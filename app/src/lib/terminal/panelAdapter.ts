import type { TerminalAsset, TerminalEvidence, TerminalSource, TerminalVerdict } from '$lib/types/terminal';
import type { AnalyzeEnvelope, DerivativesEnvelope, SnapshotEnvelope } from '$lib/contracts/terminalBackend';
import type { MemoryRerankRecord } from '$lib/api/terminalBackend';

/**
 * Terminal panel adapter.
 *
 * Backend field mapping authority:
 * - docs/domains/terminal-backend-mapping.md
 *
 * Keep this adapter as a pure UI-shape transformer:
 * raw route payloads -> stable panel view model.
 */
type Tone = 'bull' | 'bear' | 'neutral' | 'warn' | 'info';

export interface PanelHeaderModel {
  symbol: string;
  timeframe: string;
  biasLabel: string;
  priceLabel: string;
  changeLabel: string;
  changeTone: Tone;
  sourceCount: number;
}

export interface PanelConclusionModel {
  bias: string;
  action: string;
  invalidation: string;
}

export interface PanelFlowRow {
  metric: string;
  value: string;
  interpretation: string;
  tone: Tone;
}

export interface PanelActionRow {
  label: string;
  value: string;
  tone: Tone;
}

export interface EntryLevelRow {
  label: string;
  value: number;
  distancePct: number;
  tone: Tone;
}

export interface EntryPlanModel {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  rr: number;
  confidencePct: number;
  levels: EntryLevelRow[];
}

export interface PanelViewModel {
  header: PanelHeaderModel;
  conclusion: PanelConclusionModel;
  entry: EntryPlanModel;
  flowRows: PanelFlowRow[];
  riskRows: PanelActionRow[];
  summaryBullets: string[];
}

export type PanelAnalyzeData = AnalyzeEnvelope & {
  timeframe?: string;
  p_win?: number;
  blocks_triggered?: string[];
  ensemble_triggered?: boolean;
  snapshot?: AnalyzeEnvelope['snapshot'] & {
    rsi14?: number;
    ema_alignment?: string;
    htf_structure?: string;
  };
  backendSnapshot?: SnapshotEnvelope | null;
  derivativesSnapshot?: DerivativesEnvelope | null;
  derivatives?: { funding_rate?: number };
};

export interface TerminalDecisionBundle {
  asset: TerminalAsset;
  verdict: TerminalVerdict;
  evidence: TerminalEvidence[];
  sources: TerminalSource[];
}

function asToneFromState(state: TerminalEvidence['state']): Tone {
  if (state === 'bullish') return 'bull';
  if (state === 'bearish') return 'bear';
  if (state === 'warning') return 'warn';
  return 'neutral';
}

function priceLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value >= 1000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : value.toFixed(4);
}

function changeLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function pctDistance(base: number, target: number): number {
  if (!base || !Number.isFinite(base) || !Number.isFinite(target)) return 0;
  return ((target - base) / base) * 100;
}

function sourceKindToCategory(kind: 'market' | 'derived' | 'model' | 'news'): TerminalSource['category'] {
  if (kind === 'market') return 'Market';
  if (kind === 'news') return 'News';
  if (kind === 'model') return 'Model';
  return 'Derived';
}

const LAYER_LABELS: Record<string, string> = {
  wyckoff: 'Wyckoff', mtf: 'MTF Conf', breakout: 'Breakout',
  vsurge: 'Vol Surge', cvd: 'CVD', flow: 'FR / Flow',
  liq_est: 'Liq Est', real_liq: 'Real Liq', oi: 'OI Squeeze',
  basis: 'Basis', bb14: 'BB(14)', bb16: 'BB Sqz', atr: 'ATR',
  ob: 'Order Book', onchain: 'On-chain', fg: 'Fear/Greed',
  kimchi: 'Kimchi', sector: 'Sector',
};

