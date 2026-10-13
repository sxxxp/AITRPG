import { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';

// 평가/통계 (F-RVW) — BE-RVW-*
// 플레이 수 집계(BE-RVW-06), 평점 집계(BE-RVW-07)는 라우트 없이 서비스 내부에서 처리
export const reviewRouter = Router();

// scenarioRouter 의 /scenarios/:scenarioId 보다 먼저 마운트되어야 함
reviewRouter.get('/scenarios/trending', notImplemented('BE-RVW-09'));

reviewRouter.put('/scenarios/:scenarioId/ratings/me', notImplemented('BE-RVW-01'));
reviewRouter.get('/scenarios/:scenarioId/ratings/me', notImplemented('BE-RVW-02'));
reviewRouter.delete('/scenarios/:scenarioId/ratings/me', notImplemented('BE-RVW-03'));
reviewRouter.get('/scenarios/:scenarioId/ratings', notImplemented('BE-RVW-04'));
reviewRouter.get('/scenarios/:scenarioId/stats', notImplemented('BE-RVW-05'));
reviewRouter.get('/users/me/scenarios/stats', notImplemented('BE-RVW-08'));
