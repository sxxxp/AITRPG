import { QueryClient } from '@tanstack/react-query';
import { getErrorStatus } from '@/shared/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx는 재시도해도 결과가 같으므로 재시도하지 않음
      retry: (failureCount, error) => {
        const status = getErrorStatus(error);
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
