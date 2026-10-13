export type StatBlock = Record<string, number>;

export interface CharacterRules {
  stats: string[];
  method: 'point_buy';
  totalPoints: number;
  minPerStat: number;
  maxPerStat: number;
  allowCustom: boolean;
}

export interface CharacterPreset {
  id: string;
  name: string;
  description: string;
  stats: StatBlock;
}

export interface CharacterSummary {
  id: string;
  name: string;
  presetId: string | null;
}

export interface Character extends CharacterSummary {
  background: string;
  stats: StatBlock;
}

export type CharacterInput = { presetId: string } | { name: string; background: string; stats: StatBlock };
