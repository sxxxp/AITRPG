import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/errors';
import { useAuthStore } from '@/shared/auth/authStore';
import { safeRedirect } from '@/shared/auth/redirect';
import { authApi } from '../api';

// FE-AUTH-02 (소셜 로그인은 P1이라 제외)
export function LoginPage() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ accessToken, user }) => {
      setSession(accessToken, user);
      navigate(redirect, { replace: true });
    },
    onError: (e) => setError(getErrorMessage(e, '로그인에 실패했습니다.')),
  });

  if (status === 'authenticated') return <Navigate to={redirect} replace />;

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>로그인</h1>
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim() || !password) {
              setError('이메일과 비밀번호를 입력하세요.');
              return;
            }
            setError(null);
            mutation.mutate({ email: email.trim(), password });
          }}
        >
          <div className="field">
            <label htmlFor="login-email">이메일</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">비밀번호</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={mutation.isPending}>
            {mutation.isPending ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <p className="muted small text-center">
          계정이 없으신가요? <Link to={`/signup?redirect=${encodeURIComponent(redirect)}`}>회원가입</Link>
        </p>
        {import.meta.env.VITE_USE_MOCK === 'true' && (
          <p className="muted small text-center">목 모드 데모 계정: demo@wtg.dev / demo1234</p>
        )}
      </div>
    </div>
  );
}
