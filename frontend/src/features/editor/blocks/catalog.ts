// 블록 드롭다운 선택지 (아이템, 장면, NPC ...).
// Blockly 드롭다운은 선택지에 없는 값을 받으면 조용히 버리므로,
// 정의된 ID 와 '지금 참조 중인' ID 를 넣는다 (정의되지 않은 것은 ⚠ 표시).
// 매번 새로 만들므로 ID 를 입력하는 중간 값(a, ar, arr ...)은 남지 않는다.

export type RefKind = 'items' | 'scenes' | 'npcs' | 'enemies' | 'endings' | 'statuses' | 'stats' | 'resources' | 'vars' | 'targets';

export type MenuOption = [string, string];

type Obj = Record<string, unknown>;

interface Entry {
  label: string;
  defined: boolean;
}

const KINDS: RefKind[] = ['items', 'scenes', 'npcs', 'enemies', 'endings', 'statuses', 'stats', 'resources', 'vars', 'targets'];

const catalog = Object.fromEntries(KINDS.map((k) => [k, new Map<string, Entry>()])) as Record<RefKind, Map<string, Entry>>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function define(kind: RefKind, id: string, name?: string) {
  if (!id) return;
  catalog[kind].set(id, { label: name ? `${name} (${id})` : id, defined: true });
}

/** NPC → (비밀 문장 → 정의됨 여부). '비밀 공개' 블록의 선택지 */
const secrets = new Map<string, Map<string, boolean>>();

function addSecret(npc: string, text: string, defined: boolean) {
  if (!npc || !text) return;
  const map = secrets.get(npc) ?? new Map<string, boolean>();
  if (!map.get(text)) map.set(text, defined);
  secrets.set(npc, map);
}

function seen(kind: RefKind, id: unknown) {
  if (typeof id !== 'string' || !id || catalog[kind].has(id)) return;
  catalog[kind].set(id, { label: `⚠ ${id} (정의 없음)`, defined: false });
}

/** 참조 키 → 종류 */
const REF_KEYS: Record<string, RefKind> = {
  item: 'items',
  scene: 'scenes',
  to: 'scenes',
  npc: 'npcs',
  ending: 'endings',
  status: 'statuses',
  stat: 'stats',
  resource: 'resources',
  var: 'vars',
  target: 'targets',
};

/** 조건식 안의 참조: var('x'), has_item('x'), in_scene('x'), stat('x') */
const EXPR_REFS: Record<string, RefKind> = { var: 'vars', has_item: 'items', in_scene: 'scenes', stat: 'stats' };

function scanExpr(expr: string) {
  for (const m of expr.matchAll(/\b(var|has_item|in_scene|stat)\(\s*['"]([^'"]*)['"]\s*\)/g)) seen(EXPR_REFS[m[1]], m[2]);
}

function scanRefs(node: unknown) {
  if (Array.isArray(node)) return node.forEach(scanRefs);
  if (!isObj(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (REF_KEYS[key]) seen(REF_KEYS[key], value);
    if ((key === 'condition' || key === 'when') && typeof value === 'string') scanExpr(value);
    if (key === 'secret' && node.op === 'reveal_secret') addSecret(str(node.npc), str(value), false);
    if (key === 'enemies' && Array.isArray(value)) value.forEach((e) => seen('enemies', e));
    scanRefs(value);
  }
}

/** 블록 필드 이름 → 종류 (convert.ts / definitions.ts 의 필드 이름과 같아야 함) */
const FIELD_KINDS: Record<string, RefKind> = {
  ITEM: 'items',
  SCENE: 'scenes',
  TO: 'scenes',
  NPC: 'npcs',
  ENEMY: 'enemies',
  ENDING: 'endings',
  STATUS: 'statuses',
  STAT: 'stats',
  SAVE_STAT: 'stats',
  RES: 'resources',
  VAR: 'vars',
  TARGET: 'targets',
};

interface BlockLike {
  type?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block: BlockLike }>;
  next?: { block: BlockLike };
}

/** 참조 중인 값. 비밀은 NPC 와 문장 쌍 */
export type ExtraRef = [RefKind, string] | ['secret', string, string];

