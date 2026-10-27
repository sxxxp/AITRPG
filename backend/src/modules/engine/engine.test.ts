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

describe('대성공/대실패 갈래', () => {
  const flag = (name: string) => [{ op: 'set_flag' as const, flag: name, value: true }];
  const withBranch = (critical: boolean) => {
    const s2 = structuredClone(sc);
    s2.scenes.main_lobby.objects!.drum_row.on_examine = {
      check: { stat: '눈치', dc: 12 },
      success: flag('r_success'),
      failure: flag('r_failure'),
      ...(critical ? { critical_success: flag('r_crit_success'), critical_failure: flag('r_crit_failure') } : {}),
    };
    return s2;
  };
  /** 웹프로그래밍과(눈치 3)로 주사위를 고정해 드럼통 행렬을 살펴본 뒤 켜진 플래그 */
  const examineWith = (scenario: typeof sc, roll: number) => {
    const { state } = createGame(scenario, [{ name: '리아', presetId: 'web_dev' }], 1);
    state.fixedRoll = roll;
    const action = listActions(scenario, state, 'p1').find((a) => a.id === 'examine:drum_row')!;
    return Object.keys(applyAction(scenario, state, 'p1', action).state.flags);
  };

  it('주사위 1/20 이면 대실패/대성공 갈래를, 그 외에는 일반 갈래를 실행한다', () => {
    const s2 = withBranch(true);
    assert.deepEqual(examineWith(s2, 1), ['r_crit_failure']);
    assert.deepEqual(examineWith(s2, 2), ['r_failure']); // 2 + 3 < 12
    assert.deepEqual(examineWith(s2, 19), ['r_success']); // 19 + 3 >= 12
    assert.deepEqual(examineWith(s2, 20), ['r_crit_success']);
  });

  it('대성공/대실패 갈래가 없으면 success/failure 로 대체한다', () => {
    const s2 = withBranch(false);
    assert.deepEqual(examineWith(s2, 1), ['r_failure']);
    assert.deepEqual(examineWith(s2, 20), ['r_success']);
  });
});

describe('스탯 변경 (add_stat)', () => {
  /** 드럼통 행렬 살펴보기를 주어진 연산으로 바꾼 시나리오 */
  const withOps = (ops: { op: 'add_stat'; stat: string; value: number }[]) => {
    const s2 = structuredClone(sc);
    s2.scenes.main_lobby.objects!.drum_row.on_examine = { actions: ops };
    return s2;
  };
  const run = (scenario: typeof sc, before?: (s: GameState) => void) => {
    const { state } = createGame(scenario, [{ name: '리아', presetId: 'digital_contents' }], 1); // 체력 4, 눈치 4
    before?.(state);
    const action = listActions(scenario, state, 'p1').find((a) => a.id === 'examine:drum_row')!;
    return applyAction(scenario, state, 'p1', action);
  };

  it('생성 상한(5)을 넘어 오르고, 연결된 최대 HP와 현재 HP도 함께 오른다', () => {
    const { state, events } = run(withOps([{ op: 'add_stat', stat: '체력', value: 2 }]), (s) => {
      s.party[0].resources.hp = 10; // 다친 상태
    });
    const c = state.party[0];
    assert.equal(c.stats['체력'], 6);
    assert.equal(c.resourceMax.hp, 16); // 10 + 체력
    assert.equal(c.resources.hp, 12, '현재 HP도 최대치 증가분만큼');
    const ev = events.find((e) => e.type === 'stat');
    assert.ok(ev?.type === 'stat');
    assert.deepEqual(ev.maxChanges, [{ resource: 'hp', delta: 2, max: 16 }]);
  });

  it('오른 스탯은 이후 판정에 반영된다', () => {
    let { state } = run(withOps([{ op: 'add_stat', stat: '눈치', value: 1 }]));
    state = go(state, 'cafeteria');
    state.fixedRoll = 10;
    const r = applyAction(sc, state, 'p1', listActions(sc, state, 'p1').find((a) => a.id === 'examine:dimichung')!);
    const check = r.events.find((e) => e.type === 'check');
    assert.ok(check?.type === 'check');
    assert.equal(check.bonus, 5); // 눈치 4 + 1
  });

  it('스탯이 내려가면 최대 HP가 줄고 현재 HP는 새 최대치로 맞춰진다', () => {
    const { state } = run(withOps([{ op: 'add_stat', stat: '체력', value: -3 }]));
    const c = state.party[0];
    assert.equal(c.stats['체력'], 1);
    assert.equal(c.resourceMax.hp, 11);
    assert.equal(c.resources.hp, 11);
  });

  // 이 describe 안에서만 쓰는 이동 도우미 (아래 '네오 디미고 진행'의 go 와 동일)
  function go(state: GameState, to: string) {
    const action = listActions(sc, state, 'p1').find((a) => a.kind === 'move' && a.to === to)!;
    return applyAction(sc, state, 'p1', action).state;
  }
});

