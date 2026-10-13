import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/shared/auth/authStore';
import type { ClientToServerEvents, ServerToClientEvents } from './events';
import { useSocketStatusStore } from './socketStatusStore';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketFactory = () => GameSocket;

const defaultFactory: SocketFactory = () =>
  io(`${import.meta.env.VITE_SOCKET_URL ?? ''}/game`, {
    autoConnect: false,
    // 재연결할 때마다 최신 Access Token을 사용
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
    reconnectionDelayMax: 5_000,
  });

let factory: SocketFactory = defaultFactory;
let socket: GameSocket | null = null;

/** 목 모드 등에서 소켓 구현 교체 */
export function setSocketFactory(next: SocketFactory) {
  factory = next;
}

// FE-COM-03: 앱 전체에서 하나의 연결을 공유
export function getSocket(): GameSocket {
  const { setStatus } = useSocketStatusStore.getState();
  if (!socket) {
    const s = factory();
    s.on('connect', () => setStatus('connected'));
    s.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') setStatus('idle');
      else setStatus(s.active ? 'reconnecting' : 'error');
    });
    s.on('connect_error', () => setStatus(s.active ? 'reconnecting' : 'error'));
    socket = s;
  }
  if (!socket.connected && !socket.active) {
    setStatus('connecting');
    socket.connect();
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket?.removeAllListeners();
  socket = null;
  useSocketStatusStore.getState().setStatus('idle');
}
