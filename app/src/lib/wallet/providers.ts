import { env as publicEnv } from '$env/dynamic/public';

export type WalletProviderKey = 'metamask' | 'coinbase' | 'walletconnect' | 'phantom' | 'base';

export const WALLET_PROVIDER_LABEL: Record<WalletProviderKey, string> = {
  metamask: 'MetaMask',
  coinbase: 'Coinbase Wallet',
  walletconnect: 'WalletConnect',
  phantom: 'Phantom',
  base: 'Base Smart Wallet',
};

type Eip1193RequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

interface Eip1193Provider {
  request: (args: Eip1193RequestArgs) => Promise<unknown>;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isWalletConnect?: boolean;
  isPhantom?: boolean;
  isPhantomEthereum?: boolean;
  disconnect?: () => Promise<void>;
}

interface PhantomSolanaConnectResult {
  publicKey?: { toString: () => string };
}

interface PhantomSolanaSignResult {
  signature: Uint8Array;
}

interface PhantomSolanaProvider {
  isPhantom?: boolean;
  connect: (args?: { onlyIfTrusted?: boolean }) => Promise<PhantomSolanaConnectResult>;
  signMessage: (message: Uint8Array, display?: 'utf8' | 'hex') => Promise<PhantomSolanaSignResult>;
  publicKey?: { toString: () => string };
}

interface WalletWindow extends Window {
  ethereum?: Eip1193Provider;
  solana?: PhantomSolanaProvider;
  phantom?: {
    solana?: PhantomSolanaProvider;
  };
}

function getWalletWindow(): WalletWindow | null {
  if (typeof window === 'undefined') return null;
  return window as WalletWindow;
}

function getEthereumRoot(): Eip1193Provider | null {
  const w = getWalletWindow();
  const ethereum = w?.ethereum;
  if (!ethereum || typeof ethereum.request !== 'function') return null;
  return ethereum;
}

function getInjectedEvmProviders(): Eip1193Provider[] {
  const root = getEthereumRoot();
  if (!root) return [];
  if (Array.isArray(root.providers) && root.providers.length > 0) {
    return root.providers.filter((p) => typeof p?.request === 'function');
  }
  return [root];
}

function isProviderMatch(provider: Eip1193Provider, key: WalletProviderKey): boolean {
  if (key === 'metamask') return provider.isMetaMask === true;
  if (key === 'coinbase') return provider.isCoinbaseWallet === true;
  if (key === 'walletconnect') return provider.isWalletConnect === true;
  if (key === 'phantom') return provider.isPhantom === true || provider.isPhantomEthereum === true;
  if (key === 'base') return false; // Base Smart Wallet is SDK-only, never injected
  return false;
}

function resolveInjectedEvmProvider(key: WalletProviderKey): Eip1193Provider | null {
  const providers = getInjectedEvmProviders();
  const exact = providers.find((p) => isProviderMatch(p, key));
  if (exact) return exact;

  // Fallback only for MetaMask when a single injected provider exists.
  if (key === 'metamask' && providers.length === 1) return providers[0];
  return null;
}

let _walletConnectProvider: Eip1193Provider | null = null;
let _coinbaseProvider: Eip1193Provider | null = null;
let _metamaskSdkProvider: Eip1193Provider | null = null;
let _phantomSdkInstance: unknown = null;
const PUBLIC_ENV = publicEnv as Record<string, string | undefined>;

function isPlaceholderWalletConnectProjectId(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === ''
    || normalized === 'your_walletconnect_project_id'
    || normalized === 'walletconnect_project_id'
    || normalized === 'changeme';
}

export function isWalletConnectConfigured(): boolean {
  const projectId = PUBLIC_ENV.PUBLIC_WALLETCONNECT_PROJECT_ID
    || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
    || '';
  return !isPlaceholderWalletConnectProjectId(projectId);
}

function getWalletConnectProjectId(): string {
  const projectId = PUBLIC_ENV.PUBLIC_WALLETCONNECT_PROJECT_ID
    || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
    || '';
  if (isPlaceholderWalletConnectProjectId(projectId)) {
    throw new Error('WalletConnect project id is missing. Set PUBLIC_WALLETCONNECT_PROJECT_ID.');
  }
  return projectId;
}

