import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorView } from '@/shared/ui/Feedback';
import { PageSpinner, Spinner } from '@/shared/ui/Spinner';
import { toast } from '@/shared/ui/toastStore';
import { editorApi, editorKeys, issuesFromError } from '../api';
import type { BlockModeHandle } from '../blocks/BlockMode';
import type { CodeEditorHandle } from '../components/CodeEditor';
import { ValidationPanel } from '../components/ValidationPanel';
import template from '../template.yaml?raw';
import { VISIBILITY_LABEL, type ScenarioRecord, type ValidationIssue, type Visibility } from '../types';

// Monaco / Blockly 는 무거우므로 이 화면에서, 필요한 탭을 열 때만 불러온다
const CodeEditor = lazy(() => import('../components/CodeEditor'));
const BlockMode = lazy(() => import('../blocks/BlockMode'));

type EditMode = 'blocks' | 'code';
const MODE_KEY = 'wtg.editor.mode';

function readPreferredMode(): EditMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'code' ? 'code' : 'blocks';
  } catch {
    return 'blocks';
  }
}

function savePreferredMode(mode: EditMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // 저장 불가 환경이면 매번 기본값(블록)
  }
}

const VALIDATE_DELAY_MS = 600;

/** /scenarios/new 와 /scenarios/:scenarioId/edit 공용 (FE-EDT-02, 05~08) */
export function ScenarioEditorPage() {
  const { scenarioId } = useParams();
  if (!scenarioId) return <Editor key="new" record={null} initialSource={null} />;
  return <ExistingScenario key={scenarioId} scenarioId={scenarioId} />;
}

function ExistingScenario({ scenarioId }: { scenarioId: string }) {
  const query = useQuery({ queryKey: editorKeys.source(scenarioId), queryFn: () => editorApi.source(scenarioId), staleTime: 0 });
  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return (
      <div className="page narrow stack">
        <ErrorView
          message={getErrorStatus(query.error) === 404 ? '시나리오를 찾을 수 없습니다.' : getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
        <Link to="/my/scenarios" className="btn btn-secondary">
          내 시나리오
        </Link>
      </div>
    );
  }
  return <Editor record={query.data.record} initialSource={query.data.source} />;
}

