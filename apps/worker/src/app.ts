import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { accountRoutes } from './routes/accounts';
import { authRoutes, meRoutes } from './routes/auth';
import { budgetRoutes } from './routes/budgets';
import { dashboardRoutes } from './routes/dashboard';
import { dayMarkRoutes } from './routes/dayMarks';
import { reportRoutes } from './routes/reports';
import { routineRoutes } from './routes/routines';
import { savingsRoutes } from './routes/savings';
import { settingsRoutes } from './routes/settings';
import { taskRoutes } from './routes/tasks';
import { telegramRoutes } from './routes/telegram';
import { transactionRoutes } from './routes/transactions';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', secureHeaders());

  // CORS: only the configured Mini App origin. Auth is a bearer token, so no cookies / credentials.
  app.use(
    '/api/*',
    cors({
      origin: (origin, c) => (origin && origin === new URL(c.env.APP_URL).origin ? origin : null),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );

  app.get('/', (c) => c.json({ name: 'personal-life-assistant-api', ok: true }));
  app.get('/api/health', (c) => c.json({ ok: true }));

  // public login endpoints (verify Telegram signature / dev gate themselves)
  app.route('/api', authRoutes);
  // everything below enforces requireOwner on its own router
  app.route('/api', meRoutes);
  app.route('/api/dashboard', dashboardRoutes);
  app.route('/api/accounts', accountRoutes);
  app.route('/api/transactions', transactionRoutes);
  app.route('/api/budgets', budgetRoutes);
  app.route('/api/savings', savingsRoutes);
  app.route('/api/tasks', taskRoutes);
  app.route('/api/day-marks', dayMarkRoutes);
  app.route('/api/routines', routineRoutes);
  app.route('/api/reports', reportRoutes);
  app.route('/api/settings', settingsRoutes);
  app.route('/telegram', telegramRoutes);

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
  app.onError(errorHandler);
  return app;
}
