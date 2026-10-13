// F-ENG-09: 조건식 DSL (docs/기능명세서.md §6.6)
// 화이트리스트 파서로만 평가한다. eval/Function 사용 금지.

export type Value = number | boolean | string;

export interface ExprContext {
  functions: Record<string, (...args: Value[]) => Value>;
  /** 식별자 값 (스탯 이름, 적의 hp 등) */
  identifiers: Record<string, Value>;
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: string };

type Node =
  | { type: 'lit'; value: Value }
  | { type: 'ident'; name: string }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'unary'; op: 'not' | '-'; arg: Node }
  | { type: 'binary'; op: string; left: Node; right: Node };

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
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) {
      tokens.push({ kind: 'num', value: Number(num[0]) });
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
    const ident = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i));
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

function parse(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.kind === 'op' && peek()!.value === v;
  const isWord = (v: string) => peek()?.kind === 'ident' && peek()!.value === v;
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new Error(`'${v}' 가 필요합니다`);
    pos++;
  };

  const binaryLevel = (next: () => Node, ops: string[], words = false) => (): Node => {
    let left = next();
    for (;;) {
      const t = peek();
      if (!t || t.kind !== (words ? 'ident' : 'op') || !ops.includes(t.value as string)) return left;
      pos++;
      left = { type: 'binary', op: t.value as string, left, right: next() };
    }
  };

  const primary = (): Node => {
    const t = peek();
    if (!t) throw new Error('식이 끝났습니다');
    pos++;
    if (t.kind === 'num' || t.kind === 'str') return { type: 'lit', value: t.value };
    if (t.kind === 'op' && t.value === '(') {
      const inner = orExpr();
      expectOp(')');
      return inner;
    }
    if (t.kind === 'ident') {
      if (t.value === 'true' || t.value === 'false') return { type: 'lit', value: t.value === 'true' };
      if (isOp('(')) {
        pos++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(orExpr());
          while (isOp(',')) {
            pos++;
            args.push(orExpr());
          }
        }
        expectOp(')');
        return { type: 'call', name: t.value, args };
      }
      return { type: 'ident', name: t.value };
    }
    throw new Error(`예상하지 못한 토큰: ${t.value}`);
  };
  const unary = (): Node => {
    if (isOp('-')) {
      pos++;
      return { type: 'unary', op: '-', arg: unary() };
    }
    return primary();
  };
  const mul = binaryLevel(unary, ['*', '/', '%']);
  const add = binaryLevel(mul, ['+', '-']);
  const cmp = (): Node => {
    const left = add();
    const t = peek();
    if (t?.kind === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t.value)) {
      pos++;
      return { type: 'binary', op: t.value, left, right: add() };
    }
    return left;
  };
  const notExpr = (): Node => {
    if (isWord('not')) {
      pos++;
      return { type: 'unary', op: 'not', arg: notExpr() };
    }
    return cmp();
  };
  const andExpr = binaryLevel(notExpr, ['and'], true);
  const orExpr = binaryLevel(andExpr, ['or'], true);

  const node = orExpr();
  if (pos < tokens.length) throw new Error(`해석할 수 없는 부분: ${tokens[pos].value}`);
  return node;
}

const cache = new Map<string, Node>();

function compile(src: string): Node {
  let node = cache.get(src);
  if (!node) {
    try {
      node = parse(src);
    } catch (e) {
      throw new Error(`조건식 오류 "${src}": ${(e as Error).message}`);
    }
    cache.set(src, node);
  }
  return node;
}

const num = (v: Value) => (typeof v === 'number' ? v : Number(v));

function evalNode(node: Node, ctx: ExprContext): Value {
  switch (node.type) {
    case 'lit':
      return node.value;
    // hasOwn: 프로토타입 속성(constructor, __proto__ 등) 접근 차단
    case 'ident':
      if (!Object.hasOwn(ctx.identifiers, node.name)) throw new Error(`알 수 없는 식별자: ${node.name}`);
      return ctx.identifiers[node.name];
    case 'call': {
      if (!Object.hasOwn(ctx.functions, node.name)) throw new Error(`알 수 없는 함수: ${node.name}()`);
      const fn = ctx.functions[node.name];
      return fn(...node.args.map((a) => evalNode(a, ctx)));
    }
    case 'unary':
      return node.op === 'not' ? !evalNode(node.arg, ctx) : -num(evalNode(node.arg, ctx));
    case 'binary': {
      if (node.op === 'and') return Boolean(evalNode(node.left, ctx)) && Boolean(evalNode(node.right, ctx));
      if (node.op === 'or') return Boolean(evalNode(node.left, ctx)) || Boolean(evalNode(node.right, ctx));
      const l = evalNode(node.left, ctx);
      const r = evalNode(node.right, ctx);
      switch (node.op) {
        case '==':
          return l === r;
        case '!=':
          return l !== r;
        case '<':
          return num(l) < num(r);
        case '<=':
          return num(l) <= num(r);
        case '>':
          return num(l) > num(r);
        case '>=':
          return num(l) >= num(r);
        case '+':
          return num(l) + num(r);
        case '-':
          return num(l) - num(r);
        case '*':
          return num(l) * num(r);
        case '/':
          return Math.floor(num(l) / num(r));
        case '%':
          return num(l) % num(r);
      }
      throw new Error(`알 수 없는 연산자: ${node.op}`);
    }
  }
}

export function evaluate(src: string, ctx: ExprContext): Value {
  return evalNode(compile(src), ctx);
}

export function evaluateBool(src: string, ctx: ExprContext): boolean {
  return Boolean(evaluate(src, ctx));
}

export function evaluateNumber(src: string | number, ctx: ExprContext): number {
  if (typeof src === 'number') return src;
  const v = evaluate(src, ctx);
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`숫자가 아닌 결과: ${src}`);
  return v;
}
