import { isNode, LineCounter, parseDocument } from 'yaml';
import type { ZodErrorMap } from 'zod';
import {
  scenarioSchema,
  TARGET_RE,
  type Check,
  type Interaction,
  type Op,
  type Scenario,
} from './scenario.schema.js';

// BE-SCN-10 (F-SCN-03 스키마 검증, F-SCN-04 참조 무결성)

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  /** 예: scenes.stairs_4.objects.lectern.on_interact.success.1.scene */
  path: string;
  /** 1부터 시작. 위치를 특정할 수 없으면 null */
  line: number | null;
  message: string;
  severity: Severity;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

type Path = (string | number)[];
type RawIssue = { severity: Severity; path: Path; message: string };

const DSL_FUNCTIONS = new Set([
  'flag',
  'var',
  'has_item',
  'stat',
  'resource',
  'in_scene',
  'turn_count',
  'all_players_down',
  'party_size',
]);

const errorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: issue.received === 'undefined' ? '필수 항목입니다' : `${issue.expected} 형식이어야 합니다 (입력: ${issue.received})` };
    case 'unrecognized_keys':
      return { message: `알 수 없는 키: ${issue.keys.join(', ')}` };
    case 'invalid_enum_value':
      return { message: `허용 값: ${issue.options.join(', ')}` };
    case 'invalid_literal':
      return { message: `${JSON.stringify(issue.expected)} 이어야 합니다` };
    case 'invalid_union_discriminator':
      return { message: `허용 값: ${issue.options.join(', ')}` };
    case 'too_small':
      return { message: issue.type === 'array' ? `최소 ${issue.minimum}개 필요합니다` : `${issue.minimum} 이상이어야 합니다` };
    case 'invalid_union':
      return { message: '형식이 올바르지 않습니다' };
    default:
      return { message: ctx.defaultError };
  }
};

export function validateScenarioSource(source: string): ValidationResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, uniqueKeys: true });

  if (doc.errors.length > 0) {
    return {
      valid: false,
      issues: doc.errors.map((e) => ({
        path: '',
        line: e.linePos?.[0].line ?? null,
        message: `YAML 문법 오류: ${e.message.split('\n')[0]}`,
        severity: 'error',
      })),
    };
  }

  // 경로에 해당하는 노드가 없으면 가장 가까운 상위 노드의 줄을 사용
  const lineOf = (path: Path): number | null => {
    for (let p = path; ; p = p.slice(0, -1)) {
      const node = p.length === 0 ? doc.contents : doc.getIn(p, true);
      if (isNode(node) && node.range) return lineCounter.linePos(node.range[0]).line;
      if (p.length === 0) return null;
    }
  };
  const toIssue = ({ severity, path, message }: RawIssue): ValidationIssue => ({
    path: path.join('.'),
    line: lineOf(path),
    message,
    severity,
  });

  const parsed = scenarioSchema.safeParse(doc.toJS(), { errorMap });
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((i) => toIssue({ severity: 'error', path: i.path, message: i.message })),
    };
  }

  const issues = checkReferences(parsed.data).map(toIssue);
  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}

