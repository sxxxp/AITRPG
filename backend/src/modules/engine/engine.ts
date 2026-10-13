import type { Check, Interaction, Op, Scenario, ScenarioEvent } from '../scenario/scenario.schema.js';
import { nextRandom, rollD20, rollDice } from './dice.js';
import { evaluateBool, evaluateNumber, type ExprContext, type Value } from './expression.js';
import type {
  Action,
  AnyAction,
  CharacterState,
  EngineEvent,
  EnemyState,
  GameState,
  PlayerSetup,
} from './types.js';

// 게임 엔진 (F-ENG). 시나리오 v1(docs/기능명세서.md §6)을 해석해 상태를 바꾸는 유일한 주체.
// I/O 없음. 같은 상태 + 같은 행동 = 같은 결과 (난수 상태도 GameState 에 포함).

export class EngineError extends Error {}

type CheckSpec = Pick<Check, 'stat' | 'dc' | 'modifiers'>;

function combatRules(sc: Scenario) {
  const first = sc.ruleset.stats[0];
  return (
    sc.ruleset.combat ?? {
      attack_stat: first,
      attack_dc: 10,
      damage: '1d6',
      damage_bonus_stat: undefined,
      dodge: undefined,
      flee: { stat: first, dc: 12 },
    }
  );
}

function hasRestriction(sc: Scenario, c: CharacterState) {
  return c.statuses.some((s) => sc.statuses?.[s.id]?.restrict_actions);
}

class Turn {
  readonly events: EngineEvent[] = [];

  constructor(
    readonly sc: Scenario,
    readonly state: GameState,
  ) {}

  get scene() {
    return this.sc.scenes[this.state.sceneId];
  }

  private defaultActor(): CharacterState {
    return this.state.party.find((c) => !c.down) ?? this.state.party[0];
  }

  ctx(actor?: CharacterState, identifiers: Record<string, Value> = {}): ExprContext {
    const s = this.state;
    const a = actor ?? this.defaultActor();
    return {
      identifiers: { ...a.stats, ...identifiers },
      functions: {
        flag: (id) => !!s.flags[String(id)],
        var: (id) => s.vars[String(id)] ?? 0,
        has_item: (id) => s.party.some((c) => (c.inventory[String(id)] ?? 0) > 0),
        stat: (id) => a.stats[String(id)] ?? 0,
        resource: (id) => a.resources[String(id)] ?? 0,
        in_scene: (id) => s.sceneId === String(id),
        turn_count: () => s.turn,
        all_players_down: () => s.party.every((c) => c.down),
        party_size: () => s.party.length,
      },
    };
  }

  cond(expr: string | undefined, actor?: CharacterState): boolean {
    return expr === undefined || evaluateBool(expr, this.ctx(actor));
  }

  check(actor: CharacterState, spec: CheckSpec, reason: string): boolean {
    const roll = rollD20(this.state);
    const modifier = (spec.modifiers ?? [])
      .filter((m) => this.cond(m.when, actor))
      .reduce((sum, m) => sum + m.bonus, 0);
    const bonus = (actor.stats[spec.stat] ?? 0) + modifier;
    const total = roll + bonus;
    const crit = this.sc.ruleset.critical;
    const critical = crit && roll === crit.success ? 'success' : crit && roll === crit.failure ? 'failure' : null;
    const success = critical === 'success' ? true : critical === 'failure' ? false : total >= spec.dc;
    this.events.push({ type: 'check', actor: actor.name, stat: spec.stat, roll, bonus, total, dc: spec.dc, success, critical, reason });
    return success;
  }

  runBranch(b: Interaction | ScenarioEvent, actor: CharacterState, reason: string, lockedFallback: string | null) {
    if (!this.cond(b.condition, actor)) {
      const text = b.locked_text ?? lockedFallback;
      if (text) this.events.push({ type: 'locked', text });
      return false;
    }
    if (b.check) {
      const ok = this.check(actor, b.check, reason);
      this.runOps((ok ? b.success : b.failure) ?? [], actor);
    } else {
      this.runOps(b.actions ?? [], actor);
    }
    return true;
  }

  runOps(ops: Op[], actor: CharacterState, target: CharacterState = actor) {
    for (const op of ops) {
      if (this.state.ending) return;
      this.runOp(op, actor, target);
    }
  }