const LAYER_ORDER = [
  'wyckoff', 'mtf', 'cvd', 'vsurge', 'breakout',
  'flow', 'oi', 'real_liq', 'liq_est', 'basis',
  'bb14', 'bb16', 'atr', 'fg', 'onchain', 'kimchi', 'sector', 'ob',
];

function deepBias(verdict: string): 'bullish' | 'bearish' | 'neutral' {
  if (!verdict) return 'neutral';
  if (verdict.includes('BULL')) return 'bullish';
  if (verdict.includes('BEAR')) return 'bearish';
  return 'neutral';
}

function deepConfidence(score: number): 'high' | 'medium' | 'low' {
  const abs = Math.abs(score);
  return abs >= 50 ? 'high' : abs >= 20 ? 'medium' : 'low';
}

function deepAction(verdict: string, ensDir: string): string {
  if (verdict === 'STRONG BULL' || ensDir === 'strong_long') return 'Strong buy on pullback';
  if (verdict === 'BULLISH' || ensDir === 'long') return 'Buy on pullback';
  if (verdict === 'BEARISH' || ensDir === 'short') return 'Avoid / short';
  if (verdict === 'STRONG BEAR' || ensDir === 'strong_short') return 'Strong short / avoid';
  return 'Wait for clarity';
}

export function buildAssetFromAnalysis(symbol: string, analysisData?: PanelAnalyzeData | null): TerminalAsset {
  const deep = analysisData?.deep as any;
  const snap = analysisData?.snapshot ?? {};
  const ens = analysisData?.ensemble ?? {};
  const isMarketOnly = analysisData?.mode === 'market-only';
  const price = analysisData?.price ?? snap?.last_close ?? 0;
  const verdict = String(deep?.verdict ?? '');
  const score = deep?.total_score ?? 0;
  const bias = deepBias(verdict) || (ens.direction?.includes('long') ? 'bullish' : ens.direction?.includes('short') ? 'bearish' : 'neutral');
  const confidence = isMarketOnly ? 'low' : deepConfidence(score);
  const stopLong = deep?.atr_levels?.stop_long;
  const invalidation = stopLong ? `$${Number(stopLong).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
  const sources = buildSourcesFromAnalysis(analysisData);
  const tfArrow = (val: string | undefined, pos: string, neg: string): '↑' | '↓' | '→' => (val === pos ? '↑' : val === neg ? '↓' : '→');
  const mtfMeta = deep?.layers?.mtf?.meta ?? {};

  return {
    symbol,
    venue: 'USDT Perp',
    lastPrice: price,
    changePct15m: 0,
    changePct1h: 0,
    changePct4h: analysisData?.change24h ?? 0,
    volumeRatio1h: snap.vol_ratio_3 ?? deep?.layers?.vsurge?.meta?.vol_ratio ?? 1,
    oiChangePct1h: (snap.oi_change_1h ?? 0) * 100,
    fundingRate: snap.funding_rate ?? analysisData?.derivatives?.funding_rate ?? analysisData?.derivativesSnapshot?.funding ?? 0,
    fundingPercentile7d: 50,
    spreadBps: 0,
    bias,
    confidence,
    action: isMarketOnly ? 'Track market context' : deepAction(verdict, ens.direction ?? ''),
    invalidation,
    sources,
    freshnessStatus: isMarketOnly ? 'disconnected' : 'recent',
    tf15m: tfArrow((snap as any).ema_alignment ?? mtfMeta.tf15m, 'bullish', 'bearish'),
    tf1h: tfArrow((snap as any).ema_alignment ?? mtfMeta.tf1h, 'bullish', 'bearish'),
    tf4h: tfArrow((snap as any).htf_structure ?? mtfMeta.tf4h, 'uptrend', 'downtrend'),
  };
}

export function buildVerdictFromAnalysis(analysisData?: PanelAnalyzeData | null): TerminalVerdict | null {
  const deep = analysisData?.deep as any;
  const ens = analysisData?.ensemble;
  if (deep?.verdict) {
    const score = deep.total_score ?? 0;
    const verdict = String(deep.verdict);
    const direction: TerminalVerdict['direction'] = deepBias(verdict);
    const topLayers = deep.layers
      ? Object.entries(deep.layers as Record<string, any>)
          .filter(([, lr]) => lr.score !== 0)
          .sort(([, a], [, b]) => Math.abs(b.score) - Math.abs(a.score))
          .slice(0, 3)
          .map(([, lr]) => (lr.sigs as Array<{ t: string }>)[0]?.t ?? '')
          .filter(Boolean)
          .join(' · ')
      : verdict;

    return {
      direction,
      confidence: deepConfidence(score),
      reason: topLayers || verdict,
      against: analysisData?.ensemble?.block_analysis?.disqualifiers || [],
      action: deepAction(verdict, ens?.direction ?? ''),
      invalidation: deep.atr_levels?.stop_long
        ? `Stop $${Number(deep.atr_levels.stop_long).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
        : '',
      updatedAt: Date.now(),
    };
  }

  if (!ens) return null;
  const dir = ens.direction ?? '';
  const ensembleScore = ens.ensemble_score ?? 0;
  return {
    direction: dir.includes('long') ? 'bullish' : dir.includes('short') ? 'bearish' : 'neutral',
    confidence: Math.abs(ensembleScore) > 0.6 ? 'high' : Math.abs(ensembleScore) > 0.3 ? 'medium' : 'low',
    reason: ens.reason || 'Analysis in progress',
    against: ens.block_analysis?.disqualifiers || [],
    action: deepAction('', dir),
    invalidation: '',
    updatedAt: Date.now(),
  };
}

