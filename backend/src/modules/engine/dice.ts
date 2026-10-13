// F-ENG-01: 시드 기반 난수 + 주사위 표기(NdM±K) 해석

export interface RngHolder {
  rng: number;
  /** 테스트 플레이용 d20 고정값 (F-SCN-08). null 이면 무작위 */
  fixedRoll: number | null;
}

/** mulberry32. 상태를 holder.rng 에 저장해 재현 가능 */
export function nextRandom(holder: RngHolder): number {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rollDie(holder: RngHolder, sides: number): number {
  return Math.floor(nextRandom(holder) * sides) + 1;
}

export function rollD20(holder: RngHolder): number {
  return holder.fixedRoll ?? rollDie(holder, 20);
}

const DICE = /^(-)?(\d+)(?:d(\d+))?([+-]\d+)?$/;

/** "3", "-1", "1d6+1", "-1d4" → 정수 */
export function rollDice(holder: RngHolder, expr: string | number): number {
  if (typeof expr === 'number') return expr;
  const m = DICE.exec(expr.replace(/\s+/g, ''));
  if (!m) throw new Error(`잘못된 주사위 표기: ${expr}`);
  const [, neg, countOrValue, sides, mod] = m;
  let total: number;
  if (sides) {
    total = 0;
    for (let i = 0; i < Number(countOrValue); i++) total += rollDie(holder, Number(sides));
  } else {
    total = Number(countOrValue);
  }
  if (mod) total += Number(mod);
  return neg ? -total : total;
}
