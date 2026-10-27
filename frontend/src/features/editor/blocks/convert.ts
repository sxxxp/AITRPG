import { parseExpr, PREC, precOf, printExpr, type Node } from './dsl';

// 시나리오(JSON) ↔ Blockly 직렬화 JSON. Blockly 에 의존하지 않는 순수 함수라 단독으로 테스트할 수 있다.
//
// 블록이 다루는 부분: items, npcs, scenes, events, enemies, endings, meta.start_scene
// 그 외(meta, ruleset, presets, variables, statuses, ai_guide)는 base 에서 그대로 가져온다.
// 블록으로 표현하지 않는 세부 항목(판정 보정, 적 스킬 등)은 블록의 data 에 보관해 왕복해도 사라지지 않는다.

type Obj = Record<string, any>;

export interface BlockJson {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block: BlockJson }>;
  next?: { block: BlockJson };
  data?: string;
}

export interface WorkspaceJson {
  blocks?: { languageVersion: number; blocks: BlockJson[] };
}

export interface ConvertProblem {
  blockId: string;
  message: string;
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const n = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || fallback);
const bool = (v: unknown) => v === true || v === 'TRUE';

// ───────────────────────── 공통 도우미 ─────────────────────────

function chain(blocks: BlockJson[]): { block: BlockJson } | undefined {
  if (blocks.length === 0) return undefined;
  for (let i = blocks.length - 1; i > 0; i--) blocks[i - 1].next = { block: blocks[i] };
  return { block: blocks[0] };
}

function unchain(input: { block: BlockJson } | undefined): BlockJson[] {
  const out: BlockJson[] = [];
  for (let b = input?.block; b; b = b.next?.block) out.push(b);
  return out;
}

function inputs(entries: Record<string, { block: BlockJson } | undefined>) {
  const result: Record<string, { block: BlockJson }> = {};
  for (const [k, v] of Object.entries(entries)) if (v) result[k] = v;
  return Object.keys(result).length ? result : undefined;
}

function withData(block: BlockJson, data: Obj): BlockJson {
  const kept = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (Object.keys(kept).length) block.data = JSON.stringify(kept);
  return block;
}

function readData(block: BlockJson): Obj {
  try {
    return block.data ? (JSON.parse(block.data) as Obj) : {};
  } catch {
    return {};
  }
}

const f = (block: BlockJson, name: string) => block.fields?.[name];
const input = (block: BlockJson, name: string) => block.inputs?.[name];

// ───────────────────────── 조건식 ─────────────────────────

const CMP = ['>=', '<=', '>', '<', '==', '!='];
const strArg = (node: Node) => (node.type === 'call' && node.args.length === 1 && node.args[0].type === 'str' ? node.args[0].value : null);

function nodeToCond(node: Node): BlockJson {
  if (node.type === 'call' && node.name === 'flag' && strArg(node) !== null) {
    return { type: 'wtg_cond_flag', fields: { FLAG: strArg(node), STATE: 'ON' } };
  }
  if (node.type === 'not' && node.arg.type === 'call' && node.arg.name === 'flag' && strArg(node.arg) !== null) {
    return { type: 'wtg_cond_flag', fields: { FLAG: strArg(node.arg), STATE: 'OFF' } };
  }
  if (node.type === 'call' && node.name === 'has_item' && strArg(node) !== null) {
    return { type: 'wtg_cond_has_item', fields: { ITEM: strArg(node) } };
  }
  if (node.type === 'call' && node.name === 'in_scene' && strArg(node) !== null) {
    return { type: 'wtg_cond_in_scene', fields: { SCENE: strArg(node) } };
  }
  if (node.type === 'call' && node.name === 'all_players_down' && node.args.length === 0) {
    return { type: 'wtg_cond_all_down' };
  }
  if (node.type === 'bin' && CMP.includes(node.op) && node.right.type === 'num') {
    const l = node.left;
    if (l.type === 'call' && l.name === 'var' && strArg(l) !== null) {
      return { type: 'wtg_cond_var', fields: { VAR: strArg(l), OP: node.op, NUM: node.right.value } };
    }
    if (l.type === 'call' && l.name === 'stat' && strArg(l) !== null) {
      return { type: 'wtg_cond_stat', fields: { STAT: strArg(l), OP: node.op, NUM: node.right.value } };
    }
    if (l.type === 'call' && l.name === 'turn_count' && l.args.length === 0) {
      return { type: 'wtg_cond_turn', fields: { OP: node.op, NUM: node.right.value } };
    }
  }
  if (node.type === 'bin' && (node.op === 'and' || node.op === 'or')) {
    return {
      type: node.op === 'and' ? 'wtg_cond_and' : 'wtg_cond_or',
      inputs: { A: { block: nodeToCond(node.left) }, B: { block: nodeToCond(node.right) } },
    };
  }
  if (node.type === 'not') return { type: 'wtg_cond_not', inputs: { A: { block: nodeToCond(node.arg) } } };
  return { type: 'wtg_cond_raw', fields: { EXPR: printExpr(node) } };
}

