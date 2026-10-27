import express, { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';
import { HttpError } from '../../common/middlewares/errorHandler.js';
import { env } from '../../config/env.js';
import { scenarioJsonSchema } from './scenario.jsonSchema.js';
import { ScenarioStore, type Visibility } from './scenario.store.js';
import { validateScenarioSource } from './scenario.validator.js';

// 시나리오 (F-SCN) — BE-SCN-*
// TODO: 인증 미들웨어가 생기면 로그인 사용자/제작자로 제한 (지금은 로컬 개발용으로 모두 허용)
export const scenarioRouter = Router();
const store = new ScenarioStore(env.scenarioDir);

const sourceFrom = (body: unknown): string => {
  const source = (body as { source?: unknown } | undefined)?.source;
  if (typeof source !== 'string') throw new HttpError(400, 'INVALID_BODY', 'source(YAML 문자열)가 필요합니다.');
  return source;
};

// 고정 경로는 /scenarios/:scenarioId 보다 먼저 등록
scenarioRouter.get('/scenarios/schema', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(scenarioJsonSchema());
});

scenarioRouter.post('/scenarios/validate', (req, res) => {
  res.json(validateScenarioSource(sourceFrom(req.body)));
});

// .trpg(zip) 원본을 그대로 받는다 (multipart 대신 application/zip 본문)
scenarioRouter.post(
  '/scenarios/import',
  express.raw({ type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], limit: '5mb' }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new HttpError(400, 'INVALID_BODY', '.trpg 파일을 application/zip 본문으로 보내 주세요.');
    }
    res.status(201).json(store.importZip(new Uint8Array(req.body)));
  },
);
scenarioRouter.post('/scenarios/assist', notImplemented('BE-SCN-24'));

scenarioRouter.post('/scenarios', (req, res) => {
  res.status(201).json(store.create(sourceFrom(req.body)));
});
scenarioRouter.get('/scenarios', notImplemented('BE-SCN-02'));
scenarioRouter.get('/scenarios/:scenarioId', (req, res) => {
  res.json(store.get(req.params.scenarioId));
});
scenarioRouter.get('/scenarios/:scenarioId/source', (req, res) => {
  res.json(store.getSource(req.params.scenarioId));
});
scenarioRouter.put('/scenarios/:scenarioId', (req, res) => {
  const note = typeof req.body?.note === 'string' ? req.body.note : '';
  res.json(store.update(req.params.scenarioId, sourceFrom(req.body), note));
});
scenarioRouter.delete('/scenarios/:scenarioId', (req, res) => {
  store.remove(req.params.scenarioId);
  res.status(204).end();
});
scenarioRouter.get('/scenarios/:scenarioId/export', (req, res) => {
  const zip = store.exportZip(req.params.scenarioId);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.scenarioId}.trpg"`);
  res.send(Buffer.from(zip));
});
scenarioRouter.get('/scenarios/:scenarioId/graph', notImplemented('BE-SCN-12'));
scenarioRouter.get('/scenarios/:scenarioId/versions', notImplemented('BE-SCN-15'));
scenarioRouter.get('/scenarios/:scenarioId/versions/:version', notImplemented('BE-SCN-16'));
scenarioRouter.patch('/scenarios/:scenarioId/visibility', (req, res) => {
  const visibility = req.body?.visibility as Visibility;
  if (!['public', 'unlisted', 'private'].includes(visibility)) {
    throw new HttpError(422, 'INVALID_VISIBILITY', 'visibility 는 public | unlisted | private 중 하나입니다.');
  }
  res.json(store.setVisibility(req.params.scenarioId, visibility));
});
scenarioRouter.post('/scenarios/:scenarioId/fork', notImplemented('BE-SCN-19'));
// 1인 테스트 플레이 디버그는 PATCH /play/games/:gameId/debug (play.routes.ts). 멀티플레이 세션용은 미구현
scenarioRouter.patch('/sessions/:sessionId/debug/state', notImplemented('BE-SCN-14'));
scenarioRouter.get('/users/me/scenarios', (_req, res) => {
  res.json(store.list());
});
scenarioRouter.get('/tags', notImplemented('BE-SCN-18'));

scenarioRouter.post('/rulesets', notImplemented('BE-SCN-20'));
scenarioRouter.get('/rulesets', notImplemented('BE-SCN-21'));
scenarioRouter.get('/rulesets/:rulesetId', notImplemented('BE-SCN-22'));
scenarioRouter.put('/rulesets/:rulesetId', notImplemented('BE-SCN-23'));
// BE-SCN-13 테스트 플레이 시작은 play.routes.ts (POST /scenarios/:scenarioId/test-sessions)