function getPreferredChainId(): number {
  const raw = PUBLIC_ENV.PUBLIC_EVM_CHAIN_ID
    || import.meta.env.VITE_EVM_CHAIN_ID
    || '';
  const value = raw ? Number(raw) : 42161;
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 42161;
}

function getPreferredRpcUrl(chainId: number): string {
  const envUrl = PUBLIC_ENV.PUBLIC_EVM_RPC_URL
    || import.meta.env.VITE_EVM_RPC_URL
    || '';
  if (envUrl) return envUrl;

  if (chainId === 42161) return 'https://arb1.arbitrum.io/rpc';
  if (chainId === 137) return 'https://polygon-rpc.com';
  if (chainId === 8453) return 'https://mainnet.base.org';
  return 'https://cloudflare-eth.com';
}

function mapChainIdToCode(chainId: number): string {
  if (chainId === 1) return 'ETH';
  if (chainId === 10) return 'OP';
  if (chainId === 56) return 'BSC';
  if (chainId === 137) return 'POL';
  if (chainId === 8453) return 'BASE';
  if (chainId === 42161) return 'ARB';
  return 'EVM';
}

export function getPreferredEvmChainCode(): string {
  return mapChainIdToCode(getPreferredChainId());
}

async function getWalletConnectProvider(): Promise<Eip1193Provider> {
  if (_walletConnectProvider) return _walletConnectProvider;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;
  try {
    mod = await import('@walletconnect/ethereum-provider');
  } catch {
    throw new Error('WalletConnect SDK is not installed. Add @walletconnect/ethereum-provider.');
  }

  const EthereumProvider = mod?.default ?? mod?.EthereumProvider ?? mod;
  if (!EthereumProvider || typeof EthereumProvider.init !== 'function') {
    throw new Error('WalletConnect SDK initialization failed.');
  }

  const projectId = getWalletConnectProjectId();
  const chainId = getPreferredChainId();
  const provider = await EthereumProvider.init({
    projectId,
    showQrModal: true,
    chains: [chainId],
    optionalChains: [1, 10, 56, 137, 8453, 42161],
    methods: ['eth_requestAccounts', 'personal_sign'],
  });

  _walletConnectProvider = provider as Eip1193Provider;
  return _walletConnectProvider;
}

async function getCoinbaseProvider(): Promise<Eip1193Provider> {
  if (_coinbaseProvider) return _coinbaseProvider;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;
  try {
    mod = await import('@coinbase/wallet-sdk');
  } catch {
    throw new Error('Coinbase Wallet SDK is not installed. Add @coinbase/wallet-sdk.');
  }

  let provider: unknown;

  // SDK v4 preferred API: createCoinbaseWalletSDK({ preference: { options } })
  if (typeof mod?.createCoinbaseWalletSDK === 'function') {
    const sdk = mod.createCoinbaseWalletSDK({
      appName: 'wtd',
      appChainIds: [getPreferredChainId()],
      preference: { options: 'all' },
    });
    provider = typeof sdk?.getProvider === 'function' ? sdk.getProvider() : null;
  } else {
    // SDK v4 class API fallback: makeWeb3Provider({ options }) — NOT (rpcUrl, chainId)
    const CoinbaseWalletSDK = mod?.default ?? mod?.CoinbaseWalletSDK;
    if (typeof CoinbaseWalletSDK !== 'function') {
      throw new Error('Coinbase Wallet SDK initialization failed.');
    }
    const sdk = new CoinbaseWalletSDK({
      appName: 'wtd',
      appChainIds: [getPreferredChainId()],
    });
    provider = typeof sdk?.makeWeb3Provider === 'function'
      ? sdk.makeWeb3Provider({ options: 'all' })
      : typeof sdk?.getProvider === 'function'
        ? sdk.getProvider()
        : null;
  }

  if (!provider || typeof (provider as Record<string, unknown>).request !== 'function') {
    throw new Error('Coinbase Wallet provider could not be created.');
  }

  _coinbaseProvider = provider as Eip1193Provider;
  return _coinbaseProvider;
}

/**
 * MetaMask SDK fallback — creates a provider via @metamask/sdk when
 * the browser extension is not injected (e.g. mobile browsers).
 */
