import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/errors';
import { EmptyState, ErrorView } from '@/shared/ui/Feedback';
import { Pagination } from '@/shared/ui/Pagination';
import { PageSpinner } from '@/shared/ui/Spinner';
import { sessionApi, sessionKeys } from '../api';
import { JoinSessionButton } from '../components/JoinSessionButton';
import { SessionCard } from '../components/SessionCard';

const PAGE_SIZE = 12;

// FE-SES-01
export function SessionListPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);

  const query = useQuery({
    queryKey: sessionKeys.publicList(page, PAGE_SIZE),
    queryFn: () => sessionApi.listPublic(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>방 목록</h1>
        <button type="button" className="btn btn-secondary btn-sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
          새로고침
        </button>
      </div>
      <p className="muted">참여 가능한 공개 방입니다. 방을 만들려면 홈에서 시나리오를 고르세요.</p>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <ErrorView message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState>지금 참여할 수 있는 방이 없습니다.</EmptyState>
      ) : (
        <>
          <div className="grid">
            {query.data.items.map((s) => (
              <SessionCard key={s.id} session={s} actions={<JoinSessionButton session={s} />} />
            ))}
          </div>
          <Pagination
            page={page}
            size={PAGE_SIZE}
            total={query.data.total}
            onChange={(p) => setParams(p === 1 ? {} : { page: String(p) })}
          />
        </>
      )}
    </div>
  );
}
