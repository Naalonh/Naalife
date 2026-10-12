import { Hono } from 'hono';
import { dailyReportQuery, dateRangeQuery, isoDateSchema, monthlyReportQuery, weeklyReportQuery } from '@pla/shared';
import { startOfMonth } from '@pla/shared';
import { z } from '@pla/shared';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import { categoryTotals } from '../services/aggregate';
import { getCategories } from '../services/context';
import { fetchLedger } from '../services/financeService';
import { buildReport, exportTransactionsCsv, windowFor } from '../services/reportService';
import { getCtx, ok, parseQuery } from './util';

export const reportRoutes = new Hono<AppEnv>();
reportRoutes.use('*', requireOwner);

reportRoutes.get('/daily', async (c) => {
  const ctx = getCtx(c);
  const q = parseQuery(c, dailyReportQuery);
  const { from, to } = windowFor('daily', q.date ?? ctx.today);
  return ok(c, await buildReport(ctx, 'daily', from, to, q.category_id));
});

reportRoutes.get('/weekly', async (c) => {
  const ctx = getCtx(c);
  const q = parseQuery(c, weeklyReportQuery);
  const { from, to } = windowFor('weekly', q.date ?? ctx.today);
  return ok(c, await buildReport(ctx, 'weekly', from, to, q.category_id));
});

reportRoutes.get('/monthly', async (c) => {
  const ctx = getCtx(c);
  const q = parseQuery(c, monthlyReportQuery);
  const anchor = q.month ? `${q.month}-01` : ctx.today;
  const { from, to } = windowFor('monthly', anchor);
  return ok(c, await buildReport(ctx, 'monthly', from, to, q.category_id));
});

reportRoutes.get('/categories', async (c) => {
  const ctx = getCtx(c);
  const q = parseQuery(c, dateRangeQuery);
  const from = q.from ?? startOfMonth(ctx.today);
  const to = q.to ?? ctx.today;
  const rows = await fetchLedger(ctx, from, to);
  const filtered = q.category_id ? rows.filter((r) => r.category_id === q.category_id) : rows;
  const cats = await getCategories(ctx);
  return ok(c, categoryTotals(filtered, q.type, cats, ctx.settings.preferred_currency, from, to));
});

const exportQuery = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() });

reportRoutes.get('/export', async (c) => {
  const q = parseQuery(c, exportQuery);
  const csv = await exportTransactionsCsv(getCtx(c), q.from, q.to);
  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="transactions-${q.from ?? 'all'}_${q.to ?? 'all'}.csv"`,
    'cache-control': 'no-store',
  });
});
