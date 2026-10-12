import { useEffect } from 'react';
import { setChromeColors, telegramPrefersDark } from '@/lib/telegram';

export type ThemePref = 'dark' | 'light' | 'system';

export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'system') return pref;
  const tg = telegramPrefersDark();
  if (tg !== null) return tg ? 'dark' : 'light';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(pref: ThemePref) {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  setChromeColors(theme === 'dark' ? '#0b1120' : '#f6f8fb');
  try {
    localStorage.setItem('pla.theme', pref);
  } catch {
    /* storage unavailable */
  }
}

/** Applies the stored preference immediately (before settings load) to avoid a flash. */
export function bootTheme() {
  let pref: ThemePref = 'dark';
  try {
    const s = localStorage.getItem('pla.theme');
    if (s === 'light' || s === 'dark' || s === 'system') pref = s;
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}

export function useApplyTheme(pref: ThemePref | undefined) {
  useEffect(() => {
    if (pref) applyTheme(pref);
  }, [pref]);
}
