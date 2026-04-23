import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchMarketCapOverview } from '$lib/server/marketCapPlane';

export const GET: RequestHandler = async () => {
  try {
    const overview = await fetchMarketCapOverview();

    if (overview.totalMarketCapUsd === null || overview.btcDominance === null) {
      return json({ error: 'Market cap overview unavailable' }, { status: 502 });
    }

    const payload = {
      global: {
        totalMarketCapUsd: overview.totalMarketCapUsd,
        totalVolumeUsd: 0,
        btcDominance: overview.btcDominance,
        ethDominance: overview.ethDominance ?? 0,
        marketCapChange24hPct: overview.marketCapChange24hPct ?? 0,
        activeCryptocurrencies: 0,
        updatedAt: overview.at,
      },
      stablecoin:
        overview.stablecoinMcapUsd !== null
          ? {
              source: overview.providers.stablecoins.provider,
              totalMcapUsd: overview.stablecoinMcapUsd,
              change24hPct: overview.stablecoinMcapChange24hPct ?? 0,
              change7dPct: overview.stablecoinMcapChange7dPct ?? 0,
              updatedAt: overview.providers.stablecoins.updatedAt ?? overview.at,
            }
          : null,
      providers: overview.providers,
      sourceSpreadPct: overview.sourceSpreadPct,
      confidence: overview.confidence,
      btcDominance: overview.btcDominance,
      totalMarketCap: overview.totalMarketCapUsd,
      marketCapChange24hPct: overview.marketCapChange24hPct ?? 0,
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
          'Cache-Control': 'public, max-age=60',
        },
      },
    );
  } catch (error) {
    console.error('[coingecko/global/get] unexpected error:', error);
    return json({ error: 'Failed to load CoinGecko global data' }, { status: 500 });
  }
};
