// Privy integration stub.
// To activate: install `@privy-io/js-sdk-core` and set PUBLIC_PRIVY_APP_ID in .env.
// The loginWithPrivyEmail flow returns an access token you then POST to /api/auth/privy.

import { env } from '$env/dynamic/public';

export function isPrivyConfigured(): boolean {
  return !!env.PUBLIC_PRIVY_APP_ID;
}

export async function initPrivy(): Promise<void> {
  if (!isPrivyConfigured()) throw new Error('Privy not configured');
  // Dynamic import so the bundle is not affected when Privy is absent.
  // const { PrivyClient } = await import('@privy-io/js-sdk-core');
  // privy = new PrivyClient(env.PUBLIC_PRIVY_APP_ID);
}

export async function loginWithPrivyEmail(
  email: string
): Promise<{ address: string; accessToken: string } | null> {
  if (!isPrivyConfigured()) throw new Error('Privy not configured');
  // const { PrivyClient } = await import('@privy-io/js-sdk-core');
  // const client = new PrivyClient(env.PUBLIC_PRIVY_APP_ID);
  // const result = await client.loginWithEmail(email);
  // return { address: result.user.wallet?.address ?? '', accessToken: result.accessToken };
  return null;
}
