import { Hono } from 'hono';
import { routineCompleteSchema, routineCreateSchema, routineUpdateSchema } from '@pla/shared';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import {
  createRoutine,
  listRoutines,
  setRoutineCompletion,
  updateRoutine,
  weeklySummary,
} from '../services/routineService';
import { getCtx, idParam, ok, parseBody } from './util';

export const routineRoutes = new Hono<AppEnv>();
routineRoutes.use('*', requireOwner);

routineRoutes.get('/', async (c) => {
  const routines = await listRoutines(getCtx(c));
  return c.json({ data: routines, summary: weeklySummary(routines) });
});

routineRoutes.post('/', async (c) => {
  const input = await parseBody(c, routineCreateSchema);
  return ok(c, await createRoutine(getCtx(c), input), undefined, 201);
});

routineRoutes.patch('/:id', async (c) => {
  const patch = await parseBody(c, routineUpdateSchema);
  return ok(c, await updateRoutine(getCtx(c), idParam(c), patch));
});

routineRoutes.post('/:id/complete', async (c) => {
  const { date, completed } = await parseBody(c, routineCompleteSchema);
  return ok(c, await setRoutineCompletion(getCtx(c), idParam(c), date, completed));
});
