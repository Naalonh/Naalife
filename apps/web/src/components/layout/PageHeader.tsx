import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { t } from '@/i18n';

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3 pb-4 pt-5">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-1 inline-flex items-center text-xs font-semibold text-muted-foreground">
            <ChevronLeft className="h-4 w-4" /> {t('Back')}
          </Link>
        )}
        <h1 className="truncate text-[1.7rem] font-extrabold tracking-tightest">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-foreground/15 py-10 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <p className="font-semibold">{title}</p>
      {hint ? <p className="max-w-[16rem] text-sm text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  );
}
