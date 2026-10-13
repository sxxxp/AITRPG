const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  if (!value.trim()) return '이메일을 입력하세요.';
  if (!EMAIL_RE.test(value.trim())) return '올바른 이메일 형식이 아닙니다.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8 || value.length > 64) return '비밀번호는 8~64자여야 합니다.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return '영문과 숫자를 모두 포함해야 합니다.';
  return null;
}

export function validateNickname(value: string): string | null {
  const v = value.trim();
  if (v.length < 2 || v.length > 16) return '닉네임은 2~16자여야 합니다.';
  if (!/^[가-힣A-Za-z0-9_]+$/.test(v)) return '한글, 영문, 숫자, _만 사용할 수 있습니다.';
  return null;
}
