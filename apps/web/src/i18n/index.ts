import { KM } from './km';

export type Lang = 'en' | 'km';

export const LANGS: Array<{ id: Lang; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'km', label: 'ខ្មែរ' },
];

const STORAGE_KEY = 'pla.lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'km') return saved;
  } catch {
    /* storage unavailable */
  }
  // first run: follow the Telegram client's language
  const tgLang = (window as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }).Telegram?.WebApp
    ?.initDataUnsafe?.user?.language_code;
  return tgLang?.toLowerCase().startsWith('km') ? 'km' : 'en';
}

/** Resolved once at start-up; changing language reloads the app so every module re-evaluates. */
export const lang: Lang = detect();

if (typeof document !== 'undefined') document.documentElement.lang = lang;

export function setLang(next: Lang) {
  if (next === lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/**
 * Translate an English UI string. The English text is the key, so a missing translation
 * falls back to readable English. `{0}`, `{1}`… are replaced by the extra arguments.
 */
export function t(key: string, ...args: Array<string | number>): string {
  const text = (lang === 'km' ? KM[key] : undefined) ?? key;
  return args.length ? text.replace(/\{(\d+)\}/g, (m, i: string) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m)) : text;
}
