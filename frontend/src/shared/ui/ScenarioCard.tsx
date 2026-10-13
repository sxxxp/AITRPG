import type { ReactNode } from 'react';
import { formatCount } from '@/shared/lib/format';
import type { ScenarioSummary } from '@/shared/types/scenario';

// 홈과 이후 시나리오 탐색(FE-SCN-02)에서 공통으로 쓰는 카드
export function ScenarioCard({ scenario, actions }: { scenario: ScenarioSummary; actions?: ReactNode }) {
  const rounded = Math.round(scenario.ratingAvg);
  const { min, max } = scenario.players;
  return (
    <article className="card scenario-card">
      <h3>{scenario.title}</h3>
      <p className="muted small">by {scenario.authorNickname}</p>
      <p className="scenario-card__summary">{scenario.summary}</p>
      <ul className="tag-list" aria-label="태그">
        {scenario.tags.map((tag) => (
          <li key={tag} className="tag">
            {tag}
          </li>
        ))}
      </ul>
      <dl className="meta-list">
        <div>
          <dt>평점</dt>
          <dd>
            <span className="stars" aria-hidden="true">
              {'★'.repeat(rounded)}
              {'☆'.repeat(5 - rounded)}
            </span>{' '}
            <span className="sr-only">5점 만점에 </span>
            {scenario.ratingAvg.toFixed(1)} <span className="muted">({formatCount(scenario.ratingCount)})</span>
          </dd>
        </div>
        <div>
          <dt>플레이</dt>
          <dd>{formatCount(scenario.playCount)}회</dd>
        </div>
        <div>
          <dt>인원</dt>
          <dd>{min === max ? `${min}명` : `${min}~${max}명`}</dd>
        </div>
        <div>
          <dt>시간</dt>
          <dd>약 {scenario.estimatedMinutes}분</dd>
        </div>
      </dl>
      {actions && <div className="card-actions">{actions}</div>}
    </article>
  );
}
