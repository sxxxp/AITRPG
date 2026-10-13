import type { StatBlock } from '@/shared/types/character';
import type { MySessionItem } from '@/shared/types/session';
import {
  broadcastLobby,
  db,
  findCharacter,
  findScenario,
  findSession,
  findUser,
  nextId,
  nowIso,
  persist,
  publish,
  toAuthUser,
  toCharacter,
  toScenarioSummary,
  toSessionDetail,
  toSessionSummary,
  toSettings,
  type MockScenario,
  type MockSession,
  type MockUser,
} from './db';
import { HttpError, route, type Ctx } from './http';

// httpOnly Refresh 쿠키 흉내
const REFRESH_KEY = 'wtg.mock.refreshUser';
const tokenFor = (userId: string) => `mock.${userId}`;

function setRefresh(userId: string | null) {
  try {
    if (userId) localStorage.setItem(REFRESH_KEY, userId);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // noop
  }
}

function getRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function requireUser(ctx: Ctx): MockUser {
  const user = ctx.userId ? findUser(ctx.userId) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  return user;
}

function getSession(id: string): MockSession {
  const s = findSession(id);
  if (!s) throw new HttpError(404, 'SESSION_NOT_FOUND', '방을 찾을 수 없습니다.');
  return s;
}

function requireMember(s: MockSession, user: MockUser) {
  const m = s.members.find((x) => x.userId === user.id);
  if (!m) throw new HttpError(403, 'NOT_MEMBER', '이 방의 참가자가 아닙니다.');
  return m;
}

function requireHost(s: MockSession, user: MockUser) {
  if (s.hostId !== user.id) throw new HttpError(403, 'NOT_HOST', '호스트만 할 수 있습니다.');
}

function requireLobby(s: MockSession) {
  if (s.status !== 'lobby') throw new HttpError(409, 'NOT_IN_LOBBY', '대기실 상태에서만 가능합니다.');
}

function paginate<T>(items: T[], query: URLSearchParams) {
  const page = Math.max(1, Number(query.get('page')) || 1);
  const size = Math.max(1, Number(query.get('size')) || 12);
  return { items: items.slice((page - 1) * size, page * size), page, size, total: items.length };
}

function newInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (db.sessions.some((s) => s.inviteCode === code));
  return code;
}

function applySettings(s: MockSession, sc: MockScenario, body: any) {
  if (body.maxPlayers !== undefined) {
    const n = Number(body.maxPlayers);
    if (!Number.isInteger(n) || n < sc.players.min || n > sc.players.max) {
      throw new HttpError(422, 'INVALID_SETTINGS', `최대 인원은 ${sc.players.min}~${sc.players.max}명이어야 합니다.`);
    }
    if (n < s.members.length) throw new HttpError(422, 'INVALID_SETTINGS', '현재 참가자 수보다 적게 설정할 수 없습니다.');
    s.maxPlayers = n;
  }
  if (body.isPublic !== undefined) s.isPublic = !!body.isPublic;
  if (body.mode !== undefined) {
    if (body.mode !== 'round' && body.mode !== 'free') throw new HttpError(422, 'INVALID_SETTINGS', '잘못된 진행 모드입니다.');
    s.mode = body.mode;
  }
  if (body.roundTimeLimitSec !== undefined) {
    const sec = Number(body.roundTimeLimitSec);
    if (!Number.isInteger(sec) || sec < 30 || sec > 600) throw new HttpError(422, 'INVALID_SETTINGS', '제한 시간은 30~600초입니다.');
    s.roundTimeLimitSec = sec;
  }
  if (body.password === null) s.password = null;
  else if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 4 || body.password.length > 20) {
      throw new HttpError(422, 'INVALID_SETTINGS', '비밀번호는 4~20자여야 합니다.');
    }
    s.password = body.password;
  }
}

function buildCharacter(sc: MockScenario, body: any) {
  if (body?.presetId) {
    const p = sc.presets.find((x) => x.id === body.presetId);
    if (!p) throw new HttpError(422, 'INVALID_PRESET', '존재하지 않는 프리셋입니다.');
    return { name: p.name, background: p.description, stats: { ...p.stats }, presetId: p.id };
  }
  const { rules } = sc;
  const name = String(body?.name ?? '').trim();
  if (!name || name.length > 20) throw new HttpError(422, 'INVALID_NAME', '캐릭터 이름은 1~20자여야 합니다.');
  const input = (body?.stats ?? {}) as StatBlock;
  let sum = 0;
  for (const key of rules.stats) {
    const v = input[key];
    if (!Number.isInteger(v) || v < rules.minPerStat || v > rules.maxPerStat) {
      throw new HttpError(422, 'INVALID_STATS', `${key} 값이 허용 범위를 벗어났습니다.`);
    }
    sum += v;
  }
  if (sum !== rules.totalPoints) throw new HttpError(422, 'INVALID_STATS', `스탯 합계는 ${rules.totalPoints}이어야 합니다.`);
  const stats = Object.fromEntries(rules.stats.map((k) => [k, input[k]]));
  return { name, background: String(body?.background ?? '').slice(0, 500), stats, presetId: null };
}