  private runOp(op: Op, actor: CharacterState, target: CharacterState) {
    const s = this.state;
    switch (op.op) {
      case 'give_item':
        this.giveItem(actor, op.item, op.quantity ?? 1);
        break;
      case 'remove_item':
        this.removeItem(actor, op.item, op.quantity ?? 1);
        break;
      case 'add_resource':
        this.changeResource(target, op.resource, rollDice(s, op.value));
        break;
      case 'set_resource':
        this.changeResource(target, op.resource, rollDice(s, op.value) - (target.resources[op.resource] ?? 0));
        break;
      case 'set_flag':
        s.flags[op.flag] = op.value;
        break;
      case 'add_var':
        s.vars[op.var] = (s.vars[op.var] ?? 0) + op.value;
        break;
      case 'move_party':
        this.moveTo(op.scene, actor);
        break;
      case 'start_combat':
        this.startCombat(op.enemies);
        break;
      case 'end_combat':
        if (s.combat) {
          s.combat = null;
          this.events.push({ type: 'combat_end', reason: 'victory' });
        }
        break;
      case 'apply_status':
        this.applyStatus(target, op.status, op.save);
        break;
      case 'remove_status':
        this.removeStatus(target, op.status, 'removed');
        break;
      case 'narrate_hint':
        this.events.push({ type: 'hint', text: op.text });
        break;
      case 'fixed_text':
        this.events.push({ type: 'fixed', text: op.text });
        break;
      case 'reveal_secret': {
        const key = `${op.npc}:${op.secret}`;
        if (!s.revealedSecrets.includes(key)) s.revealedSecrets.push(key);
        this.events.push({ type: 'secret', npc: this.sc.npcs[op.npc]?.name ?? op.npc, text: op.secret });
        break;
      }
      case 'trigger_ending':
        this.setEnding(op.ending);
        break;
    }
  }

  giveItem(actor: CharacterState, item: string, qty: number) {
    actor.inventory[item] = (actor.inventory[item] ?? 0) + qty;
    this.events.push({ type: 'item', actor: actor.name, item, name: this.sc.items[item].name, delta: qty });
  }

  removeItem(actor: CharacterState, item: string, qty: number) {
    let left = qty;
    // 행동한 캐릭터부터, 부족하면 다른 파티원에게서 가져간다
    for (const c of [actor, ...this.state.party.filter((p) => p !== actor)]) {
      const take = Math.min(left, c.inventory[item] ?? 0);
      if (take <= 0) continue;
      c.inventory[item] -= take;
      if (c.inventory[item] === 0) delete c.inventory[item];
      left -= take;
      this.events.push({ type: 'item', actor: c.name, item, name: this.sc.items[item].name, delta: -take });
      if (left === 0) break;
    }
  }

  changeResource(target: CharacterState, resource: string, delta: number) {
    if (!(resource in target.resources)) return;
    const before = target.resources[resource];
    const value = Math.min(target.resourceMax[resource], Math.max(target.resourceMin[resource], before + delta));
    target.resources[resource] = value;
    if (value !== before) this.events.push({ type: 'resource', actor: target.name, resource, delta: value - before, value });
    if (resource === 'hp' && value <= target.resourceMin.hp && !target.down) {
      target.down = true;
      this.events.push({ type: 'down', actor: target.name });
    }
  }

  applyStatus(target: CharacterState, statusId: string, save?: { stat: string; dc: number }) {
    const def = this.sc.statuses?.[statusId];
    if (!def || target.down) return;
    if (save && this.check(target, save, `${def.name} 저항`)) {
      this.events.push({ type: 'status', actor: target.name, status: statusId, name: def.name, change: 'resisted' });
      return;
    }
    target.statuses = target.statuses.filter((st) => st.id !== statusId);
    target.statuses.push({ id: statusId, remaining: def.duration === 'until_removed' ? null : def.duration });
    this.events.push({ type: 'status', actor: target.name, status: statusId, name: def.name, change: 'applied' });
  }

  removeStatus(target: CharacterState, statusId: string, change: 'removed' | 'expired') {
    if (!target.statuses.some((st) => st.id === statusId)) return;
    target.statuses = target.statuses.filter((st) => st.id !== statusId);
    const name = this.sc.statuses?.[statusId]?.name ?? statusId;
    this.events.push({ type: 'status', actor: target.name, status: statusId, name, change });
  }

