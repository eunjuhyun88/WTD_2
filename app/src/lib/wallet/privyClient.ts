import { env } from '$env/dynamic/public';

let _privy: any = null;

export function isPrivyConfigured(): boolean {
  return !!env.PUBLIC_PRIVY_APP_ID;
}

async function getPrivy(): Promise<any> {
  if (_privy) return _privy;
  const { default: Privy, LocalStorage } = await import('@privy-io/js-sdk-core');
  _privy = new Privy({
    appId: env.PUBLIC_PRIVY_APP_ID!,
    storage: new LocalStorage(),
  });
  return _privy;
}

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, opts: Record<string, unknown>): string;
      reset(widgetId: string): void;
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
    s.onerror = () => reject(new Error('Failed to load Turnstile script'));
    document.head.appendChild(s);
  });
}

async function getTurnstileToken(siteKey: string): Promise<string> {
  await loadTurnstileScript();
  return new Promise<string>((resolve, reject) => {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;bottom:0;right:0;z-index:99999;';
    document.body.appendChild(container);

    const cleanup = () => { try { document.body.removeChild(container); } catch { /* ignore */ } };

    window.turnstile!.render(container, {
      sitekey: siteKey,
      theme: 'dark',
      callback: (token: string) => { cleanup(); resolve(token); },
      'error-callback': () => { cleanup(); reject(new Error('Bot verification failed. Please try again.')); },
      'expired-callback': () => { cleanup(); reject(new Error('Verification expired. Please try again.')); },
    });
  });
}

async function getCaptchaToken(): Promise<string | undefined> {
  try {
    const privy = await getPrivy();
    const siteKey: string | undefined =
      privy.config?.captcha?.siteKey ??
      privy.config?.bot_protection?.siteKey ??
      privy._config?.captcha?.siteKey;
    if (!siteKey) return undefined;
    return await getTurnstileToken(siteKey);
  } catch {
    return undefined;
  }
}

export async function privySendCode(email: string): Promise<void> {
  const privy = await getPrivy();
  try {
    await privy.auth.email.sendCode(email);
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg.toLowerCase().includes('bot') || msg.toLowerCase().includes('captcha') || msg.toLowerCase().includes('verification')) {
      const token = await getCaptchaToken();
      await privy.auth.email.sendCode(email, token);
    } else {
      throw err;
    }
  }
}

export async function privyLoginWithCode(
  email: string,
  code: string
): Promise<{ address: string; accessToken: string }> {
  const privy = await getPrivy();
  const result = await privy.auth.email.loginWithCode(email, code, 'login-or-sign-up');
  const wallets: any[] = result.user?.linked_accounts?.filter(
    (a: any) => a.type === 'wallet' && /^0x[0-9a-fA-F]{40}$/.test(a.address)
  ) ?? [];
  const address = wallets[0]?.address ?? '';
  return { address, accessToken: result.accessToken };
}
