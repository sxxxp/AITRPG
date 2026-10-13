import type { LobbyUpdate, SessionDetail } from '@/shared/types/session';

// backend_기능명세서.xlsx 'Socket 이벤트' 시트 중 현재 구현된 영역(세션 로비)만 정의
export interface ServerToClientEvents {
  'session:joined': (payload: { snapshot: SessionDetail; lastSeq: number }) => void;
  'session:presence': (payload: { userId: string; status: 'online' | 'offline' | 'away' }) => void;
  'lobby:update': (payload: LobbyUpdate) => void;
  'session:started': (payload: { startedAt: string }) => void;
  error: (payload: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'session:join': (payload: { sessionId: string }) => void;
  'lobby:ready': (payload: { ready: boolean }) => void;
}