describe('에디터 새 시나리오 템플릿', () => {
  it('검증을 통과하고 처음부터 엔딩까지 진행할 수 있다', () => {
    const tpl = loadScenarioFile(fileURLToPath(new URL('../../../../frontend/src/features/editor/template.yaml', import.meta.url)));
    let { state } = createGame(tpl, [{ name: '리아', presetId: 'warrior' }], 1);
    state.fixedRoll = 20;
    const act = (id: string) => {
      const action = listActions(tpl, state, 'p1').find((a) => a.id === id);
      assert.ok(action, `${id} 없음: ${listActions(tpl, state, 'p1').map((a) => a.id).join(', ')}`);
      state = applyAction(tpl, state, 'p1', action).state;
    };
    act('examine:bush');
    act('use:old_key@gate.exits.tower');
    act('move:0');
    assert.ok(state.combat);
    for (let i = 0; i < 20 && !state.ending; i++) act(listActions(tpl, state, 'p1').find((a) => a.kind === 'attack')!.id);
    assert.equal(state.ending?.id, 'clear');
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

  it('도주했다가 다시 만난 적은 남은 HP를 유지한다', () => {
    let s = start();
    s = go(s, 'cafeteria');
    s.fixedRoll = 1; // 몰래 빼기 실패 → 전투
    s = act(s, (id) => id === 'interact:dimichung').state;
    const fullHp = s.combat!.enemies[0].maxHp;

    s.fixedRoll = 20; // 공격 명중, 회피·도주 성공
    s = act(s, (id) => id.startsWith('attack:')).state;
    const woundedHp = s.combat!.enemies[0].hp;
    assert.ok(woundedHp < fullHp);

    s = act(s, (id) => id === 'flee').state;
    assert.equal(s.combat, null);
    assert.equal(s.sceneId, 'main_lobby');
    assert.deepEqual(s.woundedEnemies, { 'cafeteria:dimichung': [woundedHp] });

    s = go(s, 'cafeteria');
    s.fixedRoll = 1;
    const again = act(s, (id) => id === 'interact:dimichung');
    const enemy = again.state.combat!.enemies[0];
    assert.equal(enemy.hp, woundedHp, '지난 전투의 HP로 시작');
    assert.equal(enemy.maxHp, fullHp, '최대 HP는 그대로');
    assert.ok(again.events.some((e) => e.type === 'combat_start' && e.resumed.includes('거대 변이 디미충')));
    assert.deepEqual(again.state.woundedEnemies, {}, '꺼내 쓴 기록은 지운다');
  });

  it('스스로 도망친 적도 남은 HP를 기억한다', () => {
    let s = start();
    s = go(s, 'cafeteria');
    s.fixedRoll = 1;
    s = act(s, (id) => id === 'interact:dimichung').state;
    s.fixedRoll = 20;
    // 디미충은 HP 8 미만이면 도망친다 (behavior: hp < 8 → flee)
    for (let i = 0; i < 30 && s.combat; i++) s = act(s, (id) => id.startsWith('attack:')).state;
    assert.equal(s.combat, null);
    const [hp] = s.woundedEnemies['cafeteria:dimichung'];
    assert.ok(hp > 0 && hp < 8);
  });

  it('처치한 적은 기억하지 않는다', () => {
    let s = start();
    s = go(s, 'smart_farm');
    s.fixedRoll = 1; // 뿌리 뽑기 실패 → 식인 식물 2마리
    s = act(s, (id) => id === 'interact:giant_root').state;
    assert.equal(s.combat?.enemies.length, 2);
    s.fixedRoll = 20;
    for (let i = 0; i < 30 && s.combat; i++) s = act(s, (id) => id.startsWith('attack:')).state;
    assert.equal(s.combat, null);
    assert.deepEqual(s.woundedEnemies, {});
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
