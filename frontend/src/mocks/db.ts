// 개발용 인메모리 DB. localStorage에 저장되어 새로고침 후에도 유지됨
import type { Character, CharacterPreset, CharacterRules } from '@/shared/types/character';
import type { AuthUser } from '@/shared/types/user';
import type { ScenarioRef, ScenarioSummary } from '@/shared/types/scenario';
import type {
  LobbyPlayer,
  LobbyUpdate,
  ProgressMode,
  SessionDetail,
  SessionSettings,
  SessionStatus,
  SessionSummary,
} from '@/shared/types/session';

export interface MockUser {
  id: string;
  email: string;
  password: string;
  nickname: string;
  createdAt: string;
}

export interface MockScenario {
  id: string;
  title: string;
  summary: string;
  authorId: string;
  tags: string[];
  players: { min: number; max: number };
  estimatedMinutes: number;
  ratingSum: number;
  ratingCount: number;
  playCount: number;
  weeklyPlays: number;
  rules: CharacterRules;
  presets: CharacterPreset[];
}

export interface MockMember {
  userId: string;
  ready: boolean;
  online: boolean;
  characterId: string | null;
}

export interface MockSession {
  id: string;
  scenarioId: string;
  hostId: string;
  status: SessionStatus;
  inviteCode: string;
  maxPlayers: number;
  isPublic: boolean;
  password: string | null;
  mode: ProgressMode;
  roundTimeLimitSec: number;
  members: MockMember[];
  createdAt: string;
  updatedAt: string;
  endingTitle: string | null;
}

export interface MockCharacter extends Character {
  sessionId: string;
  userId: string;
}

interface MockDb {
  users: MockUser[];
  scenarios: MockScenario[];
  sessions: MockSession[];
  characters: MockCharacter[];
  seq: number;
}

const STORAGE_KEY = 'wtg.mock.db.v1';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

function rules(stats: string[]): CharacterRules {
  return { stats, method: 'point_buy', totalPoints: 12, minPerStat: 1, maxPerStat: 5, allowCustom: true };
}

function presets(stats: string[], defs: [string, string, number[]][]): CharacterPreset[] {
  return defs.map(([name, description, values], i) => ({
    id: `p${i + 1}`,
    name,
    description,
    stats: Object.fromEntries(stats.map((s, j) => [s, values[j]])),
  }));
}

const FANTASY = ['힘', '민첩', '지능', '매력'];
const FANTASY_PRESETS = presets(FANTASY, [
  ['전사 브란', '전장에서 잔뼈가 굵은 용병.', [5, 3, 2, 2]],
  ['도적 미라', '그림자 속을 걷는 정보상.', [2, 5, 2, 3]],
  ['학자 엘린', '고대 문헌을 연구하는 마법사.', [2, 2, 5, 3]],
]);
const MODERN = ['체력', '반사신경', '기술', '교섭'];
const MODERN_PRESETS = presets(MODERN, [
  ['요원 케이', '은퇴를 앞둔 현장 요원.', [4, 4, 2, 2]],
  ['해커 진', '네트워크의 유령.', [2, 3, 5, 2]],
  ['협상가 레아', '말 한마디로 문을 연다.', [2, 2, 3, 5]],
]);

