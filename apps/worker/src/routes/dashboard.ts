import { Hono } from 'hono';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import { buildDashboard } from '../services/reportService';
import { getCtx, ok } from './util';

export const dashboardRoutes = new Hono<AppEnv>();
dashboardRoutes.use('*', requireOwner);

dashboardRoutes.get('/', async (c) => ok(c, await buildDashboard(getCtx(c))));
