import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Budget } from '@pla/shared';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Ring } from '@/components/ui/ring';
import { useMoney } from '@/lib/money';
import { cn, titleCase } from '@/lib/utils';
import { t } from '@/i18n';

/** Budget tile: ring shows the share of the limit used, colour shifts with risk. */
export function BudgetCard({ budget, onClick }: { budget: Budget; onClick?: () => void }) {
  const { fmt } = useMoney();
  const s = budget.status;
  const tone = s.level === 'over' ? 'danger' : s.level === 'warning' ? 'warning' : 'primary';
  const Status = s.level === 'ok' ? CheckCircle2 : AlertTriangle;

  return (
    <button
      type="button"
      onClick={onClick}
      className="glass pressable flex w-full items-center gap-4 rounded-3xl p-4 text-left"
    >
      <Ring value={s.used_pct} size={68} stroke={8} tone={tone}>
        <CategoryIcon icon={budget.category?.icon ?? 'wallet'} color={budget.category?.color ?? '#22d3ee'} size="sm" />
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-bold">{budget.category?.name ? t(budget.category.name) : t('All spending')}</p>
          <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {titleCase(budget.period)}
          </span>
        </div>
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
          {t('{0} of {1}', fmt(s.spent_minor, budget.currency), fmt(s.limit_minor, budget.currency))}
        </p>
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-xs font-bold',
            s.level === 'over' ? 'text-danger' : s.level === 'warning' ? 'text-warning' : 'text-primary',
          )}
        >
          <Status className="h-3.5 w-3.5" />
          {s.level === 'over'
            ? t('Over budget')
            : s.level === 'warning'
              ? t('{0}% used · {1} left', Math.round(s.used_pct), fmt(s.remaining_minor, budget.currency))
              : t('{0} left', fmt(s.remaining_minor, budget.currency))}
        </p>
      </div>
      <span className="text-sm font-extrabold tabular-nums text-muted-foreground">{Math.round(s.used_pct)}%</span>
    </button>
  );
}
