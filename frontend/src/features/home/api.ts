import { apiClient } from '@/shared/api/client';
import type { Page } from '@/shared/api/types';
import type { ScenarioSummary } from '@/shared/types/scenario';

const HOME_SIZE = 6;

export const homeKeys = {
  trending: ['home', 'trending'] as const,
  topRated: ['home', 'top-rated'] as const,
};

export const homeApi = {
  trending: () =>
    apiClient
      .get<ScenarioSummary[]>('/scenarios/trending', { params: { period: '7d' } })
      .then((r) => r.data.slice(0, HOME_SIZE)),

  topRated: () =>
    apiClient
      .get<Page<ScenarioSummary>>('/scenarios', { params: { sort: 'rating', size: HOME_SIZE } })
      .then((r) => r.data.items),
};