/** 작업 공간의 모든 블록(장면에 끼우지 않은 블록 포함)이 참조 중인 값 */
export function refsFromWorkspace(ws: { blocks?: { blocks: BlockLike[] } }): ExtraRef[] {
  const refs: ExtraRef[] = [];
  const visit = (b: BlockLike | undefined) => {
    if (!b) return;
    for (const [name, value] of Object.entries(b.fields ?? {})) {
      if (FIELD_KINDS[name] && typeof value === 'string' && value) refs.push([FIELD_KINDS[name], value]);
    }
    // 비밀 공개 블록이 고른 문장은 NPC 별로 유지
    if (b.type === 'wtg_op_reveal_secret') refs.push(['secret', str(b.fields?.NPC), str(b.fields?.SECRET)]);
    Object.values(b.inputs ?? {}).forEach((i) => visit(i.block));
    visit(b.next?.block);
  };
  (ws.blocks?.blocks ?? []).forEach(visit);
  return refs;
}

/** 정의된 것(기본 정보 + 블록)과 참조 중인 것으로 선택지를 처음부터 다시 만든다 */
export function rebuildCatalog(scenario: Obj, extraRefs: ExtraRef[] = []) {
  for (const kind of KINDS) catalog[kind].clear();
  secrets.clear();
  for (const [id, np] of Object.entries(isObj(scenario.npcs) ? scenario.npcs : {})) {
    const list = (np as Obj)?.secrets;
    (Array.isArray(list) ? list : []).forEach((t) => addSecret(id, str(t), true));
  }
  const ruleset = isObj(scenario.ruleset) ? scenario.ruleset : {};
  (Array.isArray(ruleset.stats) ? ruleset.stats : []).forEach((s) => define('stats', str(s)));
  Object.keys(isObj(ruleset.resources) ? ruleset.resources : {}).forEach((r) => define('resources', r));
  for (const [id, s] of Object.entries(isObj(scenario.statuses) ? scenario.statuses : {})) define('statuses', id, str((s as Obj)?.name));
  Object.keys(isObj(scenario.variables) ? scenario.variables : {}).forEach((v) => define('vars', v));
  for (const [id, it] of Object.entries(isObj(scenario.items) ? scenario.items : {})) define('items', id, str((it as Obj)?.name));
  for (const [id, n] of Object.entries(isObj(scenario.npcs) ? scenario.npcs : {})) define('npcs', id, str((n as Obj)?.name));
  for (const [id, e] of Object.entries(isObj(scenario.enemies) ? scenario.enemies : {})) define('enemies', id, str((e as Obj)?.name));
  for (const e of Array.isArray(scenario.endings) ? scenario.endings : []) if (isObj(e)) define('endings', str(e.id), str(e.title));
  for (const [id, sc] of Object.entries(isObj(scenario.scenes) ? scenario.scenes : {})) {
    const scene = isObj(sc) ? sc : {};
    const sceneName = str(scene.name) || id;
    define('scenes', id, sceneName);
    for (const [oid, ob] of Object.entries(isObj(scene.objects) ? scene.objects : {})) {
      catalog.targets.set(`${id}.objects.${oid}`, { label: `${sceneName} › ${str((ob as Obj)?.name) || oid}`, defined: true });
    }
    for (const ex of Array.isArray(scene.exits) ? scene.exits : []) {
      if (!isObj(ex) || !ex.to) continue;
      catalog.targets.set(`${id}.exits.${str(ex.to)}`, { label: `${sceneName} › 출구 ${str(ex.label) || str(ex.to)}`, defined: true });
    }
  }
  scanRefs(scenario);
  for (const ref of extraRefs) {
    if (ref[0] === 'secret') addSecret(ref[1], ref[2], false);
    else seen(ref[0], ref[1]);
  }
}

/** 비밀 공개 블록의 선택지: 고른 NPC 의 비밀 문장 */
export function secretOptions(npc: string): MenuOption[] {
  const short = (t: string) => (t.length > 28 ? `${t.slice(0, 28)}…` : t);
  const list: MenuOption[] = [...(secrets.get(npc) ?? new Map<string, boolean>()).entries()]
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([text, defined]) => [defined ? short(text) : `⚠ ${short(text)} (비밀 목록에 없음)`, text]);
  return [[npc ? '(비밀 선택)' : '(NPC 먼저 선택)', ''], ...list];
}

/** 드롭다운 선택지. 첫 항목은 항상 '(선택)' */
export function options(kind: RefKind): MenuOption[] {
  const list: MenuOption[] = [...catalog[kind].entries()]
    .sort((a, b) => Number(b[1].defined) - Number(a[1].defined))
    .map(([id, e]) => [e.label, id]);
  return [[kind === 'targets' ? '(대상 없음)' : '(선택)', ''], ...list];
}
