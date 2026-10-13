import { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';

// 캐릭터 (F-CHR) — BE-CHR-*
export const characterRouter = Router();

characterRouter.get('/scenarios/:scenarioId/character-rules', notImplemented('BE-CHR-01'));
characterRouter.get('/scenarios/:scenarioId/presets', notImplemented('BE-CHR-02'));
characterRouter.post('/sessions/:sessionId/characters', notImplemented('BE-CHR-03'));
characterRouter.patch('/sessions/:sessionId/characters/:characterId', notImplemented('BE-CHR-04'));
characterRouter.get('/sessions/:sessionId/characters/:characterId', notImplemented('BE-CHR-05'));
characterRouter.get('/sessions/:sessionId/characters/:characterId/secrets', notImplemented('BE-CHR-06'));
characterRouter.post('/users/me/characters', notImplemented('BE-CHR-07'));
characterRouter.get('/users/me/characters', notImplemented('BE-CHR-08'));
