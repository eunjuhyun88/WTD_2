import { writable, derived, get } from 'svelte/store';
import en from './locales/en.json';
import ko from './locales/ko.json';

export type Locale = 'en' | 'ko';

const STORAGE_KEY = 'wtd_locale';
const COOKIE_KEY  = 'wtd_locale';

function detectInitialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ko') return stored;
  }
  if (typeof navigator !== 'undefined') {
    return navigator.language.startsWith('ko') ? 'ko' : 'en';
  }
  return 'en';
}

export const locale = writable<Locale>(
  typeof window !== 'undefined' ? detectInitialLocale() : 'en'
);

const LOCALES: Record<Locale, Record<string, string>> = { en, ko };

export const t = derived(locale, ($locale) => (key: string): string => {
  return LOCALES[$locale]?.[key] ?? LOCALES['en']?.[key] ?? key;
});

export function setLocale(l: Locale) {
  locale.set(l);
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, l);
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_KEY}=${l};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = l;
  }
}

export function getLocaleFromCookie(cookieHeader: string | null): Locale {
  if (!cookieHeader) return 'en';
  const match = cookieHeader.match(new RegExp(`${COOKIE_KEY}=([^;]+)`));
  if (match?.[1] === 'ko') return 'ko';
  return 'en';
}