  /** 턴 시작 처리. 이번 턴 행동을 막는 상태이상 ID를 반환 */
  tickStatuses(actor: CharacterState): string | null {
    for (const st of [...actor.statuses]) {
      const def = this.sc.statuses?.[st.id];
      if (!def) continue;
      this.runOps(def.on_turn_start ?? [], actor);
      if (def.resist && actor.statuses.some((x) => x.id === st.id) && this.check(actor, def.resist.check, `${def.name} 저항`)) {
        this.runOps(def.resist.on_success, actor);
      }
    }
    const restricting = actor.statuses.find((st) => this.sc.statuses?.[st.id]?.restrict_actions)?.id ?? null;
    for (const st of [...actor.statuses]) {
      if (st.remaining === null) continue;
      st.remaining -= 1;
      if (st.remaining <= 0) this.removeStatus(actor, st.id, 'expired');
    }
    return restricting;
  }

  enterScene(sceneId: string, actor: CharacterState) {
    this.runOps(this.sc.scenes[sceneId].on_enter ?? [], actor);
    for (const ev of this.sc.events ?? []) {
      if (this.state.ending || this.state.sceneId !== sceneId) return;
      if (ev.trigger.type === 'enter_scene' && ev.trigger.scene === sceneId) this.runEvent(ev, actor);
    }
  }

  moveTo(sceneId: string, actor: CharacterState) {
    const from = this.state.sceneId;
    this.state.prevSceneId = from;
    this.state.sceneId = sceneId;
    this.events.push({ type: 'move', from, to: sceneId, sceneName: this.sc.scenes[sceneId].name });
    this.enterScene(sceneId, actor);
  }

  runEvent(ev: ScenarioEvent, actor: CharacterState): boolean {
    return this.runBranch(ev, actor, ev.id, null);
  }

  processConditionEvents(actor: CharacterState) {
    for (let guard = 0; guard < 50; guard++) {
      const ev = (this.sc.events ?? []).find(
        (e) => e.trigger.type === 'condition' && !this.state.firedEvents.includes(e.id) && this.cond(e.condition, actor),
      );
      if (!ev || this.state.ending) return;
      this.state.firedEvents.push(ev.id);
      if (ev.check) {
        const ok = this.check(actor, ev.check, ev.id);
        this.runOps((ok ? ev.success : ev.failure) ?? [], actor);
      } else {
        this.runOps(ev.actions ?? [], actor);
      }
    }
  }

  setEnding(id: string) {
    const ending = this.sc.endings.find((e) => e.id === id);
    if (!ending || this.state.ending) return;
    this.state.ending = { id: ending.id, title: ending.title, text: ending.text };
    this.events.push({ type: 'ending', id: ending.id, title: ending.title, text: ending.text });
  }

  checkEndings() {
    if (this.state.ending) return;
    const ending = this.sc.endings.find((e) => evaluateBool(e.condition, this.ctx()));
    if (ending) this.setEnding(ending.id);
  }

  // ── 전투 ──
  activeEnemies(): EnemyState[] {
    return this.state.combat?.enemies.filter((e) => !e.gone) ?? [];
  }

  startCombat(ids: string[]) {
    const enemies = ids.map((id) => {
      const def = this.sc.enemies![id];
      const hp = typeof def.hp === 'number' ? def.hp : evaluateNumber(def.hp, this.ctx());
      return { uid: `e${this.state.nextEnemyUid++}`, id, name: def.name, hp, maxHp: hp, gone: null } satisfies EnemyState;
    });
    if (this.state.combat) this.state.combat.enemies.push(...enemies);
    else this.state.combat = { enemies };
    this.events.push({ type: 'combat_start', enemies: enemies.map((e) => e.name) });
  }

  finishCombatIfDone() {
    if (this.state.combat && this.activeEnemies().length === 0) {
      this.state.combat = null;
      this.events.push({ type: 'combat_end', reason: 'victory' });
    }
  }

