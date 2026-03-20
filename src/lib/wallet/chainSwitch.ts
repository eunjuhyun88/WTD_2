// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Chain Switching (Polygon + Arbitrum)
// ═══════════════════════════════════════════════════════════════
// Ensures the user's wallet is on the correct chain before
// executing transactions. Polygon for Polymarket, Arbitrum for GMX.

import { resolveEvmProvider, type WalletProviderKey } from './providers';

const POLYGON_CHAIN_ID = '0x89'; // 137 in hex
const POLYGON_CHAIN_CONFIG = {
  chainId: POLYGON_CHAIN_ID,
  chainName: 'Polygon PoS',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'POL',
    decimals: 18,
  },
  rpcUrls: ['https://polygon-rpc.com', 'https://rpc-mainnet.maticvigil.com'],
  blockExplorerUrls: ['https://polygonscan.com'],
};

/**
 * Ensure the user's wallet is connected to Polygon.
 *
 * @param providerKey Which wallet to use
 * @returns true if successfully on Polygon, false if user rejected
 */
export async function ensurePolygonChain(providerKey: WalletProviderKey): Promise<boolean> {
  const provider = await resolveEvmProvider(providerKey);
  if (!provider) return false;

  try {
    // Check current chain
    const currentChainId = await provider.request({ method: 'eth_chainId' }) as string;
    if (currentChainId?.toLowerCase() === POLYGON_CHAIN_ID) {
      return true; // Already on Polygon
    }

    // Try switching to Polygon
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_CHAIN_ID }],
    });
    return true;
  } catch (switchError: any) {
    // Chain not added to wallet — try adding it
    if (switchError?.code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [POLYGON_CHAIN_CONFIG],
        });
        return true;
      } catch {
        return false; // User rejected add chain
      }
    }
    // User rejected switch
    if (switchError?.code === 4001) return false;
    return false;
  }
}

/**
 * Get the current chain ID from the wallet.
 */
export async function getCurrentChainId(providerKey: WalletProviderKey): Promise<number | null> {
  const provider = await resolveEvmProvider(providerKey);
  if (!provider) return null;

  try {
    const chainId = await provider.request({ method: 'eth_chainId' }) as string;
    return parseInt(chainId, 16);
  } catch {
    return null;
  }
}

/**
 * Check if the wallet is currently on Polygon.
 */
export async function isOnPolygon(providerKey: WalletProviderKey): Promise<boolean> {
  const chainId = await getCurrentChainId(providerKey);
  return chainId === 137;
}

// ═══ Arbitrum (for GMX V2) ═══════════════════════════════════

const ARBITRUM_CHAIN_ID = '0xa4b1'; // 42161 in hex
const ARBITRUM_CHAIN_CONFIG = {
  chainId: ARBITRUM_CHAIN_ID,
  chainName: 'Arbitrum One',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'],
  blockExplorerUrls: ['https://arbiscan.io'],
};

/**
 * Ensure the user's wallet is connected to Arbitrum.
 *
 * @param providerKey Which wallet to use
 * @returns true if successfully on Arbitrum, false if user rejected
 */
export async function ensureArbitrumChain(providerKey: WalletProviderKey): Promise<boolean> {
  const provider = await resolveEvmProvider(providerKey);
  if (!provider) return false;

  try {
    const currentChainId = await provider.request({ method: 'eth_chainId' }) as string;
    if (currentChainId?.toLowerCase() === ARBITRUM_CHAIN_ID) {
      return true; // Already on Arbitrum
    }

    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARBITRUM_CHAIN_ID }],
    });
    return true;
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [ARBITRUM_CHAIN_CONFIG],
        });
        return true;
      } catch {
        return false;
      }
    }
    if (switchError?.code === 4001) return false;
    return false;
  }
}

/**
 * Check if the wallet is currently on Arbitrum.
 */
export async function isOnArbitrum(providerKey: WalletProviderKey): Promise<boolean> {
  const chainId = await getCurrentChainId(providerKey);
  return chainId === 42161;
}
