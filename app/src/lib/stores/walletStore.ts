// ═══════════════════════════════════════════════════════════════
// WTD — Wallet & User State Store
// Per UserJourney Lifecycle spec: P0→P5 progression
// ═══════════════════════════════════════════════════════════════

import { writable, derived } from 'svelte/store';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';
import { resolveLifecyclePhase } from './progressionRules';
import { fetchAuthSession, type AuthUserPayload } from '$lib/api/auth';

export type UserTier = 'guest' | 'registered' | 'connected' | 'verified';

export interface WalletState {
  // User identity
  tier: UserTier;
  email: string | null;
  nickname: string | null;

  // Wallet
  connected: boolean;
  address: string | null;
  shortAddr: string | null;
  balance: number;
  chain: string;
  provider: string | null;

  // Progression (P0-P5)
  phase: number;         // 0-5
  hasSeenDemo: boolean;
  hasCompletedOnboarding: boolean;
  matchesPlayed: number;
  totalLP: number;

  // UI state
  showWalletModal: boolean;
  walletModalStep: 'wallet-select' | 'connecting' | 'sign-message' | 'connected' | 'signup' | 'login';
  signature: string | null;
}

function normalizeProvider(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === 'metamask' || value === 'coinbase' || value === 'walletconnect' || value === 'phantom') {
    return value;
  }

  if (value === 'meta mask' || value === 'metamask wallet') return 'metamask';
  if (value === 'coinbase wallet') return 'coinbase';
  if (value === 'wallet connect') return 'walletconnect';
  return null;
}

const defaultWallet: WalletState = {
  tier: 'guest',
  email: null,
  nickname: null,
  connected: false,
  address: null,
  shortAddr: null,
  balance: 0,
  chain: 'ARB',
  provider: null,
  phase: 0,
  hasSeenDemo: false,
  hasCompletedOnboarding: false,
  matchesPlayed: 0,
  totalLP: 0,
  showWalletModal: false,
  walletModalStep: 'wallet-select',
  signature: null
};

// Load from localStorage
function loadWallet(): WalletState {
  const saved = loadFromStorage<Partial<WalletState>>(STORAGE_KEYS.wallet, null as unknown as Partial<WalletState>);
  if (!saved) return defaultWallet;
  const merged = { ...defaultWallet, ...saved };
  const provider = normalizeProvider(merged.provider);
  return {
    ...merged,
    provider,
    chain: typeof merged.chain === 'string' && merged.chain.trim() ? merged.chain.toUpperCase() : defaultWallet.chain,
    phase: resolveLifecyclePhase(merged.matchesPlayed, merged.totalLP)
  };
}

export const walletStore = writable<WalletState>(loadWallet());

autoSave(walletStore, STORAGE_KEYS.wallet, (w) => {
  const { showWalletModal, walletModalStep, signature, ...persistable } = w;
  return persistable;
}, 300);

// Derived stores
export const isWalletConnected = derived(walletStore, $w => $w.connected);
export const userTier = derived(walletStore, $w => $w.tier);
export const userPhase = derived(walletStore, $w => $w.phase);

let _authHydrated = false;
let _authHydrationPromise: Promise<void> | null = null;

function normalizeTier(value: unknown, fallback: UserTier): UserTier {
  const tier = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (tier === 'verified' || tier === 'connected' || tier === 'registered' || tier === 'guest') {
    return tier;
  }
  return fallback;
}