function seed(): MockDb {
  const scenario = (
    id: string,
    title: string,
    summary: string,
    authorId: string,
    tags: string[],
    players: [number, number],
    minutes: number,
    avg: number,
    count: number,
    plays: number,
    weekly: number,
    modern = false,
  ): MockScenario => ({
    id,
    title,
    summary,
    authorId,
    tags,
    players: { min: players[0], max: players[1] },
    estimatedMinutes: minutes,
    ratingSum: Math.round(avg * count),
    ratingCount: count,
    playCount: plays,
    weeklyPlays: weekly,
    rules: rules(modern ? MODERN : FANTASY),
    presets: modern ? MODERN_PRESETS : FANTASY_PRESETS,
  });

  const presetChar = (id: string, sessionId: string, userId: string, sc: MockScenario, idx: number): MockCharacter => {
    const p = sc.presets[idx];
    return { id, sessionId, userId, name: p.name, background: p.description, stats: { ...p.stats }, presetId: p.id };
  };

  const scenarios = [
    scenario('s1', '버려진 예배당의 비밀', '실종 사건이 이어지는 마을, 모두가 예배당 이야기를 꺼린다.', 'u2', ['호러', '추리'], [1, 4], 60, 4.6, 128, 1520, 210),
    scenario('s2', '용의 둥지 원정대', '왕국을 위협하는 붉은 용을 토벌하라.', 'u3', ['판타지', '전투'], [2, 5], 120, 4.2, 86, 980, 340),
    scenario('s3', '네온 시티 해킹 작전', '거대 기업의 금고 서버에 침투하는 하룻밤.', 'u4', ['사이버펑크', '잠입'], [2, 4], 90, 4.4, 41, 412, 95, true),
    scenario('s4', '안개 섬의 등대지기', '꺼진 등대와 사라진 등대지기의 일지.', 'u2', ['미스터리', '힐링'], [1, 2], 45, 4.8, 12, 150, 40),
    scenario('s5', '마법학교 입학시험', '엉망진창 시험장에서 살아남아 합격하라.', 'u3', ['코미디', '판타지'], [1, 6], 40, 3.9, 203, 2300, 180),
    scenario('s6', '심해 연구소 7호', '통신이 끊긴 해저 기지에서 무언가가 깨어났다.', 'u4', ['SF', '호러', '생존'], [2, 4], 90, 4.5, 67, 630, 120, true),
  ];
  const [s1, s2, s3, s4, s5, s6] = scenarios;

  const session = (
    id: string,
    sc: MockScenario,
    hostId: string,
    status: SessionStatus,
    inviteCode: string,
    maxPlayers: number,
    members: [string, boolean, string | null][],
    opts: Partial<MockSession> = {},
  ): MockSession => ({
    id,
    scenarioId: sc.id,
    hostId,
    status,
    inviteCode,
    maxPlayers,
    isPublic: true,
    password: null,
    mode: 'round',
    roundTimeLimitSec: 120,
    members: members.map(([userId, ready, characterId]) => ({ userId, ready, online: true, characterId })),
    createdAt: ago(30),
    updatedAt: ago(5),
    endingTitle: null,
    ...opts,
  });

  return {
    users: [
      { id: 'u1', email: 'demo@wtg.dev', password: 'demo1234', nickname: '모험가', createdAt: ago(60 * 24 * 30) },
      { id: 'u2', email: 'ria@wtg.dev', password: 'demo1234', nickname: '리아', createdAt: ago(60 * 24 * 90) },
      { id: 'u3', email: 'kyle@wtg.dev', password: 'demo1234', nickname: '카일', createdAt: ago(60 * 24 * 60) },
      { id: 'u4', email: 'serin@wtg.dev', password: 'demo1234', nickname: '세린', createdAt: ago(60 * 24 * 45) },
    ],
    scenarios,
    sessions: [
      session('ses1', s2, 'u3', 'lobby', 'DRAGON', 5, [['u3', true, 'c1'], ['u4', false, null]]),
      session('ses2', s1, 'u2', 'lobby', 'CHAPEL', 4, [['u2', true, 'c2']], { password: '1234' }),
      session('ses3', s5, 'u4', 'lobby', 'MAGIC1', 3, [['u4', true, 'c3'], ['u2', true, 'c4'], ['u3', true, 'c5']]),
      session('ses4', s3, 'u1', 'in_progress', 'NEON42', 4, [['u1', true, 'c6'], ['u4', true, 'c7']], { isPublic: false }),
      session('ses5', s6, 'u4', 'paused', 'DEEP77', 4, [['u4', true, 'c8'], ['u1', true, 'c9']], { isPublic: false, updatedAt: ago(60 * 26) }),
      session('ses6', s4, 'u1', 'ended', 'LIGHT9', 2, [['u1', true, 'c10']], {
        isPublic: false,
        updatedAt: ago(60 * 24 * 3),
        endingTitle: '등대의 불빛',
      }),
    ],
    characters: [
      presetChar('c1', 'ses1', 'u3', s2, 0),
      presetChar('c2', 'ses2', 'u2', s1, 2),
      presetChar('c3', 'ses3', 'u4', s5, 1),
      presetChar('c4', 'ses3', 'u2', s5, 2),
      presetChar('c5', 'ses3', 'u3', s5, 0),
      presetChar('c6', 'ses4', 'u1', s3, 1),
      presetChar('c7', 'ses4', 'u4', s3, 0),
      presetChar('c8', 'ses5', 'u4', s6, 0),
      presetChar('c9', 'ses5', 'u1', s6, 2),
      presetChar('c10', 'ses6', 'u1', s4, 1),
    ],
    seq: 100,
  };
}

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // 손상된 데이터는 무시하고 초기화
  }
  return seed();
}

