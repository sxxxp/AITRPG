import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '@/shared/socket/socket';
import type { LobbyUpdate, SessionDetail } from '@/shared/types/session';
import { toast } from '@/shared/ui/toastStore';
import { sessionApi, sessionKeys } from '../api';

/** 로비 상태: 최초 REST 조회 후 Socket 이벤트로 Query 캐시를 갱신 (FE-SES-04) */
export function useLobby(sessionId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: sessionKeys.detail(sessionId),
    queryFn: () => sessionApi.get(sessionId),
  });

  useEffect(() => {
    const socket = getSocket();
    const key = sessionKeys.detail(sessionId);
    const patch = (fn: (prev: SessionDetail) => SessionDetail) =>
      queryClient.setQueryData<SessionDetail>(key, (prev) => (prev ? fn(prev) : prev));

    // 재연결 시에도 다시 방에 참여
    const join = () => socket.emit('session:join', { sessionId });
    const onJoined = ({ snapshot }: { snapshot: SessionDetail }) => queryClient.setQueryData(key, snapshot);
    const onUpdate = (update: LobbyUpdate) => patch((prev) => ({ ...prev, ...update }));
    const onPresence = ({ userId, status }: { userId: string; status: 'online' | 'offline' | 'away' }) =>
      patch((prev) => ({
        ...prev,
        players: prev.players.map((p) => (p.userId === userId ? { ...p, online: status !== 'offline' } : p)),
      }));
    const onStarted = () => navigate(`/sessions/${sessionId}/play`, { replace: true });
    const onError = ({ message }: { message: string }) => toast.error(message);

    socket.on('connect', join);
    socket.on('session:joined', onJoined);
    socket.on('lobby:update', onUpdate);
    socket.on('session:presence', onPresence);
    socket.on('session:started', onStarted);
    socket.on('error', onError);
    if (socket.connected) join();

    return () => {
      socket.off('connect', join);
      socket.off('session:joined', onJoined);
      socket.off('lobby:update', onUpdate);
      socket.off('session:presence', onPresence);
      socket.off('session:started', onStarted);
      socket.off('error', onError);
    };
  }, [sessionId, queryClient, navigate]);

  return query;
}
