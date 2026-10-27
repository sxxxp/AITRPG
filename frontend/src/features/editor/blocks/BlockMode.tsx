import { forwardRef, lazy, Suspense, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ErrorView } from '@/shared/ui/Feedback';
import { Spinner } from '@/shared/ui/Spinner';
import { rebuildCatalog } from './catalog';
import type { BlockWorkspaceHandle } from './BlockWorkspace';
import { MetaForm } from './MetaForm';
import { parseForBlocks, toYaml } from './yaml';

const BlockWorkspace = lazy(() => import('./BlockWorkspace'));

type Obj = Record<string, unknown>;

export interface BlockModeHandle {
  focusPath: (path: string) => boolean;
}

interface Props {
  /** 블록 탭을 열 때의 YAML (다시 불러오려면 key 를 바꿔 다시 마운트) */
  source: string;
  canEditId: boolean;
  onSourceChange: (yaml: string) => void;
}

// 블록 탭 전체 (기본 정보 폼 + Blockly). React.lazy 로만 불러올 것
const BlockMode = forwardRef<BlockModeHandle, Props>(function BlockMode({ source, canEditId, onSourceChange }, ref) {
  const parsed = useMemo(() => parseForBlocks(source), []); // 처음 한 번만
  const baseRef = useRef<Obj>(parsed.ok ? parsed.scenario : {});
  const [scenario, setScenario] = useState<Obj>(baseRef.current);
  const workspaceRef = useRef<BlockWorkspaceHandle>(null);
  const hadComments = useMemo(() => /^\s*#/m.test(source), []);

  useImperativeHandle(ref, () => ({
    focusPath: (path: string) => workspaceRef.current?.focusPath(path) ?? false,
  }));

  if (!parsed.ok) {
    return (
      <ErrorView message={`블록으로 열 수 없습니다. 코드 탭에서 먼저 고쳐 주세요. (${parsed.message})`} />
    );
  }

  const commit = (next: Obj) => {
    baseRef.current = next;
    setScenario(next);
    onSourceChange(toYaml(next));
  };

  return (
    <div className="block-mode">
      {hadComments && (
        <p className="field-hint">블록이나 기본 정보를 수정하면 YAML 이 다시 만들어져 주석(#)은 사라집니다.</p>
      )}
      <MetaForm
        scenario={scenario}
        canEditId={canEditId}
        onChange={(next) => {
          rebuildCatalog(next);
          commit(next);
        }}
      />
      <Suspense
        fallback={
          <div className="page-center">
            <Spinner label="블록 편집기 불러오는 중" />
          </div>
        }
      >
        <BlockWorkspace ref={workspaceRef} initial={baseRef.current} baseRef={baseRef} onChange={commit} />
      </Suspense>
    </div>
  );
});

export default BlockMode;