  playerAttack(actor: CharacterState, uid: string) {
    const rules = combatRules(this.sc);
    const enemy = this.activeEnemies().find((e) => e.uid === uid);
    if (!enemy) throw new EngineError('공격할 수 없는 대상입니다');
    const hit = this.check(actor, { stat: rules.attack_stat, dc: rules.attack_dc }, `${enemy.name} 공격`);
    let damage = 0;
    if (hit) {
      const bonus = rules.damage_bonus_stat ? (actor.stats[rules.damage_bonus_stat] ?? 0) : 0;
      damage = Math.max(1, rollDice(this.state, rules.damage) + bonus);
      enemy.hp = Math.max(0, enemy.hp - damage);
    }
    this.events.push({ type: 'attack', attacker: actor.name, target: enemy.name, hit, damage, skill: null });
    if (enemy.hp <= 0) {
      enemy.gone = 'defeated';
      this.events.push({ type: 'enemy_gone', name: enemy.name, reason: 'defeated' });
      this.runOps(this.sc.enemies![enemy.id].on_defeat ?? [], actor);
    }
    this.finishCombatIfDone();
  }

  flee(actor: CharacterState) {
    const rules = combatRules(this.sc);
    if (!this.check(actor, rules.flee, '도주')) return;
    this.state.combat = null;
    this.events.push({ type: 'combat_end', reason: 'escaped' });
    if (this.state.prevSceneId) this.moveTo(this.state.prevSceneId, actor);
  }

  private pickRandom<T>(list: T[]): T {
    return list[Math.floor(nextRandom(this.state) * list.length)];
  }

  private enemyHit(enemy: EnemyState, target: CharacterState, dice: string, skill: string | null) {
    const rules = combatRules(this.sc);
    const hit = rules.dodge ? !this.check(target, rules.dodge, `${enemy.name}의 ${skill ?? '공격'} 회피`) : true;
    const damage = hit ? Math.max(1, rollDice(this.state, dice)) : 0;
    this.events.push({ type: 'attack', attacker: enemy.name, target: target.name, hit, damage, skill });
    if (hit) this.changeResource(target, 'hp', -damage);
  }

  enemiesAct() {
    for (const enemy of this.activeEnemies()) {
      const alive = this.state.party.filter((c) => !c.down);
      if (this.state.ending || alive.length === 0) return;
      const def = this.sc.enemies![enemy.id];
      let action: string | null = null;
      for (const b of def.behavior) {
        if ('default' in b) {
          action = b.default;
          break;
        }
        if (evaluateBool(b.when, this.ctx(undefined, { hp: enemy.hp }))) {
          action = b.do;
          break;
        }
      }
      if (!action) continue;
      if (action === 'flee') {
        enemy.gone = 'fled';
        this.events.push({ type: 'enemy_gone', name: enemy.name, reason: 'fled' });
        continue;
      }
      const target =
        action === 'attack_lowest_hp'
          ? alive.reduce((a, b) => ((a.resources.hp ?? 0) <= (b.resources.hp ?? 0) ? a : b))
          : this.pickRandom(alive);
      if (action.startsWith('skill:')) {
        const skill = def.skills![action.slice(6)];
        if (skill.attack) {
          const targets = skill.attack.targets === 'all' ? alive : [target];
          for (const t of targets) this.enemyHit(enemy, t, skill.attack.dice, skill.name);
        }
        if (skill.effects) this.runOps(skill.effects, target, target);
      } else {
        const targets = def.attack.targets === 'all' ? alive : [target];
        for (const t of targets) this.enemyHit(enemy, t, def.attack.dice, null);
      }
    }
    this.finishCombatIfDone();
  }

  // ── 플레이어 행동 ──
  perform(actor: CharacterState, action: AnyAction) {
    const scene = this.scene;
    switch (action.kind) {
      case 'examine': {
        const obj = scene.objects![action.object];
        this.runBranch(obj.on_examine!, actor, `${obj.name} 조사`, '더 이상 특별한 것은 보이지 않는다.');
        break;
      }
      case 'interact': {
        const obj = scene.objects![action.object];
        this.runBranch(obj.on_interact!, actor, obj.name, '아무 일도 일어나지 않았다.');
        break;
      }
      case 'move': {
        const exit = scene.exits[action.exit];
        if (!this.cond(exit.condition, actor)) {
          this.events.push({ type: 'locked', text: exit.locked_text ?? '지금은 그쪽으로 갈 수 없다.' });
        } else {
          this.moveTo(exit.to, actor);
        }
        break;
      }
      case 'use_item':
        this.useItem(actor, action.item, action.target);
        break;
      case 'talk':
        this.events.push({ type: 'talk', actor: actor.name, npc: action.npc });
        break;
      case 'attack':
        this.playerAttack(actor, action.enemy);
        break;
      case 'flee':
        this.flee(actor);
        break;
      case 'wait':
      case 'free':
        break;
    }
  }