async function getMetaMaskSdkProvider(): Promise<Eip1193Provider> {
  if (_metamaskSdkProvider) return _metamaskSdkProvider;

  let mod: any;
  try {
    const moduleName = '@metamask/sdk';
    mod = await import(/* @vite-ignore */ moduleName);
  } catch {
    throw new Error('MetaMask SDK not available. Install the MetaMask browser extension or @metamask/sdk.');
  }

  const MetaMaskSDK = mod?.default ?? mod?.MetaMaskSDK;
  if (!MetaMaskSDK || typeof MetaMaskSDK !== 'function') {
    throw new Error('MetaMask SDK initialization failed.');
  }

  const sdk = new MetaMaskSDK({
    dappMetadata: { name: 'wtd', url: typeof window !== 'undefined' ? window.location.origin : '' },
    checkInstallationImmediately: false,
  });

  await sdk.init();
  const provider = sdk.getProvider?.();
  if (!provider || typeof provider.request !== 'function') {
    throw new Error('MetaMask SDK could not create a provider.');
  }

  _metamaskSdkProvider = provider as Eip1193Provider;
  return _metamaskSdkProvider;
}

/**
 * Phantom Browser SDK fallback — creates an embedded wallet provider
 * when the Phantom browser extension is not installed.
 */
async function getPhantomSdkProvider(): Promise<Eip1193Provider> {
  if (_phantomSdkInstance) return _phantomSdkInstance as Eip1193Provider;

  let mod: any;
  try {
    const moduleName = '@phantom/browser-sdk';
    mod = await import(/* @vite-ignore */ moduleName);
  } catch {
    throw new Error('Phantom Browser SDK not available. Install the Phantom extension or @phantom/browser-sdk.');
  }

  const BrowserSDK = mod?.BrowserSDK ?? mod?.default;
  if (!BrowserSDK) {
    throw new Error('Phantom Browser SDK initialization failed.');
  }

  const appId = PUBLIC_ENV.PUBLIC_PHANTOM_APP_ID || '';
  const sdk = new BrowserSDK({
    providerType: 'embedded',
    addressTypes: ['ethereum', 'solana'],
    appId: appId || undefined,
    authOptions: {
      authUrl: 'https://connect.phantom.app/login',
      redirectUrl: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
    },
  });

  // The Phantom Browser SDK exposes an EIP-1193-compatible ethereum provider.
  const provider = sdk.ethereum ?? sdk;
  if (typeof provider.request !== 'function') {
    throw new Error('Phantom Browser SDK did not expose an EIP-1193 provider.');
  }

  _phantomSdkInstance = provider;
  return provider as Eip1193Provider;
}

/**
 * Base Smart Wallet — uses @base-org/account SDK.
 * Single-step connect + SIWE signing, no extension needed.
 */
let _baseAccountProvider: Eip1193Provider | null = null;

async function getBaseAccountProvider(): Promise<Eip1193Provider> {
  if (_baseAccountProvider) return _baseAccountProvider;

  let mod: any;
  try {
    const moduleName = '@base-org/account';
    mod = await import(/* @vite-ignore */ moduleName);
  } catch {
    throw new Error('Base Account SDK not available. Install @base-org/account.');
  }

  const createBaseAccountSDK = mod?.createBaseAccountSDK ?? mod?.default?.createBaseAccountSDK;
  if (typeof createBaseAccountSDK !== 'function') {
    // Fallback: the SDK may expose getProvider directly
    if (typeof mod?.getProvider === 'function') {
      const provider = mod.getProvider();
      if (provider && typeof provider.request === 'function') {
        _baseAccountProvider = provider as Eip1193Provider;
        return _baseAccountProvider;
      }
    }
    throw new Error('Base Account SDK initialization failed.');
  }

  const sdk = createBaseAccountSDK({
    appName: 'wtd',
  });

  const provider = sdk.getProvider?.() ?? sdk;
  if (!provider || typeof provider.request !== 'function') {
    throw new Error('Base Account provider could not be created.');
  }

  _baseAccountProvider = provider as Eip1193Provider;
  return _baseAccountProvider;
}

