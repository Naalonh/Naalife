import { Hono } from 'hono';
import { transactionCreateSchema, transactionUpdateSchema, transactionsQuery } from '@pla/shared';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import { enqueueBudgetAlerts } from '../services/budgetService';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from '../services/financeService';
import { processDueJobs } from '../services/notificationService';
import { getCtx, idParam, ok, parseBody, parseQuery } from './util';

export const transactionRoutes = new Hono<AppEnv>();
transactionRoutes.use('*', requireOwner);

transactionRoutes.get('/', async (c) => {
  const f = parseQuery(c, transactionsQuery);
  const { rows, total } = await listTransactions(getCtx(c), f);
  return ok(c, rows, { page: f.page, limit: f.limit, total });
});

transactionRoutes.post('/', async (c) => {
  const ctx = getCtx(c);
  const input = await parseBody(c, transactionCreateSchema);
  const { transaction, duplicate } = await createTransaction(ctx, input, 'app');
  if (transaction.type === 'expense' && !duplicate) {
    // enqueue threshold alerts, then deliver them after the response is sent
    ctx.defer(
      enqueueBudgetAlerts(ctx, transaction.category_id).then((n) => (n ? processDueJobs(ctx.env, ctx) : undefined)),
    );
  }
  return ok(c, transaction, undefined, duplicate ? 200 : 201);
});

transactionRoutes.patch('/:id', async (c) => {
  const ctx = getCtx(c);
  const patch = await parseBody(c, transactionUpdateSchema);
  return ok(c, await updateTransaction(ctx, idParam(c), patch));
});

transactionRoutes.delete('/:id', async (c) => {
  await deleteTransaction(getCtx(c), idParam(c));
  return ok(c, { deleted: true });
});