export function buildEvidenceFromAnalysis(analysisData?: PanelAnalyzeData | null): TerminalEvidence[] {
  const deep = analysisData?.deep as any;
  if (deep?.layers) {
    const ev: TerminalEvidence[] = [];
    for (const name of LAYER_ORDER) {
      const lr = (deep.layers as Record<string, any>)[name];
      if (!lr) continue;
      if (lr.score === 0 && lr.sigs.length === 0) continue;
      const topSig = (lr.sigs as Array<{ t: string; type: string }>)[0];
      const state: TerminalEvidence['state'] =
        lr.score >= 5 ? 'bullish' : lr.score <= -5 ? 'bearish'
          : topSig?.type === 'warn' ? 'warning'
            : topSig?.type === 'bull' ? 'bullish'
              : topSig?.type === 'bear' ? 'bearish' : 'neutral';
      ev.push({
        metric: LAYER_LABELS[name] ?? name,
        value: (lr.score >= 0 ? '+' : '') + lr.score,
        delta: '',
        interpretation: topSig?.t?.slice(0, 70) ?? '',
        state,
        sourceCount: lr.sigs.length,
      });
    }
    return ev;
  }

  const s = analysisData?.snapshot;
  if (!s) return [];
  const ev: TerminalEvidence[] = [];
  if (s.rsi14 != null) ev.push({ metric: 'RSI 14', value: s.rsi14.toFixed(1), delta: '', interpretation: s.rsi14 > 70 ? 'Overbought' : s.rsi14 < 30 ? 'Oversold' : 'Neutral', state: s.rsi14 > 70 ? 'warning' : s.rsi14 < 30 ? 'bullish' : 'neutral', sourceCount: 1 });
  if (s.funding_rate != null) ev.push({ metric: 'Funding', value: (s.funding_rate * 100).toFixed(3) + '%', delta: '', interpretation: s.funding_rate > 0.01 ? 'Longs paying' : s.funding_rate < -0.005 ? 'Shorts paying' : 'Neutral', state: s.funding_rate > 0.015 ? 'warning' : 'neutral', sourceCount: 1 });
  if (s.oi_change_1h != null) ev.push({ metric: 'OI 1H', value: (s.oi_change_1h >= 0 ? '+' : '') + (s.oi_change_1h * 100).toFixed(2) + '%', delta: '', interpretation: s.oi_change_1h > 0.02 ? 'Expanding' : s.oi_change_1h < -0.02 ? 'Contracting' : 'Stable', state: s.oi_change_1h > 0.02 ? 'bullish' : s.oi_change_1h < -0.02 ? 'bearish' : 'neutral', sourceCount: 1 });
  if (s.cvd_state) ev.push({ metric: 'CVD', value: s.cvd_state, delta: '', interpretation: s.cvd_state === 'buying' ? 'Aggressive buys' : s.cvd_state === 'selling' ? 'Aggressive sells' : 'Balanced', state: s.cvd_state === 'buying' ? 'bullish' : s.cvd_state === 'selling' ? 'bearish' : 'neutral', sourceCount: 1 });
  if (s.regime) ev.push({ metric: 'Regime', value: s.regime.toUpperCase(), delta: '', interpretation: s.regime, state: s.regime === 'risk_on' ? 'bullish' : s.regime === 'risk_off' ? 'bearish' : 'neutral', sourceCount: 1 });
  if (s.vol_ratio_3 != null) ev.push({ metric: 'Volume', value: s.vol_ratio_3.toFixed(1) + 'x', delta: '', interpretation: s.vol_ratio_3 > 2 ? 'Spike' : s.vol_ratio_3 > 1.2 ? 'Above avg' : 'Below avg', state: s.vol_ratio_3 > 2 ? 'warning' : 'neutral', sourceCount: 1 });
  return ev;
}

