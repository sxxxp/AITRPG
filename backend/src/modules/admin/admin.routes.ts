import { Router } from 'express';
import { notImplemented } from '../../common/http/notImplemented.js';

// 관리 (F-ADM) — BE-ADM-*
export const adminRouter = Router();

adminRouter.post('/reports', notImplemented('BE-ADM-01'));
adminRouter.get('/admin/reports', notImplemented('BE-ADM-02'));
adminRouter.patch('/admin/reports/:reportId', notImplemented('BE-ADM-03'));
adminRouter.patch('/admin/scenarios/:scenarioId/status', notImplemented('BE-ADM-04'));
adminRouter.patch('/admin/users/:userId/status', notImplemented('BE-ADM-05'));
adminRouter.patch('/admin/ratings/:ratingId', notImplemented('BE-ADM-06'));
adminRouter.get('/admin/metrics/llm', notImplemented('BE-ADM-07'));
