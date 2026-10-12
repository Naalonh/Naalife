import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CheckSquare, Home, ListTodo, Minus, PiggyBank, Plus, Settings, TrendingUp, Wallet, X } from 'lucide-react';
import { useSheets } from '@/contexts/SheetContext';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/telegram';
import { t } from '@/i18n';

const NAV = [
  { to: '/', label: t('Home'), icon: Home, end: true },
  { to: '/finance', label: t('Finance'), icon: Wallet },
  { to: '/savings', label: t('Savings'), icon: PiggyBank },
  { to: '/tasks', label: t('Tasks'), icon: CheckSquare },
  { to: '/settings', label: t('Settings'), icon: Settings },
];

function QuickAddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sheets = useSheets();
  const items = [
    { label: t('Expense'), icon: Minus, tone: 'bg-danger/15 text-danger', run: () => sheets.open({ kind: 'transaction', type: 'expense' }) },
    { label: t('Income'), icon: TrendingUp, tone: 'bg-primary/15 text-primary', run: () => sheets.open({ kind: 'transaction', type: 'income' }) },
    { label: t('Savings'), icon: PiggyBank, tone: 'bg-info/15 text-info', run: () => sheets.open({ kind: 'contribution' }) },
    { label: t('Task'), icon: ListTodo, tone: 'bg-accent/15 text-accent', run: () => sheets.open({ kind: 'task' }) },
  ];
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
      <div className="absolute inset-x-0 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] mx-auto grid w-full max-w-lg grid-cols-4 gap-2 px-4">
        {items.map((it, i) => (
          <button
            key={it.label}
            type="button"
            style={{ animationDelay: `${i * 45}ms` }}
            className="glass animate-pop flex flex-col items-center gap-2 rounded-3xl py-4 text-xs font-bold"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              haptic('light');
              it.run();
            }}
          >
            <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', it.tone)}>
              <it.icon className="h-6 w-6" />
            </span>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <main key={pathname} className="flex-1 animate-fade-up px-4 pb-36 pt-safe">
        <Outlet />
      </main>

      <QuickAddMenu open={menu} onClose={() => setMenu(false)} />

      {/* floating quick-add button */}
      <button
        type="button"
        aria-label={menu ? t('Close quick add') : t('Quick add')}
        aria-expanded={menu}
        onClick={() => {
          haptic('light');
          setMenu((m) => !m);
        }}
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50%-14rem+1rem))] z-50 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-info text-primary-foreground shadow-fab transition-transform active:scale-90"
      >
        <span className={cn('transition-transform duration-300', menu && 'rotate-45')}>
          {menu ? <X className="h-6 w-6" strokeWidth={2.6} /> : <Plus className="h-7 w-7" strokeWidth={2.6} />}
        </span>
      </button>

      {/* floating glass tab bar */}
      <nav
        aria-label={t('Primary')}
        className="pb-safe fixed inset-x-0 bottom-3 z-30 mx-auto w-full max-w-lg px-4"
      >
        <ul className="glass grid grid-cols-5 rounded-[1.75rem] p-1.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={() => haptic('light')}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10.5px] font-semibold transition-all',
                    isActive ? 'bg-foreground/[0.1] text-primary' : 'text-muted-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.5 : 2} />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
