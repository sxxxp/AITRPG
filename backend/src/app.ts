import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { errorHandler, notFoundHandler } from './common/middlewares/errorHandler.js';
import { env } from './config/env.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { characterRouter } from './modules/character/character.routes.js';
import { engineRouter } from './modules/engine/engine.routes.js';
import { logRouter } from './modules/log/log.routes.js';
import { playRouter } from './modules/play/play.routes.js';
import { reviewRouter } from './modules/review/review.routes.js';
import { scenarioRouter } from './modules/scenario/scenario.routes.js';
import { sessionRouter } from './modules/session/session.routes.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(authRouter);
  api.use(reviewRouter); // /scenarios/trending 이 /scenarios/:scenarioId 보다 먼저 매칭되도록
  api.use(characterRouter);
  api.use(scenarioRouter);
  api.use(sessionRouter);
  api.use(engineRouter);
  api.use(logRouter);
  api.use(adminRouter);
  api.use(playRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
