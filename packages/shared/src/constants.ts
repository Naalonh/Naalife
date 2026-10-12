export const CURRENCIES = ['USD', 'KHR'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Number of minor-unit decimals per currency (USD cents, KHR has none). */
export const CURRENCY_EXPONENT: Record<Currency, number> = { USD: 2, KHR: 0 };

export const DEFAULT_TIMEZONE = 'Asia/Phnom_Penh';
export const DEFAULT_FX_KHR_PER_USD = 4100;

export const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'savings'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export interface CategoryDef {
  slug: string;
  name: string;
  icon: string;
  color: string;
}

export const EXPENSE_CATEGORIES: CategoryDef[] = [
  { slug: 'food', name: 'Food', icon: 'utensils', color: '#f59e0b' },
  { slug: 'transportation', name: 'Transportation', icon: 'bus', color: '#38bdf8' },
  { slug: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: '#f472b6' },
  { slug: 'education', name: 'Education', icon: 'graduation-cap', color: '#a78bfa' },
  { slug: 'bills', name: 'Bills', icon: 'receipt', color: '#fb7185' },
  { slug: 'entertainment', name: 'Entertainment', icon: 'clapperboard', color: '#facc15' },
  { slug: 'health', name: 'Health', icon: 'heart-pulse', color: '#34d399' },
  { slug: 'family', name: 'Family', icon: 'users', color: '#fb923c' },
  { slug: 'business', name: 'Business', icon: 'briefcase', color: '#60a5fa' },
  { slug: 'other', name: 'Other', icon: 'ellipsis', color: '#94a3b8' },
];

export const INCOME_CATEGORIES: CategoryDef[] = [
  { slug: 'salary', name: 'Salary', icon: 'banknote', color: '#22d3ee' },
  { slug: 'business', name: 'Business', icon: 'briefcase', color: '#60a5fa' },
  { slug: 'freelance', name: 'Freelance', icon: 'laptop', color: '#a78bfa' },
  { slug: 'gifts', name: 'Gifts', icon: 'gift', color: '#f472b6' },
  { slug: 'allowance', name: 'Allowance', icon: 'wallet', color: '#facc15' },
  { slug: 'other', name: 'Other', icon: 'ellipsis', color: '#94a3b8' },
];

export const TASK_CATEGORIES = ['personal', 'study', 'work', 'business', 'finance', 'health', 'other'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const RECURRENCE_TYPES = ['none', 'daily', 'weekly', 'custom'] as const;
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

export const BUDGET_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const NOTIFICATION_KINDS = ['morning', 'savings', 'evening'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const DEFAULT_NOTIFICATION_TIMES: Record<NotificationKind, string> = {
  morning: '07:00',
  savings: '20:00',
  evening: '21:00',
};

/** How many days ahead recurring task occurrences are materialised. */
export const OCCURRENCE_HORIZON_DAYS = 14;
