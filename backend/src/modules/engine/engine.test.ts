import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { loadScenarioFile } from '../scenario/scenario.loader.js';
import { rollDice } from './dice.js';
import { applyAction, createGame, EngineError, FREE_ACTION, listActions } from './engine.js';
import { evaluate } from './expression.js';
import type { EngineEvent, GameState } from './types.js';

const NEO = fileURLToPath(new URL('../../../../scenarios/neo-dimigo/scenario.yaml', import.meta.url));
const sc = loadScenarioFile(NEO);

const ctx = {
  identifiers: { 체력: 3, hp: 5 },
  functions: { flag: (id: unknown) => id === 'on', var: () => 2, turn_count: () => 6 },
};

describe('조건식 DSL', () => {
  it('논리/비교/산술과 함수 호출을 평가한다', () => {
    assert.equal(evaluate("flag('on') and not flag('off')", ctx), true);
    assert.equal(evaluate("var('x') >= 2 or flag('off')", ctx), true);
    assert.equal(evaluate('10 + 체력 * 2', ctx), 16);
    assert.equal(evaluate('hp < 6 and turn_count() % 3 == 0', ctx), true);
    assert.equal(evaluate('-(1 + 2)', ctx), -3);
  });

  it('허용되지 않은 함수와 식별자는 거부한다', () => {
    assert.throws(() => evaluate('process()', ctx), /알 수 없는 함수/);
    assert.throws(() => evaluate('constructor', ctx), /알 수 없는 식별자/);
    assert.throws(() => evaluate("constructor('x')", ctx), /알 수 없는 함수/);
    assert.throws(() => evaluate('__proto__', ctx), /알 수 없는 식별자/);
    assert.throws(() => evaluate("flag('a'); x", ctx), /알 수 없는 문자/);
  });
});

describe('주사위', () => {
  it('같은 시드는 같은 결과를 낸다', () => {
    const a = { rng: 42, fixedRoll: null };
    const b = { rng: 42, fixedRoll: null };
    const seqA = Array.from({ length: 5 }, () => rollDice(a, '2d6+1'));
    const seqB = Array.from({ length: 5 }, () => rollDice(b, '2d6+1'));
    assert.deepEqual(seqA, seqB);
    seqA.forEach((v) => assert.ok(v >= 3 && v <= 13));
    assert.equal(rollDice(a, '-1'), -1);
  });
});