/** 조건식 문자열 → 조건 블록. 해석할 수 없으면 '직접 입력' 블록 */
export function condToBlock(expr: string | undefined): BlockJson | undefined {
  if (expr === undefined || expr.trim() === '') return undefined;
  try {
    return nodeToCond(parseExpr(expr));
  } catch {
    return { type: 'wtg_cond_raw', fields: { EXPR: expr } };
  }
}

const q = (v: unknown) => `'${s(v)}'`;

function condText(block: BlockJson | undefined): { text: string; prec: number } | null {
  if (!block) return null;
  const wrap = (c: { text: string; prec: number } | null, min: number) => (c ? (c.prec < min ? `(${c.text})` : c.text) : null);
  switch (block.type) {
    case 'wtg_cond_flag':
      return f(block, 'STATE') === 'OFF'
        ? { text: `not flag(${q(f(block, 'FLAG'))})`, prec: PREC.not }
        : { text: `flag(${q(f(block, 'FLAG'))})`, prec: PREC.atom };
    case 'wtg_cond_has_item':
      return { text: `has_item(${q(f(block, 'ITEM'))})`, prec: PREC.atom };
    case 'wtg_cond_in_scene':
      return { text: `in_scene(${q(f(block, 'SCENE'))})`, prec: PREC.atom };
    case 'wtg_cond_all_down':
      return { text: 'all_players_down()', prec: PREC.atom };
    case 'wtg_cond_var':
      return { text: `var(${q(f(block, 'VAR'))}) ${s(f(block, 'OP'))} ${n(f(block, 'NUM'))}`, prec: PREC.cmp };
    case 'wtg_cond_stat':
      return { text: `stat(${q(f(block, 'STAT'))}) ${s(f(block, 'OP'))} ${n(f(block, 'NUM'))}`, prec: PREC.cmp };
    case 'wtg_cond_turn':
      return { text: `turn_count() ${s(f(block, 'OP'))} ${n(f(block, 'NUM'))}`, prec: PREC.cmp };
    case 'wtg_cond_and':
    case 'wtg_cond_or': {
      const op = block.type === 'wtg_cond_and' ? 'and' : 'or';
      const p = op === 'and' ? PREC.and : PREC.or;
      const a = wrap(condText(input(block, 'A')?.block), p);
      const b = wrap(condText(input(block, 'B')?.block), p + 1);
      if (a && b) return { text: `${a} ${op} ${b}`, prec: p };
      const one = condText(input(block, 'A')?.block) ?? condText(input(block, 'B')?.block);
      return one;
    }
    case 'wtg_cond_not': {
      const a = wrap(condText(input(block, 'A')?.block), PREC.not);
      return a ? { text: `not ${a}`, prec: PREC.not } : null;
    }
    case 'wtg_cond_raw': {
      const text = s(f(block, 'EXPR')).trim();
      if (!text) return null;
      try {
        return { text, prec: precOf(parseExpr(text)) };
      } catch {
        return { text, prec: 0 }; // 해석할 수 없으면 항상 괄호로 감싼다
      }
    }
    default:
      return null;
  }
}

