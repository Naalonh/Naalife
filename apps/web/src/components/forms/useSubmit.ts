import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { haptic } from '@/lib/telegram';
import { t } from '@/i18n';

/** Wraps a form submit: busy flag, field errors from the API, toast + haptics. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
    if (busy) return undefined; // ignore double taps
    setBusy(true);
    setErrors({});
    try {
      const r = await fn();
      haptic('success');
      if (success) toast.success(success);
      return r;
    } catch (e) {
      haptic('error');
      if (e instanceof ApiError) {
        const map: Record<string, string> = {};
        for (const d of e.details ?? []) map[d.path] = d.message;
        setErrors(map);
        toast.error(Object.keys(map).length ? t('Please check the highlighted fields') : e.message);
      } else {
        toast.error(t('Something went wrong'));
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { busy, errors, run, setErrors };
}
