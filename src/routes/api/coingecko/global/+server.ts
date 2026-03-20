import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCoinGeckoGlobal, fetchStablecoinMcap } from '$lib/server/coingecko';
import { fetchDefiLlamaStableMcap } from '$lib/server/defillama';

export const GET: RequestHandler = async () => {
  try {
    const [global, cgStable, llamaStable] = await Promise.all([
      fetchCoinGeckoGlobal(),
      fetchStablecoinMcap(),
      fetchDefiLlamaStableMcap(),
    ]);

    if (!global) {
      return json({ error: 'CoinGecko global source unavailable' }, { status: 502 });
    }

    const payload = {
      global,
      stablecoin: llamaStable
        ? {
            source: 'defillama',
            totalMcapUsd: llamaStable.totalMcapUsd,
            change24hPct: llamaStable.change24hPct,
            change7dPct: llamaStable.change7dPct,
            updatedAt: llamaStable.updatedAt,
          }
        : cgStable
          ? {
              source: 'coingecko',
              totalMcapUsd: cgStable.totalMcapUsd,
              change24hPct: cgStable.change24hPct,
              updatedAt: cgStable.updatedAt,
              top: cgStable.top,
            }
          : null,
      btcDominance: global.btcDominance,
      totalMarketCap: global.totalMarketCapUsd,
      marketCapChange24hPct: global.marketCapChange24hPct,
    };

    return json(
      {
        success: true,
        ok: true,
        btcDominance: payload.btcDominance,
        totalMarketCap: payload.totalMarketCap,
        marketCapChange24hPct: payload.marketCapChange24hPct,
        data: payload,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=120',
        },
      }
    );
  } catch (error) {
    console.error('[coingecko/global/get] unexpected error:', error);
    return json({ error: 'Failed to load CoinGecko global data' }, { status: 500 });
  }
};