/** 조건 블록 → 조건식 문자열 (없으면 undefined) */
export function blockToCond(block: BlockJson | undefined): string | undefined {
  return condText(block)?.text;
}

// ───────────────────────── 동작(op) ─────────────────────────

const OP_TYPES = [
  'give_item',
  'remove_item',
  'add_resource',
  'set_resource',
  'add_stat',
  'set_flag',
  'add_var',
  'move_party',
  'start_combat',
  'end_combat',
  'apply_status',
  'remove_status',
  'narrate_hint',
  'fixed_text',
  'reveal_secret',
  'trigger_ending',
];

function opToBlocks(op: Obj): BlockJson[] {
  const t = `wtg_op_${s(op.op)}`;
  switch (op.op) {
    case 'give_item':
    case 'remove_item':
      return [{ type: t, fields: { ITEM: s(op.item), QTY: n(op.quantity, 1) } }];
    case 'add_resource':
    case 'set_resource':
      return [{ type: t, fields: { RES: s(op.resource), VALUE: s(op.value) } }];
    case 'add_stat':
      return [{ type: t, fields: { STAT: s(op.stat), VALUE: n(op.value) } }];
    case 'set_flag':
      return [{ type: t, fields: { FLAG: s(op.flag), VALUE: op.value === false ? 'FALSE' : 'TRUE' } }];
    case 'add_var':
      return [{ type: t, fields: { VAR: s(op.var), VALUE: n(op.value) } }];
    case 'move_party':
      return [{ type: t, fields: { SCENE: s(op.scene) } }];
    case 'start_combat': {
      // [a, a, b] → (a × 2), (b × 1). 전투 중 start_combat 은 적을 추가하므로 결과가 같다
      const groups: { enemy: string; count: number }[] = [];
      for (const e of Array.isArray(op.enemies) ? op.enemies : []) {
        const last = groups[groups.length - 1];
        if (last && last.enemy === e) last.count++;
        else groups.push({ enemy: s(e), count: 1 });
      }
      return groups.map((g) => ({ type: t, fields: { ENEMY: g.enemy, COUNT: g.count } }));
    }
    case 'end_combat':
      return [{ type: t }];
    case 'apply_status':
      return [{ type: t, fields: { STATUS: s(op.status), SAVE_STAT: s(op.save?.stat), SAVE_DC: n(op.save?.dc) } }];
    case 'remove_status':
      return [{ type: t, fields: { STATUS: s(op.status) } }];
    case 'narrate_hint':
    case 'fixed_text':
      return [{ type: t, fields: { TEXT: s(op.text) } }];
    case 'reveal_secret':
      return [{ type: t, fields: { NPC: s(op.npc), SECRET: s(op.secret) } }];
    case 'trigger_ending':
      return [{ type: t, fields: { ENDING: s(op.ending) } }];
    default:
      return [withData({ type: 'wtg_op_raw' }, { op })];
  }
}

const opsToStatement = (ops: unknown) => chain((Array.isArray(ops) ? ops : []).flatMap((o) => (isObj(o) ? opToBlocks(o) : [])));

function blockToOp(b: BlockJson): Obj | null {
  const op = b.type.replace(/^wtg_op_/, '');
  switch (op) {
    case 'give_item':
    case 'remove_item': {
      const qty = n(f(b, 'QTY'), 1);
      return { op, item: s(f(b, 'ITEM')), ...(qty !== 1 ? { quantity: qty } : {}) };
    }
    case 'add_resource':
    case 'set_resource': {
      const raw = s(f(b, 'VALUE')).trim();
      return { op, resource: s(f(b, 'RES')), value: /^-?\d+$/.test(raw) ? Number(raw) : raw };
    }
    case 'add_stat':
      return { op, stat: s(f(b, 'STAT')), value: n(f(b, 'VALUE')) };
    case 'set_flag':
      return { op, flag: s(f(b, 'FLAG')), value: f(b, 'VALUE') !== 'FALSE' };
    case 'add_var':
      return { op, var: s(f(b, 'VAR')), value: n(f(b, 'VALUE')) };
    case 'move_party':
      return { op, scene: s(f(b, 'SCENE')) };
    case 'start_combat':
      return { op, enemies: Array.from({ length: Math.max(1, n(f(b, 'COUNT'), 1)) }, () => s(f(b, 'ENEMY'))) };
    case 'end_combat':
      return { op };
    case 'apply_status': {
      const stat = s(f(b, 'SAVE_STAT'));
      return { op, status: s(f(b, 'STATUS')), ...(stat ? { save: { stat, dc: n(f(b, 'SAVE_DC'), 10) } } : {}) };
    }
    case 'remove_status':
      return { op, status: s(f(b, 'STATUS')) };
    case 'narrate_hint':
    case 'fixed_text':
      return { op, text: s(f(b, 'TEXT')) };
    case 'reveal_secret':
      return { op, npc: s(f(b, 'NPC')), secret: s(f(b, 'SECRET')) };
    case 'trigger_ending':
      return { op, ending: s(f(b, 'ENDING')) };
    case 'raw':
      return (readData(b).op as Obj) ?? null;
    default:
      return null;
  }
}

