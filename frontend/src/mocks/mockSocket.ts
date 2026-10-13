import { useAuthStore } from '@/shared/auth/authStore';
import {
  broadcastLobby,
  db,
  findScenario,
  findSession,
  nextId,
  persist,
  publish,
  subscribe,
  toSessionDetail,
  type MockSession,
} from './db';

type Listener = (...args: never[]) => void;

/** socket.io-client Socket 중 앱이 쓰는 부분만 흉내 */
export class MockGameSocket {
  connected = false;
  active = false;
  private listeners = new Map<string, Set<Listener>>();
  private sessionId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return this;
  }

  off(event: string, fn?: Listener) {
    if (fn) this.listeners.get(event)?.delete(fn);
    else this.listeners.delete(event);
    return this;
  }

  removeAllListeners() {
    this.listeners.clear();
    return this;
  }

  connect() {
    if (this.active) return this;
    this.active = true;
    setTimeout(() => {
      if (!this.active) return;
      this.connected = true;
      this.unsubscribe = subscribe((sessionId, event, payload) => {
        if (sessionId === this.sessionId) this.fire(event, payload);
      });
      this.fire('connect');
    }, 150);
    return this;
  }

  disconnect() {
    this.setOnline(false);
    this.active = false;
    this.connected = false;
    this.unsubscribe?.();
    this.sessionId = null;
    this.fire('disconnect', 'io client disconnect');
    return this;
  }

  emit(event: string, payload: unknown) {
    setTimeout(() => this.handle(event, payload), 50);
    return this;
  }

  private fire(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((fn) => (fn as (...a: unknown[]) => void)(...args));
  }

  private userId(): string | null {
    const token = useAuthStore.getState().accessToken;
    return token?.startsWith('mock.') ? token.slice(5) : null;
  }

  private setOnline(online: boolean) {
    const s = this.sessionId ? findSession(this.sessionId) : undefined;
    const uid = this.userId();
    const m = s?.members.find((x) => x.userId === uid);
    if (!s || !m || !uid) return;
    m.online = online;
    persist();
    publish(s.id, 'session:presence', { userId: uid, status: online ? 'online' : 'offline' });
  }

  private handle(event: string, payload: unknown) {
    const uid = this.userId();
    if (event === 'session:join') {
      const { sessionId } = payload as { sessionId: string };
      const s = findSession(sessionId);
      if (!s || !uid || !s.members.some((m) => m.userId === uid)) {
        this.fire('error', { code: 'NOT_MEMBER', message: '방에 참여할 수 없습니다.' });
        return;
      }
      this.sessionId = s.id;
      this.setOnline(true);
      this.fire('session:joined', { snapshot: toSessionDetail(s), lastSeq: 0 });
      scheduleBots(s, uid);
      return;
    }
    if (event === 'lobby:ready') {
      const s = this.sessionId ? findSession(this.sessionId) : undefined;
      const m = s?.members.find((x) => x.userId === uid);
      if (!s || !m) return;
      if (!m.characterId) {
        this.fire('error', { code: 'NO_CHARACTER', message: '캐릭터를 먼저 정하세요.' });
        return;
      }
      m.ready = (payload as { ready: boolean }).ready;
      broadcastLobby(s);
    }
  }
}

// 다른 참가자(봇)가 잠시 후 캐릭터를 고르고 준비하도록 해서 게임 시작 흐름을 확인할 수 있게 함
const scheduled = new Set<string>();

function scheduleBots(session: MockSession, humanId: string) {
  if (scheduled.has(session.id) || session.status !== 'lobby') return;
  scheduled.add(session.id);
  const sc = findScenario(session.scenarioId)!;

  session.members
    .filter((m) => m.userId !== humanId)
    .forEach((m, i) => {
      const member = () => {
        const s = findSession(session.id);
        return s?.status === 'lobby' ? { s, m: s.members.find((x) => x.userId === m.userId) } : null;
      };
      setTimeout(() => {
        const cur = member();
        if (!cur?.m || cur.m.characterId) return;
        const preset = sc.presets[(i + 1) % sc.presets.length];
        const c = {
          id: nextId('c'),
          sessionId: cur.s.id,
          userId: cur.m.userId,
          name: preset.name,
          background: preset.description,
          stats: { ...preset.stats },
          presetId: preset.id,
        };
        db.characters.push(c);
        cur.m.characterId = c.id;
        broadcastLobby(cur.s);
      }, 1500 + i * 700);
      setTimeout(() => {
        const cur = member();
        if (!cur?.m || cur.m.ready || !cur.m.characterId) return;
        cur.m.ready = true;
        broadcastLobby(cur.s);
      }, 3000 + i * 700);
    });
}