export const db: MockDb = load();

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // 저장 불가 환경에서는 메모리에만 유지
  }
}

export function resetMockDb() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
  location.reload();
}

export function nextId(prefix: string): string {
  db.seq += 1;
  return `${prefix}${db.seq}`;
}

export const nowIso = () => new Date().toISOString();
export const findUser = (id: string) => db.users.find((u) => u.id === id);
export const findScenario = (id: string) => db.scenarios.find((s) => s.id === id);
export const findSession = (id: string) => db.sessions.find((s) => s.id === id);
export const findCharacter = (id: string) => db.characters.find((c) => c.id === id);

// ── 소켓 브로드캐스트용 이벤트 버스 ──
type Listener = (sessionId: string, event: string, payload: unknown) => void;
const listeners = new Set<Listener>();

export function publish(sessionId: string, event: string, payload: unknown) {
  listeners.forEach((l) => l(sessionId, event, payload));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── DTO 변환 ──
export function toAuthUser(u: MockUser): AuthUser {
  return { id: u.id, nickname: u.nickname, email: u.email, avatarUrl: null, role: 'user' };
}

export function toScenarioSummary(s: MockScenario): ScenarioSummary {
  return {
    id: s.id,
    title: s.title,
    summary: s.summary,
    authorId: s.authorId,
    authorNickname: findUser(s.authorId)?.nickname ?? '(알 수 없음)',
    tags: s.tags,
    players: s.players,
    estimatedMinutes: s.estimatedMinutes,
    ratingAvg: s.ratingCount ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : 0,
    ratingCount: s.ratingCount,
    playCount: s.playCount,
  };
}

function scenarioRef(id: string): ScenarioRef {
  const s = findScenario(id)!;
  return { id: s.id, title: s.title, players: s.players };
}

export function toSettings(s: MockSession): SessionSettings {
  return {
    maxPlayers: s.maxPlayers,
    isPublic: s.isPublic,
    hasPassword: !!s.password,
    mode: s.mode,
    roundTimeLimitSec: s.roundTimeLimitSec,
  };
}

export function toSessionSummary(s: MockSession): SessionSummary {
  return {
    id: s.id,
    scenario: scenarioRef(s.scenarioId),
    hostNickname: findUser(s.hostId)?.nickname ?? '?',
    playerCount: s.members.length,
    maxPlayers: s.maxPlayers,
    hasPassword: !!s.password,
    isPublic: s.isPublic,
    status: s.status,
    mode: s.mode,
    createdAt: s.createdAt,
  };
}

function toLobbyPlayer(s: MockSession, m: MockMember): LobbyPlayer {
  const c = m.characterId ? findCharacter(m.characterId) : undefined;
  return {
    userId: m.userId,
    nickname: findUser(m.userId)?.nickname ?? '?',
    isHost: s.hostId === m.userId,
    ready: m.ready,
    online: m.online,
    character: c ? { id: c.id, name: c.name, presetId: c.presetId } : null,
  };
}

export function toLobbyUpdate(s: MockSession): LobbyUpdate {
  return {
    hostId: s.hostId,
    inviteCode: s.inviteCode,
    settings: toSettings(s),
    players: s.members.map((m) => toLobbyPlayer(s, m)),
  };
}

export function toSessionDetail(s: MockSession): SessionDetail {
  return { id: s.id, scenario: scenarioRef(s.scenarioId), status: s.status, createdAt: s.createdAt, ...toLobbyUpdate(s) };
}

export function toCharacter(c: MockCharacter): Character {
  return { id: c.id, name: c.name, background: c.background, stats: c.stats, presetId: c.presetId };
}

export function broadcastLobby(s: MockSession) {
  s.updatedAt = nowIso();
  persist();
  publish(s.id, 'lobby:update', toLobbyUpdate(s));
}