function Editor({ record: initialRecord, initialSource }: { record: ScenarioRecord | null; initialSource: string | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const editorRef = useRef<CodeEditorHandle>(null);

  // 새 시나리오: 가져온 YAML(location.state.source) 또는 템플릿
  const startSource = initialSource ?? (location.state as { source?: string } | null)?.source ?? template;
  const [record, setRecord] = useState(initialRecord);
  const [source, setSource] = useState(startSource);
  const [baseline, setBaseline] = useState(initialSource ?? '');
  const [note, setNote] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [checking, setChecking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const dirty = source !== baseline;
  const leavingAfterSave = useRef(false);

  // 블록 / 코드 탭. 블록 탭은 열 때마다 현재 YAML 로 다시 만든다
  const [mode, setMode] = useState<EditMode>(readPreferredMode);
  const [blockKey, setBlockKey] = useState(0);
  const blockRef = useRef<BlockModeHandle>(null);
  const switchMode = (next: EditMode) => {
    if (next === mode) return;
    if (next === 'blocks') setBlockKey((k) => k + 1);
    setMode(next);
    savePreferredMode(next);
  };
  const selectIssue = (issue: ValidationIssue) => {
    if (mode === 'blocks') {
      if (!blockRef.current?.focusPath(issue.path)) toast.info('이 오류에 해당하는 블록을 찾지 못했습니다. 코드 탭에서 확인하세요.');
    } else if (issue.line) {
      editorRef.current?.revealLine(issue.line);
    }
  };

  const schema = useQuery({ queryKey: editorKeys.schema, queryFn: editorApi.schema, staleTime: Infinity });

  // FE-EDT-06: 입력이 멈추면 서버 검증 (오래된 응답은 무시)
  const requestSeq = useRef(0);
  useEffect(() => {
    setChecking(true);
    const seq = ++requestSeq.current;
    const timer = window.setTimeout(() => {
      editorApi
        .validate(source)
        .then((r) => {
          if (seq !== requestSeq.current) return;
          setIssues(r.issues);
          setUnavailable(false);
        })
        .catch(() => seq === requestSeq.current && setUnavailable(true))
        .finally(() => seq === requestSeq.current && setChecking(false));
    }, VALIDATE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [source]);

  // 저장하지 않은 변경 이탈 경고 (FE-EDT-07)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leavingAfterSave.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => (record ? editorApi.update(record.id, source, note) : editorApi.create(source)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: editorKeys.mine });
      toast.success(record ? `저장했습니다 (v${saved.version})` : '시나리오를 만들었습니다.');
      setNote('');
      if (!record) {
        leavingAfterSave.current = true;
        navigate(`/scenarios/${saved.id}/edit`, { replace: true });
        return;
      }
      setRecord(saved);
      setBaseline(source);
      queryClient.setQueryData(editorKeys.source(saved.id), { record: saved, source });
    },
    onError: (e) => {
      const failed = issuesFromError(e);
      if (failed) {
        setIssues(failed);
        toast.error(`검증 오류 ${failed.length}개 때문에 저장하지 못했습니다.`);
        if (failed[0]) selectIssue(failed[0]);
      } else {
        toast.error(getErrorMessage(e));
      }
    },
  });

  const visibility = useMutation({
    mutationFn: (v: Visibility) => editorApi.setVisibility(record!.id, v),
    onSuccess: (saved) => {
      setRecord(saved);
      void queryClient.invalidateQueries({ queryKey: editorKeys.mine });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const hasErrors = issues.some((i) => i.severity === 'error');
  const trySave = () => {
    if (!save.isPending && (dirty || !record)) save.mutate();
  };

  return (
    <div className="page editor-page">
      <div className="page-header">
        <div>
          <p className="muted small">
            <Link to="/my/scenarios">내 시나리오</Link> / {record ? record.id : '새 시나리오'}
          </p>
          <h1>
            {record?.title ?? '새 시나리오'}{' '}
            {record && <span className="badge">v{record.version}</span>}
            {dirty && <span className="badge badge--warning">저장 안 됨</span>}
          </h1>
        </div>
        <div className="row editor-actions">
          {record && (
            <>
              <label className="sr-only" htmlFor="visibility">
                공개 범위
              </label>
              <select
                id="visibility"
                value={record.visibility}
                disabled={visibility.isPending}
                onChange={(e) => visibility.mutate(e.target.value as Visibility)}
              >
                {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABEL[v]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void editorApi.exportPackage(record.id).catch((e) => toast.error(getErrorMessage(e)))}>
                내보내기
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={dirty}
                title={dirty ? '저장한 버전으로 테스트합니다. 먼저 저장하세요.' : undefined}
                onClick={() => navigate(`/play?scenario=${record.id}`)}
              >
                테스트 플레이
              </button>
            </>
          )}
          {record && (
            <input
              className="note-input"
              placeholder="변경 메모 (선택)"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              aria-label="변경 메모"
            />
          )}
          <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending || (!!record && !dirty)} onClick={trySave}>
            {save.isPending ? '저장 중…' : record ? '저장' : '만들기'}
          </button>
        </div>
      </div>

      {!record && (
        <p className="muted small">
          템플릿에서 시작합니다. 시나리오 ID(<code>meta.id</code>)를 다른 시나리오와 겹치지 않게 바꾼 뒤 만드세요. 저장 후에는 ID 를 바꿀 수 없습니다.
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="편집 방식">
        {(['blocks', 'code'] as const).map((m) => (
          <button key={m} type="button" role="tab" className="tab" aria-selected={mode === m} onClick={() => switchMode(m)}>
            {m === 'blocks' ? '🧩 블록' : '</> 코드'}
          </button>
        ))}
      </div>

      <div className="editor-grid">
        <div className={mode === 'blocks' ? 'editor-main editor-main--blocks' : 'card editor-main'}>
          <Suspense
            fallback={
              <div className="page-center">
                <Spinner label="편집기 불러오는 중" />
              </div>
            }
          >
            {mode === 'blocks' ? (
              <BlockMode key={blockKey} ref={blockRef} source={source} canEditId={!record} onSourceChange={setSource} />
            ) : (
              <CodeEditor
                ref={editorRef}
                value={source}
                onChange={setSource}
                issues={issues}
                schema={schema.data ?? null}
                onSave={trySave}
              />
            )}
          </Suspense>
        </div>
        <ValidationPanel
          issues={issues}
          checking={checking}
          unavailable={unavailable}
          selectByPath={mode === 'blocks'}
          onSelect={selectIssue}
        />
      </div>
      {hasErrors && <p className="field-hint">오류가 있으면 저장할 수 없습니다. (Ctrl+S 로 저장)</p>}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="저장하지 않은 변경"
        message="저장하지 않은 변경이 있습니다. 이 화면을 나갈까요?"
        confirmLabel="나가기"
        danger
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}
