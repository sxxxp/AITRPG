import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';

// 실시간 이벤트 — backend_기능명세서.xlsx 'Socket 이벤트' 시트
export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: env.clientOrigin, credentials: true } });
  const game = io.of('/game');

  game.on('connection', (socket) => {
    // TODO(BE-SES-11): handshake.auth.token 검증 후 session:join 에서 room 참여
    // TODO(BE-SES-12): lobby:ready, action:submit 등 영역별 핸들러 등록
    socket.emit('error', { code: 'NOT_IMPLEMENTED', message: '실시간 기능 미구현' });
  });

  return io;
}
