import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  Account,
  Budget,
  BudgetHistoryEntry,
  Category,
  CategoryTotal,
  Contribution,
  Dashboard,
  DayMark,
  Me,
  Report,
  Routine,
  SavingsGoal,
  Settings,
  TaskItem,
  TaskStats,
  Transaction,
} from '@pla/shared';
import { api, apiPage } from '@/lib/api';

export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  accounts: ['accounts'] as const,
  budgets: ['budgets'] as const,
  budgetHistory: (id: string) => ['budgets', id, 'history'] as const,
  transactions: (f: object) => ['transactions', f] as const,
  savings: ['savings'] as const,
  contributions: (id: string) => ['savings', id, 'contributions'] as const,
  tasks: (f: object) => ['tasks', f] as const,
  taskStats: ['tasks', 'stats'] as const,
  routines: ['routines'] as const,
  report: (period: string, p: object) => ['reports', period, p] as const,
  categories: (p: object) => ['reports', 'categories', p] as const,
};

export function useMe(enabled = true) {
  return useQuery({ queryKey: qk.me, queryFn: () => api<Me>('/me'), enabled, staleTime: 5 * 60_000 });
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: () => api<Dashboard>('/dashboard') });
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: [...qk.accounts, includeArchived],
    queryFn: () => api<Account[]>('/accounts', { params: { include_archived: includeArchived } }),
  });
}

export interface TxFilter {
  q?: string;
  type?: 'income' | 'expense' | 'transfer';
  category_id?: string;
  account_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useTransactions(filter: TxFilter) {
  return useQuery({
    queryKey: qk.transactions(filter),
    queryFn: () => apiPage<Transaction>('/transactions', { params: { limit: 30, ...filter } }),
    placeholderData: keepPreviousData,
  });
}

export function useBudgets() {
  return useQuery({ queryKey: qk.budgets, queryFn: () => api<Budget[]>('/budgets') });
}

export function useBudgetHistory(id: string | null) {
  return useQuery({
    queryKey: qk.budgetHistory(id ?? ''),
    queryFn: () => api<BudgetHistoryEntry[]>(`/budgets/${id}/history`),
    enabled: !!id,
  });
}

export function useGoals(includeArchived = false) {
  return useQuery({
    queryKey: [...qk.savings, includeArchived],
    queryFn: () => api<SavingsGoal[]>('/savings', { params: { include_archived: includeArchived } }),
  });
}

export function useContributions(goalId: string | null) {
  return useQuery({
    queryKey: qk.contributions(goalId ?? ''),
    queryFn: () => api<Contribution[]>(`/savings/${goalId}/contributions`),
    enabled: !!goalId,
  });
}

export function useTasks(filter: { from?: string; to?: string; status?: 'open' | 'done' | 'skipped' | 'all' } = {}) {
  return useQuery({ queryKey: qk.tasks(filter), queryFn: () => api<TaskItem[]>('/tasks', { params: filter }) });
}

export function useTaskStats() {
  return useQuery({ queryKey: qk.taskStats, queryFn: () => api<TaskStats>('/tasks/stats') });
}

export function useRoutines() {
  return useQuery({
    queryKey: qk.routines,
    queryFn: async () => {
      const res = await api<Routine[]>('/routines');
      return res;
    },
  });
}

export function useReport(period: 'daily' | 'weekly' | 'monthly', params: Record<string, string | undefined>) {
  return useQuery({
    queryKey: qk.report(period, params),
    queryFn: () => api<Report>(`/reports/${period}`, { params }),
    placeholderData: keepPreviousData,
  });
}

export function useCategoryTotals(params: { from: string; to: string; type: 'expense' | 'income' }) {
  return useQuery({
    queryKey: qk.categories(params),
    queryFn: () => api<CategoryTotal[]>('/reports/categories', { params }),
  });
}

/** Every number in the app derives from the same ledger, so after any write we refetch all of it. */
export function invalidateAll(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
}

export function useApiMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { refreshMe?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await invalidateAll(qc);
      if (opts.refreshMe) await qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export type { Category, Settings };

export function useDayMarks(from: string, to: string) {
  return useQuery({
    queryKey: ['day-marks', from, to],
    queryFn: () => api<DayMark[]>('/day-marks', { params: { from, to } }),
  });
}
