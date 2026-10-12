import { z } from 'zod';
import {
  ACCOUNT_TYPES,
  BUDGET_PERIODS,
  CURRENCIES,
  NOTIFICATION_KINDS,
  RECURRENCE_TYPES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TRANSACTION_TYPES,
} from './constants';
import { diffDays, isIsoDate, isValidTimeZone } from './dates';
import { DAY_KINDS } from './daymarks';

export const currencySchema = z.enum(CURRENCIES);
export const uuidSchema = z.string().uuid();
export const isoDateSchema = z.string().refine(isIsoDate, 'Expected a valid YYYY-MM-DD date');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');
export const amountMinorSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const rateSchema = z.number().min(1).max(1_000_000);

// ---- pagination / filters ---------------------------------------------------
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const transactionsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  category_id: uuidSchema.optional(),
  account_id: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

// ---- transactions -----------------------------------------------------------
export const transactionCreateSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    account_id: uuidSchema,
    to_account_id: uuidSchema.optional(),
    amount_minor: amountMinorSchema,
    currency: currencySchema,
    to_amount_minor: amountMinorSchema.optional(),
    category_id: uuidSchema.optional(),
    description: z.string().trim().max(200).default(''),
    occurred_on: isoDateSchema.optional(),
    fx_khr_per_usd: rateSchema.optional(),
    client_request_id: uuidSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'transfer') {
      if (!v.to_account_id) ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: 'Required for transfers' });
      else if (v.to_account_id === v.account_id)
        ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: 'Must differ from source account' });
      if (v.category_id) ctx.addIssue({ code: 'custom', path: ['category_id'], message: 'Transfers have no category' });
    } else if (v.to_account_id || v.to_amount_minor) {
      ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: 'Only valid for transfers' });
    }
  });

export const transactionUpdateSchema = z
  .object({
    account_id: uuidSchema,
    to_account_id: uuidSchema,
    amount_minor: amountMinorSchema,
    currency: currencySchema,
    to_amount_minor: amountMinorSchema,
    category_id: uuidSchema.nullable(),
    description: z.string().trim().max(200),
    occurred_on: isoDateSchema,
    fx_khr_per_usd: rateSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

// ---- accounts ---------------------------------------------------------------
export const accountCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(ACCOUNT_TYPES),
  currency: currencySchema,
  opening_balance_minor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
});

export const accountUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    type: z.enum(ACCOUNT_TYPES),
    opening_balance_minor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    is_archived: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

// ---- budgets ----------------------------------------------------------------
export const budgetCreateSchema = z.object({
  period: z.enum(BUDGET_PERIODS),
  category_id: uuidSchema.nullable().default(null),
  amount_minor: amountMinorSchema,
  currency: currencySchema,
  alert_threshold_pct: z.number().int().min(1).max(100).default(80),
});

export const budgetUpdateSchema = z
  .object({
    amount_minor: amountMinorSchema,
    alert_threshold_pct: z.number().int().min(1).max(100),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

// ---- savings ----------------------------------------------------------------
export const goalCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    target_minor: amountMinorSchema,
    currency: currencySchema,
    start_date: isoDateSchema.optional(),
    target_date: isoDateSchema,
  })
  .refine((v) => !v.start_date || v.target_date >= v.start_date, {
    path: ['target_date'],
    message: 'Target date must not be before the start date',
  });

