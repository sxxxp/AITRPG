// backend/src/modules/scenario 응답 형식

export type Visibility = 'public' | 'unlisted' | 'private';

export interface ScenarioRecord {
  id: string;
  title: string;
  author: string;
  version: number;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  valid: boolean;
  errorCount: number;
}

export interface ValidationIssue {
  path: string;
  line: number | null;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: '공개',
  unlisted: '링크 공유',
  private: '비공개',
};
