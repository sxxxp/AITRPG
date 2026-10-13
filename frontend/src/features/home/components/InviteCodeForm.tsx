import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function InviteCodeForm() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="invite-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const normalized = code.trim().toUpperCase();
        if (!/^[A-Z0-9]{4,12}$/.test(normalized)) {
          setError('초대 코드는 영문/숫자 4~12자입니다.');
          return;
        }
        navigate(`/join/${normalized}`);
      }}
    >
      <label htmlFor="invite-code" className="sr-only">
        초대 코드
      </label>
      <input
        id="invite-code"
        placeholder="초대 코드 입력"
        value={code}
        maxLength={12}
        autoComplete="off"
        onChange={(e) => {
          setCode(e.target.value);
          setError(null);
        }}
        aria-invalid={!!error}
      />
      <button type="submit" className="btn btn-primary">
        참여
      </button>
      {error && <p className="field-error invite-form__error">{error}</p>}
    </form>
  );
}
