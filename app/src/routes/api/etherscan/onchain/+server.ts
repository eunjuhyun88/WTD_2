// ═══════════════════════════════════════════════════════════════
// Stockclaw — On-chain Data Proxy (Etherscan + Dune)
// ═══════════════════════════════════════════════════════════════
// Exposes server-side on-chain data to client via REST
// Gas oracle + exchange netflow + ETH supply/price + Dune whale/active addr

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  fetchGasOracle,
  fetchEthSupply,
  fetchEthPrice,
  estimateExchangeNetflow
} from '$lib/server/etherscan';
import {
  fetchWhaleActivity,
  fetchActiveAddresses,
  fetchExchangeBalance
} from '$lib/server/dune';

export const GET: RequestHandler = async () => {
  try {
    const [gasRes, supplyRes, priceRes, netflowRes, whaleRes, activeAddrRes, exchBalRes] =
      await Promise.allSettled([
        fetchGasOracle(),
        fetchEthSupply(),
        fetchEthPrice(),
        estimateExchangeNetflow(),
        fetchWhaleActivity(),
        fetchActiveAddresses(),
        fetchExchangeBalance('ETH')
      ]);

    const gas = gasRes.status === 'fulfilled' ? gasRes.value : null;
    const supply = supplyRes.status === 'fulfilled' ? supplyRes.value : null;
    const price = priceRes.status === 'fulfilled' ? priceRes.value : null;
    const netflow = netflowRes.status === 'fulfilled' ? netflowRes.value : null;
    const whaleActivity = whaleRes.status === 'fulfilled' ? whaleRes.value : null;
    const activeAddresses = activeAddrRes.status === 'fulfilled' ? activeAddrRes.value : null;
    const exchangeBalance = exchBalRes.status === 'fulfilled' ? exchBalRes.value : null;

    return json(
      {
        ok: true,
        data: {
          gas: gas
            ? {
                safe: Number(gas.SafeGasPrice),
                standard: Number(gas.ProposeGasPrice),
                fast: Number(gas.FastGasPrice),
                baseFee: Number(gas.suggestBaseFee || 0)
              }
            : null,
          ethSupply: supply,
          ethPrice: price,
          exchangeNetflowEth: netflow,
          // Dune Analytics data
          whaleActivity,       // large tx count (>$100k)
          activeAddresses,     // daily active addresses
          exchangeBalance,     // ETH held on exchanges (from Dune)
          updatedAt: Date.now()
        }
      },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error: unknown) {
    console.error('[etherscan/onchain] error:', error);
    return json({ error: 'Failed to fetch on-chain data' }, { status: 500 });
  }
};
