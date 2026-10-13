import type { AnyAction, CharacterState, EngineEvent, GameState } from '../engine/types.js';
import type { Scenario } from '../scenario/scenario.schema.js';
import type { ChatMessage, LlmProvider } from './provider.js';

// BE-AI-03 서술 생성 / BE-AI-05 출력 검증 / BE-AI-09 폴백
// AI는 엔진이 확정한 사실(Fact Sheet)만 묘사한다. 상태는 절대 바꾸지 않는다.

export interface NarrationInput {
  sc: Scenario;
  state: GameState;
  actor: CharacterState;
  action: AnyAction;
  utterance: string;
  events: EngineEvent[];
  recent: string[];
}

export type NarrationChunk = { type: 'delta'; text: string } | { type: 'final'; text: string; fallback: boolean };

const LENGTH = {
  short: { sentences: 3, tokens: 220 },
  medium: { sentences: 5, tokens: 340 },
  long: { sentences: 8, tokens: 500 },
} as const;

const RESOURCE_WORD: Record<string, [string, string]> = { hp: ['회복했다', '다쳤다'] };

/** 엔진 이벤트 → 서술용 사실 문장 (수치 제외) */
function describeFacts(input: NarrationInput) {
  const { sc } = input;
  const facts: string[] = [];
  const checks: string[] = [];
  const shown: string[] = [];
  for (const e of input.events) {
    switch (e.type) {
      case 'check': {
        const result = e.critical === 'success' ? '대성공' : e.critical === 'failure' ? '대실패' : e.success ? '성공' : '실패';
        checks.push(`${e.reason} — ${e.actor}의 ${e.stat} 판정 ${result}`);
        break;
      }
      case 'hint':
        facts.push(e.text);
        break;
      case 'fixed':
      case 'locked':
        shown.push(e.text);
        break;
      case 'item':
        facts.push(e.delta > 0 ? `${e.actor}이(가) ${e.name}을(를) 얻었다.` : `${e.name}을(를) 사용해 없어졌다.`);
        break;
      case 'resource': {
        const [up, down] = RESOURCE_WORD[e.resource] ?? ['늘었다', '줄었다'];
        facts.push(`${e.actor}: ${e.delta > 0 ? up : down}`);
        break;
      }
      case 'status':
        facts.push(
          e.change === 'applied'
            ? `${e.actor}이(가) '${e.name}' 상태가 되었다.`
            : e.change === 'resisted'
              ? `${e.actor}이(가) '${e.name}'에 저항했다.`
              : `${e.actor}의 '${e.name}' 상태가 풀렸다.`,
        );
        break;
      case 'restricted':
        facts.push(`${e.actor}은(는) '${e.status}' 때문에 이번 턴에 움직일 수 없었다.`);
        break;
      case 'move':
        facts.push(`일행이 ${e.sceneName}(으)로 이동했다. (새 장면 묘사: ${sc.scenes[e.to].description})`);
        break;
      case 'combat_start':
        facts.push(`전투가 시작되었다: ${e.enemies.join(', ')}`);
        break;
      case 'attack':
        facts.push(
          `${e.attacker}의 ${e.skill ?? '공격'} → ${e.target}: ${e.hit ? (e.damage >= 6 ? '강하게 명중' : '명중') : '빗나감'}`,
        );
        break;
      case 'enemy_gone':
        facts.push(e.reason === 'defeated' ? `${e.name}이(가) 쓰러졌다.` : `${e.name}이(가) 도망쳤다.`);
        break;
      case 'combat_end':
        facts.push(e.reason === 'victory' ? '전투가 끝났다.' : '일행이 전투에서 빠져나왔다.');
        break;
      case 'down':
        facts.push(`${e.actor}이(가) 쓰러졌다.`);
        break;
      case 'secret':
        facts.push(`${e.npc}의 비밀이 드러났다: ${e.text}`);
        break;
      case 'nothing':
        facts.push(e.text);
        break;
      case 'talk':
      case 'ending':
        break;
    }
  }
  return { facts, checks, shown };
}

/** 아직 공개되지 않은, 현재 장면 NPC 들의 비밀 */
function hiddenSecrets(input: NarrationInput): string[] {
  const { sc, state, action } = input;
  const npcIds = new Set(sc.scenes[state.sceneId].npcs ?? []);
  if (action.kind === 'talk') npcIds.add(action.npc);
  const secrets: string[] = [];
  for (const id of npcIds) {
    for (const secret of sc.npcs[id]?.secrets ?? []) {
      if (!state.revealedSecrets.includes(`${id}:${secret}`)) secrets.push(secret);
    }
  }
  return secrets;
}

