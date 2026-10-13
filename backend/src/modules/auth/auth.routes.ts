import { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';

// 계정 (F-AUTH) — BE-AUTH-*
export const authRouter = Router();

authRouter.post('/auth/signup', notImplemented('BE-AUTH-01'));
authRouter.post('/auth/login', notImplemented('BE-AUTH-02'));
authRouter.post('/auth/logout', notImplemented('BE-AUTH-03'));
authRouter.post('/auth/refresh', notImplemented('BE-AUTH-04'));
authRouter.get('/auth/oauth/:provider', notImplemented('BE-AUTH-05'));
authRouter.get('/auth/oauth/:provider/callback', notImplemented('BE-AUTH-06'));
authRouter.post('/auth/guest', notImplemented('BE-AUTH-10'));

// /users/me 는 /users/:userId 보다 먼저 등록
authRouter.get('/users/me', notImplemented('BE-AUTH-07'));
authRouter.patch('/users/me', notImplemented('BE-AUTH-08'));
authRouter.get('/users/:userId', notImplemented('BE-AUTH-09'));
