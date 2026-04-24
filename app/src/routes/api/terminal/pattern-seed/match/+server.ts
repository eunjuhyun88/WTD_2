import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { postSeedSearchProxy } from '$lib/server/enginePlanes/search';
import type { SearchCandidate } from '$lib/contracts/search/scan';

type SeedSignal =
  | 'oi_spike'
  | 'dump_then_reclaim'
  | 'higher_low_reclaim'
  | 'short_funding_pressure'
  | 'long_funding_pressure'
  | 'volume_breakout';

interface SeedAssetInput {
  symbol: string;
  changePct15m: number;
  changePct1h: number;
  changePct4h: number;
  volumeRatio1h: number;
  oiChangePct1h: number;
  fundingRate: number;
}

interface MatchRequestBody {
  thesis?: string;
  assets?: SeedAssetInput[];
  snapshotNames?: string[];
  activeSymbol?: string;
  timeframe?: string;
}

interface MatchCandidate {
  symbol: string;
  source: 'board' | 'search';
  score: number;
  matchedSignals: SeedSignal[];
  missingSignals: SeedSignal[];
  summary: string;
}

const SEARCH_LIMIT = 8;
const FINAL_LIMIT = 12;
const SEARCH_TIMEFRAME_FILTERS = new Set(['15m', '1h', '4h', '1d']);

function parseSignals(thesis: string): SeedSignal[] {
  const t = thesis.toLowerCase();
  const signals = new Set<SeedSignal>();
  if (/(oi|open interest|미결|오아이).*(급등|증가|spike|surge)|급등.*(oi|open interest|미결|오아이)/.test(t)) {
    signals.add('oi_spike');
  }
  if (/(급락|덤프|하락|dump|flush).*(반등|회복|reclaim|재진입)|반등.*(급락|덤프|하락|dump|flush)/.test(t)) {
    signals.add('dump_then_reclaim');
  }
  if (/(저점.*높|higher low|우상향.*저점|저점 상향)/.test(t)) {
    signals.add('higher_low_reclaim');
  }
  if (/(숏펀|short funding|negative funding|음수 펀딩)/.test(t)) {
    signals.add('short_funding_pressure');
  }
  if (/(양펀|long funding|positive funding|양수 펀딩)/.test(t)) {
    signals.add('long_funding_pressure');
  }
  if (/(돌파|브레이크|breakout|빔|volume spike|거래량)/.test(t)) {
    signals.add('volume_breakout');
  }
  if (signals.size === 0) signals.add('volume_breakout');
  return [...signals];
}

