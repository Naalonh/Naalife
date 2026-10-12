import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/**
 * Drop-in replacement for a native <select>: same <option> children and an onChange
 * that receives `{ target: { value } }`, but rendered as an animated glass popover.
 */
interface Opt {
  value: string;
  label: string;
  disabled?: boolean;
}

const EMPTY = '__empty__'; // Radix items cannot have an empty-string value

function collect(children: React.ReactNode): Opt[] {
  const out: Opt[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode };
    if (child.type === 'option') {
      const label = React.Children.toArray(props.children).join('');
      out.push({ value: props.value !== undefined ? String(props.value) : label, label, disabled: props.disabled });
    } else if (child.type === React.Fragment) {
      out.push(...collect(props.children));
    }
  });
  return out;
}

export interface SelectProps {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
}

export function Select({
  value = '',
  onChange,
  children,
  className,
  disabled,
  placeholder = t('Select…'),
  id,
  'aria-label': ariaLabel,
}: SelectProps) {
  const options = collect(children);
  // a disabled "Select…" row is only a placeholder, so it is not offered as a choice
  const visible = options.filter((o) => !(o.value === '' && o.disabled));
  const hasEmptyChoice = visible.some((o) => o.value === '');
  // '' shows the placeholder; EMPTY selects a real option whose value is the empty string
  const current = value === '' ? (hasEmptyChoice ? EMPTY : '') : value;

  return (
    <SelectPrimitive.Root
      value={current}
      disabled={disabled}
      onValueChange={(v) => onChange?.({ target: { value: v === EMPTY ? '' : v } })}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'group flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-foreground/10 bg-foreground/[0.05] px-4 text-left text-base text-foreground transition-all',
          'focus:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25',
          'data-[state=open]:border-primary/60 data-[state=open]:bg-foreground/[0.08] disabled:opacity-50 data-[placeholder]:text-muted-foreground/70',
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'glass z-[80] max-h-[min(22rem,var(--radix-select-content-available-height))] w-max min-w-[max(var(--radix-select-trigger-width),12rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-card/95 p-1.5',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
        >
          <SelectPrimitive.Viewport className="max-h-[inherit] overflow-y-auto">
            {visible.map((o) => (
              <SelectPrimitive.Item
                key={o.value || EMPTY}
                value={o.value === '' ? EMPTY : o.value}
                disabled={o.disabled}
                className={cn(
                  'relative flex min-h-[42px] cursor-pointer select-none items-center rounded-xl py-2 pl-3 pr-9 text-[15px] font-medium outline-none transition-colors',
                  'data-[highlighted]:bg-foreground/[0.08] data-[state=checked]:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                )}
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
