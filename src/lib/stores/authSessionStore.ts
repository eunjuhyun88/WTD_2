import { derived, writable } from 'svelte/store';
import {
  walletStore,
  hydrateAuthSession as hydrateWalletAuthSession,
  applyAuthenticatedUser as applyWalletAuthenticatedUser,
  clearAuthenticatedUser as clearWalletAuthenticatedUser,
} from './walletStore';
import type { AuthUserPayload } from '$lib/api/auth';

const authHydrated = writable(false);

export const authSessionStore = derived([walletStore, authHydrated], ([$wallet, $hydrated]) => ({
  authenticated: Boolean($wallet.email),
  hydrated: $hydrated,
}));

export async function hydrateAuthSession(force = false) {
  await hydrateWalletAuthSession(force);
  authHydrated.set(true);
}

export function applyAuthenticatedUser(user: AuthUserPayload) {
  applyWalletAuthenticatedUser(user);
  authHydrated.set(true);
}

export function clearAuthenticatedUser() {
  clearWalletAuthenticatedUser();
  authHydrated.set(true);
}
