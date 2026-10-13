import { randomUUID } from 'node:crypto';
import { HttpError } from '../../common/middlewares/errorHandler.js';
import { env } from '../../config/env.js';
import { parseIntent } from '../ai/intent.js';
import { narrate, type NarrationInput } from '../ai/narrator.js';
import { createProvider, type LlmHealth, type LlmProvider } from '../ai/provider.js';
import { applyAction, createGame, EngineError, findAction, FREE_ACTION, listActions } from '../engine/engine.js';
import type { EngineEvent, GameState, PlayerSetup } from '../engine/types.js';
import { loadScenarioDir } from '../scenario/scenario.loader.js';
import type { Scenario } from '../scenario/scenario.schema.js';

// 1인 플레이 (테스트 플레이, F-SCN-08 기반). 멀티플레이 세션(F-SES)은 같은 엔진을 Socket 으로 연결할 예정.

export type FeedEntry =
  | { id: string; type: 'player'; text: string }
  | { id: string; type: 'system'; text: string }
  | { id: string; type: 'fixed'; text: string }
  | { id: string; type: 'check'; text: string; success: boolean; roll: number; bonus: number; total: number; dc: number; critical: string | null }
  | { id: string; type: 'narration'; text: string; fallback: boolean }
  | { id: string; type: 'ending'; title: string; text: string };

export type StreamEvent =
  | { type: 'feed'; entry: FeedEntry }
  | { type: 'narration_start'; id: string }
  | { type: 'narration_delta'; id: string; delta: string }
  | { type: 'narration_end'; entry: FeedEntry }
  | { type: 'view'; view: GameView }
  | { type: 'error'; message: string };

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
  debug: { fixedRoll: number | null };
}

interface Game {
  id: string;
  scenario: Scenario;
  state: GameState;
  feed: FeedEntry[];
  busy: boolean;
  updatedAt: number;
}

const ACTOR = 'p1';
const MAX_GAMES = 200;

let provider: LlmProvider | null = createProvider();
let scenarios: Map<string, Scenario> | null = null;
const games = new Map<string, Game>();
let seq = 0;
const nextId = () => `f${++seq}`;

/** 테스트에서 LLM 공급자 교체 */
export function setProvider(next: LlmProvider | null) {
  provider = next;
}

function getScenarios() {
  scenarios ??= loadScenarioDir(env.scenarioDir);
  return scenarios;
}

export function reloadScenarios() {
  scenarios = null;
  return getScenarios();
}

function getGame(id: string): Game {
  const game = games.get(id);
  if (!game) throw new HttpError(404, 'GAME_NOT_FOUND', '게임을 찾을 수 없습니다. 서버가 재시작되었다면 새로 시작하세요.');
  return game;
}

export function listScenarios() {
  return [...getScenarios().values()].map((s) => ({
    id: s.meta.id,
    title: s.meta.title,
    summary: s.meta.summary ?? '',
    players: s.meta.players,
    estimatedMinutes: s.meta.estimated_minutes,
    tags: s.meta.tags,
    stats: s.ruleset.stats,
    characterCreation: s.ruleset.character_creation ?? null,
    presets: Object.entries(s.presets ?? {}).map(([id, p]) => ({ id, ...p })),
  }));
}

export async function aiStatus(): Promise<LlmHealth & { provider: string; model: string | null }> {
  if (!provider) return { available: false, message: 'LLM 미사용 (LLM_PROVIDER=none)', provider: 'none', model: null };
  return { ...(await provider.health()), provider: provider.name, model: provider.model };
}

