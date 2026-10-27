import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { env } from '../../config/env.js';
import { createProvider } from '../ai/provider.js';
import { act, applyDebug, setProvider, startGame, type StreamEvent } from './play.service.js';

/**
 * Ollama /api/chat 를 흉내 내는 가짜 서버.
 * - format(JSON Schema) 요청: 플레이어 입력과 라벨 단어가 겹치는 후보를 고른다 (의도 해석)
 * - 그 외: 서술. narrationQueue 의 문장을 차례로 돌려준다 (stream 이면 NDJSON 조각)
 */
let server: Server;
let baseUrl = '';
const narrationQueue: string[] = [];
const requests: { stream: boolean; format: boolean; think?: boolean; numCtx?: number }[] = [];

function pickIntent(prompt: string): string {
  const input = /플레이어 입력: """([\s\S]*?)"""/.exec(prompt)?.[1] ?? '';
  const candidates = [...prompt.matchAll(/^- (\S+): (.+)$/gm)].map((m) => ({ id: m[1], label: m[2] }));
  const words = input.split(/\s+/).map((w) => w.replace(/(을|를|이|가|에게|에|으로|로|하기|한다|해)$/, '')).filter((w) => w.length >= 2);
  const hit = candidates.find((c) => c.id !== 'free' && words.some((w) => c.label.includes(w)));
  return hit?.id ?? 'free';
}

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/api/tags') {
        res.end(JSON.stringify({ models: [{ name: 'fake:4b' }] }));
        return;
      }
      const body = JSON.parse(raw);
      requests.push({ stream: body.stream, format: !!body.format, think: body.think, numCtx: body.options?.num_ctx });
      if (body.format) {
        const prompt = body.messages.at(-1).content as string;
        res.end(JSON.stringify({ message: { content: JSON.stringify({ action_id: pickIntent(prompt), utterance: '' }) }, done: true }));
        return;
      }
      const text = narrationQueue.shift() ?? '조용한 정적이 흐른다.';
      if (!body.stream) {
        res.end(JSON.stringify({ message: { content: text }, done: true }));
        return;
      }
      res.setHeader('Content-Type', 'application/x-ndjson');
      for (const part of text.match(/.{1,4}/gsu) ?? []) res.write(`${JSON.stringify({ message: { content: part }, done: false })}\n`);
      res.end(`${JSON.stringify({ message: { content: '' }, done: true })}\n`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setProvider(createProvider({ ...env.llm, provider: 'ollama', baseUrl, model: 'fake:4b', think: false }));
});

after(() => {
  setProvider(null);
  server.close();
});

async function collect(gen: AsyncGenerator<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

const newGame = () => {
  const { view } = startGame('neo-dimigo', { name: '리아', presetId: 'web_dev' });
  applyDebug(view.gameId, { fixedRoll: 20 });
  return view.gameId;
};

describe('1인 플레이 + LLM 연동 (가짜 Ollama)', () => {
  it('자유 입력을 후보 행동으로 해석하고, 판정 결과를 서술보다 먼저 보낸 뒤 서술을 스트리밍한다', async () => {
    const id = newGame();
    await collect(act(id, { actionId: 'move:3' })); // 스마트 팜
    narrationQueue.push('리리아가 제어판을 두드리자 스프링클러가 멈춘다.');
    const events = await collect(act(id, { text: '자동 급수 제어판을 해킹한다' }));

    const types = events.map((e) => e.type);
    assert.ok(types.indexOf('view') < types.indexOf('narration_start'), '엔진 결과가 서술보다 먼저');
    assert.ok(events.some((e) => e.type === 'feed' && e.entry.type === 'check'));
    assert.ok(events.some((e) => e.type === 'feed' && e.entry.type === 'system' && e.entry.text.includes('자동 급수 제어판 다루기')));
    assert.ok(types.filter((t) => t === 'narration_delta').length > 1, '여러 조각으로 스트리밍');
    const end = events.find((e) => e.type === 'narration_end');
    assert.ok(end?.type === 'narration_end' && end.entry.type === 'narration' && !end.entry.fallback);
    const view = [...events].reverse().find((e) => e.type === 'view');
    assert.ok(view?.type === 'view');

    const last = requests.at(-1)!;
    assert.equal(last.think, false);
    assert.equal(last.numCtx, env.llm.numCtx);
  });

  it('비밀을 누설한 서술은 재생성하고, 그래도 실패하면 폴백한다', async () => {
    const id = newGame();
    await collect(act(id, { actionId: 'move:2' })); // 기숙사 (사감 빨간모자)
    narrationQueue.push('사감은 매 정각 옥상 방향으로 경례하러 사감실을 비운다고 중얼거린다.', '사감이 호루라기를 분다.');
    const events = await collect(act(id, { actionId: 'talk:red_hat_warden' }));
    const end = events.find((e) => e.type === 'narration_end');
    assert.ok(end?.type === 'narration_end' && end.entry.type === 'narration');
    assert.equal(end.entry.text, '사감이 호루라기를 분다.');
    assert.equal(end.entry.fallback, false);
  });

  it('LLM 연결이 끊기면 엔진 사실로 폴백 서술한다', async () => {
    const id = newGame();
    setProvider(createProvider({ ...env.llm, provider: 'ollama', baseUrl: 'http://127.0.0.1:9', model: 'fake:4b', timeoutMs: 2000 }));
    try {
      const events = await collect(act(id, { actionId: 'move:0' }));
      const end = events.find((e) => e.type === 'narration_end');
      assert.ok(end?.type === 'narration_end' && end.entry.type === 'narration' && end.entry.fallback);
      assert.ok(end.entry.text.includes('빵 냄새'));
    } finally {
      setProvider(createProvider({ ...env.llm, provider: 'ollama', baseUrl, model: 'fake:4b', think: false }));
    }
  });

  it('디버그로 플래그·변수·HP·장면·아이템을 바꾸고 기록을 남긴다', () => {
    const id = newGame();
    const { view, entry } = applyDebug(id, {
      flags: { laptop_repaired: true },
      vars: { laptop_pieces: 3 },
      sceneId: 'stairs_4',
      giveItem: 'code_bread',
      hp: 3,
    });
    assert.equal(view.debug.flags.laptop_repaired, true);
    assert.equal(view.debug.vars.laptop_pieces, 3);
    assert.equal(view.scene.id, 'stairs_4');
    assert.equal(view.character.hp, 3);
    assert.ok(view.inventory.some((i) => i.id === 'code_bread'));
    assert.ok(view.actions.some((a) => a.label.includes('옥상')), '옥상 출구가 열려 있어야 함');
    assert.ok(view.debug.knownFlags.includes('battery_taken'));
    assert.match(entry!.text, /디버그/);
    assert.throws(() => applyDebug(id, { sceneId: 'nowhere' }), /존재하지 않는 장면/);
    assert.throws(() => applyDebug(id, { vars: { undeclared: 1 } }), /잘못된 변수/);
  });

  it('후보에 없는 입력은 상태를 바꾸지 않는 자유 행동이 된다', async () => {
    const id = newGame();
    const events = await collect(act(id, { text: '하늘을 보며 한숨을 쉰다' }));
    assert.ok(!events.some((e) => e.type === 'feed' && e.entry.type === 'check'));
    const view = events.find((e) => e.type === 'view');
    assert.ok(view?.type === 'view' && view.view.scene.id === 'main_lobby');
  });
});
