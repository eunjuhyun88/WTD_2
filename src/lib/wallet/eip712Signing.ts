// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — EIP-712 Typed Data Signing
// ═══════════════════════════════════════════════════════════════
// Signs EIP-712 typed data using the user's connected wallet.
// This is the ONE crypto operation that MUST happen in the browser
// (private key never leaves the wallet).
//
// Uses eth_signTypedData_v4 — supported by all major wallets:
// MetaMask, WalletConnect, Coinbase, Phantom EVM

import { resolveEvmProvider, type WalletProviderKey } from './providers';

export interface EIP712TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

/**
 * Sign EIP-712 typed data using the user's connected wallet.
 *
 * @param providerKey Which wallet to use (metamask, coinbase, etc.)
 * @param address The user's wallet address (must match connected account)
 * @param typedData The EIP-712 typed data from our API's /prepare endpoint
 * @returns Hex-encoded signature string (0x...)
 * @throws Error if user rejects, wallet unavailable, or signing fails
 */
export async function signTypedData(
  providerKey: WalletProviderKey,
  address: string,
  typedData: EIP712TypedData,
): Promise<string> {
  const provider = await resolveEvmProvider(providerKey);
  if (!provider) {
    throw new Error('Wallet provider not available. Please reconnect your wallet.');
  }

  try {
    // eth_signTypedData_v4 is the standard method for EIP-712
    // The params are [address, typedDataJSON]
    const signature = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(typedData)],
    });

    if (typeof signature !== 'string' || !signature.startsWith('0x')) {
      throw new Error('Invalid signature returned from wallet');
    }

    return signature;
  } catch (err: any) {
    // User rejected the signing request
    if (err?.code === 4001 || err?.message?.includes('rejected')) {
      throw new Error('Signing cancelled by user');
    }
    // Method not supported (very old wallet)
    if (err?.code === -32601 || err?.message?.includes('not supported')) {
      throw new Error('Your wallet does not support EIP-712 signing. Please use MetaMask or a compatible wallet.');
    }
    throw err;
  }
}