function toView(game: Game): GameView {
  const { scenario: sc, state } = game;
  const c = state.party[0];
  const scene = sc.scenes[state.sceneId];
  return {
    gameId: game.id,
    scenario: { id: sc.meta.id, title: sc.meta.title },
    turn: state.turn,
    scene: { id: state.sceneId, name: scene.name, description: scene.description, npcs: (scene.npcs ?? []).map((n) => sc.npcs[n].name) },
    character: {
      name: c.name,
      stats: c.stats,
      hp: c.resources.hp ?? 0,
      maxHp: c.resourceMax.hp ?? 0,
      down: c.down,
      statuses: c.statuses.map((s) => ({ id: s.id, name: sc.statuses?.[s.id]?.name ?? s.id, remaining: s.remaining })),
    },
    inventory: Object.entries(c.inventory).map(([id, qty]) => ({
      id,
      name: sc.items[id].name,
      description: sc.items[id].description ?? '',
      qty,
    })),
    combat: state.combat
      ? { enemies: state.combat.enemies.filter((e) => !e.gone).map((e) => ({ uid: e.uid, name: e.name, hp: e.hp, maxHp: e.maxHp })) }
      : null,
    actions: listActions(sc, state, ACTOR).map((a) => ({ id: a.id, label: a.label, group: a.group })),
    ending: state.ending,
    debug: { fixedRoll: state.fixedRoll },
  };
}

/** 엔진 이벤트 → 화면 기록 (서술은 별도) */
function toFeed(sc: Scenario, events: EngineEvent[]): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'check':
        out.push({
          id: nextId(),
          type: 'check',
          text: `${e.reason} · ${e.stat}`,
          success: e.success,
          roll: e.roll,
          bonus: e.bonus,
          total: e.total,
          dc: e.dc,
          critical: e.critical,
        });
        break;
      case 'fixed':
      case 'locked':
        out.push({ id: nextId(), type: 'fixed', text: e.text });
        break;
      case 'item':
        out.push({ id: nextId(), type: 'system', text: e.delta > 0 ? `획득: ${e.name}` : `소모: ${e.name}` });
        break;
      case 'resource':
        if (e.resource === 'hp') out.push({ id: nextId(), type: 'system', text: `${e.actor} HP ${e.delta > 0 ? '+' : ''}${e.delta} → ${e.value}` });
        break;
      case 'status':
        out.push({
          id: nextId(),
          type: 'system',
          text: `${e.actor}: ${e.name} ${{ applied: '걸림', resisted: '저항', removed: '해제', expired: '풀림' }[e.change]}`,
        });
        break;
      case 'restricted':
        out.push({ id: nextId(), type: 'system', text: `${e.actor}은(는) ${e.status} 때문에 움직일 수 없다` });
        break;
      case 'move':
        out.push({ id: nextId(), type: 'system', text: `이동: ${e.sceneName}` });
        break;
      case 'combat_start':
        out.push({ id: nextId(), type: 'system', text: `전투 시작: ${e.enemies.join(', ')}` });
        break;
      case 'attack':
        out.push({
          id: nextId(),
          type: 'system',
          text: `${e.attacker}${e.skill ? `의 ${e.skill}` : ''} → ${e.target}: ${e.hit ? `명중 (${e.damage})` : '빗나감'}`,
        });
        break;
      case 'enemy_gone':
        out.push({ id: nextId(), type: 'system', text: `${e.name} ${e.reason === 'defeated' ? '처치' : '도주'}` });
        break;
      case 'combat_end':
        out.push({ id: nextId(), type: 'system', text: e.reason === 'victory' ? '전투 종료' : '전투에서 벗어남' });
        break;
      case 'down':
        out.push({ id: nextId(), type: 'system', text: `${e.actor} 쓰러짐` });
        break;
      case 'secret':
        out.push({ id: nextId(), type: 'system', text: `비밀 공개: ${e.npc}` });
        break;
      case 'hint':
      case 'talk':
      case 'nothing':
      case 'ending':
        break;
    }
  }
  return out;
}

function evictOldGames() {
  if (games.size < MAX_GAMES) return;
  const oldest = [...games.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
  games.delete(oldest.id);
}

export function startGame(scenarioId: string, player: PlayerSetup) {
  const sc = getScenarios().get(scenarioId);
  if (!sc) throw new HttpError(404, 'SCENARIO_NOT_FOUND', '시나리오를 찾을 수 없습니다.');
  let created;
  try {
    created = createGame(sc, [player]);
  } catch (e) {
    if (e instanceof EngineError) throw new HttpError(422, 'INVALID_PLAYER', e.message);
    throw e;
  }
  evictOldGames();
  const scene = sc.scenes[created.state.sceneId];
  const game: Game = {
    id: randomUUID(),
    scenario: sc,
    state: created.state,
    feed: [
      { id: nextId(), type: 'narration', text: `${sc.meta.summary ?? sc.meta.title}\n\n${scene.description}`, fallback: true },
      ...toFeed(sc, created.events),
    ],
    busy: false,
    updatedAt: Date.now(),
  };
  games.set(game.id, game);
  return { view: toView(game), feed: game.feed };
}

export function getGameSnapshot(id: string) {
  const game = getGame(id);
  return { view: toView(game), feed: game.feed };
}

/** 테스트 플레이 디버그: 주사위 고정 (F-SCN-08) */
export function setFixedRoll(id: string, value: number | null) {
  const game = getGame(id);
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 20)) {
    throw new HttpError(422, 'INVALID_ROLL', '주사위 값은 1~20 이어야 합니다.');
  }
  game.state = { ...game.state, fixedRoll: value };
  return toView(game);
}

