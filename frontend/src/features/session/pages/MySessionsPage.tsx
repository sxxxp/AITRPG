import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/format';
import type { MySessionItem } from '@/shared/types/session';
import { EmptyState, ErrorView } from '@/shared/ui/Feedback';
import { PageSpinner } from '@/shared/ui/Spinner';
import { sessionApi, sessionKeys, type MySessionsFilter } from '../api';
import { STATUS_LABEL } from '../labels';

const TABS: { id: MySessionsFilter; label: string; empty: string }[] = [
  { id: 'active', label: '진행 중', empty: '참여 중인 세션이 없습니다.' },
  { id: 'paused', label: '일시정지', empty: '일시정지된 세션이 없습니다.' },
  { id: 'ended', label: '종료', empty: '종료된 세션이 없습니다.' },
];

function primaryAction(item: MySessionItem): { to: string; label: string } {
  switch (item.status) {
    case 'lobby':
      return { to: `/sessions/${item.id}/lobby`, label: '대기실로' };
    case 'in_progress':
    case 'paused':
      return { to: `/sessions/${item.id}/play`, label: '이어하기' };
    case 'ended':
      return { to: `/sessions/${item.id}/log`, label: '기록 보기' };
  }
}

// FE-SES-07
export function MySessionsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  const query = useQuery({ queryKey: sessionKeys.mine(tab.id), queryFn: () => sessionApi.mine(tab.id) });

  return (
    <div className="page">
      <h1>내 세션</h1>
      <div className="tabs" role="tablist" aria-label="세션 상태">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab.id === t.id}
            onClick={() => setParams(t.id === 'active' ? {} : { tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {query.isPending ? (
          <PageSpinner />
        ) : query.isError ? (
          <ErrorView message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState>
            {tab.empty} <Link to="/sessions">방 목록</Link>
          </EmptyState>
        ) : (
          <ul className="list">
            {query.data.items.map((item) => {
              const action = primaryAction(item);
              return (
                <li key={item.id} className="card list-item">
                  <div>
                    <div className="row">
                      <strong>{item.scenario.title}</strong>
                      <span className="badge">{STATUS_LABEL[item.status]}</span>
                    </div>
                    <p className="muted small">
                      {item.myCharacterName ? `내 캐릭터 ${item.myCharacterName}` : '캐릭터 미정'} · 호스트{' '}
                      {item.hostNickname} · {item.playerCount}명 · {formatDateTime(item.updatedAt)}
                    </p>
                    {item.endingTitle && <p className="small">엔딩: {item.endingTitle}</p>}
                  </div>
                  <Link to={action.to} className="btn btn-secondary btn-sm">
                    {action.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
