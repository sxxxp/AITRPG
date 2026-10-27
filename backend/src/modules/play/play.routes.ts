import { Router, type NextFunction, type Request, type Response } from 'express';
import { HttpError } from '../../common/middlewares/errorHandler.js';
import {
  act,
  aiStatus,
  applyDebug,
  getGameSnapshot,
  listScenarios,
  startGame,
  type ActInput,
  type DebugPatch,
} from './play.service.js';

// 1인 플레이 API. TODO: 인증 미들웨어가 생기면 로그인 사용자로 제한
export const playRouter = Router();

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

playRouter.get('/play/scenarios', (_req, res) => {
  res.json(listScenarios());
});

playRouter.get(
  '/play/ai-status',
  asyncRoute(async (_req, res) => {
    res.json(await aiStatus());
  }),
);

function startFromBody(scenarioId: unknown, player: { name?: unknown; presetId?: unknown; stats?: unknown } | undefined) {
  if (typeof scenarioId !== 'string' || typeof player?.name !== 'string') {
    throw new HttpError(400, 'INVALID_BODY', 'scenarioId 와 player.name 이 필요합니다.');
  }
  return startGame(scenarioId, {
    name: player.name,
    presetId: typeof player.presetId === 'string' ? player.presetId : undefined,
    stats: player.stats as Record<string, number> | undefined,
  });
}

playRouter.post('/play/games', (req, res) => {
  res.status(201).json(startFromBody(req.body?.scenarioId, req.body?.player));
});

// BE-SCN-13: 에디터에서 테스트 플레이 시작 (1인 플레이 게임을 만든다)
playRouter.post('/scenarios/:scenarioId/test-sessions', (req, res) => {
  res.status(201).json(startFromBody(req.params.scenarioId, req.body?.player));
});

playRouter.get('/play/games/:gameId', (req, res) => {
  res.json(getGameSnapshot(req.params.gameId));
});

// BE-SCN-14 (1인 테스트 플레이용). 응답: { view, entry }
playRouter.patch('/play/games/:gameId/debug', (req, res) => {
  const body = (req.body ?? {}) as DebugPatch;
  res.json(applyDebug(req.params.gameId, body));
});

/** 응답: NDJSON 스트림 (한 줄에 StreamEvent 하나) */
playRouter.post(
  '/play/games/:gameId/actions',
  asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    let input: ActInput;
    if (typeof body.actionId === 'string') input = { actionId: body.actionId };
    else if (typeof body.text === 'string') input = { text: body.text };
    else throw new HttpError(400, 'INVALID_BODY', 'actionId 또는 text 가 필요합니다.');

    const stream = act(req.params.gameId, input);
    // 첫 이벤트 전에 발생한 오류(404, 409 등)는 일반 오류 응답으로 처리
    const first = await stream.next();
    res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    const write = (ev: unknown) => res.write(`${JSON.stringify(ev)}\n`);
    try {
      if (!first.done) write(first.value);
      for await (const ev of stream) write(ev);
    } catch (e) {
      write({ type: 'error', message: e instanceof HttpError ? e.message : '처리 중 오류가 발생했습니다.' });
      if (!(e instanceof HttpError)) console.error(e);
    }
    res.end();
  }),
);
