import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({
  envState: {
    TRONSCAN_API_KEY: 'tronscan_live_key_1234567890abcdef',
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
  fetchTronscanAccountIntel,
  fetchTronscanTokenIntel,
  hasTronscanKey,
} from './tronscan';

describe('tronscan provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCached).mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('normalizes account detail, native transfers, and trc20 transfers', async () => {
    vi.mocked(fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
        balance: 3200000,
        latest_operation_time: 1710000200000,
        date_created: 1710000000000,
        bandwidth: {
          freeNetUsed: 120,
          energyUsed: 450,
        },
        withPriceTokens: [
          { tokenId: '_' },
          { tokenId: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' },
          { tokenId: 'TJASomething' },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          {
            transactionHash: 'NativeTx1',
            block_ts: 1710000300000,
            transferFromAddress: 'TSender111111111111111111111111111111',
            transferToAddress: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
            amount: 1500000,
            contractRet: 'SUCCESS',
            tokenInfo: {
              tokenAbbr: 'TRX',
              tokenDecimal: 6,
            },
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          {
            hash: 'Trc20Tx1',
            block_timestamp: 1710000400000,
            from: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
            to: 'TReceiver1111111111111111111111111111',
            amount: '5000000',
            decimals: 6,
            token_name: 'USDT',
            event_type: 'Transfer',
          },
        ],
      })));

    const intel = await fetchTronscanAccountIntel('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');

    expect(hasTronscanKey()).toBe(true);
    expect(intel?.balanceTrx).toBe(3.2);
    expect(intel?.trc20TokenCount).toBe(2);
    expect(intel?.recentTransactions[0]?.amount).toBe(1.5);
    expect(intel?.recentTrc20Transfers[0]?.amount).toBe(5);
    expect(setCache).toHaveBeenCalled();
  });

  it('normalizes token detail, holders, transfers, and supply', async () => {
    vi.mocked(fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          {
            tag1: 'USDT Token',
            tag1Url: 'https://tron.network/usdt',
            trc20token: {
              icon_url: 'https://static.tronscan.org/usdt.png',
              symbol: 'USDT',
              total_supply: '44125091014551106',
              contract_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
              issuer_addr: 'THPvaUhoh2Qn2y9THCZML3H815hhFhn5YC',
              home_page: 'https://tron.network/usdt',
              token_desc: 'USDT is the official stablecoin issued by Tether on the TRON network.',
              holders_count: '22132393',
              decimals: '6',
              name: 'Tether USD',
            },
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        trc20_tokens: [
          {
            symbol: 'USDT',
            liquidity24h: 116088399.898259,
            holders_count: 22126100,
            tokenPriceLine: {
              data: [{ priceUsd: '1.0002796372275067' }],
            },
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        trc20_tokens: [
          {
            holder_address: 'TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb',
            balance: '9873546646139600',
            addressTag: 'Binance-Cold 2',
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token_transfers: [
          {
            transaction_id: 'TokenTx1',
            block_ts: 1710000500000,
            from_address: 'TH3N6kYXow3FUP8Giyjm344qpDgjpChQx7',
            to_address: 'TL5x9MtSnDy537FXKx53yAaHRRNdg9TkkA',
            quant: '11258727923280441931',
            contractRet: 'SUCCESS',
            tokenInfo: {
              tokenAbbr: 'USDJ',
              tokenName: 'JUST Stablecoin',
              tokenDecimal: 18,
            },
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify('44125091014.551106')));

    const intel = await fetchTronscanTokenIntel('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');

    expect(intel?.symbol).toBe('USDT');
    expect(intel?.holderCount).toBe(22132393);
    expect(intel?.priceUsd).toBeCloseTo(1.0002796372);
    expect(intel?.topHolders[0]?.owner).toBe('Binance-Cold 2');
    expect(intel?.recentActivity[0]?.symbol).toBe('USDJ');
    expect(intel?.totalSupply).toBeCloseTo(44125091014.551106);
  });
});
