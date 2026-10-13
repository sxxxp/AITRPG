import { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';
import { HttpError } from '../../common/middlewares/errorHandler.js';
import { validateScenarioSource } from './scenario.validator.js';

// 시나리오 (F-SCN) — BE-SCN-*
export const scenarioRouter = Router();

// 고정 경로는 /scenarios/:scenarioId 보다 먼저 등록
scenarioRouter.get('/scenarios/schema', notImplemented('BE-SCN-11'));

// BE-SCN-10. TODO: 인증 미들웨어가 생기면 로그인 사용자로 제한
scenarioRouter.post('/scenarios/validate', (req, res) => {
  const source: unknown = req.body?.source;
  if (typeof source !== 'string') throw new HttpError(400, 'INVALID_BODY', 'source(YAML 문자열)가 필요합니다.');
  res.json(validateScenarioSource(source));
});
scenarioRouter.post('/scenarios/import', notImplemented('BE-SCN-08'));
scenarioRouter.post('/scenarios/assist', notImplemented('BE-SCN-24'));

scenarioRouter.post('/scenarios', notImplemented('BE-SCN-01'));
scenarioRouter.get('/scenarios', notImplemented('BE-SCN-02'));
scenarioRouter.get('/scenarios/:scenarioId', notImplemented('BE-SCN-03'));
scenarioRouter.get('/scenarios/:scenarioId/source', notImplemented('BE-SCN-04'));
scenarioRouter.put('/scenarios/:scenarioId', notImplemented('BE-SCN-05'));
scenarioRouter.delete('/scenarios/:scenarioId', notImplemented('BE-SCN-06'));
scenarioRouter.get('/scenarios/:scenarioId/export', notImplemented('BE-SCN-09'));
scenarioRouter.get('/scenarios/:scenarioId/graph', notImplemented('BE-SCN-12'));
scenarioRouter.post('/scenarios/:scenarioId/test-sessions', notImplemented('BE-SCN-13'));
scenarioRouter.get('/scenarios/:scenarioId/versions', notImplemented('BE-SCN-15'));
scenarioRouter.get('/scenarios/:scenarioId/versions/:version', notImplemented('BE-SCN-16'));
scenarioRouter.patch('/scenarios/:scenarioId/visibility', notImplemented('BE-SCN-17'));
scenarioRouter.post('/scenarios/:scenarioId/fork', notImplemented('BE-SCN-19'));
scenarioRouter.patch('/sessions/:sessionId/debug/state', notImplemented('BE-SCN-14'));
scenarioRouter.get('/users/me/scenarios', notImplemented('BE-SCN-07'));
scenarioRouter.get('/tags', notImplemented('BE-SCN-18'));

scenarioRouter.post('/rulesets', notImplemented('BE-SCN-20'));
scenarioRouter.get('/rulesets', notImplemented('BE-SCN-21'));
scenarioRouter.get('/rulesets/:rulesetId', notImplemented('BE-SCN-22'));
scenarioRouter.put('/rulesets/:rulesetId', notImplemented('BE-SCN-23'));