  private useItem(actor: CharacterState, item: string, target: string | null) {
    const def = this.sc.items[item];
    const events = (this.sc.events ?? []).filter(
      (ev) => ev.trigger.type === 'use_item' && ev.trigger.item === item && (ev.trigger.target ?? null) === target,
    );
    for (const ev of events) if (this.runEvent(ev, actor)) return;
    if (target) {
      this.events.push({ type: 'nothing', text: '아무 일도 일어나지 않았다.' });
      return;
    }
    if (def.effects.length === 0) {
      this.events.push({ type: 'nothing', text: `${def.name}을(를) 지금 쓸 곳이 없다.` });
      return;
    }
    if (def.consumable) this.removeItem(actor, item, 1);
    this.runOps(def.effects, actor, actor);
  }
}

// ───────────────────────── 공개 API ─────────────────────────

function buildCharacter(sc: Scenario, setup: PlayerSetup, index: number): CharacterState {
  const name = setup.name.trim();
  if (!name || name.length > 20) throw new EngineError('캐릭터 이름은 1~20자여야 합니다');

  let stats: Record<string, number>;
  if (setup.presetId) {
    const preset = sc.presets?.[setup.presetId];
    if (!preset) throw new EngineError(`존재하지 않는 프리셋: ${setup.presetId}`);
    stats = { ...preset.stats };
  } else if (setup.stats) {
    const cc = sc.ruleset.character_creation;
    if (!cc?.allow_custom) throw new EngineError('이 시나리오는 직접 캐릭터를 만들 수 없습니다');
    let sum = 0;
    for (const st of sc.ruleset.stats) {
      const v = setup.stats[st];
      if (!Number.isInteger(v) || v < cc.min_per_stat || v > cc.max_per_stat) throw new EngineError(`${st} 값이 허용 범위를 벗어났습니다`);
      sum += v;
    }
    if (sum !== cc.total_points) throw new EngineError(`스탯 합계는 ${cc.total_points}이어야 합니다`);
    stats = Object.fromEntries(sc.ruleset.stats.map((st) => [st, setup.stats![st]]));
  } else {
    throw new EngineError('프리셋 또는 스탯이 필요합니다');
  }

  const ctx: ExprContext = { identifiers: stats, functions: {} };
  const resourceMax: Record<string, number> = {};
  const resourceMin: Record<string, number> = {};
  for (const [rid, r] of Object.entries(sc.ruleset.resources)) {
    resourceMax[rid] = evaluateNumber(r.max, ctx);
    resourceMin[rid] = evaluateNumber(r.min, ctx);
  }
  return {
    id: `p${index + 1}`,
    name,
    stats,
    resources: { ...resourceMax },
    resourceMax,
    resourceMin,
    statuses: [],
    inventory: {},
    down: false,
  };
}

export function createGame(sc: Scenario, players: PlayerSetup[], seed = Date.now()): { state: GameState; events: EngineEvent[] } {
  if (players.length < 1 || players.length > sc.meta.players.max) {
    throw new EngineError(`플레이어는 1~${sc.meta.players.max}명이어야 합니다`);
  }
  const state: GameState = {
    version: 1,
    scenarioId: sc.meta.id,
    sceneId: sc.meta.start_scene,
    prevSceneId: null,
    turn: 0,
    flags: {},
    vars: { ...(sc.variables ?? {}) },
    party: players.map((p, i) => buildCharacter(sc, p, i)),
    combat: null,
    firedEvents: [],
    revealedSecrets: [],
    ending: null,
    nextEnemyUid: 1,
    rng: seed >>> 0,
    fixedRoll: null,
  };
  const turn = new Turn(sc, state);
  turn.enterScene(state.sceneId, state.party[0]);
  turn.processConditionEvents(state.party[0]);
  return { state, events: turn.events };
}