// ───────────────────────── 상호작용(판정/실행) ─────────────────────────

function branchToBlock(branch: unknown): BlockJson | undefined {
  if (!isObj(branch)) return undefined;
  const cond = condToBlock(branch.condition);
  if (branch.check) {
    const { stat, dc, ...restCheck } = isObj(branch.check) ? branch.check : ({} as Obj);
    return withData(
      {
        type: 'wtg_branch_check',
        fields: { STAT: s(stat), DC: n(dc, 10), LOCKED: s(branch.locked_text) },
        inputs: inputs({
          COND: cond && { block: cond },
          SUCCESS: opsToStatement(branch.success),
          FAILURE: opsToStatement(branch.failure),
          CRIT_SUCCESS: opsToStatement(branch.critical_success),
          CRIT_FAILURE: opsToStatement(branch.critical_failure),
        }),
      },
      // 판정 보정(modifiers) 등은 블록에 보관
      { check: Object.keys(restCheck).length ? restCheck : undefined },
    );
  }
  return {
    type: 'wtg_branch_actions',
    fields: { LOCKED: s(branch.locked_text) },
    inputs: inputs({ COND: cond && { block: cond }, DO: opsToStatement(branch.actions) }),
  };
}

class Collector {
  readonly paths: Record<string, string> = {};
  readonly problems: ConvertProblem[] = [];

  mark(path: string, block: BlockJson) {
    if (block.id) this.paths[path] = block.id;
  }

  problem(block: BlockJson, message: string) {
    if (block.id) this.problems.push({ blockId: block.id, message });
  }

  ops(slot: { block: BlockJson } | undefined, path: string): Obj[] {
    const out: Obj[] = [];
    unchain(slot).forEach((b) => {
      const op = blockToOp(b);
      if (!op) return;
      this.mark(`${path}.${out.length}`, b);
      out.push(op);
    });
    return out;
  }

  branch(slot: { block: BlockJson } | undefined, path: string): Obj | undefined {
    const b = slot?.block;
    if (!b) return undefined;
    this.mark(path, b);
    const condition = blockToCond(input_(b, 'COND'));
    const locked = s(f(b, 'LOCKED')).trim();
    const head: Obj = { ...(condition ? { condition } : {}), ...(locked ? { locked_text: locked } : {}) };
    if (b.type === 'wtg_branch_check') {
      const data = readData(b);
      const result: Obj = {
        ...head,
        check: { stat: s(f(b, 'STAT')), dc: n(f(b, 'DC'), 10), ...(isObj(data.check) ? data.check : {}) },
        success: this.ops(input(b, 'SUCCESS'), `${path}.success`),
        failure: this.ops(input(b, 'FAILURE'), `${path}.failure`),
      };
      const cs = this.ops(input(b, 'CRIT_SUCCESS'), `${path}.critical_success`);
      const cf = this.ops(input(b, 'CRIT_FAILURE'), `${path}.critical_failure`);
      if (cs.length) result.critical_success = cs;
      if (cf.length) result.critical_failure = cf;
      return result;
    }
    return { ...head, actions: this.ops(input(b, 'DO'), `${path}.actions`) };
  }
}

