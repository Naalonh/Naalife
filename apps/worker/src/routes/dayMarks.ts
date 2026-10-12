import { Hono } from 'hono';
import { dayMarkUpsertSchema, dayMarksQuery, isIsoDate } from '@pla/shared';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import { deleteDayMark, listDayMarks, upsertDayMarks } from '../services/dayMarkService';
import { AppError } from '../utils/errors';
import { getCtx, ok, parseBody, parseQuery } from './util';

export const dayMarkRoutes = new Hono<AppEnv>();
dayMarkRoutes.use('*', requireOwner);

dayMarkRoutes.get('/', async (c) => {
  const q = parseQuery(c, dayMarksQuery);
  return ok(c, await listDayMarks(getCtx(c), q.from, q.to));
});

dayMarkRoutes.post('/', async (c) => {
  const input = await parseBody(c, dayMarkUpsertSchema);
  return ok(c, await upsertDayMarks(getCtx(c), input), undefined, 201);
});

dayMarkRoutes.delete('/:date', async (c) => {
  const date = c.req.param('date') ?? '';
  if (!isIsoDate(date)) throw new AppError(400, 'invalid_date', 'Expected YYYY-MM-DD');
  await deleteDayMark(getCtx(c), date);
  return ok(c, { deleted: true });
});
