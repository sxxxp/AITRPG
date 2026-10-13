import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { useBootstrapAuth } from '@/shared/auth/bootstrapAuth';
import { queryClient } from './queryClient';
import { router } from './router';

export function App() {
  useBootstrapAuth();
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