/** 스키마를 통과한 시나리오의 참조 무결성/도달 가능성 검사 */
export function checkReferences(s: Scenario): RawIssue[] {
  const issues: RawIssue[] = [];
  const error = (path: Path, message: string) => issues.push({ severity: 'error', path, message });
  const warn = (path: Path, message: string) => issues.push({ severity: 'warning', path, message });

  const stats = new Set(s.ruleset.stats);
  const items = s.items;
  const scenes = s.scenes;
  const npcs = s.npcs;
  const enemies = s.enemies ?? {};
  const statuses = s.statuses ?? {};
  const variables = new Set(Object.keys(s.variables ?? {}));
  const endingIds = new Set(s.endings.map((e) => e.id));

  const flagsSet = new Set<string>();
  const flagsUsed: { flag: string; path: Path }[] = [];
  const obtainable = new Set<string>();
  const combatEnemies = new Set<string>();
  const placedNpcs = new Set<string>();
  const sceneLinks: { from: string | null; to: string }[] = [];

  const checkExpr = (expression: string, path: Path) => {
    for (const m of expression.matchAll(/([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
      const [, fn, rawArg] = m;
      const arg = rawArg.trim().replace(/^['"]|['"]$/g, '');
      if (!DSL_FUNCTIONS.has(fn)) {
        error(path, `알 수 없는 조건식 함수: ${fn}()`);
        continue;
      }
      if (fn === 'flag') flagsUsed.push({ flag: arg, path });
      if (fn === 'var' && !variables.has(arg)) error(path, `variables 에 선언되지 않은 변수: ${arg}`);
      if (fn === 'has_item' && !items[arg]) error(path, `존재하지 않는 아이템: ${arg}`);
      if (fn === 'stat' && !stats.has(arg)) error(path, `존재하지 않는 스탯: ${arg}`);
      if (fn === 'resource' && !s.ruleset.resources[arg]) error(path, `존재하지 않는 자원: ${arg}`);
      if (fn === 'in_scene' && !scenes[arg]) error(path, `존재하지 않는 장면: ${arg}`);
    }
  };

  const checkStat = (stat: string, path: Path) => {
    if (!stats.has(stat)) error(path, `룰셋에 없는 스탯: ${stat}`);
  };

  const checkCheck = (c: Check | undefined, path: Path) => {
    if (!c) return;
    checkStat(c.stat, [...path, 'stat']);
    c.modifiers?.forEach((m, i) => checkExpr(m.when, [...path, 'modifiers', i, 'when']));
  };

  const checkOps = (list: Op[] | undefined, path: Path, fromScene: string | null) => {
    list?.forEach((o, i) => {
      const p = [...path, i];
      switch (o.op) {
        case 'give_item':
          obtainable.add(o.item);
          if (!items[o.item]) error([...p, 'item'], `존재하지 않는 아이템: ${o.item}`);
          break;
        case 'remove_item':
          if (!items[o.item]) error([...p, 'item'], `존재하지 않는 아이템: ${o.item}`);
          break;
        case 'add_resource':
        case 'set_resource':
          if (!s.ruleset.resources[o.resource]) error([...p, 'resource'], `존재하지 않는 자원: ${o.resource}`);
          break;
        case 'set_flag':
          flagsSet.add(o.flag);
          break;
        case 'add_var':
          if (!variables.has(o.var)) error([...p, 'var'], `variables 에 선언되지 않은 변수: ${o.var}`);
          break;
        case 'move_party':
          if (!scenes[o.scene]) error([...p, 'scene'], `존재하지 않는 장면: ${o.scene}`);
          else sceneLinks.push({ from: fromScene, to: o.scene });
          break;
        case 'start_combat':
          o.enemies.forEach((e, j) => {
            combatEnemies.add(e);
            if (!enemies[e]) error([...p, 'enemies', j], `존재하지 않는 적: ${e}`);
          });
          break;
        case 'apply_status':
          if (!statuses[o.status]) error([...p, 'status'], `존재하지 않는 상태이상: ${o.status}`);
          if (o.save) checkStat(o.save.stat, [...p, 'save', 'stat']);
          break;
        case 'remove_status':
          if (!statuses[o.status]) error([...p, 'status'], `존재하지 않는 상태이상: ${o.status}`);
          break;
        case 'reveal_secret':
          if (!npcs[o.npc]) error([...p, 'npc'], `존재하지 않는 NPC: ${o.npc}`);
          else if (!npcs[o.npc].secrets.includes(o.secret)) error([...p, 'secret'], `${o.npc} 의 secrets 에 없는 문장입니다`);
          break;
        case 'trigger_ending':
          if (!endingIds.has(o.ending)) error([...p, 'ending'], `존재하지 않는 엔딩: ${o.ending}`);
          break;
      }
    });
  };

  const checkBranch = (b: Interaction, path: Path, fromScene: string | null) => {
    if (b.condition) checkExpr(b.condition, [...path, 'condition']);
    checkCheck(b.check, [...path, 'check']);
    checkOps(b.actions, [...path, 'actions'], fromScene);
    checkOps(b.success, [...path, 'success'], fromScene);
    checkOps(b.failure, [...path, 'failure'], fromScene);
  };

  // meta / ruleset / presets
  if (!scenes[s.meta.start_scene]) error(['meta', 'start_scene'], `존재하지 않는 장면: ${s.meta.start_scene}`);
  for (const [rid, r] of Object.entries(s.ruleset.resources)) {
    for (const key of ['max', 'min'] as const) {
      if (typeof r[key] === 'string') checkExpr(r[key] as string, ['ruleset', 'resources', rid, key]);
    }
  }
  const combat = s.ruleset.combat;
  if (combat) {
    const base: Path = ['ruleset', 'combat'];
    checkStat(combat.attack_stat, [...base, 'attack_stat']);
    if (combat.damage_bonus_stat) checkStat(combat.damage_bonus_stat, [...base, 'damage_bonus_stat']);
    if (combat.dodge) checkStat(combat.dodge.stat, [...base, 'dodge', 'stat']);
    checkStat(combat.flee.stat, [...base, 'flee', 'stat']);
  }
  if (Object.keys(enemies).length > 0 && !s.ruleset.resources.hp) {
    error(['ruleset', 'resources'], '적이 있으면 전투 피해를 받을 hp 자원이 필요합니다');
  }
  const cc = s.ruleset.character_creation;
  if (cc && cc.min_per_stat > cc.max_per_stat) error(['ruleset', 'character_creation'], 'min_per_stat 이 max_per_stat 보다 큽니다');
  for (const [pid, preset] of Object.entries(s.presets ?? {})) {
    const path: Path = ['presets', pid, 'stats'];
    const keys = Object.keys(preset.stats);
    const missing = s.ruleset.stats.filter((st) => !keys.includes(st));
    const extra = keys.filter((k) => !stats.has(k));
    if (missing.length) error(path, `누락된 스탯: ${missing.join(', ')}`);
    if (extra.length) error(path, `룰셋에 없는 스탯: ${extra.join(', ')}`);
    if (cc) {
      const sum = Object.values(preset.stats).reduce((a, b) => a + b, 0);
      if (sum !== cc.total_points) error(path, `스탯 합계 ${sum} ≠ total_points ${cc.total_points}`);
      for (const [k, v] of Object.entries(preset.stats)) {
        if (v < cc.min_per_stat || v > cc.max_per_stat) {
          error([...path, k], `${k} 값 ${v} 이 허용 범위(${cc.min_per_stat}~${cc.max_per_stat})를 벗어났습니다`);
        }
      }
    }
  }

  // 상태이상 / 아이템
  for (const [sid, st] of Object.entries(statuses)) {
    checkOps(st.on_turn_start, ['statuses', sid, 'on_turn_start'], null);
    if (st.resist) {
      checkCheck(st.resist.check, ['statuses', sid, 'resist', 'check']);
      checkOps(st.resist.on_success, ['statuses', sid, 'resist', 'on_success'], null);
    }
  }
  for (const [iid, item] of Object.entries(items)) checkOps(item.effects, ['items', iid, 'effects'], null);

  // 장면
  for (const [sid, scene] of Object.entries(scenes)) {
    const base: Path = ['scenes', sid];
    scene.npcs?.forEach((n, i) => {
      placedNpcs.add(n);
      if (!npcs[n]) error([...base, 'npcs', i], `존재하지 않는 NPC: ${n}`);
    });
    checkOps(scene.on_enter, [...base, 'on_enter'], sid);
    for (const [oid, obj] of Object.entries(scene.objects ?? {})) {
      if (obj.on_examine) checkBranch(obj.on_examine, [...base, 'objects', oid, 'on_examine'], sid);
      if (obj.on_interact) checkBranch(obj.on_interact, [...base, 'objects', oid, 'on_interact'], sid);
    }
    scene.exits.forEach((exit, i) => {
      if (!scenes[exit.to]) error([...base, 'exits', i, 'to'], `존재하지 않는 장면: ${exit.to}`);
      else sceneLinks.push({ from: sid, to: exit.to });
      if (exit.condition) checkExpr(exit.condition, [...base, 'exits', i, 'condition']);
    });
  }

  // 이벤트
  const eventIds = new Set<string>();
  s.events?.forEach((ev, i) => {
    const base: Path = ['events', i];
    if (eventIds.has(ev.id)) error([...base, 'id'], `중복된 이벤트 ID: ${ev.id}`);
    eventIds.add(ev.id);
    const t = ev.trigger;
    let fromScene: string | null = null;
    if (t.type === 'use_item') {
      if (!items[t.item]) error([...base, 'trigger', 'item'], `존재하지 않는 아이템: ${t.item}`);
      if (t.target) {
        const [, sceneId, kind, name] = TARGET_RE.exec(t.target)!;
        const scene = scenes[sceneId];
        const exists = kind === 'objects' ? !!scene?.objects?.[name] : !!scene?.exits.some((e) => e.to === name);
        if (!exists) error([...base, 'trigger', 'target'], `존재하지 않는 대상: ${t.target}`);
        fromScene = scene ? sceneId : null;
      }
    } else if (t.type === 'enter_scene') {
      if (!scenes[t.scene]) error([...base, 'trigger', 'scene'], `존재하지 않는 장면: ${t.scene}`);
      else fromScene = t.scene;
    }
    checkBranch(ev, base, fromScene);
  });

  // 적
  for (const [eid, enemy] of Object.entries(enemies)) {
    const base: Path = ['enemies', eid];
    if (typeof enemy.hp === 'string') checkExpr(enemy.hp, [...base, 'hp']);
    enemy.behavior.forEach((b, i) => {
      const action = 'when' in b ? b.do : b.default;
      if ('when' in b) checkExpr(b.when, [...base, 'behavior', i, 'when']);
      if (action.startsWith('skill:') && !enemy.skills?.[action.slice(6)]) {
        error([...base, 'behavior', i], `존재하지 않는 스킬: ${action.slice(6)}`);
      }
    });
    if (!enemy.behavior.some((b) => 'default' in b)) warn([...base, 'behavior'], 'default 행동이 없으면 조건에 맞지 않을 때 아무것도 하지 않습니다');
    for (const [kid, skill] of Object.entries(enemy.skills ?? {})) checkOps(skill.effects, [...base, 'skills', kid, 'effects'], null);
    checkOps(enemy.on_defeat, [...base, 'on_defeat'], null);
  }

  // 엔딩
  const seenEndings = new Set<string>();
  s.endings.forEach((ending, i) => {
    if (seenEndings.has(ending.id)) error(['endings', i, 'id'], `중복된 엔딩 ID: ${ending.id}`);
    seenEndings.add(ending.id);
    checkExpr(ending.condition, ['endings', i, 'condition']);
  });

  // 전역 검사
  for (const { flag, path } of flagsUsed) {
    if (!flagsSet.has(flag)) error(path, `조건에 쓰인 플래그 ${flag} 를 설정(set_flag)하는 곳이 없습니다`);
  }
  const usedFlags = new Set(flagsUsed.map((f) => f.flag));
  for (const flag of flagsSet) if (!usedFlags.has(flag)) warn([], `플래그 ${flag} 는 설정만 되고 조건에 쓰이지 않습니다`);
  for (const iid of Object.keys(items)) if (!obtainable.has(iid)) warn(['items', iid], `아이템 ${iid} 을 얻는 방법(give_item)이 없습니다`);
  for (const eid of Object.keys(enemies)) if (!combatEnemies.has(eid)) warn(['enemies', eid], `적 ${eid} 은 전투에 등장하지 않습니다`);
  for (const nid of Object.keys(npcs)) if (!placedNpcs.has(nid)) warn(['npcs', nid], `NPC ${nid} 은 어느 장면에도 배치되지 않았습니다`);

  // 도달 가능성: 출구와 move_party 로 시작 장면에서 닿는지 (조건은 무시)
  // 장면에 묶이지 않은 move_party(아이템, 적 처치 등)는 어디서든 발생할 수 있다고 본다
  const reachable = new Set<string>([s.meta.start_scene]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { from, to } of sceneLinks) {
      if (!reachable.has(to) && (from === null || reachable.has(from))) {
        reachable.add(to);
        changed = true;
      }
    }
  }
  for (const sid of Object.keys(scenes)) {
    if (!reachable.has(sid)) error(['scenes', sid], `시작 장면에서 도달할 수 없는 장면입니다: ${sid}`);
  }

  return issues;
}
