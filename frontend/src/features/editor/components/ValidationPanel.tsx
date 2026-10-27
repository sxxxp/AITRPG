import type { ValidationIssue } from '../types';

interface Props {
  issues: ValidationIssue[];
  checking: boolean;
  /** 서버 검증을 아직 못 받은 경우 (네트워크 오류 등) */
  unavailable: boolean;
  /** 코드 탭에서는 줄로, 블록 탭에서는 경로로 이동 */
  onSelect: (issue: ValidationIssue) => void;
  /** 줄 번호가 없어도 경로로 이동할 수 있는지 (블록 탭) */
  selectByPath?: boolean;
}

// FE-EDT-06: 오류/경고 목록. 클릭하면 해당 줄로 이동
export function ValidationPanel({ issues, checking, unavailable, onSelect, selectByPath = false }: Props) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  const summary = unavailable
    ? '검증 서버에 연결할 수 없습니다'
    : checking
      ? '검증 중…'
      : errors.length === 0 && warnings.length === 0
        ? '문제 없음'
        : `오류 ${errors.length} · 경고 ${warnings.length}`;

  return (
    <section className="card validation-panel" aria-labelledby="validation-title">
      <div className="row-between">
        <h2 id="validation-title">검증</h2>
        <span
          className={`badge ${unavailable ? 'badge--warning' : errors.length ? 'badge--danger' : warnings.length ? 'badge--warning' : 'badge--success'}`}
          role="status"
        >
          {summary}
        </span>
      </div>
      {issues.length > 0 && (
        <ul className="issue-list">
          {[...errors, ...warnings].map((issue, i) => (
            <li key={`${issue.path}-${i}`}>
              <button
                type="button"
                className={`issue issue--${issue.severity}`}
                disabled={selectByPath ? !issue.path : !issue.line}
                onClick={() => onSelect(issue)}
              >
                <span className="issue__line">{issue.line ? `${issue.line}행` : '—'}</span>
                <span className="issue__body">
                  {issue.message}
                  {issue.path && <code className="issue__path">{issue.path}</code>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">구조 오류는 편집기에서 바로, 참조 오류(없는 장면·아이템 등)는 입력을 멈추면 표시됩니다.</p>
    </section>
  );
}