function toShortAddr(address: string | null): string | null {
  if (!address || address.length < 10) return null;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function applyAuthenticatedUser(user: AuthUserPayload) {
  walletStore.update((w) => {
    const walletAddress = typeof user.walletAddress === 'string'
      ? user.walletAddress
      : typeof user.wallet === 'string'
        ? user.wallet
        : null;
    const keepLiveConnection = w.connected && !!w.address;
    const address = keepLiveConnection ? w.address : walletAddress;
    const shortAddr = keepLiveConnection ? w.shortAddr : toShortAddr(address);
    const phase = Number.isFinite(Number(user.phase)) ? Math.max(1, Number(user.phase)) : Math.max(1, w.phase);

    return {
      ...w,
      email: user.email || w.email,
      nickname: user.nickname || w.nickname,
      tier: normalizeTier(user.tier, keepLiveConnection ? 'connected' : 'registered'),
      phase,
      hasCompletedOnboarding: true,
      showWalletModal: false,
      walletModalStep: 'connected',
      address,
      shortAddr,
    };
  });
}

export function clearAuthenticatedUser() {
  walletStore.update(() => ({
    ...defaultWallet,
  }));
}

export async function hydrateAuthSession(force = false) {
  if (typeof window === 'undefined') return;
  if (_authHydrated && !force) return;
  if (_authHydrationPromise) return _authHydrationPromise;

  _authHydrationPromise = (async () => {
    try {
      const res = await fetchAuthSession();
      if (res.authenticated && res.user) {
        applyAuthenticatedUser(res.user);
      } else {
        clearAuthenticatedUser();
      }
      _authHydrated = true;
    } catch (error) {
      console.warn('[walletStore] auth session hydrate failed', error);
    }
  })();

  try {
    await _authHydrationPromise;
  } finally {
    _authHydrationPromise = null;
  }
}

// ═══ Actions ═══

export function openWalletModal() {
  walletStore.update(w => {
    const step = w.connected ? 'connected' : 'wallet-select';
    return { ...w, showWalletModal: true, walletModalStep: step };
  });
}

export function closeWalletModal() {
  walletStore.update(w => ({ ...w, showWalletModal: false }));
}

export function setWalletModalStep(step: WalletState['walletModalStep']) {
  walletStore.update(w => ({ ...w, walletModalStep: step }));
}

// Register with email + nickname (now after wallet connect)
export function registerUser(email: string, nickname: string) {
  walletStore.update(w => ({
    ...w,
    tier: w.connected ? 'connected' : 'registered',
    email,
    nickname,
    phase: Math.max(resolveLifecyclePhase(w.matchesPlayed, w.totalLP), 1),
    hasCompletedOnboarding: true,
    walletModalStep: 'connected'
  }));
}

// Complete demo viewing
export function completeDemoView() {
  walletStore.update(w => ({
    ...w,
    hasSeenDemo: true,
    phase: Math.max(resolveLifecyclePhase(w.matchesPlayed, w.totalLP), 1),
    walletModalStep: 'wallet-select'
  }));
}

// Wallet connection — called from WalletModal with real address from EIP-1193 provider
export function connectWallet(provider: string = 'metamask', address?: string, chain: string = 'ARB') {
  const resolvedAddr = address && address.trim() ? address.trim() : null;
  walletStore.update(w => ({
    ...w,
    connected: true,
    address: resolvedAddr,
    shortAddr: toShortAddr(resolvedAddr),
    chain: chain.toUpperCase(),
    provider,
    signature: null,
    walletModalStep: 'sign-message'
  }));
}

// Sign message — called from WalletModal with real signature from EIP-1193 provider
export function signMessage(signature: string) {
  walletStore.update(w => ({
    ...w,
    tier: w.email ? 'connected' : 'guest',
    signature,
    phase: Math.max(resolveLifecyclePhase(w.matchesPlayed, w.totalLP), 2),
    walletModalStep: 'connected'
  }));
}

// Skip wallet connection (stay at registered, still usable!)
export function skipWalletConnection() {
  walletStore.update(w => ({
    ...w,
    hasCompletedOnboarding: true,
    showWalletModal: false
  }));
}

// Disconnect
export function disconnectWallet() {
  walletStore.update(w => ({
    ...w,
    connected: false,
    address: null,
    shortAddr: null,
    balance: 0,
    provider: null,
    signature: null,
    tier: w.email ? 'registered' : 'guest'
  }));
}

// Track match completion (for P2→P3 progression)
export function recordMatch(_won: boolean, lpDelta: number) {
  walletStore.update(w => {
    const matches = w.matchesPlayed + 1;
    const lp = w.totalLP + lpDelta;
    const phase = resolveLifecyclePhase(matches, lp);
    return { ...w, matchesPlayed: matches, totalLP: lp, phase };
  });
}

let _walletListenerCleanup: (() => void) | null = null;

/** Call on app mount — registers MetaMask event listeners */
export function initWalletListeners(): () => void {
  import('$lib/wallet/providers').then(({ setupMetaMaskListeners }) => {
    _walletListenerCleanup?.();
    _walletListenerCleanup = setupMetaMaskListeners({
      onAccountsChanged: (accounts) => {
        const address = accounts[0] ?? null;
        if (!address) {
          // User disconnected all accounts
          disconnectWallet();
        } else {
          walletStore.update(w => ({
            ...w,
            address,
            shortAddr: toShortAddr(address),
          }));
        }
      },
      onChainChanged: (chainId) => {
        const num = parseInt(chainId, 16);
        const chainMap: Record<number, string> = { 1: 'ETH', 10: 'OP', 137: 'POL', 8453: 'BASE', 42161: 'ARB' };
        const chain = chainMap[num] ?? `EVM:${num}`;
        walletStore.update(w => ({ ...w, chain }));
      },
      onDisconnect: () => { disconnectWallet(); },
    });
  });
  return () => { _walletListenerCleanup?.(); _walletListenerCleanup = null; };
}

/** Silently reconnect MetaMask if user previously authorized — no popup.
 *  Only sets connected=true if the server session is also authenticated.
 *  This prevents a false "connected" UI state when wtd_session cookie is absent. */
export async function trySilentReconnect(): Promise<void> {
  if (typeof window === 'undefined') return;
  const { tryGetConnectedAccount, getPreferredEvmChainCode } = await import('$lib/wallet/providers');
  const address = await tryGetConnectedAccount('metamask');
  if (!address) return;

  // Guard: only mark connected if the server has a valid session.
  // fetchAuthSession hits /api/auth/session which checks the HTTP-only cookie.
  let serverAuthenticated = false;
  try {
    const res = await fetchAuthSession();
    serverAuthenticated = res.authenticated === true;
  } catch {
    // Network error — fail safe: do not claim connected
    serverAuthenticated = false;
  }

  if (!serverAuthenticated) return;

  walletStore.update(w => {
    if (w.connected && w.address) return w; // already connected
    return {
      ...w,
      connected: true,
      address,
      shortAddr: toShortAddr(address),
      chain: getPreferredEvmChainCode(),
      provider: 'metamask',
      signature: null,
    };
  });
}
