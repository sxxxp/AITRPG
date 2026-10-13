import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/shared/auth/authStore';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** true면 401 응답 시 토큰 재발급을 시도하지 않음 */
    skipAuthRefresh?: boolean;
  }
}

// FE-COM-01
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  withCredentials: true,
  timeout: 15_000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 여러 요청이 동시에 401을 받아도 재발급은 한 번만
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  refreshPromise ??= apiClient
    .post<{ accessToken: string }>('/auth/refresh', undefined, { skipAuthRefresh: true })
    .then((res) => {
      useAuthStore.getState().setAccessToken(res.data.accessToken);
      return res.data.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetryableConfig | undefined;
  if (
    error.response?.status !== 401 ||
    !config ||
    config.skipAuthRefresh ||
    config._retried ||
    !useAuthStore.getState().user
  ) {
    throw error;
  }

  config._retried = true;
  try {
    const token = await refreshAccessToken();
    config.headers.Authorization = `Bearer ${token}`;
    return apiClient(config);
  } catch {
    useAuthStore.getState().clear();
    throw error;
  }
});