function scoreBoardAsset(asset: SeedAssetInput, requested: SeedSignal[]): MatchCandidate {
  let score = 20;
  const matchedSignals: SeedSignal[] = [];
  const missingSignals: SeedSignal[] = [];

  for (const signal of requested) {
    switch (signal) {
      case 'oi_spike':
        if (asset.oiChangePct1h >= 2.5) {
          score += Math.min(24, 8 + asset.oiChangePct1h * 2.5);
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
      case 'dump_then_reclaim':
        if (asset.changePct4h <= -4 && asset.changePct1h > 0) {
          score += 22;
          matchedSignals.push(signal);
        } else if (asset.changePct4h <= -4) {
          score += 10;
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
      case 'higher_low_reclaim':
        if (asset.changePct1h > 0 && asset.changePct15m >= 0) {
          score += 16;
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
      case 'short_funding_pressure':
        if (asset.fundingRate < 0) {
          score += 12 + Math.min(8, Math.abs(asset.fundingRate) * 1500);
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
      case 'long_funding_pressure':
        if (asset.fundingRate > 0) {
          score += 12 + Math.min(8, Math.abs(asset.fundingRate) * 1500);
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
      case 'volume_breakout':
        if (asset.volumeRatio1h >= 1.5) {
          score += 14 + Math.min(8, (asset.volumeRatio1h - 1) * 6);
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
    }
  }

  return {
    symbol: asset.symbol,
    source: 'board',
    score: Math.round(Math.max(0, Math.min(100, score))),
    matchedSignals,
    missingSignals,
    summary: `4H ${asset.changePct4h >= 0 ? '+' : ''}${asset.changePct4h.toFixed(1)}% · OI ${asset.oiChangePct1h >= 0 ? '+' : ''}${asset.oiChangePct1h.toFixed(1)}% · Vol x${asset.volumeRatio1h.toFixed(2)}`,
  };
}

function resolveSearchTimeframeFilter(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SEARCH_TIMEFRAME_FILTERS.has(normalized) ? normalized : undefined;
}

function pickReferenceAsset(
  assets: SeedAssetInput[],
  boardMatches: MatchCandidate[],
  activeSymbol?: string,
): SeedAssetInput | null {
  const normalizedActive = typeof activeSymbol === 'string' ? activeSymbol.trim().toUpperCase() : '';
  if (normalizedActive) {
    const direct = assets.find((asset) => asset.symbol.toUpperCase() === normalizedActive);
    if (direct) return direct;
  }
  const bestSymbol = boardMatches
    .slice()
    .sort((a, b) => b.score - a.score)
    .at(0)?.symbol;
  if (!bestSymbol) return assets[0] ?? null;
  return assets.find((asset) => asset.symbol === bestSymbol) ?? assets[0] ?? null;
}

function buildSeedSignature(
  asset: SeedAssetInput | null,
  requestedSignals: SeedSignal[],
): Record<string, unknown> {
  if (!asset) {
    return {
      close_return_pct: requestedSignals.includes('dump_then_reclaim') ? -2.5 : 0.8,
      high_low_range_pct: requestedSignals.includes('dump_then_reclaim') ? 7.5 : 4.0,
      realized_volatility_pct: requestedSignals.includes('volume_breakout') ? 1.6 : 0.9,
      volume_ratio: requestedSignals.includes('volume_breakout') ? 1.8 : 1.0,
      funding_rate_mean: requestedSignals.includes('short_funding_pressure')
        ? -0.001
        : requestedSignals.includes('long_funding_pressure')
          ? 0.001
          : 0.0,
      funding_rate_last: requestedSignals.includes('short_funding_pressure')
        ? -0.001
        : requestedSignals.includes('long_funding_pressure')
          ? 0.001
          : 0.0,
      oi_change_1h_mean: requestedSignals.includes('oi_spike') ? 0.02 : 0.0,
      oi_change_1h_max: requestedSignals.includes('oi_spike') ? 0.05 : 0.0,
      oi_change_24h_mean: requestedSignals.includes('oi_spike') ? 0.04 : 0.0,
      trend: requestedSignals.includes('higher_low_reclaim') ? 'up' : 'flat',
    };
  }

  const closeReturnPct =
    clampNumber(asset.changePct4h * 0.65 + asset.changePct1h * 0.35, -25, 25) +
    (requestedSignals.includes('dump_then_reclaim') && asset.changePct4h < 0 && asset.changePct1h > 0
      ? 1.0
      : 0.0);

  const highLowRangePct = clampNumber(
    Math.max(
      Math.abs(asset.changePct4h),
      Math.abs(asset.changePct1h) * 1.8,
      Math.abs(asset.changePct15m) * 4.0,
    ) + (requestedSignals.includes('dump_then_reclaim') ? 2.0 : 0.0),
    0.5,
    60,
  );

  const realizedVolatilityPct = clampNumber(
    Math.abs(asset.changePct15m) * 0.2 +
      Math.abs(asset.changePct1h) * 0.12 +
      Math.abs(asset.changePct4h) * 0.06,
    0.2,
    12,
  );

  const volumeRatio = clampNumber(
    asset.volumeRatio1h + (requestedSignals.includes('volume_breakout') ? 0.25 : 0.0),
    0.1,
    6,
  );
  const normalizedOi1h = clampNumber(asset.oiChangePct1h / 100, -1, 3);
  const oiChange1hMean = requestedSignals.includes('oi_spike')
    ? clampNumber(normalizedOi1h * 0.65 + 0.005, -1, 3)
    : clampNumber(normalizedOi1h * 0.5, -1, 3);
  const oiChange1hMax = requestedSignals.includes('oi_spike')
    ? clampNumber(normalizedOi1h + 0.01, -1, 3)
    : clampNumber(normalizedOi1h, -1, 3);
  const oiChange24hMean = clampNumber(normalizedOi1h * 1.75, -1, 6);
  const fundingRateMean = clampNumber(
    asset.fundingRate +
      (requestedSignals.includes('short_funding_pressure') ? -0.00015 : 0) +
      (requestedSignals.includes('long_funding_pressure') ? 0.00015 : 0),
    -0.05,
    0.05,
  );
  const fundingRateLast = clampNumber(
    asset.fundingRate +
      (requestedSignals.includes('short_funding_pressure') ? -0.00025 : 0) +
      (requestedSignals.includes('long_funding_pressure') ? 0.00025 : 0),
    -0.05,
    0.05,
  );

  const trend =
    requestedSignals.includes('higher_low_reclaim') || asset.changePct1h > 0
      ? 'up'
      : asset.changePct4h < -1
        ? 'down'
        : 'flat';

  return {
    close_return_pct: roundNumber(closeReturnPct),
    high_low_range_pct: roundNumber(highLowRangePct),
    realized_volatility_pct: roundNumber(realizedVolatilityPct),
    volume_ratio: roundNumber(volumeRatio),
    funding_rate_mean: roundNumber(fundingRateMean),
    funding_rate_last: roundNumber(fundingRateLast),
    oi_change_1h_mean: roundNumber(oiChange1hMean),
    oi_change_1h_max: roundNumber(oiChange1hMax),
    oi_change_24h_mean: roundNumber(oiChange24hMean),
    trend,
  };
}

function adaptSearchCandidate(candidate: SearchCandidate, requested: SeedSignal[]): MatchCandidate | null {
  const payload = asRecord(candidate.payload);
  const signature = asRecord(payload.signature);
  const symbol = readString(candidate.symbol) ?? readString(payload.symbol);
  if (!symbol) return null;

  const matchedSignals = inferSearchSignals(signature, requested);
  const missingSignals = requested.filter((signal) => !matchedSignals.includes(signal));

  return {
    symbol,
    source: 'search',
    score: Math.round(clampNumber(candidate.score * 100, 0, 100)),
    matchedSignals,
    missingSignals,
    summary: formatSearchSummary(
      readString(candidate.timeframe) ?? readString(payload.timeframe),
      readString(payload.start_ts),
      readString(payload.end_ts),
      signature,
    ),
  };
}

function inferSearchSignals(signature: Record<string, unknown>, requested: SeedSignal[]): SeedSignal[] {
  const matched = new Set<SeedSignal>();
  const closeReturnPct = readNumber(signature.close_return_pct) ?? 0;
  const rangePct = readNumber(signature.high_low_range_pct) ?? 0;
  const volumeRatio = readNumber(signature.volume_ratio) ?? 0;
  const fundingRateMean = readNumber(signature.funding_rate_mean) ?? 0;
  const fundingRateLast = readNumber(signature.funding_rate_last) ?? fundingRateMean;
  const oiChange1hMean = readNumber(signature.oi_change_1h_mean) ?? 0;
  const oiChange1hMax = readNumber(signature.oi_change_1h_max) ?? oiChange1hMean;
  const trend = readString(signature.trend) ?? 'flat';

  for (const signal of requested) {
    switch (signal) {
      case 'oi_spike':
        if (oiChange1hMax >= 0.03 || oiChange1hMean >= 0.012) {
          matched.add(signal);
        }
        break;
      case 'dump_then_reclaim':
        if (rangePct >= 4.0 && closeReturnPct > -6.0) {
          matched.add(signal);
        }
        break;
      case 'higher_low_reclaim':
        if (trend === 'up' && closeReturnPct >= 0) {
          matched.add(signal);
        }
        break;
      case 'volume_breakout':
        if (volumeRatio >= 1.2) {
          matched.add(signal);
        }
        break;
      case 'short_funding_pressure':
        if (fundingRateMean <= -0.0001 || fundingRateLast <= -0.0002) {
          matched.add(signal);
        }
        break;
      case 'long_funding_pressure':
        if (fundingRateMean >= 0.0001 || fundingRateLast >= 0.0002) {
          matched.add(signal);
        }
        break;
    }
  }

  return [...matched];
}

function formatSearchSummary(
  timeframe: string | null,
  startTs: string | null,
  endTs: string | null,
  signature: Record<string, unknown>,
): string {
  const ret = readNumber(signature.close_return_pct);
  const volumeRatio = readNumber(signature.volume_ratio);
  const rangePct = readNumber(signature.high_low_range_pct);
  const oiChange1hMax = readNumber(signature.oi_change_1h_max);
  const fundingRateMean = readNumber(signature.funding_rate_mean);
  const parts = [
    timeframe ? timeframe.toUpperCase() : 'SEARCH',
    startTs && endTs ? `${formatShortTs(startTs)} -> ${formatShortTs(endTs)}` : null,
    ret == null ? null : `ret ${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`,
    rangePct == null ? null : `range ${rangePct.toFixed(1)}%`,
    volumeRatio == null ? null : `vol x${volumeRatio.toFixed(2)}`,
    oiChange1hMax == null ? null : `OI1h ${formatPct(oiChange1hMax)}`,
    fundingRateMean == null ? null : `fund ${formatSignedNumber(fundingRateMean, 4)}`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' · ');
}

function mergeCandidates(groups: MatchCandidate[][]): MatchCandidate[] {
  const deduped = new Map<string, MatchCandidate>();
  for (const candidate of groups
    .flat()
    .sort((a, b) => b.score - a.score || Number(b.source === 'search') - Number(a.source === 'search'))) {
    if (!deduped.has(candidate.symbol)) {
      deduped.set(candidate.symbol, candidate);
    }
  }
  return [...deduped.values()].slice(0, FINAL_LIMIT);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function roundNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatShortTs(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

function formatPct(value: number): string {
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function formatSignedNumber(value: number, digits: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const body = (await request.json()) as MatchRequestBody;
    const thesis = (body.thesis ?? '').trim();
    const requestedSignals = parseSignals(thesis);
    const assets = Array.isArray(body.assets) ? body.assets : [];

    const boardMatches = assets.map((asset) => scoreBoardAsset(asset, requestedSignals));
    const referenceAsset = pickReferenceAsset(assets, boardMatches, body.activeSymbol);
    const referenceSignature = buildSeedSignature(referenceAsset, requestedSignals);

    const searchResult = await postSeedSearchProxy(fetch, {
      timeframe: resolveSearchTimeframeFilter(body.timeframe),
      signature: referenceSignature,
      limit: SEARCH_LIMIT,
    });

    const searchMatches = (searchResult?.candidates ?? [])
      .map((candidate) => adaptSearchCandidate(candidate, requestedSignals))
      .filter((candidate): candidate is MatchCandidate => candidate !== null);

    return json({
      ok: true,
      seed: {
        thesis,
        requestedSignals,
        snapshotCount: Array.isArray(body.snapshotNames) ? body.snapshotNames.length : 0,
        referenceSymbol: referenceAsset?.symbol ?? null,
        referenceSignature,
        searchStatus: searchResult?.status ?? 'local_fallback',
      },
      candidates: mergeCandidates([searchMatches, boardMatches]),
      scannedAt: Date.now(),
    });
  } catch (error) {
    return json(
      { ok: false, error: `Failed to match pattern seed: ${String(error)}` },
      { status: 500 },
    );
  }
};
