import { Document, isMap, isScalar, parse, visit, type YAMLMap } from 'yaml';

type Obj = Record<string, unknown>;

// 한 줄로 쓰는 편이 읽기 쉬운 작은 맵 (예: - { op: give_item, item: key })
const INLINE_KEYS = new Set(['op', 'min', 'max', 'stat', 'dc', 'dice', 'targets', 'when', 'do', 'default', 'bonus', 'success', 'failure']);

function shouldInline(node: YAMLMap): boolean {
  const keys = node.items.map((p) => (isScalar(p.key) ? String(p.key.value) : ''));
  if (keys.includes('op')) return node.items.every((p) => !isMap(p.value) || keys.length <= 4);
  if (keys.length > 3) return false;
  return keys.every((k) => INLINE_KEYS.has(k) || k === 'type' || k === 'item' || k === 'target' || k === 'scene')
    && node.items.every((p) => isScalar(p.value));
}

/** 블록 편집 결과를 YAML 로. 주석은 남지 않는다 */
export function toYaml(scenario: Obj): string {
  const doc = new Document(scenario);
  visit(doc, {
    Map(_, node) {
      if (shouldInline(node)) node.flow = true;
    },
  });
  return `# 블록 편집기에서 저장됨 — 형식은 docs/기능명세서.md §6\n${doc.toString({ lineWidth: 0 })}`;
}

export type ParseResult = { ok: true; scenario: Obj } | { ok: false; message: string };

/** 블록 탭으로 넘어갈 때 현재 YAML 을 읽는다 */
export function parseForBlocks(source: string): ParseResult {
  try {
    const value = parse(source) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, message: '시나리오 최상위는 키-값 형식이어야 합니다.' };
    }
    return { ok: true, scenario: value as Obj };
  } catch (e) {
    return { ok: false, message: `YAML 문법 오류: ${(e as Error).message.split('\n')[0]}` };
  }
}
