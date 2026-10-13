/** 외부 사이트로의 오픈 리다이렉트 방지: 같은 origin의 경로만 허용 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return fallback;
  return target;
}

export function loginPath(redirect: string): string {
  return `/login?redirect=${encodeURIComponent(redirect)}`;
}
