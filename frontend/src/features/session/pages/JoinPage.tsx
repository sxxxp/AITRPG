import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors';
import { useAuthStore } from '@/shared/auth/authStore';
import { loginPath } from '@/shared/auth/redirect';
import { ErrorView } from '@/shared/ui/Feedback';
import { PageSpinner } from '@/shared/ui/Spinner';
import { sessionApi, sessionKeys } from '../api';
import { STATUS_LABEL } from '../labels';

// FE-SES-03 (게스트 참여는 P1이라 제외 — 비로그인은 로그인으로 안내)
export function JoinPage() {
  const { inviteCode = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lookup = useQuery({
    queryKey: sessionKeys.invite(inviteCode),
    queryFn: () => sessionApi.lookupInvite(inviteCode),
  });

  const join = useMutation({
    mutationFn: (sessionId: string) => sessionApi.join(sessionId, password || undefined),
    onSuccess: (detail) => {
      queryClient.setQueryData(sessionKeys.detail(detail.id), detail);
      navigate(`/sessions/${detail.id}/lobby`, { replace: true });
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  if (lookup.isPending || status === 'unknown') return <PageSpinner />;
  if (lookup.isError) {
    return (
      <div className="page narrow stack">
        <ErrorView
          message={
            getErrorStatus(lookup.error) === 404 ? '유효하지 않거나 만료된 초대 코드입니다.' : getErrorMessage(lookup.error)
          }
        />
        <Link to="/sessions" className="btn btn-secondary">
          방 목록 보기
        </Link>
      </div>
    );
  }

  const info = lookup.data;
  const closed = info.status !== 'lobby';
  const full = info.playerCount >= info.maxPlayers;

  return (
    <div className="page narrow">
      <div className="card stack">
        <div>
          <p className="muted small">초대받은 방</p>
          <h1>{info.scenarioTitle}</h1>
          <p className="muted">
            호스트 {info.hostNickname} · {info.playerCount}/{info.maxPlayers}명 · {STATUS_LABEL[info.status]}
            {info.hasPassword && ' · 🔒 비밀방'}
          </p>
        </div>

        {closed ? (
          <p>
            이미 게임이 시작되었거나 종료된 방입니다.
            {user && (
              <>
                {' '}
                참가자라면 <Link to="/my/sessions">내 세션</Link>에서 이어할 수 있습니다.
              </>
            )}
          </p>
        ) : full ? (
          <p>인원이 가득 찼습니다.</p>
        ) : !user ? (
          <Link to={loginPath(location.pathname)} className="btn btn-primary btn-block">
            로그인하고 참여
          </Link>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (info.hasPassword && !password) {
                setError('비밀번호를 입력하세요.');
                return;
              }
              setError(null);
              join.mutate(info.sessionId);
            }}
          >
            {info.hasPassword && (
              <div className="field">
                <label htmlFor="join-password">방 비밀번호</label>
                <input
                  id="join-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!error}
                />
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={join.isPending}>
              {user.nickname}(으)로 참여하기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
