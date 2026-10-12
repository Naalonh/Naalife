import { Hono } from 'hono';
import { accountCreateSchema, accountUpdateSchema } from '@pla/shared';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import { createAccount, listAccounts, updateAccount } from '../services/financeService';
import { getCtx, idParam, ok, parseBody } from './util';

export const accountRoutes = new Hono<AppEnv>();
accountRoutes.use('*', requireOwner);

accountRoutes.get('/', async (c) => {
  const includeArchived = c.req.query('include_archived') === 'true';
  return ok(c, await listAccounts(getCtx(c), includeArchived));
});

accountRoutes.post('/', async (c) => {
  const input = await parseBody(c, accountCreateSchema);
  return ok(c, await createAccount(getCtx(c), input), undefined, 201);
});

accountRoutes.patch('/:id', async (c) => {
  const patch = await parseBody(c, accountUpdateSchema);
  return ok(c, await updateAccount(getCtx(c), idParam(c), patch));
});
