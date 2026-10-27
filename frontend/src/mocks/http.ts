import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  // 목 핸들러는 요청 본문을 느슨하게 다룸
  body: any;
  userId: string | null;
}

type Handler = (ctx: Ctx) => { status?: number; data?: unknown };

const routes: { method: string; regex: RegExp; keys: string[]; handler: Handler }[] = [];

export function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = path.replace(/:(\w+)/g, (_, key: string) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ method, regex: new RegExp(`^${pattern}$`), keys, handler });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 목 핸들러가 없는 요청은 실제 백엔드로 보낸다 (구현된 백엔드 API 는 목 모드에서도 그대로 사용)
const realAdapter = axios.getAdapter(axios.defaults.adapter);

/** axios 어댑터: 등록된 목 핸들러가 있으면 그것으로, 없으면 실제 네트워크로 응답 */
export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toUpperCase();
  const url = new URL(config.url ?? '/', 'http://mock.local');
  if (!routes.some((r) => r.method === method && r.regex.test(url.pathname))) return realAdapter(config);

  await delay(120 + Math.random() * 200);
  const query = url.searchParams;
  for (const [k, v] of Object.entries(config.params ?? {})) {
    if (v !== undefined && v !== null) query.set(k, String(v));
  }
  const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : config.data;
  const auth = String(config.headers.get('Authorization') ?? '');
  const userId = auth.startsWith('Bearer mock.') ? auth.slice('Bearer mock.'.length) : null;

  let status = 500;
  let data: unknown = null;

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(url.pathname);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      const res = r.handler({ params, query, body, userId });
      status = res.status ?? 200;
      data = res.data ?? null;
    } catch (e) {
      if (e instanceof HttpError) {
        status = e.status;
        data = { error: { code: e.code, message: e.message } };
      } else {
        status = 500;
        data = { error: { code: 'INTERNAL', message: String(e) } };
      }
    }
    break;
  }

  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 200 && status < 300) return response;
  throw new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    {},
    response,
  );
};
