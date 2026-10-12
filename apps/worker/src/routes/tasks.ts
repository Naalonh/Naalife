import { Hono } from 'hono';
import { taskCreateSchema, taskUpdateSchema, tasksQuery } from '@pla/shared';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import { createTask, deleteTask, listTasks, taskStats, updateTask } from '../services/taskService';
import { getCtx, idParam, ok, parseBody, parseQuery } from './util';

export const taskRoutes = new Hono<AppEnv>();
taskRoutes.use('*', requireOwner);

taskRoutes.get('/', async (c) => {
  const q = parseQuery(c, tasksQuery);
  return ok(c, await listTasks(getCtx(c), q));
});

taskRoutes.get('/stats', async (c) => ok(c, await taskStats(getCtx(c))));

taskRoutes.post('/', async (c) => {
  const input = await parseBody(c, taskCreateSchema);
  return ok(c, await createTask(getCtx(c), input), undefined, 201);
});

taskRoutes.patch('/:id', async (c) => {
  const patch = await parseBody(c, taskUpdateSchema);
  return ok(c, await updateTask(getCtx(c), idParam(c), patch));
});

taskRoutes.delete('/:id', async (c) => {
  await deleteTask(getCtx(c), idParam(c));
  return ok(c, { deleted: true });
});
