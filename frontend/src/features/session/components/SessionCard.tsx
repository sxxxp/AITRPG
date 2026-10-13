import type { ReactNode } from 'react';
import type { SessionSummary } from '@/shared/types/session';
import { MODE_LABEL } from '../labels';

export function SessionCard({ session, actions }: { session: SessionSummary; actions?: ReactNode }) {
  const full = session.playerCount >= session.maxPlayers;
  return (
    <article className="card session-card">
      <div className="row-between">
        <h3>{session.scenario.title}</h3>
        {session.hasPassword && <span className="badge">🔒 비밀방</span>}
      </div>
      <p className="muted small">
        호스트 {session.hostNickname} · {MODE_LABEL[session.mode]}
      </p>
      <p className={full ? 'muted' : undefined}>
        <strong>{session.playerCount}</strong> / {session.maxPlayers}명 {full && '· 인원 마감'}
      </p>
      {actions && <div className="card-actions">{actions}</div>}
    </article>
  );
}
