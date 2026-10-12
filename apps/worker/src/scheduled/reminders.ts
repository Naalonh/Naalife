import type { Ctx, Env } from '../config/env';
import { createDb } from '../db/supabase';
import { buildCtx, resolveOwnerId } from '../services/context';
import { ensureDueJobs, processDueJobs } from '../services/notificationService';
import { generateRecurringTasks } from './recurringTasks';

/**
 * Entry point for the every-5-minutes cron trigger.
 *  1. work out the current local time (Asia/Phnom_Penh by default)
 *  2. keep recurring-task occurrences materialised
 *  3. create any notification jobs that became due (idempotent via dedupe keys)
 *  4. atomically claim + deliver pending jobs, recording results and retries
 */
export async function runScheduled(env: Env, now = new Date()): Promise<{ created: number; processed: number }> {
  const db = createDb(env);
  const ownerId = await resolveOwnerId(db, env);
  const ctx: Ctx = await buildCtx(env, db, ownerId, (p) => void p.catch(() => undefined), now);
  await generateRecurringTasks(ctx);
  const created = await ensureDueJobs(ctx, now);
  const processed = await processDueJobs(env, ctx, 10, now);
  return { created, processed };
}
