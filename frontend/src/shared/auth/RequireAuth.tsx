import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { PageSpinner } from '@/shared/ui/Spinner';
import { useAuthStore } from './authStore';
import { loginPath } from './redirect';

// FE-COM-02
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'unknown') return <PageSpinner />;
  if (status !== 'authenticated') {
    return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  }
  return <>{children}</>;
}
