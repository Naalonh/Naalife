import { MoneyError, parseAmount, type Currency } from '@pla/shared';

export interface QuickEntry {
  amount_minor: number;
  currency: Currency;
  description: string;
}

const CUR_WORD = /^(usd|dollars?|bucks?|\$|khr|riels?|r|៛)$/i;

function currencyOf(word: string): Currency {
  return /^(khr|riels?|r|៛)$/i.test(word) ? 'KHR' : 'USD';
}

/**
 * Parses "2.50 lunch", "$2.5 coffee", "4000 khr tuk tuk", "5usd books", "៛8000 noodles".
 * Returns null when no amount can be found.
 */
export function parseQuickEntry(input: string, defaultCurrency: Currency): QuickEntry | null {
  const text = input.trim();
  if (!text) return null;
  const m = /^(\$|៛)?\s*(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(usd|khr|riels?|dollars?|bucks?|\$|៛|r(?=\s|$))?\s*(.*)$/i.exec(text);
  if (!m) return null;
  const [, prefix, amountStr, suffix, rest] = m;
  let currency = defaultCurrency;
  let desc = rest.trim();
  if (prefix) currency = currencyOf(prefix);
  else if (suffix) currency = currencyOf(suffix);
  else {
    const first = desc.split(/\s+/)[0] ?? '';
    if (first && CUR_WORD.test(first)) {
      currency = currencyOf(first);
      desc = desc.slice(first.length).trim();
    }
  }
  try {
    return { amount_minor: parseAmount(amountStr, currency), currency, description: desc.slice(0, 200) };
  } catch (e) {
    if (e instanceof MoneyError) return null;
    throw e;
  }
}

const KEYWORDS: Array<[string, RegExp]> = [
  ['food', /\b(lunch|dinner|breakfast|coffee|cafe|tea|snack|food|meal|rice|noodle|restaurant|eat|drink|pizza|burger|bread|fruit|grocer\w*)\b/i],
  ['transportation', /\b(grab|taxi|tuk|tuktuk|bus|fuel|gas|petrol|parking|moto|ride|transport|fare|pass app)\b/i],
  ['shopping', /\b(shop\w*|clothes|shirt|shoes|market|mall|buy|bought|gift)\b/i],
  ['education', /\b(book|books|course|class|school|tuition|study|english|exam|pen|notebook)\b/i],
  ['bills', /\b(bill|bills|rent|electric\w*|water|internet|wifi|phone|topup|top-up|credit|subscription|insurance)\b/i],
  ['entertainment', /\b(movie|cinema|game|games|netflix|spotify|concert|fun|party|karaoke)\b/i],
  ['health', /\b(doctor|medicine|pharmacy|hospital|clinic|dentist|gym|vitamin|health)\b/i],
  ['family', /\b(family|mom|dad|mother|father|parents|sister|brother|kid|kids|baby)\b/i],
  ['business', /\b(business|stock|inventory|supplier|client|office|ads|advert\w*)\b/i],
];

const INCOME_KEYWORDS: Array<[string, RegExp]> = [
  ['salary', /\b(salary|pay|payroll|wage)\b/i],
  ['freelance', /\b(freelance|project|gig|contract)\b/i],
  ['business', /\b(sale|sales|business|profit|customer)\b/i],
  ['gifts', /\b(gift|bonus|present|red packet)\b/i],
  ['allowance', /\b(allowance|pocket)\b/i],
];

/** Best-effort category slug from free text; null means "ask the user". */
export function guessCategory(description: string, kind: 'expense' | 'income'): string | null {
  const table = kind === 'expense' ? KEYWORDS : INCOME_KEYWORDS;
  for (const [slug, re] of table) if (re.test(description)) return slug;
  return null;
}

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Deterministic UUID-shaped id from a string, used as an idempotency key for bot updates. */
export async function uuidFrom(seed: string): Promise<string> {
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))).slice(0, 16);
  buf[6] = (buf[6] & 0x0f) | 0x50;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