/** Exposed for EIP-712 signing and chain switching modules */
export async function resolveEvmProvider(key: WalletProviderKey): Promise<Eip1193Provider | null> {
  if (key === 'base') {
    return getBaseAccountProvider();
  }

  if (key === 'walletconnect') {
    return getWalletConnectProvider();
  }

  if (key === 'coinbase') {
    try {
      return await getCoinbaseProvider();
    } catch (error) {
      const injected = resolveInjectedEvmProvider(key);
      if (injected) return injected;

      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Coinbase Wallet provider could not be initialized.');
    }
  }

  // MetaMask: try injected first, fallback to SDK
  if (key === 'metamask') {
    const injected = resolveInjectedEvmProvider(key);
    if (injected) return injected;
    try {
      return await getMetaMaskSdkProvider();
    } catch {
      throw new Error('MetaMask not detected. Install the MetaMask browser extension or use the MetaMask mobile app.');
    }
  }

  // Phantom: try injected first, fallback to Browser SDK
  if (key === 'phantom') {
    const injected = resolveInjectedEvmProvider(key);
    if (injected) return injected;
    try {
      return await getPhantomSdkProvider();
    } catch {
      throw new Error('Phantom not detected. Install the Phantom extension or use an embedded wallet.');
    }
  }

  return resolveInjectedEvmProvider(key);
}

export function hasInjectedEvmProvider(key: WalletProviderKey): boolean {
  if (key === 'walletconnect') return isWalletConnectConfigured();
  // Coinbase, MetaMask, Phantom, Base all have SDK fallbacks — always available
  if (key === 'coinbase' || key === 'metamask' || key === 'phantom' || key === 'base') return true;
  return resolveInjectedEvmProvider(key) !== null;
}

export async function requestInjectedEvmAccount(key: WalletProviderKey): Promise<string> {
  const provider = await resolveEvmProvider(key);
  if (!provider) {
    throw new Error(`${WALLET_PROVIDER_LABEL[key]} provider not detected. Check extension/app connection.`);
  }

  const accountsRaw = await provider.request({ method: 'eth_requestAccounts' });
  const accounts = Array.isArray(accountsRaw) ? accountsRaw : [];
  const address = accounts.find((v) => typeof v === 'string' && v.startsWith('0x'));
  if (typeof address !== 'string') {
    throw new Error(`Failed to read ${WALLET_PROVIDER_LABEL[key]} account address.`);
  }
  return address;
}

export async function signInjectedEvmMessage(
  key: WalletProviderKey,
  message: string,
  address: string
): Promise<string> {
  const provider = await resolveEvmProvider(key);
  if (!provider) {
    throw new Error(`${WALLET_PROVIDER_LABEL[key]} provider is unavailable for signing.`);
  }

  const signatureRaw = await provider.request({
    method: 'personal_sign',
    params: [message, address],
  });

  if (typeof signatureRaw !== 'string' || !signatureRaw.startsWith('0x')) {
    throw new Error(`${WALLET_PROVIDER_LABEL[key]} returned an invalid signature.`);
  }
  return signatureRaw;
}

function getPhantomSolanaProvider(): PhantomSolanaProvider | null {
  const w = getWalletWindow();
  const provider = w?.solana || w?.phantom?.solana;
  if (!provider) return null;
  if (typeof provider.connect !== 'function' || typeof provider.signMessage !== 'function') return null;
  if (provider.isPhantom !== true) return null;
  return provider;
}

export async function requestPhantomSolanaAccount(): Promise<string> {
  const provider = getPhantomSolanaProvider();
  if (!provider) {
    throw new Error('Phantom (Solana) provider not detected. Install/enable Phantom extension.');
  }

  const connected = await provider.connect();
  const address = connected?.publicKey?.toString() || provider.publicKey?.toString();
  if (!address) {
    throw new Error('Failed to read Phantom Solana address.');
  }
  return address;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signPhantomSolanaUtf8Message(message: string): Promise<string> {
  const provider = getPhantomSolanaProvider();
  if (!provider) {
    throw new Error('Phantom (Solana) provider is unavailable for signing.');
  }

  const encoded = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encoded, 'utf8');
  if (!signed?.signature || signed.signature.length === 0) {
    throw new Error('Phantom returned an empty signature.');
  }

  return `0x${bytesToHex(signed.signature)}`;
}
