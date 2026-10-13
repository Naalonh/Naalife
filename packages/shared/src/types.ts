import type {
  AccountType,
  BudgetPeriod,
  Currency,
  NotificationKind,
  RecurrenceType,
  TaskCategory,
  TaskPriority,
  TransactionType,
} from './constants';
import type { BudgetStatus } from './budget';
import type { GoalProgress } from './savings';

/** All money values over the API are integer minor units (USD cents / KHR riel). */

export interface ApiOk<T> {
  data: T;
  meta?: { page: number; limit: number; total: number };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Category {
  id: string;
  kind: 'expense' | 'income';
  slug: string;
  name: string;
  icon: string;
  color: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  opening_balance_minor: number;
  balance_minor: number;
  is_archived: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  account_id: string;
  to_account_id: string | null;
  amount_minor: number;
  currency: Currency;
  account_amount_minor: number;
  to_amount_minor: number | null;
  base_usd_minor: number;
  fx_khr_per_usd: number;
  category_id: string | null;
  category: Pick<Category, 'id' | 'slug' | 'name' | 'icon' | 'color'> | null;
  description: string;
  occurred_on: string;
  source: 'app' | 'bot';
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  period: BudgetPeriod;
  category_id: string | null;
  category: Pick<Category, 'id' | 'slug' | 'name' | 'icon' | 'color'> | null;
  amount_minor: number;
  currency: Currency;
  alert_threshold_pct: number;
  active: boolean;
  period_from: string;
  period_to: string;
  status: BudgetStatus;
}

export interface BudgetHistoryEntry {
  period_from: string;
  period_to: string;
  status: BudgetStatus;
}

export interface Contribution {
  id: string;
  goal_id: string;
  amount_minor: number;
  account_id: string | null;
  account_amount_minor: number | null;
  contributed_on: string;
  note: string;
  reversed_at: string | null;
  created_at: string;
}

export interface SavingsGoal extends GoalProgress {
  id: string;
  name: string;
  target_minor: number;
  saved_minor: number;
  currency: Currency;
  start_date: string;
  target_date: string;
  status: 'active' | 'completed' | 'archived';
  completed_at: string | null;
  saved_today_minor: number;
  created_at: string;
}

export interface TaskItem {
  occurrence_id: string;
  task_id: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  date: string;
  due_time: string | null;
  reminder_time: string | null;
  status: 'open' | 'done' | 'skipped';
  completed_at: string | null;
  recurrence_type: RecurrenceType;
  recurrence_interval: number;
  recurrence_days: number[];
  recurrence_until: string | null;
  overdue: boolean;
}

export interface TaskStats {
  today_total: number;
  today_done: number;
  overdue: number;
  week_total: number;
  week_done: number;
  completion_rate_pct: number;
}

export interface Routine {
  id: string;
  title: string;
  icon: string | null;
  active: boolean;
  completed_today: boolean;
  streak: number;
  /** Mon..Sun completion flags for the current week */
  week: boolean[];
}

export interface Settings {
  preferred_currency: Currency;
  secondary_currency: Currency;
  fx_khr_per_usd: number;
  timezone: string;
  theme: 'dark' | 'light' | 'system';
  default_account_id: string | null;
  task_reminders_enabled: boolean;
  budget_alerts_enabled: boolean;
  bakong_account_type: 'individual' | 'merchant';
  bakong_account_id: string | null;
  bakong_merchant_name: string | null;
  bakong_merchant_city: string;
  bakong_phone: string | null;
  bakong_merchant_id: string | null;
  bakong_acquiring_bank: string | null;
  bakong_store_label: string | null;
  notifications: Array<{ kind: NotificationKind; enabled: boolean; local_time: string }>;
}

export interface Me {
  telegram_id: number;
  first_name: string | null;
  username: string | null;
  settings: Settings;
  categories: Category[];
  today: string;
}

export interface SeriesPoint {
  label: string;
  income_minor: number;
  expense_minor: number;
}

export interface CategoryTotal {
  category_id: string | null;
  name: string;
  color: string;
  total_minor: number;
  count: number;
}

export interface Dashboard {
  today: string;
  currency: Currency;
  fx_khr_per_usd: number;
  available_balance_minor: number;
  accounts: Account[];
  today_income_minor: number;
  today_expense_minor: number;
  week_expense_minor: number;
  month_income_minor: number;
  month_expense_minor: number;
  net_cash_flow_minor: number;
  saving_target_today_minor: number;
  saved_today_minor: number;
  total_savings_minor: number;
  goals: SavingsGoal[];
  tasks_today: TaskItem[];
  tasks_overdue: TaskItem[];
  upcoming_reminders: TaskItem[];
  recent_transactions: Transaction[];
  budgets: Budget[];
  charts: {
    income_vs_expense: SeriesPoint[];
    daily_spending: Array<{ date: string; expense_minor: number }>;
    expense_categories: CategoryTotal[];
  };
}

export interface Report {
  period: 'daily' | 'weekly' | 'monthly';
  from: string;
  to: string;
  currency: Currency;
  income_minor: number;
  expense_minor: number;
  net_minor: number;
  savings_contributions_minor: number;
  balances: Array<{ account_id: string; name: string; currency: Currency; balance_minor: number }>;
  budgets: Budget[];
  categories: CategoryTotal[];
  income_sources: CategoryTotal[];
  trend: Array<{ date: string; income_minor: number; expense_minor: number }>;
  previous: { from: string; to: string; income_minor: number; expense_minor: number; net_minor: number };
}

export type { DayKind, DayMark } from './daymarks';