const input_ = (b: BlockJson, name: string) => b.inputs?.[name]?.block;

// ───────────────────────── 시나리오 → 블록 ─────────────────────────

const LINE = (text: string): BlockJson => ({ type: 'wtg_text_line', fields: { TEXT: text } });

function simpleBehavior(behavior: unknown): { def: string; fleeBelow: number } | null {
  if (!Array.isArray(behavior)) return null;
  const last = behavior[behavior.length - 1];
  const defaults = ['attack_random', 'attack_lowest_hp'];
  if (!isObj(last) || !defaults.includes(last.default)) return null;
  if (behavior.length === 1) return { def: last.default, fleeBelow: 0 };
  const first = behavior[0];
  const m = behavior.length === 2 && isObj(first) && first.do === 'flee' ? /^hp\s*<\s*(\d+)$/.exec(s(first.when).trim()) : null;
  return m ? { def: last.default, fleeBelow: Number(m[1]) } : null;
}

/** 시나리오 → 워크스페이스 JSON */
export function scenarioToBlocks(scenario: Obj): WorkspaceJson {
  const roots: BlockJson[] = [];
  const start = s(scenario.meta?.start_scene);

  for (const [id, sc] of Object.entries(isObj(scenario.scenes) ? scenario.scenes : {})) {
    const scene = isObj(sc) ? sc : {};
    const objects = Object.entries(isObj(scene.objects) ? scene.objects : {}).map(([oid, ob]) => {
      const o = isObj(ob) ? ob : {};
      const examine = branchToBlock(o.on_examine);
      const interact = branchToBlock(o.on_interact);
      return {
        type: 'wtg_object',
        fields: { ID: oid, NAME: s(o.name) },
        inputs: inputs({ EXAMINE: examine && { block: examine }, INTERACT: interact && { block: interact } }),
      } as BlockJson;
    });
    const exits = (Array.isArray(scene.exits) ? scene.exits : []).filter(isObj).map((ex) => {
      const cond = condToBlock(ex.condition);
      return {
        type: 'wtg_exit',
        fields: { TO: s(ex.to), LABEL: s(ex.label), LOCKED: s(ex.locked_text) },
        inputs: inputs({ COND: cond && { block: cond } }),
      } as BlockJson;
    });
    roots.push({
      type: 'wtg_scene',
      fields: { ID: id, NAME: s(scene.name), START: id === start ? 'TRUE' : 'FALSE', DESC: s(scene.description) },
      inputs: inputs({
        NPCS: chain((Array.isArray(scene.npcs) ? scene.npcs : []).map((npc) => ({ type: 'wtg_npc_ref', fields: { NPC: s(npc) } }))),
        ON_ENTER: opsToStatement(scene.on_enter),
        OBJECTS: chain(objects),
        EXITS: chain(exits),
      }),
    });
  }

  for (const [id, it] of Object.entries(isObj(scenario.items) ? scenario.items : {})) {
    const item = isObj(it) ? it : {};
    roots.push({
      type: 'wtg_item',
      fields: { ID: id, NAME: s(item.name), DESC: s(item.description), CONSUMABLE: item.consumable ? 'TRUE' : 'FALSE' },
      inputs: inputs({ EFFECTS: opsToStatement(item.effects) }),
    });
  }

  for (const [id, np] of Object.entries(isObj(scenario.npcs) ? scenario.npcs : {})) {
    const npc = isObj(np) ? np : {};
    const { greeting, ...otherLines } = isObj(npc.fixed_lines) ? npc.fixed_lines : ({} as Obj);
    roots.push(
      withData(
        {
          type: 'wtg_npc',
          fields: { ID: id, NAME: s(npc.name), PERSONALITY: s(npc.personality), SPEECH: s(npc.speech_style), GREETING: s(greeting) },
          inputs: inputs({
            KNOWS: chain((Array.isArray(npc.knows) ? npc.knows : []).map((k) => LINE(s(k)))),
            SECRETS: chain((Array.isArray(npc.secrets) ? npc.secrets : []).map((k) => LINE(s(k)))),
          }),
        },
        { fixed_lines: Object.keys(otherLines).length ? otherLines : undefined },
      ),
    );
  }

  for (const ev of Array.isArray(scenario.events) ? scenario.events : []) {
    if (!isObj(ev)) continue;
    const t = isObj(ev.trigger) ? ev.trigger : {};
    const body = branchToBlock(ev);
    const fields: Record<string, unknown> =
      t.type === 'use_item'
        ? { ID: s(ev.id), ITEM: s(t.item), TARGET: s(t.target) }
        : t.type === 'enter_scene'
          ? { ID: s(ev.id), SCENE: s(t.scene) }
          : { ID: s(ev.id) };
    const type = t.type === 'use_item' ? 'wtg_event_use_item' : t.type === 'enter_scene' ? 'wtg_event_enter_scene' : 'wtg_event_condition';
    roots.push({ type, fields, inputs: inputs({ BODY: body && { block: body } }) });
  }

  for (const [id, en] of Object.entries(isObj(scenario.enemies) ? scenario.enemies : {})) {
    const enemy = isObj(en) ? en : {};
    const simple = simpleBehavior(enemy.behavior);
    const attack = isObj(enemy.attack) ? enemy.attack : {};
    roots.push(
      withData(
        {
          type: 'wtg_enemy',
          fields: {
            ID: id,
            NAME: s(enemy.name),
            HP: s(enemy.hp),
            ATTACK: s(attack.dice),
            DEFAULT: simple?.def ?? 'attack_random',
            FLEE_BELOW: simple?.fleeBelow ?? 0,
          },
          inputs: inputs({ ON_DEFEAT: opsToStatement(enemy.on_defeat) }),
        },
        // 블록으로 표현하지 않는 부분은 보관
        {
          behavior: simple ? undefined : enemy.behavior,
          skills: enemy.skills,
          attack_targets: attack.targets,
        },
      ),
    );
  }

  for (const en of Array.isArray(scenario.endings) ? scenario.endings : []) {
    if (!isObj(en)) continue;
    const cond = condToBlock(en.condition);
    roots.push({
      type: 'wtg_ending',
      fields: { ID: s(en.id), TITLE: s(en.title), TEXT: s(en.text) },
      inputs: inputs({ COND: cond && { block: cond } }),
    });
  }

  roots.forEach((b, i) => {
    b.x = 20;
    b.y = 20 + i * 40;
  });
  return { blocks: { languageVersion: 0, blocks: roots } };
}

