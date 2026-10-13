export interface AuthUser {
  id: string;
  nickname: string;
  email: string;
  avatarUrl: string | null;
  role: 'user' | 'admin';
}
