import { apiClient } from '@/shared/api/client';
import type { Page } from '@/shared/api/types';
import type { Character, CharacterInput, CharacterPreset, CharacterRules } from '@/shared/types/character';
import type {
  InviteLookup,
  MySessionItem,
  ProgressMode,
  SessionDetail,
  SessionSettings,
  SessionSummary,
} from '@/shared/types/session';

export interface CreateSessionBody {
  scenarioId: string;
  maxPlayers: number;
  isPublic: boolean;
  password?: string;
  mode: ProgressMode;
  roundTimeLimitSec: number;
}

/** password: undefined = 유지, null = 해제, string = 변경 */
export type UpdateSettingsBody = Partial<Omit<SessionSettings, 'hasPassword'>> & { password?: string | null };

export type MySessionsFilter = 'active' | 'paused' | 'ended';

export const sessionKeys = {
  all: ['sessions'] as const,
  publicList: (page: number, size: number) => ['sessions', 'public', page, size] as const,
  detail: (sessionId: string) => ['sessions', 'detail', sessionId] as const,
  character: (sessionId: string, characterId: string) =>
    ['sessions', 'detail', sessionId, 'character', characterId] as const,
  invite: (code: string) => ['sessions', 'invite', code] as const,
  mine: (filter: MySessionsFilter) => ['sessions', 'mine', filter] as const,
  characterRules: (scenarioId: string) => ['scenarios', scenarioId, 'character-rules'] as const,
  presets: (scenarioId: string) => ['scenarios', scenarioId, 'presets'] as const,
};

export const sessionApi = {
  listPublic: (page: number, size: number) =>
    apiClient
      .get<Page<SessionSummary>>('/sessions', { params: { status: 'lobby', page, size } })
      .then((r) => r.data),

  create: (body: CreateSessionBody) => apiClient.post<SessionDetail>('/sessions', body).then((r) => r.data),

  get: (sessionId: string) => apiClient.get<SessionDetail>(`/sessions/${sessionId}`).then((r) => r.data),

  updateSettings: (sessionId: string, body: UpdateSettingsBody) =>
    apiClient.patch<SessionSettings>(`/sessions/${sessionId}/settings`, body).then((r) => r.data),

  lookupInvite: (code: string) =>
    apiClient.get<InviteLookup>(`/sessions/code/${encodeURIComponent(code)}`).then((r) => r.data),

  join: (sessionId: string, password?: string) =>
    apiClient.post<SessionDetail>(`/sessions/${sessionId}/join`, { password }).then((r) => r.data),

  leave: (sessionId: string) => apiClient.post(`/sessions/${sessionId}/leave`),

  kick: (sessionId: string, userId: string) => apiClient.post(`/sessions/${sessionId}/kick`, { userId }),

  start: (sessionId: string) => apiClient.post(`/sessions/${sessionId}/start`),

  mine: (filter: MySessionsFilter) =>
    apiClient.get<Page<MySessionItem>>('/users/me/sessions', { params: { status: filter } }).then((r) => r.data),

  characterRules: (scenarioId: string) =>
    apiClient.get<CharacterRules>(`/scenarios/${scenarioId}/character-rules`).then((r) => r.data),

  presets: (scenarioId: string) =>
    apiClient.get<CharacterPreset[]>(`/scenarios/${scenarioId}/presets`).then((r) => r.data),

  getCharacter: (sessionId: string, characterId: string) =>
    apiClient.get<Character>(`/sessions/${sessionId}/characters/${characterId}`).then((r) => r.data),

  createCharacter: (sessionId: string, input: CharacterInput) =>
    apiClient.post<Character>(`/sessions/${sessionId}/characters`, input).then((r) => r.data),

  updateCharacter: (sessionId: string, characterId: string, input: CharacterInput) =>
    apiClient.patch<Character>(`/sessions/${sessionId}/characters/${characterId}`, input).then((r) => r.data),
};