// ───────────────────────── 블록 → 시나리오 ─────────────────────────

export interface BlocksResult {
  scenario: Obj;
  /** 시나리오 경로(예: scenes.gate.objects.bush) → 블록 ID. 검증 오류 위치를 블록에서 찾을 때 사용 */
  paths: Record<string, string>;
  /** ID 중복/누락처럼 YAML 로 옮기면 잃어버리는 문제 */
  problems: ConvertProblem[];
}

/** 블록 워크스페이스 + 블록이 다루지 않는 기본 정보(base) → 시나리오 */
export function blocksToScenario(ws: WorkspaceJson, base: Obj): BlocksResult {
  const c = new Collector();
  // 엔딩·이벤트는 순서가 의미를 가지므로 작업 공간에서 위에 놓인 블록부터
  const roots = [...(ws.blocks?.blocks ?? [])].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  const byType = (...types: string[]) => roots.filter((b) => types.includes(b.type));

  const uniqueId = (b: BlockJson, seen: Set<string>, kind: string): string | null => {
    const id = s(f(b, 'ID')).trim();
    if (!id) {
      c.problem(b, `${kind} ID 가 비어 있어 저장되지 않습니다`);
      return null;
    }
    if (seen.has(id)) {
      c.problem(b, `${kind} ID '${id}' 가 중복되어 이 블록은 저장되지 않습니다`);
      return null;
    }
    seen.add(id);
    return id;
  };

  const scenes: Obj = {};
  let startScene: string | null = null;
  const sceneIds = new Set<string>();
  for (const b of byType('wtg_scene')) {
    const id = uniqueId(b, sceneIds, '장면');
    if (!id) continue;
    const path = `scenes.${id}`;
    c.mark(path, b);
    if (bool(f(b, 'START')) && !startScene) startScene = id;

    const scene: Obj = { name: s(f(b, 'NAME')), description: s(f(b, 'DESC')) };
    const npcs = unchain(input(b, 'NPCS')).map((r) => s(f(r, 'NPC'))).filter(Boolean);
    if (npcs.length) scene.npcs = npcs;
    const onEnter = c.ops(input(b, 'ON_ENTER'), `${path}.on_enter`);
    if (onEnter.length) scene.on_enter = onEnter;

    const objects: Obj = {};
    const objectIds = new Set<string>();
    for (const ob of unchain(input(b, 'OBJECTS'))) {
      const oid = uniqueId(ob, objectIds, '오브젝트');
      if (!oid) continue;
      const opath = `${path}.objects.${oid}`;
      c.mark(opath, ob);
      const obj: Obj = { name: s(f(ob, 'NAME')) };
      const examine = c.branch(input(ob, 'EXAMINE'), `${opath}.on_examine`);
      const interact = c.branch(input(ob, 'INTERACT'), `${opath}.on_interact`);
      if (examine) obj.on_examine = examine;
      if (interact) obj.on_interact = interact;
      objects[oid] = obj;
    }
    if (Object.keys(objects).length) scene.objects = objects;

    scene.exits = unchain(input(b, 'EXITS')).map((ex, i) => {
      c.mark(`${path}.exits.${i}`, ex);
      const condition = blockToCond(input_(ex, 'COND'));
      const locked = s(f(ex, 'LOCKED')).trim();
      return {
        to: s(f(ex, 'TO')),
        label: s(f(ex, 'LABEL')),
        ...(condition ? { condition } : {}),
        ...(locked ? { locked_text: locked } : {}),
      };
    });
    scenes[id] = scene;
  }

  const items: Obj = {};
  const itemIds = new Set<string>();
  for (const b of byType('wtg_item')) {
    const id = uniqueId(b, itemIds, '아이템');
    if (!id) continue;
    c.mark(`items.${id}`, b);
    const desc = s(f(b, 'DESC'));
    items[id] = {
      name: s(f(b, 'NAME')),
      ...(desc ? { description: desc } : {}),
      consumable: bool(f(b, 'CONSUMABLE')),
      effects: c.ops(input(b, 'EFFECTS'), `items.${id}.effects`),
    };
  }

  const npcs: Obj = {};
  const npcIds = new Set<string>();
  for (const b of byType('wtg_npc')) {
    const id = uniqueId(b, npcIds, 'NPC');
    if (!id) continue;
    c.mark(`npcs.${id}`, b);
    const data = readData(b);
    const greeting = s(f(b, 'GREETING'));
    const speech = s(f(b, 'SPEECH'));
    const fixedLines = { ...(isObj(data.fixed_lines) ? data.fixed_lines : {}), ...(greeting ? { greeting } : {}) };
    npcs[id] = {
      name: s(f(b, 'NAME')),
      personality: s(f(b, 'PERSONALITY')),
      ...(speech ? { speech_style: speech } : {}),
      knows: unchain(input(b, 'KNOWS')).map((l) => s(f(l, 'TEXT'))).filter(Boolean),
      secrets: unchain(input(b, 'SECRETS')).map((l) => s(f(l, 'TEXT'))).filter(Boolean),
      ...(Object.keys(fixedLines).length ? { fixed_lines: fixedLines } : {}),
    };
  }

  const events: Obj[] = [];
  const eventIds = new Set<string>();
  for (const b of byType('wtg_event_use_item', 'wtg_event_enter_scene', 'wtg_event_condition')) {
    const id = uniqueId(b, eventIds, '이벤트');
    if (!id) continue;
    const path = `events.${events.length}`;
    c.mark(path, b);
    const trigger =
      b.type === 'wtg_event_use_item'
        ? { type: 'use_item', item: s(f(b, 'ITEM')), ...(s(f(b, 'TARGET')) ? { target: s(f(b, 'TARGET')) } : {}) }
        : b.type === 'wtg_event_enter_scene'
          ? { type: 'enter_scene', scene: s(f(b, 'SCENE')) }
          : { type: 'condition' };
    const body = c.branch(input(b, 'BODY'), path) ?? { actions: [] };
    events.push({ id, trigger, ...body });
  }

  const enemies: Obj = {};
  const enemyIds = new Set<string>();
  for (const b of byType('wtg_enemy')) {
    const id = uniqueId(b, enemyIds, '적');
    if (!id) continue;
    c.mark(`enemies.${id}`, b);
    const data = readData(b);
    const hpRaw = s(f(b, 'HP')).trim();
    const flee = n(f(b, 'FLEE_BELOW'));
    const def = s(f(b, 'DEFAULT')) || 'attack_random';
    const behavior = Array.isArray(data.behavior)
      ? data.behavior
      : [...(flee > 0 ? [{ when: `hp < ${flee}`, do: 'flee' }] : []), { default: def }];
    const onDefeat = c.ops(input(b, 'ON_DEFEAT'), `enemies.${id}.on_defeat`);
    enemies[id] = {
      name: s(f(b, 'NAME')),
      hp: /^\d+$/.test(hpRaw) ? Number(hpRaw) : hpRaw,
      attack: { dice: s(f(b, 'ATTACK')), ...(data.attack_targets ? { targets: data.attack_targets } : {}) },
      ...(data.skills ? { skills: data.skills } : {}),
      behavior,
      ...(onDefeat.length ? { on_defeat: onDefeat } : {}),
    };
  }

  const endings: Obj[] = [];
  const endingIds = new Set<string>();
  for (const b of byType('wtg_ending')) {
    const id = uniqueId(b, endingIds, '엔딩');
    if (!id) continue;
    c.mark(`endings.${endings.length}`, b);
    endings.push({ id, title: s(f(b, 'TITLE')), condition: blockToCond(input_(b, 'COND')) ?? '', text: s(f(b, 'TEXT')) });
  }

  // 키 순서는 포맷 문서(§6.3)와 같게. 알 수 없는 최상위 키는 끝에 그대로 둔다
  const BLOCK_KEYS = ['items', 'npcs', 'scenes', 'events', 'enemies', 'endings'];
  const BASE_KEYS = ['format_version', 'meta', 'ruleset', 'presets', 'variables', 'statuses', 'ai_guide'];
  const rest = Object.fromEntries(Object.entries(base).filter(([k]) => !BLOCK_KEYS.includes(k) && !BASE_KEYS.includes(k)));
  const scenario: Obj = {
    format_version: base.format_version ?? 1,
    meta: { ...(isObj(base.meta) ? base.meta : {}), ...(startScene ? { start_scene: startScene } : {}) },
    ruleset: base.ruleset,
    ...(base.presets !== undefined ? { presets: base.presets } : {}),
    ...(base.variables !== undefined ? { variables: base.variables } : {}),
    ...(base.statuses !== undefined ? { statuses: base.statuses } : {}),
    ai_guide: base.ai_guide,
    items,
    npcs,
    scenes,
    ...(events.length || base.events !== undefined ? { events } : {}),
    ...(Object.keys(enemies).length || base.enemies !== undefined ? { enemies } : {}),
    endings,
    ...rest,
  };
  return { scenario, paths: c.paths, problems: c.problems };
}

/** 블록 data 에 보관된(블록으로 편집할 수 없는) 항목이 있는지 */
export function preservedNote(block: BlockJson): string | null {
  const data = readData(block);
  if (block.type === 'wtg_op_raw') return '알 수 없는 동작입니다. 코드 탭에서 편집하세요.';
  const keys = Object.keys(data);
  if (!keys.length) return null;
  const names: Record<string, string> = {
    check: '판정 보정(modifiers)',
    behavior: '행동 규칙',
    skills: '스킬',
    attack_targets: '공격 대상 범위',
    fixed_lines: '추가 고정 대사',
  };
  return `코드 탭에서만 편집할 수 있는 설정이 보관되어 있습니다: ${keys.map((k) => names[k] ?? k).join(', ')}`;
}

export const OPERATION_TYPES = OP_TYPES;
