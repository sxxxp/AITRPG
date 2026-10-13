import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/shared/api/client';
import { disconnectSocket } from '@/shared/socket/socket';
import { useAuthStore } from './authStore';

// FE-AUTH-04 (헤더에서 사용하므로 공통에 위치)
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      await apiClient.post('/auth/logout', undefined, { skipAuthRefresh: true });
    } catch {
      // 서버 요청이 실패해도 로컬 세션은 정리
    }
    disconnectSocket();
    useAuthStore.getState().clear();
    queryClient.clear();
    navigate('/');
  }, [queryClient, navigate]);
}
