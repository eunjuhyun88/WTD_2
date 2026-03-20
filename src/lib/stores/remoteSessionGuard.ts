import { get } from 'svelte/store';
import { authSessionStore, hydrateAuthSession } from './authSessionStore';

export function hasAuthenticatedRemoteSession(): boolean {
  return get(authSessionStore).authenticated;
}

export async function ensureAuthenticatedRemoteSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const session = get(authSessionStore);
  if (!session.hydrated) {
    await hydrateAuthSession();
  }

  return get(authSessionStore).authenticated;
}
