import { addDays, diffDays, type DayKind, type DayMark } from '@pla/shared';
import type { Db, Ctx } from '../config/env';
import { unwrap } from '../db/supabase';
import { notFound } from '../utils/errors';

interface Row {
  mark_date: string;
  kind: DayKind;
  note: string;
}

const toMark = (r: Row): DayMark => ({ date: r.mark_date, kind: r.kind, note: r.note });

export async function listDayMarks(ctx: Ctx, from: string, to: string): Promise<DayMark[]> {
  const rows = unwrap(
    await ctx.db
      .from('day_marks')
      .select('mark_date, kind, note')
      .eq('owner_id', ctx.ownerId)
      .gte('mark_date', from)
      .lte('mark_date', to)
      .order('mark_date'),
    'day marks',
  ) as Row[];
  return rows.map(toMark);
}

/** Date -> kind lookup used when filtering task occurrences. */
export async function marksByDate(db: Db, ownerId: string, from: string, to: string): Promise<Map<string, DayKind>> {
  const rows = unwrap(
    await db
      .from('day_marks')
      .select('mark_date, kind')
      .eq('owner_id', ownerId)
      .gte('mark_date', from)
      .lte('mark_date', to),
    'day marks lookup',
  ) as Array<{ mark_date: string; kind: DayKind }>;
  return new Map(rows.map((r) => [r.mark_date, r.kind]));
}

/** Tag one date, or every date in [from, to]. Idempotent: re-tagging replaces the kind and note. */
export async function upsertDayMarks(
  ctx: Ctx,
  input: { from: string; to?: string; kind: DayKind; note: string },
): Promise<DayMark[]> {
  const last = input.to ?? input.from;
  const span = diffDays(input.from, last);
  const rows = Array.from({ length: span + 1 }, (_, i) => ({
    owner_id: ctx.ownerId,
    mark_date: addDays(input.from, i),
    kind: input.kind,
    note: input.note,
  }));
  unwrap(await ctx.db.from('day_marks').upsert(rows, { onConflict: 'owner_id,mark_date' }), 'upsert day marks');
  return listDayMarks(ctx, input.from, last);
}

export async function deleteDayMark(ctx: Ctx, date: string): Promise<void> {
  const rows = unwrap(
    await ctx.db.from('day_marks').delete().eq('owner_id', ctx.ownerId).eq('mark_date', date).select('mark_date'),
    'delete day mark',
  ) as Array<{ mark_date: string }>;
  if (!rows.length) throw notFound('Day type');
}
