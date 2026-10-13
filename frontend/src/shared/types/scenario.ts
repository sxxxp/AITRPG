export interface PlayerRange {
  min: number;
  max: number;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  summary: string;
  authorId: string;
  authorNickname: string;
  tags: string[];
  players: PlayerRange;
  estimatedMinutes: number;
  ratingAvg: number;
  ratingCount: number;
  playCount: number;
}

export type ScenarioRef = Pick<ScenarioSummary, 'id' | 'title' | 'players'>;
