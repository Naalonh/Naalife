import { Hono } from 'hono';
import { budgetCreateSchema, budgetUpdateSchema } from '@pla/shared';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import { budgetHistory, createBudget, deleteBudget, listBudgets, updateBudget } from '../services/budgetService';
import { getCtx, idParam, ok, parseBody } from './util';

export const budgetRoutes = new Hono<AppEnv>();
budgetRoutes.use('*', requireOwner);

budgetRoutes.get('/', async (c) => ok(c, await listBudgets(getCtx(c))));

budgetRoutes.post('/', async (c) => {
  const input = await parseBody(c, budgetCreateSchema);
  return ok(c, await createBudget(getCtx(c), input), undefined, 201);
});

budgetRoutes.get('/:id/history', async (c) => ok(c, await budgetHistory(getCtx(c), idParam(c))));

budgetRoutes.patch('/:id', async (c) => {
  const patch = await parseBody(c, budgetUpdateSchema);
  return ok(c, await updateBudget(getCtx(c), idParam(c), patch));
});

budgetRoutes.delete('/:id', async (c) => {
  await deleteBudget(getCtx(c), idParam(c));
  return ok(c, { deleted: true });
});
