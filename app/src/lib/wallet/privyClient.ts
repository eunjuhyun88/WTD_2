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

export async function privySendCode(email: string): Promise<void> {
  const privy = await getPrivy();
  await privy.email.sendCode(email);
}

export async function privyLoginWithCode(
  email: string,
  code: string
): Promise<{ address: string; accessToken: string }> {
  const privy = await getPrivy();
  const result = await privy.email.loginWithCode(email, code, 'login-or-sign-up');
  const wallets: any[] = result.user?.linked_accounts?.filter(
    (a: any) => a.type === 'wallet' && /^0x[0-9a-fA-F]{40}$/.test(a.address)
  ) ?? [];
  const address = wallets[0]?.address ?? '';
  return { address, accessToken: result.accessToken };
}
