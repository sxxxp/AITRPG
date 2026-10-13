import { useQuery, type QueryKey } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getErrorMessage } from '@/shared/api/errors';
import type { ScenarioSummary } from '@/shared/types/scenario';
import { EmptyState, ErrorView } from '@/shared/ui/Feedback';
import { ScenarioCard } from '@/shared/ui/ScenarioCard';
import { Spinner } from '@/shared/ui/Spinner';

interface Props {
  title: string;
  description: string;
  queryKey: QueryKey;
  queryFn: () => Promise<ScenarioSummary[]>;
  renderActions: (scenario: ScenarioSummary) => ReactNode;
}

export function ScenarioSection({ title, description, queryKey, queryFn, renderActions }: Props) {
  const query = useQuery({ queryKey, queryFn });

  return (
    <section className="section">
      <div className="section__header">
        <h2>{title}</h2>
        <p className="muted small">{description}</p>
      </div>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorView message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState>표시할 시나리오가 없습니다.</EmptyState>
      ) : (
        <div className="grid">
          {query.data.map((s) => (
            <ScenarioCard key={s.id} scenario={s} actions={renderActions(s)} />
          ))}
        </div>
      )}
    </section>
  );
}
