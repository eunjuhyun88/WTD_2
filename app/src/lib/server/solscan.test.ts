import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({
  envState: {
    SOLSCAN_API_KEY: 'solscan_live_key_1234567890abcdef',
  },
}));

vi.mock('$env/dynamic/private', () => ({
  env: envState,
}));

vi.mock('$lib/server/providers/cache', () => ({
  getCached: vi.fn(),
  setCache: vi.fn(),
}));

import { getCached, setCache } from '$lib/server/providers/cache';
import {
  fetchSolscanAccountIntel,
  fetchSolscanTokenIntel,
  hasSolscanKey,
} from './solscan';

describe('solscan provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCached).mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('normalizes token meta, holders, markets, and activity', async () => {
    vi.mocked(fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          address: 'So11111111111111111111111111111111111111112',
          name: 'Wrapped SOL',
          symbol: 'SOL',
          icon: 'https://example.com/sol.png',
          decimals: 9,
          price: 150.12,
          volume_24h: 500_000_000,
          market_cap: 80_000_000_000,
          price_change_24h: 3.2,
          supply: '1000',
          holder: 2,
          creator: 'Creator1111',
          created_time: 1710000000,
          mint_authority: 'Mint1111',
          freeze_authority: 'Freeze1111',
          total_dex_vol_24h: 250_000_000,
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          total: 2,
          items: [
            { address: 'Holder1', owner: 'Owner1', amount: 400, rank: 1, value: 60_000 },
            { address: 'Holder2', owner: 'Owner2', amount: 100, rank: 2, value: 15_000 },
          ],
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: [
          {
            pool_id: 'Pool1',
            program_id: 'Raydium1111',
            program_name: 'Raydium',
            token_1: 'So11111111111111111111111111111111111111112',
            token_2: 'USDC11111111111111111111111111111111111111',
            total_trades_24h: 1800,
            total_volume_24h: 120_000_000,
            total_tvl: 8_000_000,
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: [
          {
            trans_id: 'Tx1',
            block_time: 1710000100,
            activity_type: 'ACTIVITY_SPL_TRANSFER',
            from_address: 'From1',
            to_address: 'To1',
            amount: 5000000000,
            token_decimals: 9,
          },
        ],
      })));

    const intel = await fetchSolscanTokenIntel('So11111111111111111111111111111111111111112');

    expect(hasSolscanKey()).toBe(true);
    expect(intel?.symbol).toBe('SOL');
    expect(intel?.topHolders[0]?.sharePct).toBeCloseTo(40);
    expect(intel?.markets[0]?.venue).toBe('Raydium');
    expect(intel?.recentActivity[0]?.amount).toBe(5);
    expect(setCache).toHaveBeenCalled();
  });

  it('normalizes account detail', async () => {
    vi.mocked(fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      data: {
        account: 'Account1111',
        lamports: 2_500_000_000,
        type: 'wallet',
        executable: false,
        owner_program: '11111111111111111111111111111111',
        rent_epoch: 42,
        is_oncurve: true,
      },
    })));

    const intel = await fetchSolscanAccountIntel('Account1111');

    expect(intel?.solBalance).toBe(2.5);
    expect(intel?.type).toBe('wallet');
    expect(intel?.isOnCurve).toBe(true);
  });
});
