import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/errors';
import { useAuthStore } from '@/shared/auth/authStore';
import { loginPath } from '@/shared/auth/redirect';
import type { SessionSummary } from '@/shared/types/session';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/toastStore';
import { sessionApi, sessionKeys } from '../api';

// 공개 방 목록에서 바로 참여 (FE-SES-01)
export function JoinSessionButton({ session }: { session: SessionSummary }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const formId = useId();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (pw?: string) => sessionApi.join(session.id, pw),
    onSuccess: (detail) => {
      queryClient.setQueryData(sessionKeys.detail(detail.id), detail);
      navigate(`/sessions/${detail.id}/lobby`);
    },
    onError: (e) => {
      if (passwordOpen) setError(getErrorMessage(e));
      else toast.error(getErrorMessage(e));
    },
  });

  const full = session.playerCount >= session.maxPlayers;

  const onClick = () => {
    if (!user) {
      navigate(loginPath(location.pathname + location.search));
    } else if (session.hasPassword) {
      setError(null);
      setPassword('');
      setPasswordOpen(true);
    } else {
      mutation.mutate(undefined);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" disabled={full || mutation.isPending} onClick={onClick}>
        {full ? '인원 마감' : '참여'}
      </button>
      <Modal
        open={passwordOpen}
        title="비밀번호 입력"
        onClose={() => setPasswordOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPasswordOpen(false)}>
              취소
            </button>
            <button type="submit" form={formId} className="btn btn-primary" disabled={mutation.isPending}>
              참여
            </button>
          </>
        }
      >
        <form
          id={formId}
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!password) {
              setError('비밀번호를 입력하세요.');
              return;
            }
            mutation.mutate(password);
          }}
        >
          <p className="muted">{session.scenario.title}</p>
          <div className="field">
            <label htmlFor={`${formId}-pw`}>비밀번호</label>
            <input
              id={`${formId}-pw`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
            />
            {error && <p className="field-error">{error}</p>}
          </div>
        </form>
      </Modal>
    </>
  );
}
