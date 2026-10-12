import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Account, Budget, DayMark, SavingsGoal, TaskItem, Transaction, TransactionType } from '@pla/shared';
import { Sheet } from '@/components/ui/sheet';
import { TransactionForm } from '@/components/forms/TransactionForm';
import { ContributionForm, GoalForm } from '@/components/forms/SavingsForms';
import { RoutineForm, TaskForm } from '@/components/forms/TaskForms';
import { AccountForm, BudgetForm } from '@/components/forms/FinanceForms';
import { DayTypeForm } from '@/components/forms/DayTypeForm';
import { t } from '@/i18n';

export type SheetState =
  | { kind: 'transaction'; type?: TransactionType; tx?: Transaction }
  | { kind: 'contribution'; goal?: SavingsGoal }
  | { kind: 'goal'; goal?: SavingsGoal }
  | { kind: 'task'; task?: TaskItem; date?: string }
  | { kind: 'account'; account?: Account }
  | { kind: 'budget'; budget?: Budget }
  | { kind: 'routine' }
  | { kind: 'daymark'; date: string; current?: DayMark };

interface SheetApi {
  open: (s: SheetState) => void;
  close: () => void;
}

const SheetContext = createContext<SheetApi | null>(null);

export function useSheets(): SheetApi {
  const v = useContext(SheetContext);
  if (!v) throw new Error('useSheets outside SheetProvider');
  return v;
}

function titleFor(s: SheetState): string {
  switch (s.kind) {
    case 'transaction':
      return s.tx ? t('Edit transaction') : s.type === 'income' ? t('Add income') : s.type === 'transfer' ? t('Transfer money') : t('Add expense');
    case 'contribution':
      return t('Add savings');
    case 'goal':
      return s.goal ? t('Edit goal') : t('New savings goal');
    case 'task':
      return s.task ? t('Edit task') : t('Add task');
    case 'account':
      return s.account ? t('Edit account') : t('New account');
    case 'budget':
      return s.budget ? t('Edit budget') : t('New budget');
    case 'routine':
      return t('New routine');
    case 'daymark':
      return t('Day type');
  }
}

export function SheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SheetState | null>(null);
  const [nonce, setNonce] = useState(0); // remount forms so each open gets fresh state + idempotency key
  const open = useCallback((s: SheetState) => {
    setNonce((n) => n + 1);
    setState(s);
  }, []);
  const close = useCallback(() => setState(null), []);
  const api = useMemo(() => ({ open, close }), [open, close]);

  return (
    <SheetContext.Provider value={api}>
      {children}
      <Sheet open={state !== null} onOpenChange={(o) => !o && close()} title={state ? titleFor(state) : ''}>
        {state?.kind === 'transaction' && <TransactionForm key={nonce} initialType={state.type} tx={state.tx} onDone={close} />}
        {state?.kind === 'contribution' && <ContributionForm key={nonce} goal={state.goal} onDone={close} />}
        {state?.kind === 'goal' && <GoalForm key={nonce} goal={state.goal} onDone={close} />}
        {state?.kind === 'task' && <TaskForm key={nonce} task={state.task} defaultDate={state.date} onDone={close} />}
        {state?.kind === 'account' && <AccountForm key={nonce} account={state.account} onDone={close} />}
        {state?.kind === 'budget' && <BudgetForm key={nonce} budget={state.budget} onDone={close} />}
        {state?.kind === 'routine' && <RoutineForm key={nonce} onDone={close} />}
        {state?.kind === 'daymark' && <DayTypeForm key={nonce} date={state.date} current={state.current} onDone={close} />}
      </Sheet>
    </SheetContext.Provider>
  );
}