describe('네오 디미고 진행', () => {
  const start = () => {
    const { state } = createGame(sc, [{ name: '리아', presetId: 'digital_contents' }], 7);
    state.fixedRoll = 20; // 모든 판정 대성공
    return state;
  };

  /** 라벨/ID 조건으로 행동을 골라 실행 */
  const act = (state: GameState, pick: (id: string, label: string) => boolean) => {
    const action = listActions(sc, state, 'p1').find((a) => pick(a.id, a.label));
    assert.ok(action, `행동을 찾을 수 없음 (장면 ${state.sceneId}): ${listActions(sc, state, 'p1').map((a) => a.id).join(', ')}`);
    return applyAction(sc, state, 'p1', action);
  };
  const go = (state: GameState, to: string) =>
    act(state, (id) => id.startsWith('move:') && listActions(sc, state, 'p1').some((a) => a.id === id && a.kind === 'move' && a.to === to)).state;
  const has = (state: GameState, item: string) => (state.party[0].inventory[item] ?? 0) > 0;

  it('프리셋으로 캐릭터를 만들고 HP를 계산한다', () => {
    const s = start();
    assert.equal(s.party[0].resources.hp, 14); // 10 + 체력 4
    assert.equal(s.sceneId, 'main_lobby');
  });

  it('잠긴 출구는 이동하지 않고 locked_text 를 낸다', () => {
    let s = go(start(), 'stairs_1');
    const r = act(s, (id) => id === 'move:1');
    s = r.state;
    assert.equal(s.sceneId, 'stairs_1');
    assert.ok(r.events.some((e) => e.type === 'locked'));
  });

  it('지금 할 수 없는 행동은 거부한다', () => {
    const s = start();
    assert.throws(() => applyAction(sc, s, 'p1', { id: 'interact:giant_root', kind: 'interact', label: '', group: '행동', object: 'giant_root' }), EngineError);
  });

  it('자유 행동은 상태를 바꾸지 않는다 (턴만 증가)', () => {
    const s = start();
    const { state } = applyAction(sc, s, 'p1', FREE_ACTION());
    assert.equal(state.turn, s.turn + 1);
    assert.deepEqual(state.flags, s.flags);
  });

  it('처음부터 엔딩까지 클리어할 수 있다', () => {
    let s = start();
    const all: EngineEvent[] = [];
    const step = (r: { state: GameState; events: EngineEvent[] }) => {
      all.push(...r.events);
      s = r.state;
    };
    const deliver = (item: string) => step(act(s, (id) => id === `use:${item}@gym.objects.repair_bench`));

    // 빵 2개 확보
    s = go(s, 'new_building');
    step(act(s, (id) => id === 'interact:bread_shelf'));
    step(act(s, (id) => id === 'interact:bread_shelf'));
    s = go(go(s, 'main_lobby'), 'cafeteria');
    // 빵으로 디미충 유인 → 배터리
    step(act(s, (id) => id === 'use:code_bread@cafeteria.objects.dimichung'));
    assert.ok(has(s, 'laptop_battery'));
    s = go(go(s, 'main_lobby'), 'gym');
    deliver('laptop_battery');
    assert.equal(s.vars.laptop_pieces, 1);

    s = go(go(s, 'main_lobby'), 'dormitory');
    step(act(s, (id) => id === 'interact:warden_safe'));
    assert.ok(has(s, 'laptop_keyboard'));
    s = go(go(s, 'main_lobby'), 'smart_farm');
    step(act(s, (id) => id === 'interact:giant_root'));
    assert.ok(has(s, 'laptop_mainboard'));
    s = go(go(s, 'main_lobby'), 'gym');
    deliver('laptop_keyboard');
    deliver('laptop_mainboard');
    assert.equal(s.vars.laptop_pieces, 3);

    // 계단 → 4층 교탁 → 해킹 공격과 교실
    s = go(go(s, 'main_lobby'), 'stairs_1');
    s = go(s, 'stairs_2');
    step(act(s, (id) => id === 'interact:talking_drum'));
    s = go(s, 'stairs_3');
    s = go(s, 'stairs_4');
    step(act(s, (id) => id === 'interact:lectern'));
    assert.equal(s.sceneId, 'hacking_class');
    step(act(s, (id) => id === 'interact:ctf_server'));
    assert.ok(has(s, 'laptop_screen'));

    for (const to of ['stairs_4', 'stairs_3', 'stairs_2', 'stairs_1', 'main_lobby', 'gym']) s = go(s, to);
    deliver('laptop_screen');
    assert.equal(s.flags.laptop_repaired, true);

    // 옥상 보스전
    for (const to of ['main_lobby', 'stairs_1', 'stairs_2', 'stairs_3', 'stairs_4']) s = go(s, to);
    step(act(s, (_, label) => label.includes('옥상')));
    assert.equal(s.sceneId, 'rooftop');
    assert.ok(s.combat);
    for (let i = 0; i < 30 && !s.ending; i++) step(act(s, (id) => id.startsWith('attack:')));

    assert.equal(s.ending?.id, 'back_to_weekend');
    assert.ok(all.some((e) => e.type === 'fixed' && e.text.includes('노트북 복구 완료')));
    assert.deepEqual(listActions(sc, s, 'p1'), []);
  });

  it('HP가 0이 되면 전멸 엔딩으로 끝난다', () => {
    let s = start();
    s.fixedRoll = 1; // 모든 판정 대실패
    s = go(s, 'cafeteria');
    s = act(s, (id) => id === 'interact:dimichung').state; // 실패 → 전투
    assert.ok(s.combat);
    for (let i = 0; i < 30 && !s.ending; i++) s = act(s, (id) => id.startsWith('attack:')).state;
    assert.equal(s.ending?.id, 'concreted_forever');
  });
});
