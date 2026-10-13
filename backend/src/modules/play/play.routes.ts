import { Router, type NextFunction, type Request, type Response } from 'express';
import { HttpError } from '../../common/middlewares/errorHandler.js';
import { act, aiStatus, getGameSnapshot, listScenarios, setFixedRoll, startGame, type ActInput } from './play.service.js';

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

playRouter.post('/play/games', (req, res) => {
  const { scenarioId, player } = req.body ?? {};
  if (typeof scenarioId !== 'string' || typeof player?.name !== 'string') {
    throw new HttpError(400, 'INVALID_BODY', 'scenarioId 와 player.name 이 필요합니다.');
  }
  res.status(201).json(startGame(scenarioId, { name: player.name, presetId: player.presetId, stats: player.stats }));
});

playRouter.get('/play/games/:gameId', (req, res) => {
  res.json(getGameSnapshot(req.params.gameId));
});

playRouter.patch('/play/games/:gameId/debug', (req, res) => {
  const value = req.body?.fixedRoll;
  res.json(setFixedRoll(req.params.gameId, value === null || value === undefined ? null : Number(value)));
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
