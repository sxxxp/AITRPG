import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sessionApi, sessionKeys } from '@/features/session/api';
import { CreateSessionModal } from '@/features/session/components/CreateSessionModal';
import { JoinSessionButton } from '@/features/session/components/JoinSessionButton';
import { SessionCard } from '@/features/session/components/SessionCard';
import { getErrorMessage } from '@/shared/api/errors';
import { useAuthStore } from '@/shared/auth/authStore';
import { loginPath } from '@/shared/auth/redirect';
import type { ScenarioSummary } from '@/shared/types/scenario';
import { EmptyState, ErrorView } from '@/shared/ui/Feedback';
import { Spinner } from '@/shared/ui/Spinner';
import { homeApi, homeKeys } from '../api';
import { InviteCodeForm } from '../components/InviteCodeForm';
import { ScenarioSection } from '../components/ScenarioSection';

const LOBBY_SIZE = 6;

// FE-HOME-01
export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [creating, setCreating] = useState<ScenarioSummary | null>(null);

  const lobbies = useQuery({
    queryKey: sessionKeys.publicList(1, LOBBY_SIZE),
    queryFn: () => sessionApi.listPublic(1, LOBBY_SIZE),
    refetchInterval: 15_000,
  });

  const scenarioActions = (s: ScenarioSummary) => (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() => (user ? setCreating(s) : navigate(loginPath('/')))}
    >
      방 만들기
    </button>
  );

  return (
    <div className="page">
      <section className="hero">
        <h1>AI가 진행하는 TRPG</h1>
        <p className="muted">판정과 아이템은 규칙 엔진이, 이야기는 AI가 맡습니다. 친구를 초대해 함께 모험을 떠나세요.</p>
        <InviteCodeForm />
      </section>

      <section className="section">
        <div className="section__header">
          <h2>참여 가능한 방</h2>
          <Link to="/sessions" className="small">
            전체 보기
          </Link>
        </div>
        {lobbies.isPending ? (
          <Spinner />
        ) : lobbies.isError ? (
          <ErrorView message={getErrorMessage(lobbies.error)} onRetry={() => void lobbies.refetch()} />
        ) : lobbies.data.items.length === 0 ? (
          <EmptyState>지금 열려 있는 방이 없습니다. 아래 시나리오로 방을 만들어 보세요.</EmptyState>
        ) : (
          <div className="grid">
            {lobbies.data.items.map((s) => (
              <SessionCard key={s.id} session={s} actions={<JoinSessionButton session={s} />} />
            ))}
          </div>
        )}
      </section>

      <ScenarioSection
        title="이번 주 인기 시나리오"
        description="최근 7일 플레이 수 기준"
        queryKey={homeKeys.trending}
        queryFn={homeApi.trending}
        renderActions={scenarioActions}
      />
      <ScenarioSection
        title="평점 높은 시나리오"
        description="평가 수를 반영한 가중 평균 기준"
        queryKey={homeKeys.topRated}
        queryFn={homeApi.topRated}
        renderActions={scenarioActions}
      />

      <CreateSessionModal scenario={creating} onClose={() => setCreating(null)} />
    </div>
  );
}
