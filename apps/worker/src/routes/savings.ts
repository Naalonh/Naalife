import { Hono } from 'hono';
import {
  contributionCreateSchema,
  contributionReverseSchema,
  goalCreateSchema,
  goalUpdateSchema,
  formatMinor,
} from '@pla/shared';
import type { AppEnv } from '../config/env';
import { requireOwner } from '../middleware/auth';
import {
  addContribution,
  createGoal,
  deleteGoal,
  getGoal,
  listContributions,
  listGoals,
  reverseContribution,
  updateGoal,
} from '../services/savingsService';
import { sendTelegramMessage } from '../services/telegram';
import { ownerTelegramId } from '../config/env';
import { escapeHtml } from '../services/telegram';
import { getCtx, idParam, ok, parseBody } from './util';

export const savingsRoutes = new Hono<AppEnv>();
savingsRoutes.use('*', requireOwner);

savingsRoutes.get('/', async (c) => {
  const includeArchived = c.req.query('include_archived') === 'true';
  return ok(c, await listGoals(getCtx(c), { includeArchived }));
});

savingsRoutes.post('/', async (c) => {
  const input = await parseBody(c, goalCreateSchema);
  return ok(c, await createGoal(getCtx(c), input), undefined, 201);
});

savingsRoutes.get('/:id', async (c) => ok(c, await getGoal(getCtx(c), idParam(c))));

savingsRoutes.patch('/:id', async (c) => {
  const patch = await parseBody(c, goalUpdateSchema);
  return ok(c, await updateGoal(getCtx(c), idParam(c), patch));
});

savingsRoutes.delete('/:id', async (c) => {
  await deleteGoal(getCtx(c), idParam(c));
  return ok(c, { deleted: true });
});

savingsRoutes.get('/:id/contributions', async (c) => ok(c, await listContributions(getCtx(c), idParam(c))));

savingsRoutes.post('/:id/contributions', async (c) => {
  const ctx = getCtx(c);
  const input = await parseBody(c, contributionCreateSchema);
  const result = await addContribution(ctx, idParam(c), input);
  if (result.goal_completed) {
    const g = result.goal;
    ctx.defer(
      sendTelegramMessage(
        ctx.env,
        ownerTelegramId(ctx.env),
        `🎉 <b>Goal completed!</b>\n${escapeHtml(g.name)} — ${formatMinor(g.saved_minor, g.currency)} saved.`,
      ),
    );
  }
  return ok(c, result, undefined, result.duplicate ? 200 : 201);
});

savingsRoutes.post('/:id/contributions/:contributionId/reverse', async (c) => {
  await parseBody(c, contributionReverseSchema);
  return ok(c, await reverseContribution(getCtx(c), idParam(c), idParam(c, 'contributionId')));
});
