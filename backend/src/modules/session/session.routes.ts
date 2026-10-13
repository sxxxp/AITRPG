import { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';

// 세션 (F-SES) — BE-SES-*  (실시간 이벤트는 src/socket 참조)
export const sessionRouter = Router();

sessionRouter.post('/sessions', notImplemented('BE-SES-01'));
sessionRouter.get('/sessions', notImplemented('BE-SES-02'));
sessionRouter.get('/sessions/code/:inviteCode', notImplemented('BE-SES-05'));
sessionRouter.get('/sessions/:sessionId', notImplemented('BE-SES-03'));
sessionRouter.patch('/sessions/:sessionId/settings', notImplemented('BE-SES-04'));
sessionRouter.post('/sessions/:sessionId/join', notImplemented('BE-SES-06'));
sessionRouter.post('/sessions/:sessionId/invite', notImplemented('BE-SES-07'));
sessionRouter.post('/sessions/:sessionId/leave', notImplemented('BE-SES-08'));
sessionRouter.post('/sessions/:sessionId/kick', notImplemented('BE-SES-09'));
sessionRouter.post('/sessions/:sessionId/start', notImplemented('BE-SES-10'));
sessionRouter.get('/sessions/:sessionId/chat', notImplemented('BE-SES-15'));
sessionRouter.get('/sessions/:sessionId/state', notImplemented('BE-SES-16'));
sessionRouter.post('/sessions/:sessionId/gm', notImplemented('BE-SES-19'));
sessionRouter.post('/sessions/:sessionId/spectate', notImplemented('BE-SES-22'));
sessionRouter.post('/sessions/:sessionId/pause', notImplemented('BE-SES-23'));
sessionRouter.post('/sessions/:sessionId/resume', notImplemented('BE-SES-24'));
sessionRouter.post('/sessions/:sessionId/end', notImplemented('BE-SES-26'));
sessionRouter.get('/users/me/sessions', notImplemented('BE-SES-25'));
