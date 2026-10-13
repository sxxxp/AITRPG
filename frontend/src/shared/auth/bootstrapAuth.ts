import { useEffect } from 'react';
import { apiClient, refreshAccessToken } from '@/shared/api/client';
import type { AuthUser } from '@/shared/types/user';
import { useAuthStore } from './authStore';

let started = false;

/** 앱 시작 시 Refresh 쿠키로 로그인 상태 복원 */
export function useBootstrapAuth() {
  useEffect(() => {
    if (started) return;
    started = true;
    void restoreSession();
  }, []);
}

async function restoreSession() {
  const store = useAuthStore.getState();
  try {
    const token = await refreshAccessToken();
    const me = await apiClient.get<AuthUser>('/users/me', { skipAuthRefresh: true });
    store.setSession(token, me.data);
  } catch {
    store.clear();
  }
}
