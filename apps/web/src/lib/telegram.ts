import {
  hapticFeedback,
  init,
  isTMA,
  miniApp,
  retrieveRawInitData,
  themeParams,
  viewport,
} from '@telegram-apps/sdk';

export interface TelegramEnv {
  inTelegram: boolean;
  initData: string | null;
}

let cached: TelegramEnv | null = null;

/** Initialise the Mini Apps SDK once. Safe to call outside Telegram (returns inTelegram=false). */
export function initTelegram(): TelegramEnv {
  if (cached) return cached;
  let inTelegram = false;
  let initData: string | null = null;
  try {
    inTelegram = isTMA();
    if (inTelegram) {
      init();
      try {
        themeParams.mountSync.ifAvailable?.();
        themeParams.bindCssVars.ifAvailable?.();
      } catch {
        /* optional */
      }
      try {
        miniApp.mountSync.ifAvailable?.();
        miniApp.ready.ifAvailable?.();
      } catch {
        /* optional */
      }
      try {
        if (viewport.mount.isAvailable()) {
          void viewport
            .mount()
            .then(() => {
              viewport.expand.ifAvailable();
              // exposes --tg-viewport-*safe-area-inset-* so fullscreen layouts clear Telegram own buttons
              viewport.bindCssVars.ifAvailable();
            })
            .catch(() => undefined);
        }
      } catch {
        /* optional */
      }
      initData = retrieveRawInitData() ?? null;
    }
  } catch {
    inTelegram = false;
  }
  cached = { inTelegram, initData };
  return cached;
}

/** Telegram's own light/dark preference, if running inside Telegram. */
export function telegramPrefersDark(): boolean | null {
  try {
    if (cached?.inTelegram) {
      const v = miniApp.isDark();
      return typeof v === 'boolean' ? v : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function haptic(kind: 'success' | 'error' | 'light' = 'light') {
  try {
    if (!cached?.inTelegram) return;
    if (kind === 'light') hapticFeedback.impactOccurred.ifAvailable?.('light');
    else hapticFeedback.notificationOccurred.ifAvailable?.(kind);
  } catch {
    /* ignore */
  }
}

export function setChromeColors(hex: string) {
  try {
    if (!cached?.inTelegram) return;
    miniApp.setHeaderColor.ifAvailable?.(hex as `#${string}`);
    miniApp.setBackgroundColor.ifAvailable?.(hex as `#${string}`);
  } catch {
    /* ignore */
  }
}
