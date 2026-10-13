import { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';

// 기록 (F-LOG) — BE-LOG-*
export const logRouter = Router();

logRouter.get('/sessions/:sessionId/logs', notImplemented('BE-LOG-01'));
logRouter.get('/sessions/:sessionId/rolls', notImplemented('BE-LOG-02'));
logRouter.get('/sessions/:sessionId/export', notImplemented('BE-LOG-03'));
logRouter.post('/sessions/:sessionId/logs/:logId/feedback', notImplemented('BE-LOG-04'));
