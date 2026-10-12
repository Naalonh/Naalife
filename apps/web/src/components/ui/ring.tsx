import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Circular progress ring with a gradient stroke and centred content. */
export function Ring({
  value,
  size = 96,
  stroke = 10,
  tone = 'primary',
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: 'primary' | 'accent' | 'info' | 'warning' | 'danger';
  children?: ReactNode;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `ring-${tone}-${size}`;
  const color = `hsl(var(--${tone}))`;
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={`hsl(var(--${tone}) / 0.55)`} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--foreground) / 0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
