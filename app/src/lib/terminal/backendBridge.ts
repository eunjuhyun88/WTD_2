/**
 * Terminal backend bridge:
 * central place for FE-only enrichment of backend payloads.
 *
 * Rule: no business scoring logic here.
 * Only normalize/compose route payloads for UI consumption.
 */

export interface TerminalMicrostructure {
  spreadBps: number;
  imbalancePct: number;
  takerRatio: number | null;
  depth: {
    ratio: number;
    bids: Array<{ price: number; weight: number }>;
    asks: Array<{ price: number; weight: number }>;
  };
  liqTotals: {
    longUsd: number;
    shortUsd: number;
  };
  liqClusters: Array<{
    side: 'SELL' | 'BUY';
    price: number;
    distancePct: number;
    usd: number;
  }>;
}

export function buildTerminalMicrostructure(input: {
  basePrice: number;
  funding: number | null;
  lsRatio: number | null;
  liqLong24h: number;
  liqShort24h: number;
}): TerminalMicrostructure {
  const { basePrice, funding, lsRatio, liqLong24h, liqShort24h } = input;
  const imbalance = lsRatio != null ? (lsRatio - 1) / 4 : 0;
  const depthRatio = Math.max(0.7, Math.min(1.3, 1 + imbalance));
  const bidWeights = [0.92, 0.72, 0.58, 0.42, 0.28];
  const askWeights = [0.9, 0.68, 0.52, 0.38, 0.26];
  const spreadBps = Math.max(1.1, Math.min(6.8, (funding ?? 0) * 10_000 + 2.2));
  const spread = spreadBps / 10_000;

  return {
    spreadBps,
    imbalancePct: (depthRatio - 1) * 100,
    takerRatio: lsRatio ?? null,
    depth: {
      ratio: depthRatio,
      bids: bidWeights.map((weight, index) => ({
        price: basePrice * (1 - spread * (index + 1.2)),
        weight,
      })),
      asks: askWeights.map((weight, index) => ({
        price: basePrice * (1 + spread * (index + 1.2)),
        weight,
      })),
    },
    liqTotals: {
      longUsd: liqLong24h,
      shortUsd: liqShort24h,
    },
    liqClusters: [
      {
        side: 'SELL',
        price: basePrice * 0.985,
        distancePct: -1.5,
        usd: liqLong24h,
      },
      {
        side: 'BUY',
        price: basePrice * 1.012,
        distancePct: 1.2,
        usd: liqShort24h,
      },
    ],
  };
}

export function enrichAnalyzePayload(input: {
  baseData: any;
  snapshotPayload: any | null;
  derivativesPayload: any | null;
}): any {
  const { baseData, snapshotPayload, derivativesPayload } = input;
  if (!snapshotPayload && !derivativesPayload) return baseData;

  const basePrice = baseData?.price ?? baseData?.snapshot?.last_close ?? 0;
  const microstructure = buildTerminalMicrostructure({
    basePrice,
    funding: derivativesPayload?.funding ?? null,
    lsRatio: derivativesPayload?.lsRatio ?? null,
    liqLong24h: derivativesPayload?.liqLong24h ?? 0,
    liqShort24h: derivativesPayload?.liqShort24h ?? 0,
  });

  return {
    ...baseData,
    microstructure,
    backendSnapshot: snapshotPayload,
    derivativesSnapshot: derivativesPayload,
  };
}