export function buildMessages(input: NarrationInput): ChatMessage[] {
  const { sc, state, actor, action, utterance } = input;
  const guide = sc.ai_guide;
  const len = LENGTH[guide.narration_length];
  const scene = sc.scenes[state.sceneId];
  const { facts, checks, shown } = describeFacts(input);
  const secrets = hiddenSecrets(input);

  const system = [
    '너는 TRPG 게임 마스터의 서술 담당이다. 한국어로 쓴다.',
    `톤: ${guide.tone}`,
    '규칙:',
    '- [판정]과 [확정된 사실]에 있는 일만 일어난다. 결과를 바꾸거나 새 아이템·장소·출구·결말을 만들지 않는다.',
    '- 숫자(HP, 주사위 값, 피해량)는 쓰지 않는다.',
    '- [금지]의 내용은 어떤 방식으로도 드러내거나 암시하지 않는다.',
    '- [이미 출력된 문장]은 되풀이하지 않는다.',
    `- ${len.sentences}문장 이내의 산문. 캐릭터 이름으로 3인칭 서술. 마크다운·목록·따옴표 머리말 금지.`,
    ...(guide.style_rules ?? []).map((r) => `- ${r}`),
    '',
    `세계관: ${guide.world_lore.replace(/\s+/g, ' ').slice(0, 700)}`,
    ...(guide.glossary ? ['용어: ' + Object.entries(guide.glossary).map(([k, v]) => `${k}(${v})`).join(', ')] : []),
  ].join('\n');

  const npcs = (scene.npcs ?? []).map((id) => sc.npcs[id].name);
  const lines = [
    ...(input.recent.length ? [`[직전 상황] ${input.recent.slice(-2).join(' ')}`] : []),
    `[장면] ${scene.name}: ${scene.description}`,
    ...(npcs.length ? [`[등장 NPC] ${npcs.join(', ')}`] : []),
    `[행동] ${actor.name}: ${action.kind === 'free' ? '자유 행동 (상태 변화 없음)' : action.label}`,
    ...(utterance ? [`[플레이어 대사] "${utterance.slice(0, 200)}"`] : []),
    ...checks.map((c) => `[판정] ${c}`),
    ...(facts.length ? ['[확정된 사실]', ...facts.map((f) => `- ${f}`)] : ['[확정된 사실] 특별한 변화 없음']),
    ...(shown.length ? ['[이미 출력된 문장]', ...shown.map((s) => `- ${s}`)] : []),
  ];

  if (action.kind === 'talk') {
    const npc = sc.npcs[action.npc];
    lines.push(
      `[대화 상대] ${npc.name} — 성격: ${npc.personality}${npc.speech_style ? ` / 말투: ${npc.speech_style}` : ''}`,
      `[대화 상대가 아는 것] ${npc.knows.join(' / ') || '없음'}`,
      `${npc.name}의 대답을 말투를 살려 1~2문장 포함한다. 아는 것 중 대화에 맞는 것만 말한다.`,
    );
  }
  if (action.kind === 'free') {
    lines.push('플레이어의 시도를 묘사하되, 실제로 상황이 바뀌거나 무언가를 얻지는 않는다.');
  }
  if (secrets.length) lines.push(`[금지] ${secrets.join(' / ')}`);

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}

function clean(text: string): string {
  return text
    .replace(/[*#`>]/g, '')
    .replace(/^\s*["'“”]+|["'“”]+\s*$/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 800);
}

/** 위반 사유를 반환. 문제 없으면 null */
export function validateNarration(text: string, input: NarrationInput): string | null {
  if (text.length < 5) return '서술이 비어 있음';

  for (const secret of hiddenSecrets(input)) {
    const words = secret.split(/[\s,.()]+/).filter((w) => w.length >= 2);
    const hits = words.filter((w) => text.includes(w)).length;
    if (words.length > 0 && hits / words.length >= 0.6) return '비밀을 누설함';
  }

  const checks = input.events.filter((e) => e.type === 'check');
  if (checks.length === 1) {
    const c = checks[0];
    if (c.success && /실패/.test(text)) return '성공한 판정을 실패로 서술함';
    if (!c.success && /성공/.test(text)) return '실패한 판정을 성공으로 서술함';
  }

  if (/\b(HP|hp)\b|체력이 \d|\d+\s*(데미지|대미지)/.test(text)) return '수치를 언급함';
  return null;
}

/** LLM 없이 엔진 사실만으로 만든 서술 */
export function fallbackNarration(input: NarrationInput): string {
  const { facts } = describeFacts(input);
  const visible = facts.filter((f) => !f.includes('(새 장면 묘사:'));
  const moved = input.events.find((e) => e.type === 'move');
  if (moved && moved.type === 'move') visible.unshift(input.sc.scenes[moved.to].description);
  if (input.action.kind === 'talk') {
    const npc = input.sc.npcs[input.action.npc];
    const greeting = npc.fixed_lines?.greeting;
    visible.push(greeting ? `${npc.name}: "${greeting}"` : `${npc.name}은(는) ${input.actor.name}을(를) 바라본다.`);
  }
  if (visible.length === 0) visible.push(`${input.actor.name}의 행동에 별다른 일은 일어나지 않았다.`);
  return visible.join(' ');
}

export async function* narrate(provider: LlmProvider | null, input: NarrationInput): AsyncGenerator<NarrationChunk> {
  if (!provider) {
    yield { type: 'final', text: fallbackNarration(input), fallback: true };
    return;
  }
  const len = LENGTH[input.sc.ai_guide.narration_length];
  const messages = buildMessages(input);
  const opts = { maxTokens: len.tokens, temperature: 0.8 };

  try {
    let text = '';
    for await (const delta of provider.stream(messages, opts)) {
      text += delta;
      yield { type: 'delta', text: delta };
    }
    text = clean(text);
    const violation = validateNarration(text, input);
    if (!violation) {
      yield { type: 'final', text, fallback: false };
      return;
    }

    // 1회 재생성 (스트리밍 없이) — 화면의 초안은 최종본으로 교체됨
    const retry = clean(
      await provider.complete(
        [...messages, { role: 'assistant', content: text }, { role: 'user', content: `규칙 위반(${violation}). 규칙을 지켜 다시 써라.` }],
        { ...opts, temperature: 0.5 },
      ),
    );
    if (!validateNarration(retry, input)) {
      yield { type: 'final', text: retry, fallback: false };
      return;
    }
  } catch {
    // 연결 오류/타임아웃 → 폴백
  }
  yield { type: 'final', text: fallbackNarration(input), fallback: true };
}
