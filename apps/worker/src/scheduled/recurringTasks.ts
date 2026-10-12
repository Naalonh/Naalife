import type { Ctx } from '../config/env';
import { materializeOccurrences } from '../services/taskService';

/** Keeps the next two weeks of recurring task occurrences materialised (idempotent). */
export async function generateRecurringTasks(ctx: Ctx): Promise<number> {
  return materializeOccurrences(ctx.db, ctx.ownerId, ctx.today);
}