export type ActInput = { actionId: string } | { text: string };

/** 행동 1회: 의도 해석 → 엔진 → 서술 스트리밍 */
export async function* act(id: string, input: ActInput): AsyncGenerator<StreamEvent> {
  const game = getGame(id);
  if (game.busy) throw new HttpError(409, 'BUSY', '이전 행동을 처리하는 중입니다.');
  if (game.state.ending) throw new HttpError(409, 'ENDED', '이미 끝난 게임입니다.');
  game.busy = true;
  game.updatedAt = Date.now();

  const push = (entry: FeedEntry): StreamEvent => {
    game.feed.push(entry);
    return { type: 'feed', entry };
  };

  try {
    const sc = game.scenario;
    const before = game.state;
    let actionId: string;
    let utterance = '';

    if ('text' in input) {
      const text = input.text.trim().slice(0, 300);
      if (!text) throw new HttpError(400, 'EMPTY_INPUT', '행동을 입력하세요.');
      yield push({ id: nextId(), type: 'player', text });
      const intent = await parseIntent(provider, sc, before.sceneId, listActions(sc, before, ACTOR), text);
      actionId = intent.actionId;
      utterance = intent.utterance;
      if (intent.source === 'fallback' && !provider) {
        yield push({ id: nextId(), type: 'system', text: 'LLM 없이 실행 중이라 자유 입력은 해석하지 않습니다. 아래 행동 버튼을 사용하세요.' });
      }
    } else {
      actionId = input.actionId;
    }

    const action = findAction(sc, before, ACTOR, actionId);
    if (!action) throw new HttpError(422, 'INVALID_ACTION', '지금은 할 수 없는 행동입니다.');
    if ('actionId' in input) yield push({ id: nextId(), type: 'player', text: action.label });
    else if (action.kind !== 'free') yield push({ id: nextId(), type: 'system', text: `→ ${action.label}` });

    let result;
    try {
      result = applyAction(sc, before, ACTOR, action.kind === 'free' ? FREE_ACTION(utterance || '자유 행동') : action);
    } catch (e) {
      if (e instanceof EngineError) throw new HttpError(422, 'ENGINE_REJECTED', e.message);
      throw e;
    }
    game.state = result.state;

    // 엔진 결과(판정, 상태 변화)를 서술보다 먼저 보낸다
    for (const entry of toFeed(sc, result.events)) yield push(entry);
    yield { type: 'view', view: toView(game) };

    const narrationInput: NarrationInput = {
      sc,
      state: result.state,
      actor: result.state.party[0],
      action,
      utterance,
      events: result.events,
      recent: game.feed.filter((f) => f.type === 'narration').slice(-2).map((f) => (f as { text: string }).text),
    };
    const narrationId = nextId();
    yield { type: 'narration_start', id: narrationId };
    for await (const chunk of narrate(provider, narrationInput)) {
      if (chunk.type === 'delta') yield { type: 'narration_delta', id: narrationId, delta: chunk.text };
      else {
        const entry: FeedEntry = { id: narrationId, type: 'narration', text: chunk.text, fallback: chunk.fallback };
        game.feed.push(entry);
        yield { type: 'narration_end', entry };
      }
    }

    if (result.state.ending) {
      yield push({ id: nextId(), type: 'ending', title: result.state.ending.title, text: result.state.ending.text });
    }
  } finally {
    game.busy = false;
    game.updatedAt = Date.now();
  }
}
