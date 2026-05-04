/**
 * Turnstile token helper for wallet auth flow (W-PF-206 / wallet-auth fix).
 * Silently renders a hidden Turnstile widget and resolves with a single-use token.
 * Returns empty string if PUBLIC_TURNSTILE_SITE_KEY is not configured
 * (server bypasses in dev when TURNSTILE_SECRET_KEY is absent).
 */
import { env } from '$env/dynamic/public';

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, opts: Record<string, unknown>): string;
    };
  }
}

async function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.turnstile) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-turnstile]');
    if (existing) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.dataset.turnstile = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Turnstile script failed to load'));
    document.head.appendChild(s);
  });
}

/**
 * Returns a single-use Turnstile token for the wallet-auth request.
 * Renders invisibly — user sees no widget.
 * Throws on failure so callers can surface the error.
 */
export async function getAuthTurnstileToken(): Promise<string> {
  const siteKey = (env as Record<string, string | undefined>).PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
  if (!siteKey) return '';

  await loadTurnstileScript();

  return new Promise<string>((resolve, reject) => {
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;bottom:-200px;right:0;z-index:99999;visibility:hidden;pointer-events:none;';
    document.body.appendChild(container);

    const cleanup = () => {
      try { document.body.removeChild(container); } catch { /* already removed */ }
    };

    window.turnstile!.render(container, {
      sitekey: siteKey,
      theme: 'dark',
      size: 'invisible',
      callback: (token: string) => { cleanup(); resolve(token); },
      'error-callback': () => {
        cleanup();
        reject(new Error('Bot verification failed. Please try again.'));
      },
      'expired-callback': () => {
        cleanup();
        reject(new Error('Verification expired. Please try again.'));
      },
    });
  });
}