export function buildSourcesFromAnalysis(analysisData?: PanelAnalyzeData | null): TerminalSource[] {
  if (analysisData?.sources?.length) {
    return analysisData.sources.map((source) => ({
      label: source.name,
      category: sourceKindToCategory(source.kind),
      freshness: 'recent',
      updatedAt: Date.parse(source.timestamp) || Date.now(),
      method: source.detail,
    }));
  }

  const now = Date.now();
  const sourceMap = analysisData?.backendSnapshot?.sources as Record<string, boolean> | undefined;
  const mapped: TerminalSource[] = [];
  if (sourceMap && typeof sourceMap === 'object') {
    const push = (key: string, label: string, category: TerminalSource['category']) => {
      if (!sourceMap[key]) return;
      mapped.push({ label, category, freshness: 'recent', updatedAt: now });
    };
    push('binance', 'Binance Spot/Perp', 'Market');
    push('derivatives', 'Coinalyze Derivatives', 'Market');
    push('coinmarketcap', 'CoinMarketCap', 'Derived');
    push('coingecko', 'CoinGecko', 'Derived');
    push('defillama', 'DefiLlama', 'Derived');
    push('fearGreed', 'Fear & Greed', 'Derived');
    push('news', 'News Feed', 'News');
    push('cryptoquant', 'CryptoQuant', 'Derived');
    push('etherscan', 'Etherscan Netflow', 'Derived');
    push('lunarcrush', 'LunarCrush', 'Derived');
  }
  mapped.push({
    label: 'Market Engine',
    category: 'Model',
    freshness: analysisData?.mode === 'market-only' ? 'disconnected' : 'recent',
    updatedAt: now,
    method: analysisData?.deep?.verdict ? `17-layer pipeline · ${analysisData.deep.verdict}` : 'Feature calc + ensemble',
  });
  return mapped;
}

