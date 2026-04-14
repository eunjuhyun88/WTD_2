<script lang="ts">
  /**
   * Terminal — Bloomberg-style 3-column decision cockpit.
   *
   * Desktop layout:
   *   [TerminalCommandBar — symbol, TF, shell toggles, layout]
   *   [TerminalLeftRail][ChartZone + AnalysisRail]
   *   [TerminalBottomDock — multimodal input]
   *
   * Mobile layout:
   *   [TerminalCommandBar]
   *   [MobileActiveBoard — single full asset view]
   *   [MobileCommandDock — fixed bottom input + quick chips]
   *   [MobileDetailSheet — bottom sheet for 5-tab detail]
   */
  import { onMount, onDestroy, untrack } from 'svelte';
  import { activePairState, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';
  import { normalizeTimeframe } from '$lib/utils/timeframe';
  import { buildCanonicalHref } from '$lib/seo/site';
  import { get } from 'svelte/store';
  import { douniRuntimeStore } from '$lib/stores/douniRuntime';

  import TerminalCommandBar from '../../components/terminal/workspace/TerminalCommandBar.svelte';
  import TerminalLeftRail from '../../components/terminal/workspace/TerminalLeftRail.svelte';
  import TerminalBottomDock from '../../components/terminal/workspace/TerminalBottomDock.svelte';
  import TerminalContextPanel from '../../components/terminal/workspace/TerminalContextPanel.svelte';
  import VerdictCard from '../../components/terminal/workspace/VerdictCard.svelte';
  import ChartBoard from '../../components/terminal/workspace/ChartBoard.svelte';
  import PatternStatusBar from '../../components/terminal/workspace/PatternStatusBar.svelte';
  import EvidenceStrip from '../../components/terminal/workspace/EvidenceStrip.svelte';
  import SaveSetupModal from '../../components/terminal/workspace/SaveSetupModal.svelte';

  // Mobile components
  import MobileActiveBoard from '../../components/terminal/mobile/MobileActiveBoard.svelte';
  import MobileDetailSheet from '../../components/terminal/mobile/MobileDetailSheet.svelte';
  import MobileCommandDock from '../../components/terminal/mobile/MobileCommandDock.svelte';

  import type { TerminalAsset, TerminalVerdict, TerminalEvidence, TerminalSource } from '$lib/types/terminal';

  // ─── State ──────────────────────────────────────────────────

  let layout = $state<'hero3' | 'compare2x2' | 'focus'>('focus');
  let boardAssets = $state<TerminalAsset[]>([]);
  let verdictMap = $state<Record<string, TerminalVerdict>>({});
  let evidenceMap = $state<Record<string, TerminalEvidence[]>>({});
  let activeSymbol = $state('');

  let analysisData = $state<any>(null);
  let analysisDataMap = $state<Record<string, any>>({});
  let newsData = $state<any>(null);

  let flowBias = $state<'LONG' | 'SHORT' | 'NEUTRAL'>('NEUTRAL');
  let trendingData = $state<any>(null);
  let scannerAlerts = $state<any[]>([]);
  let ohlcvBars = $state<any[]>([]);
  let layerBarsMap = $state<Record<string, any[]>>({});

  let isStreaming = $state(false);
  let streamText = $state('');
  let loadingSymbols = $state(new Set<string>());

  // ── Pattern Engine state ───────────────────────────────────
  interface PatternPhaseRow { slug: string; phaseName: string; symbols: string[]; }
  let patternPhases = $state<PatternPhaseRow[]>([]);
  interface PatternTransitionAlert {
    id: string;
    symbol: string;
    slug: string;
    phase: string;
    createdAt: number;
  }
  let patternTransitionAlerts = $state<PatternTransitionAlert[]>([]);

  // ── Capture modal ──────────────────────────────────────────
  let showCaptureModal = $state(false);
  let showLeftRail = $state(true);
  let showAnalysisRail = $state(true);
  let activeAnalysisTab = $state<'summary' | 'entry' | 'risk' | 'catalysts' | 'metrics'>('summary');

  // ── Chart price-level overlays (entry / target / stop) ───────
  // Extracted from deep.atr_levels after each analysis; passed to ChartBoard
  interface VerdictLevels { entry?: number; target?: number; stop?: number; }
  let chartLevels = $state<VerdictLevels>({});

  function formatCompactUsd(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  }

  function formatSignedPct(value: number | null | undefined, digits = 1): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
  }

  function extractLevels(data: any): VerdictLevels {
    const deep = data?.deep;
    if (!deep?.atr_levels) return {};
    const bias = _deepBias(deep.verdict ?? '');
    const price = data?.price ?? data?.snapshot?.last_close;
    if (bias === 'bearish') {
      return {
        entry:  price  ? Number(price)                            : undefined,
        target: deep.atr_levels.tp1_short  ? Number(deep.atr_levels.tp1_short)  : undefined,
        stop:   deep.atr_levels.stop_short ? Number(deep.atr_levels.stop_short) : undefined,
      };
    }
    return {
      entry:  price  ? Number(price)                           : undefined,
      target: deep.atr_levels.tp1_long  ? Number(deep.atr_levels.tp1_long)  : undefined,
      stop:   deep.atr_levels.stop_long ? Number(deep.atr_levels.stop_long) : undefined,
    };
  }

  type HistoryEntry = { role: 'user' | 'assistant'; content: string };
  let chatHistory = $state<HistoryEntry[]>([]);

  /** Fingerprint of the snapshot used in the last completed AI response */
  let prevSnapshotFingerprint = $state('');

  // Narrow deriveds: only pair+tf — price changes must NOT re-trigger $effect
  const gPair = $derived($activePairState.pair);
  const gTf   = $derived($activePairState.timeframe);

  // ─── Helpers ────────────────────────────────────────────────

  function pairToSymbol(pair: string): string {
    return pair.replace('/', '');
  }

  function symbolToTF(tf: string): string {
    // Normalize both "4H" (CommandBar format) and "4h" (chart format) → lowercase chart format
    const norm = tf.toLowerCase();
    const valid = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w'];
    return valid.includes(norm) ? norm : '4h';
  }

  function buildStubAsset(symbol: string): TerminalAsset {
    return {
      symbol,
      venue: 'USDT Perp',
      lastPrice: 0,
      changePct15m: 0, changePct1h: 0, changePct4h: 0,
      volumeRatio1h: 1, oiChangePct1h: 0, fundingRate: 0,
      fundingPercentile7d: 50, spreadBps: 0,
      bias: 'neutral', confidence: 'low',
      action: '—', invalidation: '—',
      sources: [],
      freshnessStatus: 'delayed',
      tf15m: '→', tf1h: '→', tf4h: '→',
    };
  }

  // ── Layer label map ──────────────────────────────────────────
  const LAYER_LABELS: Record<string, string> = {
    wyckoff: 'Wyckoff', mtf: 'MTF Conf', breakout: 'Breakout',
    vsurge: 'Vol Surge', cvd: 'CVD', flow: 'FR / Flow',
    liq_est: 'Liq Est', real_liq: 'Real Liq', oi: 'OI Squeeze',
    basis: 'Basis', bb14: 'BB(14)', bb16: 'BB Sqz', atr: 'ATR',
    ob: 'Order Book', onchain: 'On-chain', fg: 'Fear/Greed',
    kimchi: 'Kimchi', sector: 'Sector',
  };

  /** Stable fingerprint of key snapshot fields — changes only when market data actually updates */
  function snapshotFingerprint(snap: any): string {
    if (!snap) return '';
    return [
      snap.symbol ?? '',
      snap.timeframe ?? '',
      snap.rsi14 != null ? snap.rsi14.toFixed(1) : '',
      snap.funding_rate != null ? snap.funding_rate.toFixed(5) : '',
      snap.oi_change_1h != null ? snap.oi_change_1h.toFixed(3) : '',
      snap.cvd_state ?? '',
      snap.regime ?? '',
    ].join('|');
  }

  /** True when the message looks like an analysis / market-data question */
  function isAnalysisQuery(msg: string): boolean {
    const lower = msg.toLowerCase();
    return /분석|어때|어떻게|펀딩|oi\b|rsi|추세|시그널|진입|패턴|레짐|regime|signal|analysis|how.*(look|doing)|what.*(think|say)|check/.test(lower);
  }

  function localizeTerminalText(ko: string, en: string): string {
    if (typeof navigator === 'undefined') return en;
    return navigator.language.toLowerCase().startsWith('ko') ? ko : en;
  }

  function pushAssistantMessage(content: string, transient = false) {
    chatHistory = ([...chatHistory, { role: 'assistant' as const, content }] as HistoryEntry[]).slice(-10);
    streamText = content;
    if (transient) {
      setTimeout(() => {
        if (streamText === content) streamText = '';
      }, 4000);
    }
  }

  function formatAgentFailure(detail?: string): string {
    const prefix = localizeTerminalText('AI 응답 실패', 'AI response failed');
    const cleanDetail = detail?.trim();
    return cleanDetail ? `${prefix}: ${cleanDetail}` : prefix;
  }

  function _deepBias(verdict: string): 'bullish' | 'bearish' | 'neutral' {
    if (!verdict) return 'neutral';
    if (verdict.includes('BULL')) return 'bullish';
    if (verdict.includes('BEAR')) return 'bearish';
    return 'neutral';
  }

  function _deepConfidence(score: number): 'high' | 'medium' | 'low' {
    const abs = Math.abs(score);
    return abs >= 50 ? 'high' : abs >= 20 ? 'medium' : 'low';
  }

  function _deepAction(verdict: string, ensDir: string): string {
    if (verdict === 'STRONG BULL' || ensDir === 'strong_long') return 'Strong buy on pullback';
    if (verdict === 'BULLISH'     || ensDir === 'long')        return 'Buy on pullback';
    if (verdict === 'BEARISH'     || ensDir === 'short')       return 'Avoid / short';
    if (verdict === 'STRONG BEAR' || ensDir === 'strong_short') return 'Strong short / avoid';
    return 'Wait for clarity';
  }

  function buildAssetFromAnalysis(symbol: string, data: any): TerminalAsset {
    const deep = data?.deep;
    const snap = data?.snapshot ?? {};
    const ens  = data?.ensemble ?? {};
    const isMarketOnly = data?.mode === 'market-only';
    const price = data?.price ?? snap?.last_close ?? 0;

    const verdict  = deep?.verdict ?? '';
    const score    = deep?.total_score ?? 0;
    const bias     = _deepBias(verdict) || (ens.direction?.includes('long') ? 'bullish' : ens.direction?.includes('short') ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral';
    const confidence = isMarketOnly ? 'low' : _deepConfidence(score);

    // ATR stop → invalidation price
    const stopLong = deep?.atr_levels?.stop_long;
    const invalidation = stopLong
      ? `$${Number(stopLong).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : '—';

    // Per-layer sources
    const sources: TerminalSource[] = isMarketOnly
      ? [
          { label: 'Binance Spot', category: 'Market', freshness: 'live', updatedAt: Date.now() },
          { label: 'Binance Perp', category: 'Market', freshness: 'live', updatedAt: Date.now() },
          { label: 'Market-only Fallback', category: 'Model', freshness: 'disconnected', updatedAt: Date.now(),
            method: 'Raw market context while engine is unavailable' },
        ]
      : deep?.layers
      ? [
          { label: 'Binance Spot', category: 'Market', freshness: 'live', updatedAt: Date.now() },
          { label: 'Binance Perp', category: 'Market', freshness: 'live', updatedAt: Date.now() },
          { label: 'Market Engine', category: 'Model', freshness: 'recent', updatedAt: Date.now(),
            method: `17-layer pipeline · score ${score > 0 ? '+' : ''}${score}` },
        ]
      : [
          { label: 'Binance Spot', category: 'Market', freshness: 'live', updatedAt: Date.now() },
          { label: 'Binance Perp', category: 'Market', freshness: 'live', updatedAt: Date.now() },
          { label: 'Model v2', category: 'Model', freshness: 'recent', updatedAt: Date.now() },
        ];

    const tfArrow = (val: string | undefined, pos: string, neg: string): '↑' | '↓' | '→' =>
      val === pos ? '↑' : val === neg ? '↓' : '→';

    const mtfMeta = deep?.layers?.mtf?.meta ?? {};

    return {
      symbol, venue: 'USDT Perp',
      lastPrice: price,
      changePct15m: 0,
      changePct1h: 0,
      changePct4h: data?.change24h ?? 0,
      volumeRatio1h: snap.vol_ratio_3 ?? deep?.layers?.vsurge?.meta?.vol_ratio ?? 1,
      oiChangePct1h: (snap.oi_change_1h ?? 0) * 100,
      fundingRate: snap.funding_rate ?? data?.derivatives?.funding_rate ?? 0,
      fundingPercentile7d: 50,
      spreadBps: 0,
      bias, confidence,
      action: isMarketOnly ? 'Track market context' : _deepAction(verdict, ens.direction ?? ''),
      invalidation,
      sources,
      freshnessStatus: isMarketOnly ? 'disconnected' : 'recent',
      tf15m: tfArrow(snap.ema_alignment ?? mtfMeta.tf15m, 'bullish', 'bearish'),
      tf1h:  tfArrow(snap.ema_alignment ?? mtfMeta.tf1h,  'bullish', 'bearish'),
      tf4h:  tfArrow(snap.htf_structure  ?? mtfMeta.tf4h, 'uptrend', 'downtrend'),
    };
  }

  function buildVerdict(data: any): TerminalVerdict {
    const deep = data?.deep;
    const ens  = data?.ensemble ?? {};

    if (data?.mode === 'market-only') {
      return {
        direction: 'neutral',
        confidence: 'low',
        reason: ens.reason || 'Market-only context',
        against: ['engine unavailable'],
        action: 'Track market context',
        invalidation: '—',
        updatedAt: Date.now(),
      };
    }

    // Primary: deep verdict
    if (deep?.verdict) {
      const score   = deep.total_score ?? 0;
      const verdict = deep.verdict as string;

      // Top 3 active layers as reason
      const topLayers = deep.layers
        ? (Object.entries(deep.layers as Record<string, any>))
            .filter(([, lr]) => lr.score !== 0)
            .sort(([, a], [, b]) => Math.abs(b.score) - Math.abs(a.score))
            .slice(0, 3)
            .map(([name, lr]) => `${LAYER_LABELS[name] ?? name} ${lr.score > 0 ? '+' : ''}${lr.score}`)
            .join(' · ')
        : '';

      const stopLong  = deep.atr_levels?.stop_long;
      const tp1       = deep.atr_levels?.tp1_long;

      return {
        direction: _deepBias(verdict),
        confidence: _deepConfidence(score),
        reason: topLayers || ens.reason || verdict,
        against: ens.block_analysis?.disqualifiers ?? [],
        action: _deepAction(verdict, ens.direction ?? ''),
        invalidation: stopLong
          ? `Stop $${Number(stopLong).toLocaleString('en-US', { maximumFractionDigits: 2 })}${tp1 ? ` · TP1 $${Number(tp1).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''}`
          : '—',
        updatedAt: Date.now(),
      };
    }

    // Fallback: ensemble ML signal
    const direction = ens.direction ?? '';
    const absScore  = Math.abs(ens.ensemble_score ?? 0);
    return {
      direction: direction.includes('long') ? 'bullish' : direction.includes('short') ? 'bearish' : 'neutral',
      confidence: absScore > 0.6 ? 'high' : absScore > 0.3 ? 'medium' : 'low',
      reason: ens.reason || 'Analysis pending…',
      against: ens.block_analysis?.disqualifiers ?? [],
      action: _deepAction('', direction),
      invalidation: '—',
      updatedAt: Date.now(),
    };
  }

  function buildEvidence(data: any): TerminalEvidence[] {
    const deep = data?.deep;
    const snap = data?.snapshot;

    // PRIMARY: deep.layers — full 17-layer breakdown
    if (deep?.layers) {
      const ev: TerminalEvidence[] = [];
      const LAYER_ORDER = [
        'wyckoff', 'mtf', 'cvd', 'vsurge', 'breakout',
        'flow', 'oi', 'real_liq', 'liq_est', 'basis',
        'bb14', 'bb16', 'atr',
        'fg', 'onchain', 'kimchi', 'sector', 'ob',
      ];

      for (const name of LAYER_ORDER) {
        const lr = (deep.layers as Record<string, any>)[name];
        if (!lr) continue;
        if (lr.score === 0 && lr.sigs.length === 0) continue;

        const topSig = (lr.sigs as Array<{t: string; type: string}>)[0];
        const state: TerminalEvidence['state'] =
          lr.score >= 5  ? 'bullish'
          : lr.score <= -5 ? 'bearish'
          : topSig?.type === 'warn' ? 'warning'
          : topSig?.type === 'bull' ? 'bullish'
          : topSig?.type === 'bear' ? 'bearish'
          : 'neutral';

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

    // FALLBACK: snapshot fields
    if (!snap) return [];
    const ev: TerminalEvidence[] = [];
    if (snap.rsi14 != null) ev.push({
      metric: 'RSI 14', value: snap.rsi14.toFixed(1), delta: '',
      interpretation: snap.rsi14 > 70 ? 'Overbought' : snap.rsi14 < 30 ? 'Oversold' : 'Neutral',
      state: snap.rsi14 > 70 ? 'warning' : snap.rsi14 < 30 ? 'bullish' : 'neutral',
      sourceCount: 1,
    });
    if (snap.funding_rate != null) ev.push({
      metric: 'Funding', value: (snap.funding_rate * 100).toFixed(3) + '%', delta: '',
      interpretation: snap.funding_rate > 0.01 ? 'Longs paying' : snap.funding_rate < -0.005 ? 'Shorts paying' : 'Neutral',
      state: snap.funding_rate > 0.015 ? 'warning' : 'neutral',
      sourceCount: 1,
    });
    if (snap.oi_change_1h != null) ev.push({
      metric: 'OI 1H', value: (snap.oi_change_1h * 100 >= 0 ? '+' : '') + (snap.oi_change_1h * 100).toFixed(2) + '%', delta: '',
      interpretation: snap.oi_change_1h > 0.02 ? 'Expanding' : snap.oi_change_1h < -0.02 ? 'Contracting' : 'Stable',
      state: snap.oi_change_1h > 0.02 ? 'bullish' : snap.oi_change_1h < -0.02 ? 'bearish' : 'neutral',
      sourceCount: 1,
    });
    if (snap.cvd_state) ev.push({
      metric: 'CVD', value: snap.cvd_state.toUpperCase(), delta: '',
      interpretation: snap.cvd_state === 'buying' ? 'Aggressive buys' : snap.cvd_state === 'selling' ? 'Aggressive sells' : 'Balanced',
      state: snap.cvd_state === 'buying' ? 'bullish' : snap.cvd_state === 'selling' ? 'bearish' : 'neutral',
      sourceCount: 1,
    });
    if (snap.regime) ev.push({
      metric: 'Regime', value: snap.regime.toUpperCase().replace('_', ' '), delta: '',
      interpretation: snap.regime,
      state: snap.regime === 'risk_on' ? 'bullish' : snap.regime === 'risk_off' ? 'bearish' : 'neutral',
      sourceCount: 1,
    });
    if (snap.vol_ratio_3 != null) ev.push({
      metric: 'Volume', value: snap.vol_ratio_3.toFixed(1) + 'x', delta: '',
      interpretation: snap.vol_ratio_3 > 2 ? 'Spike' : snap.vol_ratio_3 > 1.2 ? 'Above avg' : 'Below avg',
      state: snap.vol_ratio_3 > 2 ? 'warning' : 'neutral',
      sourceCount: 1,
    });
    return ev;
  }

  interface MarketSeriesBar {
    t: number;
    c: number;
    v: number;
    delta: number;
    cvd: number;
  }

  function avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function safePctChange(current?: number, previous?: number): number {
    if (!current || !previous) return 0;
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
    return (current - previous) / previous;
  }

  async function readJsonSafe(res: Response): Promise<any | null> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  function buildMarketOnlyEnvelope(
    symbol: string,
    tf: string,
    reason: string,
    marketBars: MarketSeriesBar[],
    oiBars: MarketSeriesBar[],
    fundingBars: MarketSeriesBar[],
  ) {
    const latestBar = marketBars.at(-1);
    const prevBar = marketBars.at(-2);
    const reference24hBar = marketBars.length > 24 ? marketBars.at(-25) : prevBar;
    const recentVolumes = marketBars.slice(-21, -1).map((bar) => bar.v).filter((value) => Number.isFinite(value));
    const volRatio = latestBar?.v && recentVolumes.length > 0 ? latestBar.v / avg(recentVolumes) : 1;
    const latestOi = oiBars.at(-1)?.c;
    const prevOi = oiBars.at(-2)?.c;
    const latestFunding = fundingBars.at(-1)?.c ?? 0;
    const oiChange1h = safePctChange(latestOi, prevOi);
    const change24h = safePctChange(latestBar?.c, reference24hBar?.c) * 100;
    const delta = latestBar?.delta ?? 0;
    const cvdState = delta > 0 ? 'buying' : delta < 0 ? 'selling' : 'balanced';
    const regime =
      change24h >= 2 ? 'risk_on'
      : change24h <= -2 ? 'risk_off'
      : 'balanced';

    return {
      symbol,
      tf,
      mode: 'market-only',
      price: latestBar?.c ?? 0,
      change24h,
      ensemble: {
        direction: 'neutral',
        ensemble_score: 0,
        reason,
        block_analysis: { disqualifiers: ['engine unavailable'] },
      },
      snapshot: {
        symbol,
        timeframe: tf,
        last_close: latestBar?.c ?? 0,
        vol_ratio_3: volRatio,
        oi_change_1h: oiChange1h,
        funding_rate: latestFunding,
        cvd_state: cvdState,
        regime,
      },
      derivatives: {
        funding_rate: latestFunding,
      },
      degraded: true,
    };
  }

  // ─── Data Fetching ───────────────────────────────────────────

  async function loadAnalysis(symbol: string, tf: string) {
    loadingSymbols = new Set([...loadingSymbols, symbol]);

    if (!boardAssets.find(a => a.symbol === symbol)) {
      boardAssets = [buildStubAsset(symbol), ...boardAssets].slice(0, 4);
    }
    if (!activeSymbol) activeSymbol = symbol;

    try {
      // Fetch analysis + OHLCV + OI + Funding in parallel
      const interval = tf === '1d' ? '4h' : tf === '4h' ? '1h' : tf === '1h' ? '15m' : '5m';
      const oiPeriod = tf === '1d' ? '4h' : tf === '4h' ? '1h' : tf === '1h' ? '15m' : '5m';
      const [analyzeRes, ohlcvRes, oiRes, fundingRes] = await Promise.allSettled([
        fetch(`/api/cogochi/analyze?symbol=${symbol}&tf=${tf}`),
        fetch(`/api/market/ohlcv?symbol=${symbol}&interval=${interval}&limit=100`),
        fetch(`/api/market/oi?symbol=${symbol}&period=${oiPeriod}&limit=96`),
        fetch(`/api/market/funding?symbol=${symbol}&limit=96`),
      ]);

      let marketBars: MarketSeriesBar[] = [];
      if (ohlcvRes.status === 'fulfilled' && ohlcvRes.value.ok) {
        const ohlcv = await ohlcvRes.value.json();
        marketBars = ohlcv.bars ?? [];
        ohlcvBars = marketBars;
      }

      // Build per-layer bars map — OI and funding get dedicated data
      const newLayerBarsMap: Record<string, any[]> = {};
      let oiBars: MarketSeriesBar[] = [];
      if (oiRes.status === 'fulfilled' && oiRes.value.ok) {
        const oi = await oiRes.value.json();
        oiBars = oi.bars ?? [];
        if (oiBars.length) newLayerBarsMap['oi'] = oiBars;
      }
      let fundingBars: MarketSeriesBar[] = [];
      if (fundingRes.status === 'fulfilled' && fundingRes.value.ok) {
        const funding = await fundingRes.value.json();
        fundingBars = funding.bars ?? [];
        if (fundingBars.length) newLayerBarsMap['flow'] = fundingBars;
      }
      layerBarsMap = newLayerBarsMap;

      let data: any;
      if (analyzeRes.status === 'fulfilled' && analyzeRes.value.ok) {
        data = await analyzeRes.value.json();
      } else {
        const analyzePayload =
          analyzeRes.status === 'fulfilled'
            ? await readJsonSafe(analyzeRes.value)
            : null;
        const reason =
          analyzePayload?.reason
          ?? analyzePayload?.error
          ?? (analyzeRes.status === 'fulfilled'
            ? `Engine analysis unavailable (${analyzeRes.value.status})`
            : 'Engine analysis request failed');
        data = buildMarketOnlyEnvelope(symbol, tf, reason, marketBars, oiBars, fundingBars);
      }

      analysisData = data;
      analysisDataMap = { ...analysisDataMap, [symbol]: data };
      const asset = buildAssetFromAnalysis(symbol, data);
      const verdict = buildVerdict(data);
      const evidence = buildEvidence(data);

      boardAssets = boardAssets.map(a => a.symbol === symbol ? asset : a);
      if (!boardAssets.find(a => a.symbol === symbol)) {
        boardAssets = [asset, ...boardAssets].slice(0, 4);
      }
      verdictMap = { ...verdictMap, [symbol]: verdict };
      evidenceMap = { ...evidenceMap, [symbol]: evidence };

      // Extract price levels → chart overlay (entry / target / stop)
      if (symbol === activeSymbol || boardAssets.length === 1) {
        chartLevels = extractLevels(data);
      }
    } catch (e) {
      console.error('loadAnalysis error:', e);
    } finally {
      loadingSymbols = new Set([...loadingSymbols].filter(s => s !== symbol));
    }
  }

  async function loadFlow(pair: string, tf: string) {
    try {
      const res = await fetch(`/api/market/flow?pair=${encodeURIComponent(pair)}&timeframe=${tf}`);
      if (!res.ok) return;
      const data = await res.json();
      flowBias = data.bias ?? 'NEUTRAL';
    } catch {}
  }

  async function loadTrending() {
    try {
      const res = await fetch('/api/market/trending');
      if (!res.ok) return;
      trendingData = await res.json();
    } catch {}
  }

  async function loadNews() {
    try {
      const res = await fetch('/api/market/news');
      if (!res.ok) return;
      newsData = await res.json();
    } catch {}
  }

  async function loadAlerts() {
    try {
      const res = await fetch('/api/cogochi/alerts?limit=12');
      if (!res.ok) return;
      const data = await res.json();
      scannerAlerts = data.alerts ?? [];
    } catch {}
  }

  async function loadPatternPhases() {
    try {
      const res = await fetch('/api/patterns/states');
      if (!res.ok) return;
      const data = await res.json();
      // data: { states: { symbol: { slug: { current_phase, phase_name, ... } } } }
      const states: Record<string, Record<string, any>> = data.states ?? {};
      // Invert: slug → { phaseName, symbols[] }
      const bySlug: Record<string, { phaseName: string; symbols: string[] }> = {};
      for (const [sym, slugMap] of Object.entries(states)) {
        for (const [slug, info] of Object.entries(slugMap as Record<string, any>)) {
          if (!bySlug[slug]) bySlug[slug] = { phaseName: info.phase_name ?? info.current_phase ?? '', symbols: [] };
          bySlug[slug].symbols.push(sym.replace('USDT', ''));
        }
      }
      patternPhases = Object.entries(bySlug).map(([slug, v]) => ({ slug, ...v }));
    } catch {}
  }

  function pushPatternTransitions(items: Array<{ symbol: string; slug: string; phase: string }>) {
    if (items.length === 0) return;

    const now = Date.now();
    const existing = new Set(patternTransitionAlerts.map((item) => item.id));
    const fresh = items
      .map((item) => ({
        id: `${item.slug}:${item.symbol}:${item.phase}`,
        symbol: item.symbol,
        slug: item.slug,
        phase: item.phase,
        createdAt: now,
      }))
      .filter((item) => !existing.has(item.id));

    if (fresh.length === 0) return;

    patternTransitionAlerts = [...fresh, ...patternTransitionAlerts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6);

    setTimeout(() => {
      patternTransitionAlerts = patternTransitionAlerts.filter((item) => now - item.createdAt < 90_000);
    }, 95_000);
  }

  function focusPatternSymbol(item: { symbol: string }) {
    const pair = item.symbol.replace('USDT', '/USDT');
    setActivePair(pair);
  }

  function dismissPatternAlert(id: string) {
    patternTransitionAlerts = patternTransitionAlerts.filter((item) => item.id !== id);
  }

  // ─── SSE Command Flow ─────────────────────────────────────────

  async function sendCommand(text: string, _files?: File[]) {
    if (!text.trim() || isStreaming) return;

    const runtime = get(douniRuntimeStore);

    // TERMINAL mode: data only, no AI call
    if (runtime.mode === 'TERMINAL') {
      const banner = localizeTerminalText(
        '[터미널 모드] AI 분석 없음 — Settings > AI에서 모드를 변경하세요.',
        '[Terminal mode] No AI analysis — change the mode in Settings > AI.',
      );
      chatHistory = ([...chatHistory, { role: 'user' as const, content: text }] as HistoryEntry[]).slice(-10);
      pushAssistantMessage(banner, true);
      return;
    }

    // Delta detection: if snapshot hasn't changed since last AI response and
    // the question is purely about current market data, skip the LLM call
    const currentFingerprint = snapshotFingerprint(analysisData?.snapshot);
    if (
      prevSnapshotFingerprint &&
      currentFingerprint &&
      prevSnapshotFingerprint === currentFingerprint &&
      isAnalysisQuery(text)
    ) {
      const noChange = localizeTerminalText(
        '변화 없음 — 마지막 분석 이후 시장 데이터가 업데이트되지 않았어.',
        'No change — market data has not updated since the last analysis.',
      );
      chatHistory = ([...chatHistory, { role: 'user' as const, content: text }] as HistoryEntry[]).slice(-10);
      pushAssistantMessage(noChange, true);
      return;
    }

    isStreaming = true;
    streamText = '';
    showAnalysisRail = true;

    const symbol = pairToSymbol(gPair);
    const tf = symbolToTF(gTf);
    chatHistory = ([...chatHistory, { role: 'user' as const, content: text }] as HistoryEntry[]).slice(-10);

    try {
      const body = {
        message: text,
        history: chatHistory.slice(0, -1).map(h => ({ role: h.role as string, content: h.content, ts: Date.now() })),
        snapshot: analysisData?.snapshot ?? null,
        snapshotTs: analysisData ? Date.now() : undefined,
        detectedSymbol: symbol,
        locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        runtimeConfig: {
          mode: runtime.mode,
          provider: runtime.provider,
          apiKey: runtime.apiKey,
          ollamaModel: runtime.ollamaModel,
          ollamaEndpoint: runtime.ollamaEndpoint,
        },
      };

      const res = await fetch('/api/cogochi/terminal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => '');
        pushAssistantMessage(
          formatAgentFailure(errBody ? `HTTP ${res.status} ${errBody.slice(0, 120)}` : `HTTP ${res.status}`),
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let streamError = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const event = JSON.parse(raw);
            await handleSSEEvent(event, symbol, tf);
            if (event.type === 'text_delta') {
              assistantText += event.text ?? '';
              streamText = assistantText;
            } else if (event.type === 'error') {
              streamError = formatAgentFailure(event.message);
              streamText = assistantText ? `${assistantText}\n\n${streamError}` : streamError;
            }
          } catch {}
        }
      }

      const finalAssistantText = assistantText
        ? (streamError ? `${assistantText}\n\n${streamError}` : assistantText)
        : '';

      if (finalAssistantText) {
        chatHistory = ([...chatHistory, { role: 'assistant' as const, content: finalAssistantText }] as HistoryEntry[]).slice(-10);
        // Record snapshot fingerprint so identical follow-up questions get the delta guard
        if (!streamError) {
          prevSnapshotFingerprint = snapshotFingerprint(analysisData?.snapshot);
        }
      } else if (streamError) {
        pushAssistantMessage(streamError);
      }
    } catch (e) {
      console.error('SSE error:', e);
      pushAssistantMessage(formatAgentFailure(e instanceof Error ? e.message : undefined));
    } finally {
      isStreaming = false;
      streamText = '';
    }
  }

  async function handleSSEEvent(event: any, defaultSymbol: string, _tf: string) {
    if (!event?.type) return;
    if (event.type === 'research_block' && event.payload) {
      const envelope = event.payload;
      if (envelope?.snapshot || envelope?.ensemble) {
        const sym = envelope.symbol ?? defaultSymbol;
        analysisData = envelope;
        analysisDataMap = { ...analysisDataMap, [sym]: envelope };
        const asset = buildAssetFromAnalysis(sym, envelope);
        const verdict = buildVerdict(envelope);
        const evidence = buildEvidence(envelope);
        const existing = boardAssets.find(a => a.symbol === sym);
        if (existing) {
          boardAssets = boardAssets.map(a => a.symbol === sym ? asset : a);
        } else {
          boardAssets = [asset, ...boardAssets].slice(0, 4);
          if (boardAssets.length > 1) layout = 'hero3';
        }
        verdictMap = { ...verdictMap, [sym]: verdict };
        evidenceMap = { ...evidenceMap, [sym]: evidence };
        if (!activeSymbol) activeSymbol = sym;
        // Update chart levels for active symbol
        if (sym === activeSymbol || !activeSymbol) chartLevels = extractLevels(envelope);
      }
    }
    if (event.type === 'tool_result' && event.name === 'analyze' && event.data) {
      const sym = event.data.symbol ?? defaultSymbol;
      analysisData = event.data;
      analysisDataMap = { ...analysisDataMap, [sym]: event.data };
      const asset = buildAssetFromAnalysis(sym, event.data);
      const verdict = buildVerdict(event.data);
      const evidence = buildEvidence(event.data);
      boardAssets = boardAssets.map(a => a.symbol === sym ? asset : a);
      verdictMap = { ...verdictMap, [sym]: verdict };
      evidenceMap = { ...evidenceMap, [sym]: evidence };
      if (sym === activeSymbol) chartLevels = extractLevels(event.data);
    }
  }

  function handleQueryChip(query: string) { sendCommand(query); }

  function selectAsset(symbol: string) {
    activeSymbol = symbol;
    showAnalysisRail = true;
    activeAnalysisTab = 'summary';
    if (!verdictMap[symbol]) loadAnalysis(symbol, symbolToTF(gTf));
    setActivePair(symbol.replace('USDT', '/USDT'));
  }

  function switchLayout(newLayout: 'hero3' | 'compare2x2' | 'focus') { layout = newLayout; }

  function clearBoard() {
    boardAssets = []; verdictMap = {}; evidenceMap = {};
    analysisDataMap = {};
    activeSymbol = ''; layout = 'focus';
    chartLevels = {};
    activeAnalysisTab = 'summary';
    loadAnalysis(pairToSymbol(gPair), symbolToTF(gTf));
  }

  function switchToCompare() { if (boardAssets.length >= 2) layout = 'compare2x2'; }

  // ─── Lifecycle ───────────────────────────────────────────────

  let flowInterval: ReturnType<typeof setInterval>;
  let trendingInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    // ── URL param: ?symbol=BTCUSDT jumps straight to that asset ──────────────
    const searchParams = new URLSearchParams(window.location.search);
    const symbolParam = searchParams.get('symbol');
    if (symbolParam) {
      const pairStr = symbolParam.toUpperCase().replace(/USDT$/, '') + '/USDT';
      setActivePair(pairStr);
    }

    // $effect handles initial loadAnalysis + loadFlow — only set up intervals and one-shot fetches here
    loadTrending();
    loadNews();
    loadAlerts();
    loadPatternPhases();
    flowInterval = setInterval(() => loadFlow(gPair, symbolToTF(gTf)), 15_000);
    trendingInterval = setInterval(loadTrending, 60_000);
    setInterval(loadAlerts, 5 * 60_000);
    setInterval(loadPatternPhases, 60_000);  // refresh pattern states every 1 min
  });

  onDestroy(() => {
    clearInterval(flowInterval);
    clearInterval(trendingInterval);
  });

  let prevPair = '';
  let prevTf = '';
  $effect(() => {
    // Track ONLY pair + tf — price updates in activePairState must not re-trigger this
    const pair = gPair;
    const tf   = gTf;
    if (pair !== prevPair) {
      prevPair = pair;
      prevTf = tf;
      const symbol = pairToSymbol(pair);
      activeSymbol = symbol;
      activeAnalysisTab = 'summary';
      analysisData = null;  // clear stale snapshot so chat context resets
      const alreadyLoaded = untrack(() => boardAssets.find(a => a.symbol === symbol));
      if (!alreadyLoaded) {
        boardAssets = []; verdictMap = {}; evidenceMap = {}; analysisDataMap = {}; layout = 'focus';
      }
      loadAnalysis(symbol, symbolToTF(tf));
      loadFlow(pair, symbolToTF(tf));
    } else if (tf !== prevTf) {
      prevTf = tf;
      const symbol = pairToSymbol(pair);
      verdictMap = {}; evidenceMap = {};
      activeAnalysisTab = 'summary';
      loadAnalysis(symbol, symbolToTF(tf));
      loadFlow(pair, symbolToTF(tf));
    }
  });

  let isLoadingActive = $derived(loadingSymbols.has(activeSymbol));
  let activePairDisplay = $derived(gPair.split('/')[0] ?? 'BTC');

  // ─── Panel visibility + resize ───────────────────────────────
  let leftWidth = $state(160);
  let analysisWidth = $state(280);

  function toggleLeftRail() {
    showLeftRail = !showLeftRail;
  }

  function toggleAnalysisRail() {
    showAnalysisRail = !showAnalysisRail;
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      leftWidth = Math.max(132, Math.min(320, startW + delta));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startAnalysisResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = analysisWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      analysisWidth = Math.max(240, Math.min(460, startW + delta));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ─── Mobile ─────────────────────────────────────────────────
  let showDetailSheet = $state(false);

  // Computed hero asset — computed HERE in parent scope so boardAssets
  // reactivity is tracked directly (bypasses WorkspaceGrid prop chain issue)
  let heroAsset = $derived(boardAssets.find(a => a.symbol === activeSymbol) ?? boardAssets[0] ?? null);
  let heroVerdict = $derived(heroAsset ? verdictMap[heroAsset.symbol] ?? null : null);
  let heroEvidence = $derived(heroAsset ? evidenceMap[heroAsset.symbol] ?? [] : []);

  let activeAsset = $derived(boardAssets.find(a => a.symbol === activeSymbol) ?? boardAssets[0] ?? null);
  let activeVerdict = $derived(activeSymbol ? verdictMap[activeSymbol] ?? null : null);
  let activeEvidence = $derived(activeSymbol ? evidenceMap[activeSymbol] ?? [] : []);
  let activeAnalysisData = $derived(activeSymbol ? analysisDataMap[activeSymbol] ?? analysisData : analysisData);
  let companionAssets = $derived(
    boardAssets.filter((asset) => asset.symbol !== (heroAsset?.symbol ?? '')).slice(0, 3)
  );

  function metricValue(names: string[], fallback = '—'): string {
    const hit = activeEvidence.find((item) => names.includes(item.metric));
    return hit?.value ?? fallback;
  }

  function metricNote(names: string[], fallback = ''): string {
    const hit = activeEvidence.find((item) => names.includes(item.metric));
    return hit?.interpretation ?? fallback;
  }

  let heroMetricTiles = $derived.by(() => {
    if (!heroAsset) return [];
    const flowValue = metricValue(['CVD', 'FR / Flow'], flowBias);
    const flowTone =
      flowValue.startsWith('+') || flowValue.toLowerCase().includes('buy')
        ? 'bull'
        : flowValue.toLowerCase().includes('sell')
          ? 'bear'
          : 'neutral';

    return [
      {
        label: 'Last Price',
        value: heroAsset.lastPrice > 0
          ? heroAsset.lastPrice.toLocaleString('en-US', { maximumFractionDigits: heroAsset.lastPrice >= 1000 ? 2 : 4 })
          : '—',
        note: heroAsset.symbol.replace('USDT', ''),
        tone: 'neutral',
      },
      {
        label: 'Vol Ratio',
        value: `${heroAsset.volumeRatio1h.toFixed(1)}x`,
        note: metricNote(['Vol Surge', 'Volume'], 'vs recent bars'),
        tone: heroAsset.volumeRatio1h > 1.5 ? 'bull' : 'neutral',
      },
      {
        label: 'OI Change',
        value: `${heroAsset.oiChangePct1h >= 0 ? '+' : ''}${heroAsset.oiChangePct1h.toFixed(1)}%`,
        note: metricNote(['OI Squeeze', 'OI 1H'], 'positioning'),
        tone: heroAsset.oiChangePct1h >= 0 ? 'bull' : 'bear',
      },
      {
        label: 'Funding',
        value: `${(heroAsset.fundingRate * 100).toFixed(3)}%`,
        note: metricNote(['FR / Flow', 'Funding'], 'perp skew'),
        tone: Math.abs(heroAsset.fundingRate) > 0.01 ? 'warn' : 'neutral',
      },
      {
        label: 'CVD / Flow',
        value: flowValue,
        note: metricNote(['CVD', 'FR / Flow'], 'orderflow'),
        tone: flowTone,
      },
      {
        label: 'Range / Regime',
        value: metricValue(['Regime', 'Breakout'], flowBias),
        note: metricNote(['Regime', 'Breakout'], 'context'),
        tone: 'neutral',
      },
    ];
  });

  let microstructure = $derived(activeAnalysisData?.microstructure ?? null);
  let depthSnapshot = $derived(microstructure?.depth ?? null);
  let liqClusters = $derived((microstructure?.liqClusters ?? []).slice(0, 4));
  let fallbackDepth = $derived.by(() => {
    const price = activeAsset?.lastPrice
      || activeAnalysisData?.price
      || activeAnalysisData?.snapshot?.last_close
      || 0;
    if (!price) return null;
    const spread = Math.max(activeAsset?.spreadBps ?? 2.4, 1.2) / 10_000;
    const weights = [0.92, 0.72, 0.58, 0.42, 0.28];
    return {
      bids: weights.map((weight, index) => ({
        price: price * (1 - spread * (index + 1.2)),
        weight,
      })),
      asks: weights.map((weight, index) => ({
        price: price * (1 + spread * (index + 1.2)),
        weight: Math.max(0.18, weight - (activeAsset?.oiChangePct1h ?? 0) / 120),
      })),
    };
  });
  let fallbackLiqClusters = $derived.by(() => {
    const price = activeAsset?.lastPrice
      || activeAnalysisData?.price
      || activeAnalysisData?.snapshot?.last_close
      || 0;
    if (!price) return [];
    const stop = chartLevels.stop ?? price * 0.984;
    const target = chartLevels.target ?? price * 1.018;
    const volumeScale = Math.max(0.6, Math.min(2.8, activeAsset?.volumeRatio1h ?? 1));
    return [
      {
        side: 'SELL',
        label: 'Longs',
        price: stop,
        distancePct: price ? ((stop - price) / price) * 100 : 0,
        usd: 18_000_000 * volumeScale,
      },
      {
        side: 'BUY',
        label: 'Shorts',
        price: target,
        distancePct: price ? ((target - price) / price) * 100 : 0,
        usd: 14_000_000 * volumeScale,
      },
    ];
  });
  let orderbookTone = $derived.by(() => {
    const ratio = depthSnapshot?.ratio ?? 1;
    if (ratio >= 1.15) return 'bull';
    if (ratio <= 0.85) return 'bear';
    return 'neutral';
  });
  let orderbookBiasLabel = $derived.by(() => {
    const ratio = depthSnapshot?.ratio ?? 1;
    if (ratio >= 1.15) return 'Bid Heavy';
    if (ratio <= 0.85) return 'Ask Heavy';
    return 'Balanced';
  });
  let runtimeModeLabel = $derived($douniRuntimeStore.mode);

  let boardActionRows = $derived.by(() => {
    if (!activeVerdict) return [];
    return [
      {
        label: 'Verdict',
        value: activeVerdict.direction?.toUpperCase?.() ?? 'NEUTRAL',
        tone: activeVerdict.direction === 'bullish' ? 'bull' : activeVerdict.direction === 'bearish' ? 'bear' : 'neutral',
      },
      {
        label: 'Action',
        value: activeVerdict.action || 'Wait for clarity',
        tone: activeVerdict.direction === 'bullish' ? 'bull' : activeVerdict.direction === 'bearish' ? 'bear' : 'info',
      },
      {
        label: 'Invalidation',
        value: activeVerdict.invalidation || '—',
        tone: 'risk',
      },
      {
        label: 'Confidence',
        value: activeVerdict.confidence?.toUpperCase?.() ?? 'LOW',
        tone: activeVerdict.confidence === 'high' ? 'bull' : activeVerdict.confidence === 'medium' ? 'warn' : 'neutral',
      },
    ];
  });

  let boardSourceRows = $derived((activeAsset?.sources ?? []).slice(0, 4));

  let statusStripItems = $derived.by(() => {
    const regime = metricValue(['Regime', 'Breakout'], flowBias);
    const engineMode = activeAsset?.freshnessStatus === 'disconnected' ? 'MARKET ONLY' : 'FULL';
    return [
      { label: 'Mode', value: isScanMode ? 'SCAN' : 'FOCUS', tone: 'info' },
      { label: 'AI', value: runtimeModeLabel, tone: runtimeModeLabel === 'API' ? 'bull' : runtimeModeLabel === 'OLLAMA' ? 'info' : 'neutral' },
      { label: 'Engine', value: engineMode, tone: engineMode === 'FULL' ? 'bull' : 'warn' },
      { label: 'Flow Bias', value: flowBias, tone: flowBias === 'LONG' ? 'bull' : flowBias === 'SHORT' ? 'bear' : 'neutral' },
      { label: 'Regime', value: regime, tone: 'neutral' },
      { label: 'Board', value: `${boardAssets.length} symbols`, tone: 'neutral' },
      { label: 'Active', value: activeSymbol ? activeSymbol.replace('USDT', '') : activePairDisplay, tone: 'neutral' },
      { label: 'Freshness', value: activeAsset?.freshnessStatus ?? 'delayed', tone: activeAsset?.freshnessStatus === 'live' ? 'bull' : 'neutral' },
    ];
  });

  // ── Analysis rail mode ────────────────────────────────────────
  // SINGLE: ≤1 asset or active symbol has a verdict → show full VerdictCard
  // SCAN:   >1 assets returned (multi-asset prompt) → show compact scan list
  let isScanMode = $derived(boardAssets.length > 1);
  let scanAssets = $derived(
    boardAssets.map(a => ({
      asset: a,
      verdict: verdictMap[a.symbol] ?? null,
    }))
  );
  type ShellChromeTone = 'bull' | 'bear' | 'neutral' | 'info' | 'warn';
  let activeFocusLabel = $derived(activeSymbol ? activeSymbol.replace('USDT', '') : activePairDisplay);
  let timeframeBadgeLabel = $derived(symbolToTF(gTf).toUpperCase());
  let assistantBannerText = $derived(streamText.trim());
  let shellSummaryCards = $derived.by(() => {
    const engineMode = activeAsset?.freshnessStatus === 'disconnected' ? 'Market only' : 'Full context';
    const priceChange = activeAsset?.changePct4h ?? 0;
    const directionTone: ShellChromeTone =
      activeVerdict?.direction === 'bullish'
        ? 'bull'
        : activeVerdict?.direction === 'bearish'
          ? 'bear'
          : 'neutral';
    const priceTone: ShellChromeTone =
      priceChange > 0 ? 'bull' : priceChange < 0 ? 'bear' : 'neutral';
    const regime = metricValue(['Regime', 'Breakout'], flowBias);

    return [
      {
        label: 'Focus',
        value: `${activeFocusLabel}/USDT`,
        meta: `${timeframeBadgeLabel} · ${isScanMode ? `${boardAssets.length} symbols` : 'single board'}`,
        tone: 'info' as ShellChromeTone,
      },
      {
        label: 'Last Price',
        value: activeAsset?.lastPrice
          ? activeAsset.lastPrice.toLocaleString('en-US', {
              maximumFractionDigits: activeAsset.lastPrice >= 1000 ? 2 : 4,
            })
          : '—',
        meta: `${formatSignedPct(activeAsset?.changePct4h, 1)} 4H`,
        tone: priceTone,
      },
      {
        label: 'Engine',
        value: engineMode,
        meta: `${runtimeModeLabel} · ${activeAsset?.freshnessStatus ?? 'delayed'}`,
        tone: engineMode === 'Full context' ? 'bull' : 'warn',
      },
      {
        label: 'Primary Read',
        value: regime,
        meta: activeVerdict ? `${activeVerdict.confidence} confidence` : 'Awaiting analysis',
        tone: directionTone,
      },
    ];
  });
  let terminalSubtitle = $derived.by(() => {
    const regime = metricValue(['Regime', 'Breakout'], flowBias);
    const boardMode = isScanMode
      ? `${boardAssets.length} symbols loaded in scan mode`
      : 'single-asset focus board';
    const engineMode = activeAsset?.freshnessStatus === 'disconnected'
      ? 'market-only fallback active'
      : 'full engine context available';
    return `${activeFocusLabel} is pinned on ${timeframeBadgeLabel}. ${boardMode}. ${regime} regime with ${engineMode}.`;
  });

  let dockFeedItems = $derived.by(() => {
    const items = [
      `${activeFocusLabel}/USDT ${activeAsset?.lastPrice ? activeAsset.lastPrice.toLocaleString('en-US', { maximumFractionDigits: activeAsset.lastPrice >= 1000 ? 0 : 2 }) : '—'}`,
      `Flow ${flowBias}`,
      `Mode ${boardAssets.length > 1 ? 'Scan' : 'Focus'}`,
      `TF ${timeframeBadgeLabel}`,
    ];
    if (patternTransitionAlerts.length > 0) {
      items.push(`${patternTransitionAlerts[0].symbol.replace('USDT', '')} ${patternTransitionAlerts[0].phase}`);
    }
    if (statusStripItems[0]) {
      items.push(`${statusStripItems[0].label} ${statusStripItems[0].value}`);
    }
    return items;
  });

  // Quick chips for mobile dock
  const MOBILE_CHIPS = $derived([
    { id: 'top-oi',    label: 'Top OI',         action: 'Show assets with highest OI expansion right now' },
    { id: 'alts',      label: 'Hot Alts',        action: 'Show hot altcoins with breakout signals' },
    { id: 'long-bias', label: 'LONG setups',     action: 'Show best long setups with high confluence' },
    { id: 'risk',      label: 'Risk check',      action: `What are the main risks for ${gPair.split('/')[0]}?` },
    { id: 'compare',   label: 'BTC vs ETH',      action: 'Compare BTC and ETH side by side' },
  ]);
</script>

<svelte:head>
  <title>Terminal — Cogochi</title>
  <meta
    name="description"
    content="Analyze live crypto structure, flow, and evidence in the Cogochi terminal before you save or act on a setup."
  />
  <link rel="canonical" href={buildCanonicalHref('/terminal')} />
</svelte:head>

<!-- ═══════════════════════════════════════════════════ -->
<!-- Terminal Shell                                      -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="surface-page terminal-page">
  <section class="surface-card terminal-shell-head">
    {#if assistantBannerText}
      <div class="assistant-ribbon" data-state={isStreaming ? 'streaming' : 'ready'}>
        <span class="assistant-ribbon-label">{isStreaming ? 'AI Stream' : 'Assistant'}</span>
        <p class="assistant-ribbon-text">{assistantBannerText}</p>
      </div>
    {/if}

    <TerminalCommandBar
      {flowBias}
      {layout}
      assetsCount={boardAssets.length}
      onQuickIntent={handleQueryChip}
      onLayout={switchLayout}
      onClear={clearBoard}
      onCapture={() => showCaptureModal = true}
    />

    {#if patternTransitionAlerts.length > 0}
      <div class="pattern-alert-tray">
        <span class="pattern-alert-label">Live Pattern Alert</span>
        {#each patternTransitionAlerts as item}
          <div class="pattern-alert-pill">
            <button class="pattern-alert-main" onclick={() => focusPatternSymbol(item)}>
              <span class="pattern-alert-dot"></span>
              <span class="pattern-alert-symbol">{item.symbol.replace('USDT', '')}</span>
              <span class="pattern-alert-phase">{item.phase}</span>
              <span class="pattern-alert-slug">{item.slug.replace(/^tradoor-/, '').replace(/-v\d+$/, '')}</span>
            </button>
            <button class="pattern-alert-dismiss" onclick={() => dismissPatternAlert(item.id)} aria-label="Dismiss pattern alert">
              ×
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="surface-panel terminal-workspace">
    <div class="terminal-shell">
      <div class="terminal-body"
        class:left-collapsed={!showLeftRail}
        class:right-collapsed={!showAnalysisRail}
        style="--terminal-left-w: {leftWidth}px; --terminal-analysis-w: {analysisWidth}px"
      >

    <!-- Left Rail -->
    {#if showLeftRail}
      <aside class="left-rail">
        <div class="workspace-panel-head">
          <div class="workspace-panel-title">
            <span class="workspace-panel-kicker">Market Rail</span>
            <span class="workspace-panel-meta">{leftWidth}px</span>
          </div>
          <button class="panel-head-toggle" type="button" onclick={toggleLeftRail} aria-label="Hide market rail">
            ◧
          </button>
        </div>
        <TerminalLeftRail
          {trendingData}
          alerts={scannerAlerts}
          {patternPhases}
          {activeSymbol}
          newsItems={newsData?.records ?? []}
          onQuery={handleQueryChip}
        />
      </aside>

      <!-- Left resize handle -->
      <button
        class="panel-resizer"
        type="button"
        onmousedown={startResize}
        aria-label="Resize left panel"
      ></button>
    {:else}
      <button class="collapsed-rail-tab left" type="button" onclick={toggleLeftRail} aria-label="Show market rail">
        <span class="collapsed-rail-icon">◧</span>
        <span class="collapsed-rail-copy">
          <strong>Market</strong>
          <small>Hidden</small>
        </span>
      </button>
    {/if}

    <!-- Center Board -->
    <main class="center-board">
      <div class="workspace-panel-head center">
        <span class="workspace-panel-kicker">Main Board</span>
        <span class="workspace-panel-meta">{layout} layout</span>
      </div>

      <!-- Desktop board (hidden on mobile via CSS) -->
      <div class="board-content desktop-board" class:analysis-hidden={!showAnalysisRail}>

        <!-- ── Chart area — hero, full height ── -->
        <div class="chart-area">
          <ChartBoard
            symbol={activeSymbol || pairToSymbol(gPair) || 'BTCUSDT'}
            tf={symbolToTF(gTf)}
            verdictLevels={chartLevels}
            onTfChange={(t) => setActiveTimeframe(normalizeTimeframe(t))}
          />
          {#if boardActionRows.length > 0}
            <div class="board-decision-strip">
              <div class="board-decision-main">
                {#each boardActionRows as item}
                  <button
                    class="decision-cell"
                    data-tone={item.tone}
                    type="button"
                    onclick={() => {
                      showAnalysisRail = true;
                      activeAnalysisTab = item.label === 'Invalidation' ? 'risk' : item.label === 'Action' ? 'entry' : 'summary';
                    }}
                  >
                    <span class="decision-label">{item.label}</span>
                    <strong>{item.value}</strong>
                  </button>
                {/each}
              </div>
              {#if boardSourceRows.length > 0}
                <div class="board-source-row">
                  <span class="board-source-label">Sources</span>
                  {#each boardSourceRows as source}
                    <button
                      class="board-source-pill"
                      type="button"
                      onclick={() => {
                        showAnalysisRail = true;
                        activeAnalysisTab = 'summary';
                      }}
                    >
                      {source.label} · {source.freshness}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
          <PatternStatusBar
            onSelect={focusPatternSymbol}
            onTransition={pushPatternTransitions}
          />
          <EvidenceStrip
            evidence={activeEvidence}
            onExpand={() => {
              showAnalysisRail = true;
              activeAnalysisTab = 'metrics';
            }}
          />
          {#if heroMetricTiles.length > 0}
            <div class="hero-metrics-row">
              {#each heroMetricTiles as tile}
                <div class="hero-metric" data-tone={tile.tone}>
                  <span class="hero-metric-label">{tile.label}</span>
                  <span class="hero-metric-value">{tile.value}</span>
                  <span class="hero-metric-note">{tile.note}</span>
                </div>
              {/each}
            </div>
          {/if}
          {#if microstructure}
            <div class="microstructure-row">
              <section class="micro-card orderbook-card" data-tone={orderbookTone}>
                <div class="micro-card-header">
                  <span class="micro-title">Orderbook</span>
                  <span class="micro-meta">{orderbookBiasLabel}</span>
                </div>
                <div class="micro-stat-row">
                  <span>Spread {microstructure.spreadBps != null ? `${microstructure.spreadBps.toFixed(1)} bps` : '—'}</span>
                  <span>Imbalance {formatSignedPct(microstructure.imbalancePct)}</span>
                  <span>Taker {microstructure.takerRatio != null ? microstructure.takerRatio.toFixed(2) : '—'}</span>
                </div>
                {#if depthSnapshot}
                  <div class="depth-ladders">
                    <div class="depth-side bids">
                      {#each depthSnapshot.bids.slice(0, 5) as level}
                        <div class="depth-row">
                          <span class="depth-price">{level.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                          <div class="depth-bar-wrap">
                            <div class="depth-bar bid" style={`width:${Math.max(10, level.weight * 100)}%`}></div>
                          </div>
                        </div>
                      {/each}
                    </div>
                    <div class="depth-side asks">
                      {#each depthSnapshot.asks.slice(0, 5) as level}
                        <div class="depth-row ask-row">
                          <div class="depth-bar-wrap ask-wrap">
                            <div class="depth-bar ask" style={`width:${Math.max(10, level.weight * 100)}%`}></div>
                          </div>
                          <span class="depth-price">{level.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </section>

              <section class="micro-card liquidity-card">
                <div class="micro-card-header">
                  <span class="micro-title">Liquidity</span>
                  <span class="micro-meta">Recent force orders</span>
                </div>
                <div class="micro-stat-row">
                  <span>Short Liq {formatCompactUsd(microstructure.liqTotals?.shortUsd)}</span>
                  <span>Long Liq {formatCompactUsd(microstructure.liqTotals?.longUsd)}</span>
                </div>
                <div class="liq-cluster-list">
                  {#if liqClusters.length > 0}
                    {#each liqClusters as cluster}
                      <div class="liq-cluster-row">
                        <span class="liq-side" data-side={cluster.side}>{cluster.side === 'BUY' ? 'Shorts' : 'Longs'}</span>
                        <span class="liq-price">{cluster.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                        <span class="liq-distance">{formatSignedPct(cluster.distancePct, 2)}</span>
                        <span class="liq-usd">{formatCompactUsd(cluster.usd)}</span>
                      </div>
                    {/each}
                  {:else}
                    <p class="liq-empty">No forced liquidation spikes in the recent window.</p>
                  {/if}
                </div>
              </section>
            </div>
          {:else if activeAsset && fallbackDepth}
            <div class="microstructure-row">
              <section class="micro-card orderbook-card" data-tone="neutral">
                <div class="micro-card-header">
                  <span class="micro-title">Orderbook</span>
                  <span class="micro-meta">Derived view</span>
                </div>
                <div class="micro-stat-row">
                  <span>Spread {activeAsset.spreadBps ? `${activeAsset.spreadBps.toFixed(1)} bps` : 'est. 2.4 bps'}</span>
                  <span>OI {activeAsset.oiChangePct1h >= 0 ? '+' : ''}{activeAsset.oiChangePct1h.toFixed(1)}%</span>
                  <span>Funding {(activeAsset.fundingRate * 100).toFixed(3)}%</span>
                </div>
                <div class="depth-ladders">
                  <div class="depth-side bids">
                    {#each fallbackDepth.bids as level}
                      <div class="depth-row">
                        <span class="depth-price">{level.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                        <div class="depth-bar-wrap">
                          <div class="depth-bar bid" style={`width:${Math.max(10, level.weight * 100)}%`}></div>
                        </div>
                      </div>
                    {/each}
                  </div>
                  <div class="depth-side asks">
                    {#each fallbackDepth.asks as level}
                      <div class="depth-row ask-row">
                        <div class="depth-bar-wrap ask-wrap">
                          <div class="depth-bar ask" style={`width:${Math.max(10, level.weight * 100)}%`}></div>
                        </div>
                        <span class="depth-price">{level.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              </section>

              <section class="micro-card liquidity-card">
                <div class="micro-card-header">
                  <span class="micro-title">Liquidation Map</span>
                  <span class="micro-meta">Level proxy</span>
                </div>
                <div class="micro-stat-row">
                  <span>Long heat {formatCompactUsd(fallbackLiqClusters[0]?.usd)}</span>
                  <span>Short heat {formatCompactUsd(fallbackLiqClusters[1]?.usd)}</span>
                </div>
                <div class="liq-cluster-list">
                  {#each fallbackLiqClusters as cluster}
                    <div class="liq-cluster-row">
                      <span class="liq-side" data-side={cluster.side}>{cluster.label}</span>
                      <span class="liq-price">{cluster.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                      <span class="liq-distance">{formatSignedPct(cluster.distancePct, 2)}</span>
                      <span class="liq-usd">{formatCompactUsd(cluster.usd)}</span>
                    </div>
                  {/each}
                </div>
              </section>
            </div>
          {/if}
          {#if companionAssets.length > 0}
            <div class="market-mini-grid">
              {#each companionAssets as asset}
                {@const verdict = verdictMap[asset.symbol]}
                <button class="mini-asset-card" onclick={() => selectAsset(asset.symbol)}>
                  <div class="mini-top">
                    <span class="mini-symbol">{asset.symbol.replace('USDT','')}</span>
                    <span class:mini-up={asset.changePct1h >= 0} class:mini-down={asset.changePct1h < 0}>
                      {asset.changePct1h >= 0 ? '+' : ''}{asset.changePct1h.toFixed(2)}%
                    </span>
                  </div>
                  <div class="mini-meta-row">
                    <span>{asset.volumeRatio1h.toFixed(1)}x vol</span>
                    <span>OI {asset.oiChangePct1h >= 0 ? '+' : ''}{asset.oiChangePct1h.toFixed(1)}%</span>
                  </div>
                  {#if verdict}
                    <p class="mini-reason">{verdict.reason.slice(0, 72)}{verdict.reason.length > 72 ? '…' : ''}</p>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- ── Analysis rail — single verdict or scan list ── -->
        {#if showAnalysisRail}
        <button
          class="panel-resizer right"
          type="button"
          onmousedown={startAnalysisResize}
          aria-label="Resize analysis panel"
        ></button>
        <div class="analysis-rail">

          <!-- Rail header: mode indicator + streaming badge -->
          <div class="rail-header">
            {#if isStreaming}
              <span class="rail-badge streaming">
                <span class="stream-dot pulsing">●</span>
                Analyzing…
              </span>
            {:else if isScanMode}
              <span class="rail-badge scan">{boardAssets.length} RESULTS</span>
              <button class="rail-back" onclick={clearBoard}>← Back</button>
            {:else}
              <span class="rail-mode">ANALYSIS</span>
              <span class="rail-sym">{activeSymbol ? activeSymbol.replace('USDT','') : activePairDisplay}</span>
            {/if}
            <span class="rail-width-indicator">{analysisWidth}px</span>
            <button class="panel-head-toggle" type="button" onclick={toggleAnalysisRail} aria-label="Hide analysis rail">
              ◨
            </button>
          </div>

          <!-- MODE B — Scan results list -->
          {#if isScanMode}
            <div class="scan-list">
              {#each scanAssets as { asset, verdict } (asset.symbol)}
                {@const sym = asset.symbol.replace('USDT','')}
                {@const dir = verdict?.direction ?? asset.bias}
                {@const active = asset.symbol === activeSymbol}
                <button
                  class="scan-card"
                  class:active
                  class:bullish={dir === 'bullish'}
                  class:bearish={dir === 'bearish'}
                  onclick={() => selectAsset(asset.symbol)}
                >
                  <div class="sc-left">
                    <span class="sc-sym">{sym}</span>
                    <span class="sc-venue">USDT·PERP</span>
                  </div>
                  <div class="sc-right">
                    <span class="sc-dir">{dir?.toUpperCase() ?? '—'}</span>
                    {#if verdict?.reason}
                      <span class="sc-reason">{verdict.reason.slice(0, 48)}{verdict.reason.length > 48 ? '…' : ''}</span>
                    {:else if verdictMap[asset.symbol] === undefined && loadingSymbols.has(asset.symbol)}
                      <span class="sc-loading">analyzing…</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>

            <!-- Also show active symbol's VerdictCard below the list if loaded -->
            {#if heroAsset && heroVerdict}
              <div class="scan-detail">
                <TerminalContextPanel
                  analysisData={activeAnalysisData}
                  newsData={newsData}
                  activeTab={activeAnalysisTab}
                  onTabChange={(tab) => activeAnalysisTab = tab as typeof activeAnalysisTab}
                  bars={ohlcvBars}
                  {layerBarsMap}
                />
              </div>
            {/if}

          <!-- MODE A — Single asset compact verdict -->
          {:else if isLoadingActive && !heroVerdict}
            <div class="board-loading">
              <div class="loading-ring"></div>
              <p class="loading-msg">Analyzing {activePairDisplay}…</p>
            </div>
          {:else if heroAsset && heroVerdict}
            <TerminalContextPanel
              analysisData={activeAnalysisData}
              newsData={newsData}
              activeTab={activeAnalysisTab}
              onTabChange={(tab) => activeAnalysisTab = tab as typeof activeAnalysisTab}
              bars={ohlcvBars}
              {layerBarsMap}
            />
          {:else}
            <div class="board-empty">
              <p class="empty-icon">◈</p>
              <p class="empty-text">아래에서 {activePairDisplay} 분석 시작</p>
            </div>
          {/if}

        </div>
        {:else}
          <button class="collapsed-rail-tab right" type="button" onclick={toggleAnalysisRail} aria-label="Show analysis rail">
            <span class="collapsed-rail-icon">◨</span>
            <span class="collapsed-rail-copy">
              <strong>Analysis</strong>
              <small>Hidden</small>
            </span>
          </button>
        {/if}

      </div>

      <!-- Desktop bottom dock -->
      <div class="desktop-dock">
        <TerminalBottomDock
          loading={isStreaming || isLoadingActive}
          feedItems={dockFeedItems}
          onSend={sendCommand}
        />
      </div>

      <!-- Mobile board + dock -->
      <div class="mobile-board-wrap">
        <MobileActiveBoard
          asset={activeAsset}
          verdict={activeVerdict}
          evidence={activeEvidence}
          bars={ohlcvBars}
          {layerBarsMap}
          loading={isLoadingActive}
          onViewDetail={() => showDetailSheet = true}
        />
        <MobileCommandDock
          loading={isStreaming}
          queryChips={MOBILE_CHIPS}
          onSend={sendCommand}
          onChip={(action) => sendCommand(action)}
        />
      </div>
    </main>

      </div>
    </div>
  </section>
</div>

<!-- Capture modal — uses SaveSetupModal which handles its own POST -->
<SaveSetupModal
  open={showCaptureModal}
  symbol={activeSymbol || pairToSymbol(gPair)}
  timestamp={Math.floor(Date.now() / 1000)}
  tf={symbolToTF(gTf)}
  onClose={() => showCaptureModal = false}
  onSaved={() => showCaptureModal = false}
/>

<!-- Mobile detail sheet (portal-style, outside grid) -->
<MobileDetailSheet
  open={showDetailSheet}
  asset={activeAsset}
  verdict={activeVerdict}
  evidence={activeEvidence}
  bars={ohlcvBars}
  {layerBarsMap}
  newsItems={newsData?.records ?? []}
  onClose={() => showDetailSheet = false}
/>

<style>
  .terminal-page {
    width: min(100%, calc(100% - 10px));
    height: calc(100dvh - 8px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    padding-top: 4px;
    padding-bottom: 4px;
    gap: 4px;
    overflow: hidden;
  }

  .terminal-shell-head {
    display: grid;
    gap: 3px;
    padding: 4px 6px;
    background:
      linear-gradient(180deg, rgba(9, 12, 17, 0.98), rgba(9, 12, 17, 0.92));
    position: sticky;
    top: 0;
    z-index: 25;
    border-radius: 4px;
    backdrop-filter: blur(18px);
  }

  .terminal-workspace {
    padding: 0;
    overflow: hidden;
    min-height: 0;
    flex: 1;
  }

  .terminal-shell {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background:
      radial-gradient(circle at top left, rgba(99, 179, 237, 0.08), transparent 30%),
      radial-gradient(circle at top right, rgba(173, 202, 124, 0.06), transparent 24%),
      linear-gradient(180deg, #06080d 0%, #05070b 18%, #020304 100%);
    color: var(--sc-text-0);
    overflow: hidden;
    font-family: var(--sc-font-body);
  }

  .assistant-ribbon {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 3px;
    border: 1px solid rgba(99,179,237,0.14);
    background: rgba(8, 17, 26, 0.82);
  }

  .assistant-ribbon[data-state='streaming'] {
    border-color: rgba(74,222,128,0.2);
    background: rgba(8, 22, 15, 0.84);
  }

  .assistant-ribbon-label {
    flex-shrink: 0;
    color: rgba(99,179,237,0.82);
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .assistant-ribbon[data-state='streaming'] .assistant-ribbon-label {
    color: rgba(74,222,128,0.88);
  }

  .assistant-ribbon-text {
    margin: 0;
    color: rgba(247,242,234,0.82);
    font-size: 10px;
    line-height: 1.2;
    display: -webkit-box;
    overflow: hidden;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .terminal-body {
    flex: 1;
    display: grid;
    /* left | handle | center */
    grid-template-columns: var(--terminal-left-w, 240px) 4px 1fr;
    overflow: hidden;
    min-height: 0;
  }

  .pattern-alert-tray {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background:
      linear-gradient(90deg, rgba(74, 222, 128, 0.12), rgba(74, 222, 128, 0.03));
    border: 1px solid rgba(74, 222, 128, 0.16);
    border-radius: 3px;
    overflow-x: auto;
  }

  .pattern-alert-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(74, 222, 128, 0.72);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .pattern-alert-pill {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    border-radius: 3px;
    border: 1px solid rgba(74, 222, 128, 0.24);
    background: rgba(6, 22, 12, 0.9);
    box-shadow: 0 0 24px rgba(74, 222, 128, 0.08);
  }

  .pattern-alert-main {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border: 0;
    background: transparent;
    color: rgba(235, 255, 242, 0.92);
    cursor: pointer;
  }

  .pattern-alert-dismiss {
    border: 0;
    background: transparent;
    color: rgba(255,255,255,0.32);
    cursor: pointer;
    padding: 3px 6px 3px 0;
  }

  .pattern-alert-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 12px rgba(74, 222, 128, 0.7);
  }

  .pattern-alert-symbol,
  .pattern-alert-phase,
  .pattern-alert-slug {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
  }

  .pattern-alert-symbol {
    font-weight: 700;
    color: #4ade80;
  }

  .pattern-alert-phase {
    color: rgba(255,255,255,0.82);
  }

  .pattern-alert-slug {
    color: rgba(255,255,255,0.42);
    text-transform: uppercase;
  }

  .terminal-body.left-collapsed {
    grid-template-columns: 18px 1fr;
  }

  .terminal-body.right-collapsed .board-content {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Resize handles */
  .panel-resizer {
    width: 2px;
    background: rgba(255,255,255,0.045);
    border: none;
    cursor: col-resize;
    position: relative;
    z-index: 20;
    flex-shrink: 0;
    padding: 0;
    transition: background 0.15s;
  }
  .panel-resizer:hover { background: rgba(77,143,245,0.42); }
  /* Widen hit area without changing visual size */
  .panel-resizer::before {
    content: '';
    position: absolute;
    inset: 0 -5px;
  }
  .panel-resizer.right {
    width: 2px;
    border-left: 1px solid rgba(255,255,255,0.035);
    border-right: 0;
  }

  .left-rail {
    background: var(--sc-terminal-bg, #000);
    border-right: 1px solid rgba(255,255,255,0.05);
    overflow: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    scrollbar-gutter: stable;
  }

  .workspace-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    padding: 3px 5px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.015);
    flex-shrink: 0;
    min-height: 20px;
  }

  .workspace-panel-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .panel-head-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    margin-left: auto;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.025);
    color: rgba(214,233,255,0.54);
    font-family: var(--sc-font-mono);
    font-size: 7px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .panel-head-toggle:hover {
    color: rgba(214,233,255,0.9);
    border-color: rgba(77,143,245,0.24);
    background: rgba(77,143,245,0.08);
  }

  .collapsed-rail-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid rgba(77,143,245,0.14);
    background:
      linear-gradient(180deg, rgba(16, 25, 40, 0.92), rgba(9, 13, 20, 0.92));
    color: rgba(160,198,238,0.82);
    font-family: var(--sc-font-mono);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .collapsed-rail-tab:hover {
    color: rgba(204,226,255,0.95);
    border-color: rgba(77,143,245,0.28);
    background: rgba(77,143,245,0.10);
  }

  .collapsed-rail-tab.left {
    height: 100%;
    min-height: 0;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    border-width: 0 1px 0 0;
    border-radius: 0;
    padding: 2px 0;
  }

  .collapsed-rail-tab.right {
    position: absolute;
    right: 5px;
    top: 28px;
    z-index: 14;
    padding: 4px 6px;
    border-radius: 3px;
    box-shadow: 0 10px 24px rgba(0,0,0,0.28);
  }

  .collapsed-rail-icon { font-size: 8px; }

  .collapsed-rail-copy {
    display: inline-flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1;
  }

  .collapsed-rail-copy strong {
    font-size: 7px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .collapsed-rail-copy small {
    display: none;
    color: rgba(214,233,255,0.42);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .workspace-panel-head.center {
    border-bottom: 1px solid rgba(255,255,255,0.04);
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
  }

  .workspace-panel-kicker,
  .workspace-panel-meta {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .workspace-panel-kicker {
    color: rgba(255,255,255,0.3);
  }

  .workspace-panel-meta {
    color: rgba(99,179,237,0.62);
  }

  .center-board {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
    position: relative;
  }

  .board-content {
    flex: 1;
    overflow: hidden;
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto var(--terminal-analysis-w, 280px);
    min-height: 0;
  }
  .board-content.analysis-hidden .chart-area {
    border-right: none;
  }
  .board-content.analysis-hidden {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Chart area — center, takes all available width */
  .chart-area {
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
    border-right: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    min-height: 0;
    scrollbar-gutter: stable;
  }

  /* Analysis rail — always visible right panel, scrollable */
  .analysis-rail {
    width: var(--terminal-analysis-w, 280px);
    min-width: 0;
    max-width: 460px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--sc-terminal-bg, #000);
    position: relative;
    scrollbar-gutter: stable;
    border-left: 1px solid rgba(255,255,255,0.05);
  }

  /* Rail header */
  .rail-header {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 6px;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    flex-shrink: 0;
    min-height: 24px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0)),
      rgba(255,255,255,0.015);
  }
  .rail-width-indicator {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(255,255,255,0.26);
    letter-spacing: 0.08em;
    padding-left: 5px;
    border-left: 1px solid rgba(255,255,255,0.06);
  }
  .rail-header .rail-back + .rail-width-indicator {
    margin-left: 0;
  }
  .rail-mode {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.24);
    text-transform: uppercase;
  }
  .rail-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    color: rgba(255,255,255,0.72);
    margin-left: auto;
    letter-spacing: 0.08em;
  }
  .rail-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .rail-badge.streaming {
    background: rgba(74,222,128,0.08);
    color: #4ade80;
    border: 1px solid rgba(74,222,128,0.2);
  }
  .rail-badge.scan {
    background: rgba(99,179,237,0.08);
    color: #63b3ed;
    border: 1px solid rgba(99,179,237,0.2);
  }
  .rail-back {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.4);
    border-radius: 3px;
    padding: 1px 5px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .rail-back:hover { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.25); }

  /* Scan list (Mode B) */
  .scan-list {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
  }
  .scan-card {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
    padding: 5px 6px;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    width: 100%;
  }
  .scan-card:hover  { background: rgba(255,255,255,0.04); }
  .scan-card.active { background: rgba(255,255,255,0.06); }
  .scan-card.bullish .sc-dir { color: #4ade80; }
  .scan-card.bearish .sc-dir { color: #f87171; }
  .sc-left { display: flex; flex-direction: column; gap: 2px; min-width: 52px; }
  .sc-sym  { font-family: var(--sc-font-mono, monospace); font-size: 10px; font-weight: 700; color: #fff; }
  .sc-venue{ font-size: 8px; color: rgba(255,255,255,0.25); font-family: var(--sc-font-mono, monospace); }
  .sc-right{ display: flex; flex-direction: column; gap: 3px; flex: 1; align-items: flex-end; }
  .sc-dir  { font-family: var(--sc-font-mono, monospace); font-size: 8px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); }
  .sc-reason { font-size: 9px; color: rgba(255,255,255,0.35); text-align: right; line-height: 1.22; }
  .sc-loading{ font-size: 8px; color: rgba(255,255,255,0.2); font-family: var(--sc-font-mono, monospace); animation: sc-pulse 1.4s ease-in-out infinite; }

  /* Scan detail (VerdictCard below scan list) */
  .scan-detail {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .hero-metrics-row {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 1px;
    padding: 3px 4px;
    border-top: 1px solid rgba(255,255,255,0.05);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.01);
  }

  .board-decision-strip {
    display: grid;
    gap: 1px;
    padding: 0;
    border-top: 1px solid rgba(255,255,255,0.055);
    border-bottom: 1px solid rgba(255,255,255,0.055);
    background: rgba(255,255,255,0.035);
  }

  .board-decision-main {
    display: grid;
    grid-template-columns: 0.8fr 1.35fr 1.1fr 0.8fr;
    gap: 1px;
  }

  .decision-cell {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 5px;
    padding: 4px 6px;
    border: none;
    background: rgba(8,10,14,0.98);
    text-align: left;
    cursor: pointer;
  }

  .decision-cell:hover {
    background: rgba(13,17,24,0.98);
  }

  .decision-label,
  .board-source-label {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(255,255,255,0.25);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .decision-cell strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    color: rgba(247,242,234,0.78);
  }

  .decision-cell[data-tone='bull'] strong { color: #8fdd9d; }
  .decision-cell[data-tone='bear'] strong,
  .decision-cell[data-tone='risk'] strong { color: #f19999; }
  .decision-cell[data-tone='warn'] strong { color: #e9c167; }
  .decision-cell[data-tone='info'] strong { color: #83bcff; }

  .board-source-row {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    padding: 3px 5px;
    background: rgba(8,10,14,0.96);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .board-source-row::-webkit-scrollbar {
    display: none;
  }

  .board-source-pill {
    flex-shrink: 0;
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(131,188,255,0.62);
    background: rgba(77,143,245,0.055);
    border: 1px solid rgba(77,143,245,0.10);
    border-radius: 2px;
    padding: 1px 4px;
    cursor: pointer;
  }

  .board-source-pill:hover {
    color: rgba(180,215,255,0.9);
    border-color: rgba(77,143,245,0.22);
  }

  .hero-metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 3px 5px;
    border-radius: 2px;
    border: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.018);
  }
  .hero-metric[data-tone='bull'] { background: rgba(74,222,128,0.06); }
  .hero-metric[data-tone='bear'] { background: rgba(248,113,113,0.06); }
  .hero-metric[data-tone='warn'] { background: rgba(251,191,36,0.06); }
  .hero-metric-label,
  .hero-metric-note {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: var(--sc-text-3);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .hero-metric-value {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--sc-text-0);
  }

  .market-mini-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3px;
    padding: 4px 5px 5px;
    overflow: hidden;
  }

  .microstructure-row {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: 3px;
    padding: 4px 5px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.008);
  }
  .micro-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 5px 6px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.018);
  }
  .micro-card[data-tone='bull'] { background: rgba(74,222,128,0.05); }
  .micro-card[data-tone='bear'] { background: rgba(248,113,113,0.05); }
  .micro-card-header,
  .micro-stat-row,
  .depth-row,
  .liq-cluster-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .micro-card-header {
    justify-content: space-between;
  }
  .micro-title,
  .micro-meta,
  .micro-stat-row span,
  .depth-price,
  .liq-side,
  .liq-price,
  .liq-distance,
  .liq-usd {
    font-family: var(--sc-font-mono);
  }
  .micro-title {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--sc-text-2);
    text-transform: uppercase;
  }
  .micro-meta,
  .micro-stat-row span,
  .depth-price,
  .liq-price,
  .liq-distance,
  .liq-usd {
    font-size: 8px;
    color: var(--sc-text-2);
  }
  .micro-stat-row {
    flex-wrap: wrap;
    justify-content: space-between;
  }
  .depth-ladders {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }
  .depth-side {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .depth-row {
    min-width: 0;
  }
  .ask-row {
    justify-content: flex-end;
  }
  .depth-price {
    width: 64px;
    flex-shrink: 0;
  }
  .depth-bar-wrap {
    flex: 1;
    height: 6px;
    border-radius: 2px;
    background: rgba(255,255,255,0.04);
    overflow: hidden;
  }
  .ask-wrap {
    display: flex;
    justify-content: flex-end;
  }
  .depth-bar {
    height: 100%;
    border-radius: 2px;
  }
  .depth-bar.bid { background: linear-gradient(90deg, rgba(52,196,112,0.25), rgba(52,196,112,0.75)); }
  .depth-bar.ask { background: linear-gradient(90deg, rgba(232,85,85,0.75), rgba(232,85,85,0.25)); }
  .liq-cluster-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .liq-cluster-row {
    padding: 3px 5px;
    border-radius: 2px;
    background: rgba(255,255,255,0.03);
  }
  .liq-side {
    width: 38px;
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .liq-side[data-side='BUY'] { color: #4ade80; }
  .liq-side[data-side='SELL'] { color: #f87171; }
  .liq-price { flex: 1; }
  .liq-distance { width: 48px; text-align: right; }
  .liq-usd { width: 54px; text-align: right; color: var(--sc-text-1); }
  .liq-empty {
    margin: 0;
    font-size: 9px;
    color: var(--sc-text-3);
  }
  .mini-asset-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 5px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.016);
    text-align: left;
    cursor: pointer;
  }
  .mini-asset-card:hover { border-color: rgba(77,143,245,0.18); }
  .mini-top,
  .mini-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .mini-symbol,
  .mini-meta-row span {
    font-family: var(--sc-font-mono);
  }
  .mini-symbol { font-size: 9px; font-weight: 700; color: var(--sc-text-0); letter-spacing: 0.04em; }
  .mini-meta-row span { font-size: 8px; color: var(--sc-text-2); }
  .mini-up { font-family: var(--sc-font-mono); font-size: 9px; color: #4ade80; }
  .mini-down { font-family: var(--sc-font-mono); font-size: 9px; color: #f87171; }
  .mini-reason {
    margin: 0;
    font-size: 9px;
    line-height: 1.22;
    color: var(--sc-text-2);
  }

  /* Empty state */
  .board-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    opacity: 0.5;
  }
  .empty-icon {
    font-size: 28px;
    color: var(--sc-text-3);
    margin: 0;
  }
  .empty-text {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    color: var(--sc-text-2);
    margin: 0;
  }

  /* Loading */
  .board-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    opacity: 0.6;
  }
  .loading-ring {
    width: 32px; height: 32px;
    border: 2px solid rgba(255,255,255,0.08);
    border-top-color: var(--sc-text-2);
    border-radius: 50%;
    animation: sc-spin 0.9s linear infinite;
  }
  .loading-msg {
    font-family: var(--sc-font-mono);
    font-size: 12px; color: var(--sc-text-2); margin: 0;
  }

  .desktop-dock {
    flex-shrink: 0;
  }

  /* Tablet */
  @media (max-width: 1024px) and (min-width: 769px) {
    .terminal-body {
      --terminal-left-w: 200px;
    }
  }

  /* Tablet — analysis rail gets narrower */
  @media (max-width: 1200px) and (min-width: 769px) {
    .analysis-rail { width: var(--terminal-analysis-w, 260px); max-width: 340px; }
    .hero-metrics-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .microstructure-row { grid-template-columns: 1fr; }
  }

  /* Mobile */
  @media (max-width: 768px) {
    .terminal-page {
      width: min(100%, calc(100% - 16px));
      height: auto;
      min-height: calc(100dvh - 12px);
      overflow: visible;
    }
    .assistant-ribbon {
      padding: 10px;
    }
    .terminal-shell-head {
      padding: 14px;
      position: relative;
      top: auto;
    }
    .terminal-body {
      grid-template-columns: 1fr !important;
    }
    .pattern-alert-tray {
      padding: 8px 10px;
    }
    .left-rail     { display: none; }
    .panel-resizer { display: none; }
    .analysis-rail { display: none; }   /* mobile uses MobileActiveBoard instead */
    .center-board  { height: 100%; }
    .desktop-board { display: none; }
    .desktop-dock  { display: none; }
    .mobile-board-wrap { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }
  }

  /* Hide mobile wrap on desktop */
  @media (min-width: 769px) {
    .mobile-board-wrap { display: none; }
  }

  @media (max-width: 540px) {
    .terminal-page {
      width: min(100%, calc(100% - 12px));
    }
  }

  .mobile-board-wrap {
    display: none;
  }
</style>
