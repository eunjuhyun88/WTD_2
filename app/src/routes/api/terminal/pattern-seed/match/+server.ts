import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runOpportunityScan, type OpportunityScore } from '$lib/engine/opportunityScanner';

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
}

interface MatchCandidate {
  symbol: string;
  source: 'board' | 'scan';
  score: number;
  matchedSignals: SeedSignal[];
  missingSignals: SeedSignal[];
  summary: string;
}

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

function scoreScanCoin(coin: OpportunityScore, requested: SeedSignal[]): MatchCandidate {
  let score = Math.min(100, coin.totalScore);
  const matchedSignals: SeedSignal[] = [];
  const missingSignals: SeedSignal[] = [];

  for (const signal of requested) {
    switch (signal) {
      case 'volume_breakout': {
        const hasVolumeTag = coin.alerts.some((alert) => /거래량|volume|스파이크|spike/i.test(alert));
        if (hasVolumeTag || coin.volumeScore >= 12) {
          score += 10;
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
      }
      case 'dump_then_reclaim':
        if (coin.change24h <= -5 && coin.change1h > 0) {
          score += 12;
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
      case 'higher_low_reclaim':
        if (coin.change1h > 0 && coin.direction === 'long') {
          score += 8;
          matchedSignals.push(signal);
        } else {
          missingSignals.push(signal);
        }
        break;
      case 'oi_spike':
      case 'short_funding_pressure':
      case 'long_funding_pressure':
        missingSignals.push(signal);
        break;
    }
  }

  return {
    symbol: `${coin.symbol}USDT`,
    source: 'scan',
    score: Math.round(Math.max(0, Math.min(100, score))),
    matchedSignals,
    missingSignals,
    summary: `24H ${coin.change24h >= 0 ? '+' : ''}${coin.change24h.toFixed(1)}% · score ${coin.totalScore.toFixed(0)} · ${coin.reasons[0] ?? 'momentum setup'}`,
  };
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as MatchRequestBody;
    const thesis = (body.thesis ?? '').trim();
    const requestedSignals = parseSignals(thesis);
    const assets = Array.isArray(body.assets) ? body.assets : [];

    const boardMatches = assets.map((asset) => scoreBoardAsset(asset, requestedSignals));
    const scanResult = await runOpportunityScan(20);
    const scanMatches = scanResult.coins.slice(0, 20).map((coin) => scoreScanCoin(coin, requestedSignals));

    return json({
      ok: true,
      seed: {
        thesis,
        requestedSignals,
        snapshotCount: Array.isArray(body.snapshotNames) ? body.snapshotNames.length : 0,
      },
      candidates: [...boardMatches, ...scanMatches].sort((a, b) => b.score - a.score).slice(0, 12),
      scannedAt: Date.now(),
    });
  } catch (error) {
    return json(
      { ok: false, error: `Failed to match pattern seed: ${String(error)}` },
      { status: 500 },
    );
  }
};
