// backend/src/modules/play/play.service.ts 의 응답 형식

export interface PlayPreset {
  id: string;
  name: string;
  description: string;
  stats: Record<string, number>;
}

export interface PlayScenario {
  id: string;
  title: string;
  summary: string;
  players: { min: number; max: number };
  estimatedMinutes: number;
  tags: string[];
  stats: string[];
  presets: PlayPreset[];
}

export interface AiStatus {
  available: boolean;
  message: string;
  provider: string;
  model: string | null;
}

export type FeedEntry =
  | { id: string; type: 'player'; text: string }
  | { id: string; type: 'system'; text: string }
  | { id: string; type: 'fixed'; text: string }
  | {
      id: string;
      type: 'check';
      text: string;
      success: boolean;
      roll: number;
      bonus: number;
      total: number;
      dc: number;
      critical: string | null;
    }
  | { id: string; type: 'narration'; text: string; fallback: boolean }
  | { id: string; type: 'ending'; title: string; text: string };

export interface GameView {
  gameId: string;
  scenario: { id: string; title: string };
  turn: number;
  scene: { id: string; name: string; description: string; npcs: string[] };
  character: {
    name: string;
    stats: Record<string, number>;
    hp: number;
    maxHp: number;
    down: boolean;
    statuses: { id: string; name: string; remaining: number | null }[];
  };
  inventory: { id: string; name: string; description: string; qty: number }[];
  combat: { enemies: { uid: string; name: string; hp: number; maxHp: number }[] } | null;
  actions: { id: string; label: string; group: string }[];
  ending: { id: string; title: string; text: string } | null;
  debug: {
    fixedRoll: number | null;
    flags: Record<string, boolean>;
    vars: Record<string, number>;
    knownFlags: string[];
    scenes: { id: string; name: string }[];
    items: { id: string; name: string }[];
  };
}

export interface GameSnapshot {
  view: GameView;
  feed: FeedEntry[];
}

export type StreamEvent =
  | { type: 'feed'; entry: FeedEntry }
  | { type: 'narration_start'; id: string }
  | { type: 'narration_delta'; id: string; delta: string }
  | { type: 'narration_end'; entry: FeedEntry }
  | { type: 'view'; view: GameView }
  | { type: 'error'; message: string };

export type ActInput = { actionId: string } | { text: string };

/** 테스트 플레이 디버그 변경 (BE-SCN-14) */
export interface DebugPatch {
  fixedRoll?: number | null;
  flags?: Record<string, boolean>;
  vars?: Record<string, number>;
  sceneId?: string;
  giveItem?: string;
  hp?: number;
}