/** 현재 행동 가능한 선택지 (UI 버튼 + AI 의도 해석 후보) */
export function listActions(sc: Scenario, state: GameState, actorId: string): Action[] {
  const actor = state.party.find((c) => c.id === actorId);
  if (state.ending || !actor || actor.down) return [];
  if (hasRestriction(sc, actor)) return [{ id: 'wait', kind: 'wait', label: '버티기', group: '행동' }];

  const actions: Action[] = [];
  const owned = Object.keys(actor.inventory).filter((id) => actor.inventory[id] > 0);
  const selfUse = owned
    .filter((id) => sc.items[id].effects.length > 0)
    .map((id): Action => ({ id: `use:${id}`, kind: 'use_item', label: `${sc.items[id].name} 사용`, group: '아이템', item: id, target: null }));

  if (state.combat) {
    const active = state.combat.enemies.filter((e) => !e.gone);
    for (const e of active) {
      const same = active.filter((x) => x.name === e.name);
      const suffix = same.length > 1 ? ` ${same.indexOf(e) + 1}` : '';
      actions.push({ id: `attack:${e.uid}`, kind: 'attack', label: `${e.name}${suffix} 공격`, group: '전투', enemy: e.uid });
    }
    actions.push(...selfUse);
    actions.push({ id: 'flee', kind: 'flee', label: '도망치기', group: '전투' });
    return actions;
  }

  const scene = sc.scenes[state.sceneId];
  for (const [oid, obj] of Object.entries(scene.objects ?? {})) {
    if (obj.on_examine) actions.push({ id: `examine:${oid}`, kind: 'examine', label: `${obj.name} 살펴보기`, group: '조사', object: oid });
    if (obj.on_interact) actions.push({ id: `interact:${oid}`, kind: 'interact', label: `${obj.name} 다루기`, group: '행동', object: oid });
  }
  for (const nid of scene.npcs ?? []) {
    actions.push({ id: `talk:${nid}`, kind: 'talk', label: `${sc.npcs[nid].name}에게 말 걸기`, group: '대화', npc: nid });
  }
  scene.exits.forEach((exit, i) => {
    actions.push({ id: `move:${i}`, kind: 'move', label: `${exit.label}(으)로 이동`, group: '이동', exit: i, to: exit.to });
  });
  actions.push(...selfUse);

  const prefix = `${state.sceneId}.`;
  const seen = new Set<string>();
  for (const ev of sc.events ?? []) {
    const t = ev.trigger;
    if (t.type !== 'use_item' || !t.target?.startsWith(prefix) || !owned.includes(t.item)) continue;
    const id = `use:${t.item}@${t.target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const [, kind, name] = t.target.split('.');
    const targetName = kind === 'objects' ? scene.objects?.[name]?.name : scene.exits.find((e) => e.to === name)?.label;
    actions.push({
      id,
      kind: 'use_item',
      label: `${sc.items[t.item].name} → ${targetName ?? name}`,
      group: '아이템',
      item: t.item,
      target: t.target,
    });
  }
  return actions;
}

export const FREE_ACTION = (label = '자유 행동'): AnyAction => ({ id: 'free', kind: 'free', label });

/** 행동 1회 처리. 입력 상태는 변경하지 않고 새 상태를 반환 */
export function applyAction(
  sc: Scenario,
  prev: GameState,
  actorId: string,
  action: AnyAction,
): { state: GameState; events: EngineEvent[] } {
  if (prev.ending) throw new EngineError('이미 끝난 게임입니다');
  const prevActor = prev.party.find((c) => c.id === actorId);
  if (!prevActor) throw new EngineError('존재하지 않는 캐릭터입니다');
  if (prevActor.down) throw new EngineError('행동할 수 없는 상태입니다');
  if (action.kind !== 'free' && !listActions(sc, prev, actorId).some((a) => a.id === action.id)) {
    throw new EngineError('지금은 할 수 없는 행동입니다');
  }

  const state = structuredClone(prev);
  const actor = state.party.find((c) => c.id === actorId)!;
  const turn = new Turn(sc, state);
  const inCombat = state.combat !== null;
  state.turn += 1;

  const restricted = turn.tickStatuses(actor);
  if (!actor.down && !state.ending) {
    if (restricted) {
      turn.events.push({ type: 'restricted', actor: actor.name, status: sc.statuses?.[restricted]?.name ?? restricted });
    } else {
      turn.perform(actor, action);
    }
  }
  // 전투 중이던 턴에만 적이 행동 (이번 턴에 시작된 전투는 다음 턴부터)
  if (inCombat && state.combat && !state.ending) turn.enemiesAct();
  turn.processConditionEvents(actor);
  turn.checkEndings();
  return { state, events: turn.events };
}

export function findAction(sc: Scenario, state: GameState, actorId: string, actionId: string): AnyAction | undefined {
  if (actionId === 'free') return FREE_ACTION();
  return listActions(sc, state, actorId).find((a) => a.id === actionId);
}