export const goalUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    target_minor: amountMinorSchema,
    target_date: isoDateSchema,
    status: z.enum(['active', 'archived']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export const contributionCreateSchema = z.object({
  amount_minor: amountMinorSchema,
  account_id: uuidSchema.optional(),
  contributed_on: isoDateSchema.optional(),
  note: z.string().trim().max(200).default(''),
  client_request_id: uuidSchema.optional(),
});

export const contributionReverseSchema = z.object({ reversed: z.literal(true) });

// ---- tasks ------------------------------------------------------------------
const taskBase = {
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1000).default(''),
  category: z.enum(TASK_CATEGORIES).default('personal'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  due_date: isoDateSchema.optional(),
  due_time: timeSchema.nullable().optional(),
  reminder_time: timeSchema.nullable().optional(),
  recurrence_type: z.enum(RECURRENCE_TYPES).default('none'),
  recurrence_interval: z.number().int().min(1).max(365).default(1),
  recurrence_days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  recurrence_until: isoDateSchema.nullable().optional(),
};

export const taskCreateSchema = z.object(taskBase);

export const taskUpdateSchema = z
  .object({
    title: taskBase.title,
    description: z.string().trim().max(1000),
    category: z.enum(TASK_CATEGORIES),
    priority: z.enum(TASK_PRIORITIES),
    due_date: isoDateSchema,
    due_time: timeSchema.nullable(),
    reminder_time: timeSchema.nullable(),
    recurrence_type: z.enum(RECURRENCE_TYPES),
    recurrence_interval: z.number().int().min(1).max(365),
    recurrence_days: z.array(z.number().int().min(0).max(6)).max(7),
    recurrence_until: isoDateSchema.nullable(),
    /** Complete / reopen one occurrence (defaults to the task's due date). */
    completed: z.boolean(),
    /** Skip (or restore) one occurrence of a repeating task, e.g. a cancelled class. */
    skipped: z.boolean(),
    occurrence_date: isoDateSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update')
  .refine((v) => !(v.completed !== undefined && v.skipped !== undefined), 'Use either completed or skipped');

export const tasksQuery = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  status: z.enum(['open', 'done', 'skipped', 'all']).default('all'),
});

// ---- routines ---------------------------------------------------------------
export const routineCreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(32).optional(),
});

export const routineUpdateSchema = z
  .object({ title: z.string().trim().min(1).max(80), active: z.boolean(), icon: z.string().trim().max(32) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export const routineCompleteSchema = z.object({
  date: isoDateSchema.optional(),
  completed: z.boolean().default(true),
});

// ---- settings ---------------------------------------------------------------
export const settingsUpdateSchema = z
  .object({
    preferred_currency: currencySchema,
    secondary_currency: currencySchema,
    fx_khr_per_usd: rateSchema,
    timezone: z.string().refine(isValidTimeZone, 'Unknown timezone'),
    theme: z.enum(['dark', 'light', 'system']),
    default_account_id: uuidSchema.nullable(),
    task_reminders_enabled: z.boolean(),
    budget_alerts_enabled: z.boolean(),
    notifications: z
      .array(z.object({ kind: z.enum(NOTIFICATION_KINDS), enabled: z.boolean(), local_time: timeSchema }))
      .max(NOTIFICATION_KINDS.length),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

// ---- auth / reports ---------------------------------------------------------
export const telegramAuthSchema = z.object({ initData: z.string().min(10).max(4096) });

export const dateRangeQuery = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  category_id: uuidSchema.optional(),
  type: z.enum(['expense', 'income']).default('expense'),
});

export const dailyReportQuery = z.object({ date: isoDateSchema.optional(), category_id: uuidSchema.optional() });
export const weeklyReportQuery = dailyReportQuery;
export const monthlyReportQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  category_id: uuidSchema.optional(),
});

// ---- day types --------------------------------------------------------------
export const dayMarkUpsertSchema = z
  .object({
    from: isoDateSchema,
    /** Optional end date to tag a whole range (e.g. a multi-day holiday). */
    to: isoDateSchema.optional(),
    kind: z.enum(DAY_KINDS),
    note: z.string().trim().max(100).default(''),
  })
  .refine((v) => !v.to || (v.to >= v.from && diffDays(v.from, v.to) < 60), {
    path: ['to'],
    message: 'End date must be on or after the start and within 60 days',
  });

export const dayMarksQuery = z.object({ from: isoDateSchema, to: isoDateSchema });

export type TransactionCreate = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type BudgetCreate = z.infer<typeof budgetCreateSchema>;
export type GoalCreate = z.infer<typeof goalCreateSchema>;
export type ContributionCreate = z.infer<typeof contributionCreateSchema>;
export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;
export type RoutineCreate = z.infer<typeof routineCreateSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
