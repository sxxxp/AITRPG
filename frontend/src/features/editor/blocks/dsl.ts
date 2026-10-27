// 조건식 DSL(docs/기능명세서.md §6.6) 파서/출력기. 블록 ↔ 조건식 변환에만 쓰며 평가는 하지 않는다.
// 문법은 backend/src/modules/engine/expression.ts 와 같다.

export type Node =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ident'; name: string }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'not'; arg: Node }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: string; left: Node; right: Node };

type Token = { kind: 'num' | 'str' | 'ident' | 'op'; value: string };

const OPERATORS = ['==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '(', ')', ','];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const rest = src.slice(i);
    const num = /^\d+(\.\d+)?/.exec(rest);
    if (num) {
      tokens.push({ kind: 'num', value: num[0] });
      i += num[0].length;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) throw new Error('닫히지 않은 문자열');
      tokens.push({ kind: 'str', value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const ident = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(rest);
    if (ident) {
      tokens.push({ kind: 'ident', value: ident[0] });
      i += ident[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`알 수 없는 문자: ${ch}`);
    tokens.push({ kind: 'op', value: op });
    i += op.length;
  }
  return tokens;
}

export function parseExpr(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.kind === 'op' && peek()!.value === v;
  const isWord = (v: string) => peek()?.kind === 'ident' && peek()!.value === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`'${v}' 필요`);
    pos++;
  };

  const level = (next: () => Node, ops: string[], word: boolean) => (): Node => {
    let left = next();
    for (;;) {
      const t = peek();
      if (!t || t.kind !== (word ? 'ident' : 'op') || !ops.includes(t.value)) return left;
      pos++;
      left = { type: 'bin', op: t.value, left, right: next() };
    }
  };

  const primary = (): Node => {
    const t = peek();
    if (!t) throw new Error('식이 끝났습니다');
    pos++;
    if (t.kind === 'num') return { type: 'num', value: Number(t.value) };
    if (t.kind === 'str') return { type: 'str', value: t.value };
    if (t.kind === 'op' && t.value === '(') {
      const inner = or();
      expect(')');
      return inner;
    }
    if (t.kind === 'ident') {
      if (t.value === 'true' || t.value === 'false') return { type: 'bool', value: t.value === 'true' };
      if (isOp('(')) {
        pos++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(or());
          while (isOp(',')) {
            pos++;
            args.push(or());
          }
        }
        expect(')');
        return { type: 'call', name: t.value, args };
      }
      return { type: 'ident', name: t.value };
    }
    throw new Error(`예상하지 못한 토큰: ${t.value}`);
  };
  const unary = (): Node => {
    if (isOp('-')) {
      pos++;
      return { type: 'neg', arg: unary() };
    }
    return primary();
  };
  const mul = level(unary, ['*', '/', '%'], false);
  const add = level(mul, ['+', '-'], false);
  const cmp = (): Node => {
    const left = add();
    const t = peek();
    if (t?.kind === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t.value)) {
      pos++;
      return { type: 'bin', op: t.value, left, right: add() };
    }
    return left;
  };
  const not = (): Node => {
    if (isWord('not')) {
      pos++;
      return { type: 'not', arg: not() };
    }
    return cmp();
  };
  const and = level(not, ['and'], true);
  const or = level(and, ['or'], true);

  const node = or();
  if (pos < tokens.length) throw new Error(`해석할 수 없는 부분: ${tokens[pos].value}`);
  return node;
}

/** 우선순위: 클수록 강하게 묶임 */
export const PREC = { or: 1, and: 2, not: 3, cmp: 4, add: 5, mul: 6, unary: 7, atom: 8 } as const;

export function precOf(node: Node): number {
  switch (node.type) {
    case 'bin':
      if (node.op === 'or') return PREC.or;
      if (node.op === 'and') return PREC.and;
      if (['==', '!=', '<', '<=', '>', '>='].includes(node.op)) return PREC.cmp;
      if (node.op === '+' || node.op === '-') return PREC.add;
      return PREC.mul;
    case 'not':
      return PREC.not;
    case 'neg':
      return PREC.unary;
    default:
      return PREC.atom;
  }
}

const quote = (s: string) => `'${s}'`;

export function printExpr(node: Node): string {
  const wrap = (child: Node, min: number) => (precOf(child) < min ? `(${printExpr(child)})` : printExpr(child));
  switch (node.type) {
    case 'num':
      return String(node.value);
    case 'str':
      return quote(node.value);
    case 'bool':
      return String(node.value);
    case 'ident':
      return node.name;
    case 'call':
      return `${node.name}(${node.args.map(printExpr).join(', ')})`;
    case 'not':
      return `not ${wrap(node.arg, PREC.not)}`;
    case 'neg':
      return `-${wrap(node.arg, PREC.unary)}`;
    case 'bin': {
      const p = precOf(node);
      // 좌결합: 오른쪽은 같은 우선순위도 괄호
      return `${wrap(node.left, p)} ${node.op} ${wrap(node.right, p + 1)}`;
    }
  }
}