// ── 계정 ──
route('POST', '/auth/signup', ({ body }) => {
  const email = String(body?.email ?? '').trim().toLowerCase();
  const nickname = String(body?.nickname ?? '').trim();
  if (db.users.some((u) => u.email === email)) throw new HttpError(409, 'EMAIL_TAKEN', '이미 사용 중인 이메일입니다.');
  if (db.users.some((u) => u.nickname === nickname)) throw new HttpError(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.');
  const user: MockUser = { id: nextId('u'), email, password: String(body.password), nickname, createdAt: nowIso() };
  db.users.push(user);
  persist();
  setRefresh(user.id);
  return { status: 201, data: { accessToken: tokenFor(user.id), user: toAuthUser(user) } };
});

route('POST', '/auth/login', ({ body }) => {
  const email = String(body?.email ?? '').trim().toLowerCase();
  const user = db.users.find((u) => u.email === email && u.password === body?.password);
  if (!user) throw new HttpError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
  setRefresh(user.id);
  return { data: { accessToken: tokenFor(user.id), user: toAuthUser(user) } };
});

route('POST', '/auth/logout', () => {
  setRefresh(null);
  return { status: 204 };
});

route('POST', '/auth/refresh', () => {
  const userId = getRefresh();
  if (!userId || !findUser(userId)) throw new HttpError(401, 'INVALID_REFRESH', '다시 로그인하세요.');
  return { data: { accessToken: tokenFor(userId) } };
});

route('GET', '/users/me', (ctx) => ({ data: toAuthUser(requireUser(ctx)) }));

// ── 홈 / 시나리오 목록 ──
route('GET', '/scenarios/trending', () => ({
  data: [...db.scenarios].sort((a, b) => b.weeklyPlays - a.weeklyPlays).map(toScenarioSummary),
}));

route('GET', '/scenarios', ({ query }) => {
  const sort = query.get('sort') ?? 'rating';
  // 정렬용 베이지안 평균 (F-RVW-05)
  const score = (s: MockScenario) => (20 * 3.5 + s.ratingSum) / (20 + s.ratingCount);
  const sorted = [...db.scenarios].sort((a, b) => (sort === 'plays' ? b.playCount - a.playCount : score(b) - score(a)));
  return { data: paginate(sorted.map(toScenarioSummary), query) };
});

route('GET', '/scenarios/:scenarioId/character-rules', ({ params }) => {
  const sc = findScenario(params.scenarioId);
  if (!sc) throw new HttpError(404, 'SCENARIO_NOT_FOUND', '시나리오를 찾을 수 없습니다.');
  return { data: sc.rules };
});

route('GET', '/scenarios/:scenarioId/presets', ({ params }) => {
  const sc = findScenario(params.scenarioId);
  if (!sc) throw new HttpError(404, 'SCENARIO_NOT_FOUND', '시나리오를 찾을 수 없습니다.');
  return { data: sc.presets };
});

// ── 세션 ──
route('GET', '/sessions', ({ query }) => {
  const items = db.sessions
    .filter((s) => s.status === 'lobby' && s.isPublic)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toSessionSummary);
  return { data: paginate(items, query) };
});

route('POST', '/sessions', (ctx) => {
  const user = requireUser(ctx);
  const sc = findScenario(String(ctx.body?.scenarioId));
  if (!sc) throw new HttpError(404, 'SCENARIO_NOT_FOUND', '시나리오를 찾을 수 없습니다.');
  const now = nowIso();
  const s: MockSession = {
    id: nextId('ses'),
    scenarioId: sc.id,
    hostId: user.id,
    status: 'lobby',
    inviteCode: newInviteCode(),
    maxPlayers: sc.players.max,
    isPublic: true,
    password: null,
    mode: 'round',
    roundTimeLimitSec: 120,
    members: [],
    createdAt: now,
    updatedAt: now,
    endingTitle: null,
  };
  applySettings(s, sc, ctx.body);
  s.members.push({ userId: user.id, ready: false, online: true, characterId: null });
  db.sessions.push(s);
  persist();
  return { status: 201, data: toSessionDetail(s) };
});

route('GET', '/sessions/code/:inviteCode', ({ params }) => {
  const s = db.sessions.find((x) => x.inviteCode === params.inviteCode.toUpperCase());
  if (!s) throw new HttpError(404, 'INVITE_NOT_FOUND', '유효하지 않은 초대 코드입니다.');
  const summary = toSessionSummary(s);
  return {
    data: {
      sessionId: s.id,
      scenarioTitle: summary.scenario.title,
      hostNickname: summary.hostNickname,
      playerCount: summary.playerCount,
      maxPlayers: summary.maxPlayers,
      hasPassword: summary.hasPassword,
      status: s.status,
    },
  };
});

route('GET', '/sessions/:sessionId', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  requireMember(s, user);
  return { data: toSessionDetail(s) };
});

