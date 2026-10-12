import type { DayKind } from '@pla/shared';
import { t } from '@/i18n';

export const DAY_KIND_META: Record<DayKind, { label: string; emoji: string; hint: string; short: string; tone: string }> = {
  work: {
    label: t('Work'),
    emoji: '💼',
    hint: t('A normal working day. Nothing is paused.'),
    short: t('Normal working day'),
    tone: 'bg-info/15 text-info',
  },
  half_am: {
    label: t('Half day · work AM'),
    emoji: '🌅',
    hint: t('Work in the morning, off in the afternoon. Repeating work tasks timed from 12:00 are paused; tasks with no time stay.'),
    short: t('Afternoon work tasks paused'),
    tone: 'bg-warning/15 text-warning',
  },
  half_pm: {
    label: t('Half day · work PM'),
    emoji: '🌇',
    hint: t('Off in the morning, work in the afternoon. Repeating work tasks timed before 12:00 are paused; tasks with no time stay.'),
    short: t('Morning work tasks paused'),
    tone: 'bg-warning/15 text-warning',
  },
  study: {
    label: t('Study'),
    emoji: '📚',
    hint: t('Repeating work tasks are paused.'),
    short: t('Repeating work tasks paused'),
    tone: 'bg-accent/15 text-accent',
  },
  off: {
    label: t('Day off'),
    emoji: '🛌',
    hint: t('Repeating work tasks are paused.'),
    short: t('Repeating work tasks paused'),
    tone: 'bg-primary/15 text-primary',
  },
  holiday: {
    label: t('Holiday'),
    emoji: '🎉',
    hint: t('Repeating work tasks are paused.'),
    short: t('Repeating work tasks paused'),
    tone: 'bg-warning/15 text-warning',
  },
};
