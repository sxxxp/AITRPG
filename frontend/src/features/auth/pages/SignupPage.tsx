import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorCode, getErrorMessage } from '@/shared/api/errors';
import { useAuthStore } from '@/shared/auth/authStore';
import { safeRedirect } from '@/shared/auth/redirect';
import { authApi } from '../api';
import { validateEmail, validateNickname, validatePassword } from '../validation';

type Field = 'email' | 'nickname' | 'password' | 'passwordConfirm';
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

function validate(v: Values): Errors {
  const errors: Errors = {};
  const email = validateEmail(v.email);
  const nickname = validateNickname(v.nickname);
  const password = validatePassword(v.password);
  if (email) errors.email = email;
  if (nickname) errors.nickname = nickname;
  if (password) errors.password = password;
  if (v.passwordConfirm !== v.password) errors.passwordConfirm = '비밀번호가 일치하지 않습니다.';
  return errors;
}

const FIELDS: { name: Field; label: string; type: string; autoComplete: string; hint?: string }[] = [
  { name: 'email', label: '이메일', type: 'email', autoComplete: 'email' },
  { name: 'nickname', label: '닉네임', type: 'text', autoComplete: 'nickname', hint: '2~16자, 한글/영문/숫자/_' },
  { name: 'password', label: '비밀번호', type: 'password', autoComplete: 'new-password', hint: '8자 이상, 영문과 숫자 포함' },
  { name: 'passwordConfirm', label: '비밀번호 확인', type: 'password', autoComplete: 'new-password' },
];

// FE-AUTH-01
export function SignupPage() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);

  const [values, setValues] = useState<Values>({ email: '', nickname: '', password: '', passwordConfirm: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const errors = { ...validate(values), ...serverErrors };

  const mutation = useMutation({
    mutationFn: authApi.signup,
    onSuccess: ({ accessToken, user }) => {
      setSession(accessToken, user);
      navigate(redirect, { replace: true });
    },
    onError: (e) => {
      const code = getErrorCode(e);
      if (code === 'EMAIL_TAKEN') setServerErrors({ email: getErrorMessage(e) });
      else if (code === 'NICKNAME_TAKEN') setServerErrors({ nickname: getErrorMessage(e) });
      else setFormError(getErrorMessage(e, '회원가입에 실패했습니다.'));
    },
  });

  if (status === 'authenticated') return <Navigate to={redirect} replace />;

  const update = (name: Field, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setServerErrors((s) => ({ ...s, [name]: undefined }));
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>회원가입</h1>
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched({ email: true, nickname: true, password: true, passwordConfirm: true });
            setFormError(null);
            if (Object.keys(validate(values)).length > 0) return;
            mutation.mutate({ email: values.email.trim(), nickname: values.nickname.trim(), password: values.password });
          }}
        >
          {FIELDS.map((f) => {
            const error = touched[f.name] ? errors[f.name] : undefined;
            const helpId = `signup-${f.name}-help`;
            return (
              <div className="field" key={f.name}>
                <label htmlFor={`signup-${f.name}`}>{f.label}</label>
                <input
                  id={`signup-${f.name}`}
                  type={f.type}
                  autoComplete={f.autoComplete}
                  value={values[f.name]}
                  onChange={(e) => update(f.name, e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, [f.name]: true }))}
                  aria-invalid={!!error}
                  aria-describedby={error || f.hint ? helpId : undefined}
                />
                {(error || f.hint) && (
                  <p id={helpId} className={error ? 'field-error' : 'field-hint'}>
                    {error ?? f.hint}
                  </p>
                )}
              </div>
            );
          })}
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={mutation.isPending}>
            {mutation.isPending ? '가입 중…' : '가입하기'}
          </button>
        </form>
        <p className="muted small text-center">
          이미 계정이 있으신가요? <Link to={`/login?redirect=${encodeURIComponent(redirect)}`}>로그인</Link>
        </p>
      </div>
    </div>
  );
}