export function buildPanelModel(input: {
  analysisData?: PanelAnalyzeData | null;
  backendSnapshot?: SnapshotEnvelope | null;
  derivativesSnapshot?: DerivativesEnvelope | null;
  verdict?: TerminalVerdict | null;
  evidence: TerminalEvidence[];
  sources: TerminalSource[];
  pWin: number | null;
  panelSymbol: string;
  panelTimeframe: string;
}): PanelViewModel {
  const {
    analysisData,
    backendSnapshot,
    derivativesSnapshot,
    verdict,
    evidence,
    sources,
    pWin,
    panelSymbol,
    panelTimeframe,
  } = input;
  const price = analysisData?.price ?? analysisData?.snapshot?.last_close ?? 0;
  const change =
    analysisData?.change24h
    ?? analysisData?.snapshot?.change24h
    ?? analysisData?.snapshot?.price_change_pct_24h
    ?? null;

  const atrLevels = analysisData?.deep?.atr_levels ?? {};
  const mergedBackendSnapshot = backendSnapshot ?? analysisData?.backendSnapshot;
  const mergedDerivatives = derivativesSnapshot ?? analysisData?.derivativesSnapshot;
  const backendSourceCount = Object.values(mergedBackendSnapshot?.sources ?? {}).filter(Boolean).length;
  const fundingRate =
    analysisData?.snapshot?.funding_rate
    ?? analysisData?.derivatives?.funding_rate
    ?? mergedDerivatives?.funding
    ?? 0;
  const entry = Number(analysisData?.entryPlan?.entry ?? atrLevels.entry_long ?? atrLevels.entry ?? (price ? price * 0.994 : 0));
  const stop = Number(analysisData?.entryPlan?.stop ?? atrLevels.stop_long ?? atrLevels.stop ?? (price ? price * 0.988 : 0));
  const targets = analysisData?.entryPlan?.targets ?? [];
  const tp1 = Number(targets.find((target) => target.label === 'TP1')?.price ?? atrLevels.tp1_long ?? atrLevels.target ?? (price ? price * 1.008 : 0));
  const tp2 = Number(targets.find((target) => target.label === 'TP2')?.price ?? atrLevels.tp2_long ?? (price ? price * 1.016 : 0));
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(tp2 - entry);
  const rr = Number(analysisData?.entryPlan?.riskReward ?? (risk > 0 ? Math.max(0.1, reward / risk) : 0));
  const confidencePct =
    analysisData?.entryPlan?.confidencePct
    ?? (pWin != null ? pWin * 100 : verdict?.confidence === 'high' ? 72 : verdict?.confidence === 'medium' ? 58 : 44);
  const explicitRisk = analysisData?.riskPlan;
  const explicitFlow = analysisData?.flowSummary;

  const topEvidence = evidence.slice(0, 4);
  const summaryBullets = topEvidence.map((item) => `${item.metric}: ${item.value} - ${item.interpretation || 'context'}`);
  if (backendSourceCount > 0) {
    summaryBullets.push(`Backend sources active: ${backendSourceCount}`);
  }
  if (Number.isFinite(fundingRate)) {
    summaryBullets.push(`Funding: ${(fundingRate * 100).toFixed(3)}%`);
  }
  if (analysisData?.sources?.length) {
    summaryBullets.push(`Sources: ${analysisData.sources.map((source) => source.name).join(', ')}`);
  }

  return {
    header: {
      symbol: panelSymbol,
      timeframe: panelTimeframe,
      biasLabel:
        verdict?.direction === 'bullish'
          ? 'LONG BIAS'
          : verdict?.direction === 'bearish'
            ? 'SHORT BIAS'
            : 'NEUTRAL',
      priceLabel: priceLabel(price),
      changeLabel: changeLabel(change),
      changeTone: change == null ? 'neutral' : change >= 0 ? 'bull' : 'bear',
      sourceCount: sources.length + evidence.reduce((sum, item) => sum + item.sourceCount, 0) + backendSourceCount,
    },
    conclusion: {
      bias: verdict?.direction ? verdict.direction.toUpperCase() : '-',
      action: verdict?.action || '-',
      invalidation: verdict?.invalidation || '-',
    },
    entry: {
      entry,
      stop,
      tp1,
      tp2,
      rr,
      confidencePct,
      levels: [
        { label: 'TP2', value: tp2, distancePct: pctDistance(price, tp2), tone: 'bull' },
        { label: 'TP1', value: tp1, distancePct: pctDistance(price, tp1), tone: 'bull' },
        { label: 'NOW', value: price, distancePct: 0, tone: 'info' },
        { label: 'ENTRY', value: entry, distancePct: pctDistance(price, entry), tone: 'bull' },
        { label: 'STOP', value: stop, distancePct: pctDistance(price, stop), tone: 'bear' },
      ],
    },
    flowRows: explicitFlow
      ? [
          { metric: 'CVD', value: explicitFlow.cvd ?? 'n/a', interpretation: 'aggressive flow state', tone: 'info' as Tone },
          { metric: 'OI', value: explicitFlow.oi ?? 'n/a', interpretation: 'open interest context', tone: 'info' as Tone },
          { metric: 'Funding', value: explicitFlow.funding ?? 'n/a', interpretation: 'crowding / carry', tone: 'warn' as Tone },
          {
            metric: 'Taker',
            value: explicitFlow.takerBuyRatio != null ? explicitFlow.takerBuyRatio.toFixed(2) : 'n/a',
            interpretation: 'taker buy / sell ratio',
            tone: explicitFlow.takerBuyRatio != null && explicitFlow.takerBuyRatio >= 1 ? 'bull' : 'bear',
          },
        ]
      : topEvidence.map((item) => ({
          metric: item.metric,
          value: item.value,
          interpretation: item.interpretation || 'signal context',
          tone: asToneFromState(item.state),
        })),
    riskRows: [
      {
        label: 'Bias',
        value: explicitRisk?.bias ?? (verdict?.direction ? `${verdict.direction} continuation` : 'Neutral'),
        tone: explicitRisk?.bias?.includes('bull') ? 'bull' : explicitRisk?.bias?.includes('bear') ? 'bear' : verdict?.direction === 'bullish' ? 'bull' : verdict?.direction === 'bearish' ? 'bear' : 'neutral',
      },
      { label: 'Action', value: verdict?.action || 'Wait for confirmation', tone: 'info' },
      { label: 'Avoid', value: explicitRisk?.avoid ?? (verdict?.against?.[0] || 'Chasing extension'), tone: 'warn' },
      { label: 'Risk Trigger', value: explicitRisk?.riskTrigger ?? `Funding ${(fundingRate * 100).toFixed(3)}%`, tone: 'warn' },
      { label: 'Invalidation', value: explicitRisk?.invalidation ?? (verdict?.invalidation || '-'), tone: 'bear' },
      { label: 'Crowding', value: explicitRisk?.crowding ?? `Active ${panelTimeframe}`, tone: 'neutral' },
    ],
    summaryBullets,
  };
}

