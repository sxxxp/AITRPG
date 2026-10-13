import { apiClient } from '@/shared/api/client';
import type { AuthUser } from '@/shared/types/user';

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export const authApi = {
  signup: (body: { email: string; password: string; nickname: string }) =>
    apiClient.post<AuthResponse>('/auth/signup', body, { skipAuthRefresh: true }).then((r) => r.data),

  login: (body: { email: string; password: string }) =>
    apiClient.post<AuthResponse>('/auth/login', body, { skipAuthRefresh: true }).then((r) => r.data),
};
