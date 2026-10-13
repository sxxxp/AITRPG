import type { ActInput, AiStatus, GameSnapshot, GameView, PlayScenario, StreamEvent } from './types';

// 플레이 API는 NDJSON 스트리밍을 읽어야 하고, 목 모드에서도 항상 실제 백엔드로 보내야 하므로
// axios 클라이언트(목 어댑터 적용 대상) 대신 fetch 를 직접 사용한다.
const BASE = `${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/play`;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function errorMessage(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (data?.error?.message) return data.error.message;
  return res.status >= 500 || res.status === 404 ? '백엔드 서버에 연결할 수 없습니다. backend 에서 npm run dev 를 실행했는지 확인하세요.' : `요청 실패 (${res.status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: JSON_HEADERS });
  } catch {
    throw new Error('백엔드 서버에 연결할 수 없습니다.');
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

export const playKeys = {
  scenarios: ['play', 'scenarios'] as const,
  aiStatus: ['play', 'ai-status'] as const,
};

export const playApi = {
  scenarios: () => request<PlayScenario[]>('/scenarios'),
  aiStatus: () => request<AiStatus>('/ai-status'),
  start: (scenarioId: string, player: { name: string; presetId: string }) =>
    request<GameSnapshot>('/games', { method: 'POST', body: JSON.stringify({ scenarioId, player }) }),
  get: (gameId: string) => request<GameSnapshot>(`/games/${gameId}`),
  setFixedRoll: (gameId: string, fixedRoll: number | null) =>
    request<GameView>(`/games/${gameId}/debug`, { method: 'PATCH', body: JSON.stringify({ fixedRoll }) }),

  /** 행동 전송. 서버가 보내는 이벤트를 도착하는 대로 onEvent 로 전달 */
  async act(gameId: string, input: ActInput, onEvent: (ev: StreamEvent) => void): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${BASE}/games/${gameId}/actions`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) });
    } catch {
      throw new Error('백엔드 서버에 연결할 수 없습니다.');
    }
    if (!res.ok || !res.body) throw new Error(await errorMessage(res));

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) onEvent(JSON.parse(line) as StreamEvent);
      }
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
  },
};
