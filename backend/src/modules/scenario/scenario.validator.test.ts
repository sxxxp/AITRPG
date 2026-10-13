import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { validateScenarioSource, type ValidationIssue } from './scenario.validator.js';

const MINIMAL = `format_version: 1
meta:
  id: tiny
  title: 작은 시나리오
  author: tester
  players: { min: 1, max: 2 }
  estimated_minutes: 10
  rating: 전체
  tags: []
  language: ko
  start_scene: hall
ruleset:
  stats: [힘, 지능]
  resources:
    hp: { max: "10 + 힘", min: 0 }
  check: { dice: "1d20", formula: "roll + stat" }
ai_guide:
  tone: 담담함
  narration_length: short
  world_lore: 작은 방 두 개.
items:
  key:
    name: 열쇠
    consumable: true
    effects: []
npcs: {}
scenes:
  hall:
    name: 홀
    description: 넓은 홀.
    objects:
      box:
        name: 상자
        on_interact:
          check: { stat: 지능, dc: 10 }
          success:
            - { op: give_item, item: key }
          failure:
            - { op: narrate_hint, text: 열리지 않는다. }
    exits:
      - to: room
        label: 안쪽 방
        condition: "flag('door_open')"
  room:
    name: 방
    description: 작은 방.
    exits: []
events:
  - id: open_door
    trigger: { type: use_item, item: key, target: hall.exits.room }
    actions:
      - { op: set_flag, flag: door_open, value: true }
endings:
  - id: done
    title: 끝
    condition: "in_scene('room')"
    text: 끝났다.
`;

const errors = (issues: ValidationIssue[]) => issues.filter((i) => i.severity === 'error');
const lineOf = (source: string, needle: string) => source.split('\n').findIndex((l) => l.includes(needle)) + 1;

describe('validateScenarioSource', () => {
  it('최소 시나리오는 오류 없이 통과한다', () => {
    const result = validateScenarioSource(MINIMAL);
    assert.deepEqual(errors(result.issues), []);
    assert.equal(result.valid, true);
  });

  it('네오 디미고 예제 시나리오가 통과한다', () => {
    const url = new URL('../../../../scenarios/neo-dimigo/scenario.yaml', import.meta.url);
    const result = validateScenarioSource(readFileSync(url, 'utf8'));
    assert.deepEqual(errors(result.issues), []);
  });

  it('YAML 문법 오류를 줄 번호와 함께 보고한다', () => {
    const source = MINIMAL.replace('  title: 작은 시나리오', '  title: [닫히지 않음');
    const [issue] = validateScenarioSource(source).issues;
    assert.equal(issue.severity, 'error');
    assert.match(issue.message, /YAML 문법 오류/);
    assert.ok(issue.line && issue.line > 0);
  });

  it('허용되지 않은 op 를 스키마 오류로 잡는다', () => {
    const source = MINIMAL.replace('op: narrate_hint', 'op: summon_dragon');
    const result = validateScenarioSource(source);
    assert.equal(result.valid, false);
    const issue = result.issues[0];
    assert.equal(issue.path, 'scenes.hall.objects.box.on_interact.failure.0.op');
    assert.equal(issue.line, lineOf(source, 'summon_dragon'));
  });

  it('알 수 없는 키(오타)를 잡는다', () => {
    const result = validateScenarioSource(MINIMAL.replace('    consumable: true', '    consumabel: true'));
    assert.ok(result.issues.some((i) => /알 수 없는 키: consumabel/.test(i.message)));
  });

  it('존재하지 않는 장면/아이템/스탯 참조를 줄 번호와 함께 잡는다', () => {
    const source = MINIMAL.replace('- to: room', '- to: rooom')
      .replace('item: key }', 'item: kye }')
      .replace('stat: 지능', 'stat: 매력');
    const result = validateScenarioSource(source);
    const messages = errors(result.issues).map((i) => i.message);
    assert.ok(messages.includes('존재하지 않는 장면: rooom'));
    assert.ok(messages.includes('존재하지 않는 아이템: kye'));
    assert.ok(messages.includes('룰셋에 없는 스탯: 매력'));
    const exitIssue = result.issues.find((i) => i.message === '존재하지 않는 장면: rooom');
    assert.equal(exitIssue?.line, lineOf(source, 'to: rooom'));
  });

  it('설정되지 않는 플래그와 도달 불가 장면을 잡는다', () => {
    const source = MINIMAL.replace('{ op: set_flag, flag: door_open, value: true }', '{ op: narrate_hint, text: 철컥 }');
    const messages = errors(validateScenarioSource(source).issues).map((i) => i.message);
    assert.ok(messages.some((m) => m.includes('door_open')));
    // 출구는 조건과 무관하게 연결로 보므로 room 은 여전히 도달 가능
    assert.ok(!messages.some((m) => m.includes('도달할 수 없는')));

    const isolated = MINIMAL.replace(
      '    exits:\n      - to: room\n        label: 안쪽 방\n        condition: "flag(\'door_open\')"\n',
      '    exits: []\n',
    ).replace('target: hall.exits.room', 'target: hall.objects.box');
    const isolatedMessages = errors(validateScenarioSource(isolated).issues).map((i) => i.message);
    assert.ok(isolatedMessages.some((m) => m.includes('도달할 수 없는 장면입니다: room')));
  });

  it('경고만 있으면 valid 다', () => {
    const source = MINIMAL.replace('            - { op: give_item, item: key }', '            - { op: narrate_hint, text: 비었다. }');
    const result = validateScenarioSource(source);
    assert.ok(result.issues.some((i) => i.severity === 'warning' && i.message.includes('key')));
    assert.equal(result.valid, true);
  });
});
