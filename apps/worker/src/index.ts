import { createApp } from './app';
import type { Env } from './config/env';
import { runScheduled } from './scheduled/reminders';

const app = createApp();

export default {
  fetch: app.fetch,

  /** Cron Trigger (every 5 minutes, UTC). Timezone-aware logic lives in runScheduled. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduled(env).then(
        (r) => console.log('cron_ok', JSON.stringify(r)),
        (e) => console.error('cron_error', e instanceof Error ? e.name : 'unknown'),
      ),
    );
  },
};
