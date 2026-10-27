import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/format';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { EmptyState, ErrorView } from '@/shared/ui/Feedback';
import { Modal } from '@/shared/ui/Modal';
import { PageSpinner } from '@/shared/ui/Spinner';
import { toast } from '@/shared/ui/toastStore';
import { editorApi, editorKeys, issuesFromError } from '../api';
import { VISIBILITY_LABEL, type ScenarioRecord, type ValidationIssue } from '../types';

// FE-EDT-01 내 시나리오 목록, FE-EDT-03 가져오기, FE-EDT-04 내보내기
// TODO: 인증 도입 전까지는 서버의 scenarios 폴더 전체가 표시된다
export function MyScenariosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [removeTarget, setRemoveTarget] = useState<ScenarioRecord | null>(null);
  const [importIssues, setImportIssues] = useState<ValidationIssue[] | null>(null);

  const query = useQuery({ queryKey: editorKeys.mine, queryFn: editorApi.mine });

  const importPackage = useMutation({
    mutationFn: editorApi.importPackage,
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: editorKeys.mine });
      toast.success(`가져왔습니다: ${saved.title}`);
      navigate(`/scenarios/${saved.id}/edit`);
    },
    onError: (e) => {
      const issues = issuesFromError(e);
      if (issues) setImportIssues(issues);
      else toast.error(getErrorMessage(e));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => editorApi.remove(id),
    onSuccess: () => {
      setRemoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: editorKeys.mine });
      toast.success('삭제했습니다.');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const onFile = async (file: File) => {
    if (/\.(ya?ml)$/i.test(file.name)) {
      // YAML 은 바로 저장하지 않고 편집기에서 열어 검증 결과를 보며 고칠 수 있게 한다
      if (file.size > 1024 * 1024) return toast.error('1MB 이하의 파일만 가져올 수 있습니다.');
      navigate('/scenarios/new', { state: { source: await file.text() } });
    } else if (/\.(trpg|zip)$/i.test(file.name)) {
      if (file.size > 5 * 1024 * 1024) return toast.error('5MB 이하의 파일만 가져올 수 있습니다.');
      importPackage.mutate(file);
    } else {
      toast.error('.trpg, .zip, .yaml 파일만 가져올 수 있습니다.');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>내 시나리오</h1>
          <p className="muted small">YAML 로 시나리오를 만들고, 저장한 버전을 1인 플레이로 바로 테스트할 수 있습니다.</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-secondary" disabled={importPackage.isPending} onClick={() => fileRef.current?.click()}>
            {importPackage.isPending ? '가져오는 중…' : '파일 가져오기'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".trpg,.zip,.yaml,.yml"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onFile(file);
            }}
          />
          <Link to="/scenarios/new" className="btn btn-primary">
            새 시나리오
          </Link>
        </div>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <ErrorView message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState>
          아직 시나리오가 없습니다. <Link to="/scenarios/new">새 시나리오</Link>를 만들거나 파일을 가져오세요.
        </EmptyState>
      ) : (
        <ul className="list">
          {query.data.map((s) => (
            <li key={s.id} className="card list-item">
              <div>
                <div className="row">
                  <strong>{s.title}</strong>
                  <span className="badge">v{s.version}</span>
                  <span className="badge">{VISIBILITY_LABEL[s.visibility]}</span>
                  {s.valid ? (
                    <span className="badge badge--success">정상</span>
                  ) : (
                    <span className="badge badge--danger">오류 {s.errorCount}</span>
                  )}
                </div>
                <p className="muted small">
                  <code>{s.id}</code>
                  {s.author && ` · ${s.author}`} · 수정 {formatDateTime(s.updatedAt)}
                </p>
              </div>
              <div className="row">
                <Link to={`/scenarios/${s.id}/edit`} className="btn btn-primary btn-sm">
                  편집
                </Link>
                <Link
                  to={`/play?scenario=${s.id}`}
                  className={`btn btn-secondary btn-sm ${s.valid ? '' : 'is-disabled'}`}
                  aria-disabled={!s.valid}
                  onClick={(e) => !s.valid && e.preventDefault()}
                  title={s.valid ? undefined : '오류를 고친 뒤 테스트할 수 있습니다'}
                >
                  테스트 플레이
                </Link>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void editorApi.exportPackage(s.id).catch((e) => toast.error(getErrorMessage(e)))}
                >
                  내보내기
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoveTarget(s)}>
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="시나리오 삭제"
        message={`"${removeTarget?.title ?? ''}" 을(를) 삭제할까요? 서버의 .trash 폴더로 옮겨집니다.`}
        confirmLabel="삭제"
        danger
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
        onClose={() => setRemoveTarget(null)}
      />

      <Modal open={!!importIssues} title="가져오기 실패: 검증 오류" onClose={() => setImportIssues(null)}>
        <ul className="issue-list">
          {(importIssues ?? []).slice(0, 20).map((i, idx) => (
            <li key={idx} className="issue issue--error">
              <span className="issue__line">{i.line ? `${i.line}행` : '—'}</span>
              <span className="issue__body">
                {i.message}
                {i.path && <code className="issue__path">{i.path}</code>}
              </span>
            </li>
          ))}
        </ul>
        <p className="field-hint">scenario.yaml 을 꺼내 .yaml 로 가져오면 편집기에서 고칠 수 있습니다.</p>
      </Modal>
    </div>
  );
}
