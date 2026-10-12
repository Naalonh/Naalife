import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('glass rounded-3xl p-4', className)} {...props} />,
);
Card.displayName = 'Card';

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground', className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = 'muted',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'muted' | 'primary' | 'danger' | 'warning' | 'info' }) {
  const tones = {
    muted: 'bg-foreground/[0.07] text-muted-foreground',
    primary: 'bg-primary/15 text-primary',
    danger: 'bg-danger/15 text-danger',
    warning: 'bg-warning/15 text-warning',
    info: 'bg-info/15 text-info',
  } as const;
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', tones[tone], className)}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

/** Small tinted icon tile used in bento stat cards. */
export function IconTile({
  children,
  tone = 'primary',
}: {
  children: React.ReactNode;
  tone?: 'primary' | 'danger' | 'warning' | 'info' | 'accent';
}) {
  const tones = {
    primary: 'bg-primary/15 text-primary',
    danger: 'bg-danger/15 text-danger',
    warning: 'bg-warning/15 text-warning',
    info: 'bg-info/15 text-info',
    accent: 'bg-accent/15 text-accent',
  } as const;
  return <span className={cn('flex h-9 w-9 items-center justify-center rounded-2xl', tones[tone])}>{children}</span>;
}
