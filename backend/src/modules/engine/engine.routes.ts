import { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';

// 게임 엔진 (F-ENG) — BE-ENG-*
// 주사위/판정/인벤토리/조건식/전투 등은 I/O 없는 순수 모듈로 이 폴더에 둔다 (BE-ENG-01~08)
export const engineRouter = Router();

engineRouter.get('/sessions/:sessionId/events', notImplemented('BE-ENG-09'));
engineRouter.post('/sessions/:sessionId/rollback', notImplemented('BE-ENG-10'));
