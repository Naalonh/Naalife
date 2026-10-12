import { cn } from '@/lib/utils';

/** Pill segmented control with a sliding thumb. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" className={cn('glass relative flex rounded-2xl p-1', className)}>
      <span
        aria-hidden
        className="absolute inset-y-1 rounded-xl bg-foreground/[0.12] shadow-soft transition-transform duration-300 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
          left: '0.25rem',
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 flex-1 rounded-xl px-2 py-2 text-[13px] font-semibold transition-colors',
            value === o.value ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
