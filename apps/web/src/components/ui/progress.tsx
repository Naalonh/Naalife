import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

export function Progress({
  value,
  className,
  tone = 'primary',
}: {
  value: number;
  className?: string;
  tone?: 'primary' | 'warning' | 'danger' | 'info';
}) {
  const bar = { primary: 'bg-primary', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info' }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} value={v}>
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-all duration-500', bar)}
        style={{ width: `${v}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