export function buildTerminalDecisionBundle(symbol: string, analysisData?: PanelAnalyzeData | null): TerminalDecisionBundle {
  const asset = buildAssetFromAnalysis(symbol, analysisData);
  const verdict = buildVerdictFromAnalysis(analysisData) ?? {
    direction: 'neutral',
    confidence: 'low',
    reason: 'Analysis pending…',
    against: [],
    action: 'Wait for clarity',
    invalidation: '—',
    updatedAt: Date.now(),
  };
  const evidence = buildEvidenceFromAnalysis(analysisData);
  return {
    asset,
    verdict,
    evidence,
    sources: asset.sources,
  };
}

export function rerankEvidenceWithMemory(
  evidence: TerminalEvidence[],
  rankedRecords: MemoryRerankRecord[],
): TerminalEvidence[] {
  if (evidence.length <= 1 || rankedRecords.length === 0) return evidence;
  const scoreMap = new Map(rankedRecords.map((item) => [item.id.toLowerCase(), item.score]));
  return [...evidence].sort((a, b) => {
    const scoreA = scoreMap.get(a.metric.toLowerCase()) ?? Number.NEGATIVE_INFINITY;
    const scoreB = scoreMap.get(b.metric.toLowerCase()) ?? Number.NEGATIVE_INFINITY;
    if (scoreA === scoreB) return 0;
    return scoreB - scoreA;
  });
}
