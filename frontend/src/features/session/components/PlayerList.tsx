import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { getErrorMessage } from '@/shared/api/errors';
import type { LobbyPlayer, SessionDetail } from '@/shared/types/session';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { toast } from '@/shared/ui/toastStore';
import { sessionApi } from '../api';

export function PlayerList({ session, meId }: { session: SessionDetail; meId: string }) {
  const isHost = session.hostId === meId;
  const [kickTarget, setKickTarget] = useState<LobbyPlayer | null>(null);

  const kick = useMutation({
    mutationFn: (userId: string) => sessionApi.kick(session.id, userId),
    onSuccess: () => setKickTarget(null),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <>
      <ul className="player-list">
        {session.players.map((p) => (
          <li key={p.userId} className="player-list__item">
            <span className="presence" data-online={p.online} aria-label={p.online ? '접속 중' : '접속 끊김'} />
            <div className="player-list__body">
              <div>
                {p.nickname}
                {p.userId === meId && <span className="muted"> (나)</span>}
                {p.isHost && <span className="badge badge--accent">호스트</span>}
              </div>
              <div className="muted small">{p.character ? p.character.name : '캐릭터 미정'}</div>
            </div>
            <span className={`badge ${p.ready ? 'badge--success' : ''}`}>{p.ready ? '준비 완료' : '대기 중'}</span>
            {isHost && p.userId !== meId && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setKickTarget(p)}>
                내보내기
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!kickTarget}
        title="참가자 내보내기"
        message={`${kickTarget?.nickname ?? ''} 님을 방에서 내보낼까요?`}
        confirmLabel="내보내기"
        danger
        pending={kick.isPending}
        onConfirm={() => kickTarget && kick.mutate(kickTarget.userId)}
        onClose={() => setKickTarget(null)}
      />
    </>
  );
}
