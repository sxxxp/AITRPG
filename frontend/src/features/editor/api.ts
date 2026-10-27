import axios from 'axios';
import { apiClient } from '@/shared/api/client';
import type { ApiErrorBody } from '@/shared/api/types';
import type { ScenarioRecord, ValidationIssue, ValidationResult, Visibility } from './types';

export const editorKeys = {
  mine: ['scenarios', 'mine'] as const,
  source: (id: string) => ['scenarios', id, 'source'] as const,
  schema: ['scenarios', 'schema'] as const,
};

export const editorApi = {
  mine: () => apiClient.get<ScenarioRecord[]>('/users/me/scenarios').then((r) => r.data),

  source: (id: string) =>
    apiClient.get<{ record: ScenarioRecord; source: string }>(`/scenarios/${id}/source`).then((r) => r.data),

  schema: () => apiClient.get<object>('/scenarios/schema').then((r) => r.data),

  validate: (source: string) => apiClient.post<ValidationResult>('/scenarios/validate', { source }).then((r) => r.data),

  create: (source: string) => apiClient.post<ScenarioRecord>('/scenarios', { source }).then((r) => r.data),

  update: (id: string, source: string, note: string) =>
    apiClient.put<ScenarioRecord>(`/scenarios/${id}`, { source, note }).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/scenarios/${id}`),

  setVisibility: (id: string, visibility: Visibility) =>
    apiClient.patch<ScenarioRecord>(`/scenarios/${id}/visibility`, { visibility }).then((r) => r.data),

  importPackage: (file: File) =>
    apiClient
      .post<ScenarioRecord>('/scenarios/import', file, { headers: { 'Content-Type': 'application/zip' } })
      .then((r) => r.data),

  /** .trpg 다운로드 */
  async exportPackage(id: string) {
    const res = await apiClient.get<Blob>(`/scenarios/${id}/export`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.trpg`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

/** 422 검증 실패 응답의 오류 목록 */
export function issuesFromError(err: unknown): ValidationIssue[] | null {
  if (!axios.isAxiosError<ApiErrorBody>(err)) return null;
  const details = err.response?.data?.error?.details as { issues?: ValidationIssue[] } | undefined;
  return details?.issues ?? null;
}
