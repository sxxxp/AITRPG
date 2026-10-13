import type { RngHolder } from './dice.js';

export interface StatusState {
  id: string;
  /** 남은 턴. null 이면 해제될 때까지 */
  remaining: number | null;
}

export interface CharacterState {
  id: string;
  name: string;
  stats: Record<string, number>;
  resources: Record<string, number>;
  resourceMax: Record<string, number>;
  resourceMin: Record<string, number>;
  statuses: StatusState[];
  inventory: Record<string, number>;
  down: boolean;
}

export interface EnemyState {
  uid: string;
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  gone: 'defeated' | 'fled' | null;
}

export interface EndingState {
  id: string;
  title: string;
  text: string;
}

export interface GameState extends RngHolder {
  version: 1;
  scenarioId: string;
  sceneId: string;
  prevSceneId: string | null;
  turn: number;
  flags: Record<string, boolean>;
  vars: Record<string, number>;
  party: CharacterState[];
  combat: { enemies: EnemyState[] } | null;
  /** condition 트리거 이벤트는 1회만 발동 */
  firedEvents: string[];
  revealedSecrets: string[];
  ending: EndingState | null;
  nextEnemyUid: number;
}

export type ActionGroup = '조사' | '행동' | '이동' | '대화' | '아이템' | '전투';

export type Action =
  | { id: string; kind: 'examine'; label: string; group: ActionGroup; object: string }
  | { id: string; kind: 'interact'; label: string; group: ActionGroup; object: string }
  | { id: string; kind: 'move'; label: string; group: ActionGroup; exit: number; to: string }
  | { id: string; kind: 'use_item'; label: string; group: ActionGroup; item: string; target: string | null }
  | { id: string; kind: 'talk'; label: string; group: ActionGroup; npc: string }
  | { id: string; kind: 'attack'; label: string; group: ActionGroup; enemy: string }
  | { id: string; kind: 'flee'; label: string; group: ActionGroup }
  | { id: string; kind: 'wait'; label: string; group: ActionGroup };

/** 자유 서술: 상태 변화 없음 */
export interface FreeAction {
  id: 'free';
  kind: 'free';
  label: string;
}

export type AnyAction = Action | FreeAction;

/** 엔진이 확정한 사실. AI 서술(Fact Sheet)과 UI 표시의 원천 */
export type EngineEvent =
  | {
      type: 'check';
      actor: string;
      stat: string;
      roll: number;
      bonus: number;
      total: number;
      dc: number;
      success: boolean;
      critical: 'success' | 'failure' | null;
      reason: string;
    }
  | { type: 'hint'; text: string }
  | { type: 'fixed'; text: string }
  | { type: 'locked'; text: string }
  | { type: 'item'; actor: string; item: string; name: string; delta: number }
  | { type: 'resource'; actor: string; resource: string; delta: number; value: number }
  | { type: 'status'; actor: string; status: string; name: string; change: 'applied' | 'resisted' | 'removed' | 'expired' }
  | { type: 'restricted'; actor: string; status: string }
  | { type: 'move'; from: string; to: string; sceneName: string }
  | { type: 'combat_start'; enemies: string[] }
  | { type: 'attack'; attacker: string; target: string; hit: boolean; damage: number; skill: string | null }
  | { type: 'enemy_gone'; name: string; reason: 'defeated' | 'fled' }
  | { type: 'combat_end'; reason: 'victory' | 'escaped' }
  | { type: 'down'; actor: string }
  | { type: 'secret'; npc: string; text: string }
  | { type: 'talk'; actor: string; npc: string }
  | { type: 'nothing'; text: string }
  | { type: 'ending'; id: string; title: string; text: string };

export interface PlayerSetup {
  name: string;
  presetId?: string;
  stats?: Record<string, number>;
}
