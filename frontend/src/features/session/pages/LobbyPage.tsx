import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors';
import { useAuthStore } from '@/shared/auth/authStore';
import { getSocket } from '@/shared/socket/socket';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorView } from '@/shared/ui/Feedback';
import { PageSpinner } from '@/shared/ui/Spinner';
import { toast } from '@/shared/ui/toastStore';
import { sessionApi, sessionKeys } from '../api';
import { CharacterPanel } from '../components/CharacterPanel';
import { HostSettingsPanel } from '../components/HostSettingsPanel';
import { InviteLink } from '../components/InviteLink';
import { PlayerList } from '../components/PlayerList';
import { useLobby } from '../hooks/useLobby';
import { MODE_LABEL } from '../labels';

// FE-SES-04 ~ FE-SES-06
export function LobbyPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const { data: session, error, isPending, refetch } = useLobby(sessionId);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const isMember = !!session && !!me && session.players.some((p) => p.userId === me.id);
  const wasMember = useRef(false);
  const leaving = useRef(false);

  // 강퇴 감지: 참가자였다가 목록에서 사라진 경우
  useEffect(() => {
    if (isMember) {
      wasMember.current = true;
    } else if (wasMember.current && !leaving.current) {
      toast.info('호스트가 방에서 내보냈습니다.');
      navigate('/sessions', { replace: true });
    }
  }, [isMember, navigate]);

  const leave = useMutation({
    mutationFn: () => sessionApi.leave(sessionId),
    onMutate: () => {
      leaving.current = true;
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: sessionKeys.detail(sessionId) });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      navigate('/sessions', { replace: true });
    },
    onError: (e) => {
      leaving.current = false;
      toast.error(getErrorMessage(e));
    },
  });

  if (isPending) return <PageSpinner />;
  if (error || !session || !me) {
    const status = getErrorStatus(error);
    return (
      <div className="page narrow stack">
        <ErrorView
          message={
            status === 403
              ? '이 방의 참가자가 아닙니다. 초대 링크로 참여하세요.'
              : status === 404
                ? '방을 찾을 수 없습니다.'
                : getErrorMessage(error)
          }
          onRetry={status === 403 || status === 404 ? undefined : () => void refetch()}
        />
        <Link to="/sessions" className="btn btn-secondary">
          방 목록
        </Link>
      </div>
    );
  }

  if (session.status === 'in_progress' || session.status === 'paused') {
    return <Navigate to={`/sessions/${session.id}/play`} replace />;
  }
  if (session.status === 'ended') return <Navigate to={`/sessions/${session.id}/log`} replace />;

  const myPlayer = session.players.find((p) => p.userId === me.id);
  const isHost = session.hostId === me.id;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="muted small">대기실</p>
          <h1>{session.scenario.title}</h1>
          <p className="muted small">
            {MODE_LABEL[session.settings.mode]} · {session.settings.isPublic ? '공개' : '비공개'}
            {session.settings.hasPassword && ' · 🔒'}
          </p>
        </div>
        <InviteLink inviteCode={session.inviteCode} />
      </div>

      <div className="lobby-grid">
        <section className="card" aria-labelledby="lobby-players">
          <h2 id="lobby-players">
            참가자 {session.players.length}/{session.settings.maxPlayers}
          </h2>
          <PlayerList session={session} meId={me.id} />
        </section>

        <section className="card" aria-labelledby="lobby-character">
          <h2 id="lobby-character">내 캐릭터</h2>
          <CharacterPanel session={session} meId={me.id} />
        </section>

        {isHost && (
          <section className="card" aria-labelledby="lobby-host">
            <h2 id="lobby-host">호스트 설정</h2>
            <HostSettingsPanel session={session} />
          </section>
        )}
      </div>

      <div className="lobby-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setLeaveOpen(true)}>
          방 나가기
        </button>
        <button
          type="button"
          className={`btn ${myPlayer?.ready ? 'btn-secondary' : 'btn-primary'}`}
          disabled={!myPlayer?.character}
          title={myPlayer?.character ? undefined : '캐릭터를 먼저 정하세요'}
          onClick={() => getSocket().emit('lobby:ready', { ready: !myPlayer?.ready })}
        >
          {myPlayer?.ready ? '준비 취소' : '준비 완료'}
        </button>
      </div>

      <ConfirmDialog
        open={leaveOpen}
        title="방 나가기"
        message={
          isHost && session.players.length > 1 ? '방을 나가면 다른 참가자에게 호스트가 넘어갑니다.' : '방에서 나갈까요?'
        }
        confirmLabel="나가기"
        danger
        pending={leave.isPending}
        onConfirm={() => leave.mutate()}
        onClose={() => setLeaveOpen(false)}
      />
    </div>
  );
}