route('PATCH', '/sessions/:sessionId/settings', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  requireHost(s, user);
  requireLobby(s);
  applySettings(s, findScenario(s.scenarioId)!, ctx.body ?? {});
  broadcastLobby(s);
  return { data: toSettings(s) };
});

route('POST', '/sessions/:sessionId/join', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  if (s.members.some((m) => m.userId === user.id)) return { data: toSessionDetail(s) };
  requireLobby(s);
  if (s.members.length >= s.maxPlayers) throw new HttpError(409, 'SESSION_FULL', '인원이 가득 찼습니다.');
  if (s.password && ctx.body?.password !== s.password) {
    throw new HttpError(403, 'WRONG_PASSWORD', '비밀번호가 올바르지 않습니다.');
  }
  s.members.push({ userId: user.id, ready: false, online: true, characterId: null });
  broadcastLobby(s);
  return { data: toSessionDetail(s) };
});

route('POST', '/sessions/:sessionId/leave', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  requireMember(s, user);
  s.members = s.members.filter((m) => m.userId !== user.id);
  db.characters = db.characters.filter((c) => !(c.sessionId === s.id && c.userId === user.id));
  if (s.members.length === 0) {
    db.sessions = db.sessions.filter((x) => x.id !== s.id);
    persist();
  } else {
    if (s.hostId === user.id) s.hostId = s.members[0].userId;
    broadcastLobby(s);
  }
  return { status: 204 };
});

route('POST', '/sessions/:sessionId/kick', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  requireHost(s, user);
  requireLobby(s);
  const targetId = String(ctx.body?.userId);
  if (targetId === user.id) throw new HttpError(422, 'INVALID_TARGET', '자신은 내보낼 수 없습니다.');
  s.members = s.members.filter((m) => m.userId !== targetId);
  db.characters = db.characters.filter((c) => !(c.sessionId === s.id && c.userId === targetId));
  broadcastLobby(s);
  return { status: 204 };
});

route('POST', '/sessions/:sessionId/start', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  requireHost(s, user);
  requireLobby(s);
  const sc = findScenario(s.scenarioId)!;
  if (s.members.length < sc.players.min) throw new HttpError(409, 'NOT_ENOUGH_PLAYERS', `최소 ${sc.players.min}명이 필요합니다.`);
  if (s.members.some((m) => !m.ready || !m.characterId)) {
    throw new HttpError(409, 'NOT_READY', '모든 참가자가 캐릭터를 정하고 준비해야 합니다.');
  }
  s.status = 'in_progress';
  s.updatedAt = nowIso();
  // 누적 플레이 수 집계 (F-RVW-04)
  sc.playCount += 1;
  sc.weeklyPlays += 1;
  persist();
  publish(s.id, 'session:started', { startedAt: s.updatedAt });
  return { status: 204 };
});

route('GET', '/users/me/sessions', (ctx) => {
  const user = requireUser(ctx);
  const filter = ctx.query.get('status') ?? 'active';
  const statuses = filter === 'active' ? ['lobby', 'in_progress'] : [filter];
  const items: MySessionItem[] = db.sessions
    .filter((s) => statuses.includes(s.status) && s.members.some((m) => m.userId === user.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((s) => {
      const charId = s.members.find((m) => m.userId === user.id)?.characterId;
      return {
        ...toSessionSummary(s),
        myCharacterName: charId ? (findCharacter(charId)?.name ?? null) : null,
        updatedAt: s.updatedAt,
        endingTitle: s.endingTitle,
      };
    });
  return { data: paginate(items, ctx.query) };
});

// ── 캐릭터 (세션 로비에서 사용) ──
route('POST', '/sessions/:sessionId/characters', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  const member = requireMember(s, user);
  requireLobby(s);
  if (member.characterId) throw new HttpError(409, 'CHARACTER_EXISTS', '이미 캐릭터가 있습니다.');
  const c = { id: nextId('c'), sessionId: s.id, userId: user.id, ...buildCharacter(findScenario(s.scenarioId)!, ctx.body) };
  db.characters.push(c);
  member.characterId = c.id;
  member.ready = false;
  broadcastLobby(s);
  return { status: 201, data: toCharacter(c) };
});

route('PATCH', '/sessions/:sessionId/characters/:characterId', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  const member = requireMember(s, user);
  requireLobby(s);
  const c = findCharacter(ctx.params.characterId);
  if (!c || c.userId !== user.id) throw new HttpError(403, 'NOT_OWNER', '내 캐릭터만 수정할 수 있습니다.');
  Object.assign(c, buildCharacter(findScenario(s.scenarioId)!, ctx.body));
  member.ready = false;
  broadcastLobby(s);
  return { data: toCharacter(c) };
});

route('GET', '/sessions/:sessionId/characters/:characterId', (ctx) => {
  const user = requireUser(ctx);
  const s = getSession(ctx.params.sessionId);
  requireMember(s, user);
  const c = findCharacter(ctx.params.characterId);
  if (!c || c.sessionId !== s.id) throw new HttpError(404, 'CHARACTER_NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  return { data: toCharacter(c) };
});
