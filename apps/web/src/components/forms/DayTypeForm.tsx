import { useState } from 'react';
import { DAY_KINDS, type DayKind, type DayMark } from '@pla/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useApiMutation } from '@/hooks/queries';
import { api } from '@/lib/api';
import { prettyDate } from '@/lib/dates';
import { useOwner } from '@/contexts/AuthContext';
import { DAY_KIND_META } from '@/lib/dayKinds';
import { cn } from '@/lib/utils';
import { useSubmit } from './useSubmit';
import { t } from '@/i18n';

export function DayTypeForm({ date, current, onDone }: { date: string; current?: DayMark; onDone: () => void }) {
  const me = useOwner();
  const { busy, errors, run } = useSubmit();
  const [kind, setKind] = useState<DayKind>(current?.kind ?? 'off');
  const [note, setNote] = useState(current?.note ?? '');
  const [until, setUntil] = useState('');

  const save = useApiMutation((body: Record<string, unknown>) => api('/day-marks', { method: 'POST', body }));
  const clear = useApiMutation((d: string) => api(`/day-marks/${d}`, { method: 'DELETE' }));

  async function submit() {
    const body: Record<string, unknown> = { from: date, kind, note };
    if (until && until > date) body.to = until;
    const r = await run(() => save.mutateAsync(body), t('Day type saved'));
    if (r) onDone();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm text-muted-foreground">
        {prettyDate(date, me.today)} · {date}
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        {DAY_KINDS.map((k) => {
          const m = DAY_KIND_META[k];
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all',
                active ? 'border-primary bg-primary/10' : 'border-foreground/10 bg-foreground/[0.04]',
              )}
            >
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-xl', m.tone)}>{m.emoji}</span>
              <span className="text-sm font-extrabold">{m.label}</span>
            </button>
          );
        })}
      </div>
      <p className="rounded-2xl bg-foreground/[0.05] px-3.5 py-2.5 text-xs text-muted-foreground">
        {DAY_KIND_META[kind].hint} {t('One-off tasks always stay visible, so a deadline never disappears.')}
      </p>

      <Field label={t('Until (optional)')} hint={t('Tag several days at once, e.g. a long holiday.')} error={errors.to}>
        <Input type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
      </Field>
      <Field label={t('Note')} error={errors.note}>
        <Input value={note} maxLength={100} placeholder={t('e.g. Khmer New Year')} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t('Saving…') : current ? t('Update day type') : t('Set day type')}
      </Button>
      {current && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            const r = await run(() => clear.mutateAsync(date), t('Back to an ordinary day'));
            if (r) onDone();
          }}
        >
          {t('Clear day type')}
        </Button>
      )}
    </form>
  );
}
