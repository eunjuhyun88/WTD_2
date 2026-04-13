<script lang="ts">
  /**
   * Terminal — Bloomberg-style 3-column decision cockpit.
   *
   * Desktop layout:
   *   [TerminalCommandBar — symbol, TF, flow badge, layout]
   *   [TerminalLeftRail 240px][WorkspaceGrid (dynamic board)][TerminalContextPanel 320px]
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
  import { get } from 'svelte/store';
  import { douniRuntimeStore } from '$lib/stores/douniRuntime';

  import TerminalCommandBar from '../../components/terminal/workspace/TerminalCommandBar.svelte';
  import TerminalLeftRail from '../../components/terminal/workspace/TerminalLeftRail.svelte';
  import TerminalContextPanel from '../../components/terminal/workspace/TerminalContextPanel.svelte';
  import TerminalBottomDock from '../../components/terminal/workspace/TerminalBottomDock.svelte';
  import WorkspaceGrid from '../../components/terminal/workspace/WorkspaceGrid.svelte';
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

  let rightPanelTab = $state('summary');
  let analysisData = $state<any>(null);
  let newsData = $state<any>(null);

  let flowBias = $state<'LONG' | 'SHORT' | 'NEUTRAL'>('NEUTRAL');
  let trendingData = $state<any>(null);
  let scannerAlerts = $state<any[]>([]);
  let ohlcvBars = $state<any[]>([]);

  let isStreaming = $state(false);
  let streamText = $state('');
  let loadingSymbols = $state(new Set<string>());

  // ── Pattern Engine state ───────────────────────────────────
  interface PatternPhaseRow { slug: string; phaseName: string; symbols: string[]; }
  let patternPhases = $state<PatternPhaseRow[]>([]);

  // ── Capture modal ──────────────────────────────────────────
  let showCaptureModal = $state(false);

  // ── Chart price-level overlays (entry / target / stop) ───────
  // Extracted from deep.atr_levels after each analysis; passed to ChartBoard
  interface VerdictLevels { entry?: number; target?: number; stop?: number; }
  let chartLevels = $state<VerdictLevels>({});

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
    const price = data?.price ?? snap?.last_close ?? 0;

    const verdict  = deep?.verdict ?? '';
    const score    = deep?.total_score ?? 0;
    const bias     = _deepBias(verdict) || (ens.direction?.includes('long') ? 'bullish' : ens.direction?.includes('short') ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral';
    const confidence = _deepConfidence(score);

    // ATR stop → invalidation price
    const stopLong = deep?.atr_levels?.stop_long;
    const invalidation = stopLong
      ? `$${Number(stopLong).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : '—';

    // Per-layer sources
    const sources: TerminalSource[] = deep?.layers
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
      action: _deepAction(verdict, ens.direction ?? ''),
      invalidation,
      sources,
      freshnessStatus: 'recent',
      tf15m: tfArrow(snap.ema_alignment ?? mtfMeta.tf15m, 'bullish', 'bearish'),
      tf1h:  tfArrow(snap.ema_alignment ?? mtfMeta.tf1h,  'bullish', 'bearish'),
      tf4h:  tfArrow(snap.htf_structure  ?? mtfMeta.tf4h, 'uptrend', 'downtrend'),
    };
  }

  function buildVerdict(data: any): TerminalVerdict {
    const deep = data?.deep;
    const ens  = data?.ensemble ?? {};

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

  // ─── Data Fetching ───────────────────────────────────────────

  async function loadAnalysis(symbol: string, tf: string) {
    loadingSymbols = new Set([...loadingSymbols, symbol]);

    if (!boardAssets.find(a => a.symbol === symbol)) {
      boardAssets = [buildStubAsset(symbol), ...boardAssets].slice(0, 4);
    }
    if (!activeSymbol) activeSymbol = symbol;

    try {
      // Fetch analysis + OHLCV in parallel
      const interval = tf === '1d' ? '4h' : tf === '4h' ? '1h' : tf === '1h' ? '15m' : '5m';
      const [analyzeRes, ohlcvRes] = await Promise.allSettled([
        fetch(`/api/cogochi/analyze?symbol=${symbol}&tf=${tf}`),
        fetch(`/api/market/ohlcv?symbol=${symbol}&interval=${interval}&limit=100`),
      ]);

      if (analyzeRes.status !== 'fulfilled' || !analyzeRes.value.ok)
        throw new Error(`analyze ${analyzeRes.status === 'fulfilled' ? analyzeRes.value.status : 'failed'}`);
      const data = await analyzeRes.value.json();

      // Load OHLCV bars (non-blocking)
      if (ohlcvRes.status === 'fulfilled' && ohlcvRes.value.ok) {
        const ohlcv = await ohlcvRes.value.json();
        ohlcvBars = ohlcv.bars ?? [];
      }

      analysisData = data;
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

  // ─── SSE Command Flow ─────────────────────────────────────────

  async function sendCommand(text: string, _files?: File[]) {
    if (!text.trim() || isStreaming) return;

    const runtime = get(douniRuntimeStore);

    // TERMINAL mode: data only, no AI call
    if (runtime.mode === 'TERMINAL') {
      const banner = '[터미널 모드] AI 분석 없음 — Settings > AI에서 모드를 변경하세요.';
      chatHistory = ([...chatHistory, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: banner }] as HistoryEntry[]).slice(-10);
      streamText = banner;
      setTimeout(() => { streamText = ''; }, 4000);
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
      const noChange = typeof navigator !== 'undefined' && navigator.language.startsWith('ko')
        ? '변화 없음 — 마지막 분석 이후 시장 데이터가 업데이트되지 않았어.'
        : 'No change — market data has not updated since the last analysis.';
      chatHistory = ([...chatHistory, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: noChange }] as HistoryEntry[]).slice(-10);
      streamText = noChange;
      setTimeout(() => { streamText = ''; }, 4000);
      return;
    }

    isStreaming = true;
    streamText = '';
    showRightPanel = true;  // reveal context panel on first query

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

      if (!res.ok || !res.body) { isStreaming = false; return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';

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
            }
          } catch {}
        }
      }

      if (assistantText) {
        chatHistory = ([...chatHistory, { role: 'assistant' as const, content: assistantText }] as HistoryEntry[]).slice(-10);
        // Record snapshot fingerprint so identical follow-up questions get the delta guard
        prevSnapshotFingerprint = snapshotFingerprint(analysisData?.snapshot);
      }
    } catch (e) {
      console.error('SSE error:', e);
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
        analysisData = envelope;
        const sym = envelope.symbol ?? defaultSymbol;
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
    if (!verdictMap[symbol]) loadAnalysis(symbol, symbolToTF(gTf));
    setActivePair(symbol.replace('USDT', '/USDT'));
  }

  function switchLayout(newLayout: 'hero3' | 'compare2x2' | 'focus') { layout = newLayout; }

  function clearBoard() {
    boardAssets = []; verdictMap = {}; evidenceMap = {};
    activeSymbol = ''; layout = 'focus';
    chartLevels = {};
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
      analysisData = null;  // clear stale snapshot so chat context resets
      const alreadyLoaded = untrack(() => boardAssets.find(a => a.symbol === symbol));
      if (!alreadyLoaded) {
        boardAssets = []; verdictMap = {}; evidenceMap = {}; layout = 'focus';
      }
      loadAnalysis(symbol, symbolToTF(tf));
      loadFlow(pair, symbolToTF(tf));
    } else if (tf !== prevTf) {
      prevTf = tf;
      const symbol = pairToSymbol(pair);
      verdictMap = {}; evidenceMap = {};
      loadAnalysis(symbol, symbolToTF(tf));
      loadFlow(pair, symbolToTF(tf));
    }
  });

  let isLoadingActive = $derived(loadingSymbols.has(activeSymbol));
  let activePairDisplay = $derived(gPair.split('/')[0] ?? 'BTC');

  // ─── Panel visibility + resize ───────────────────────────────
  let showRightPanel = $state(false);
  let leftWidth  = $state(240);
  let rightWidth = $state(320);

  function startResize(side: 'left' | 'right', e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftWidth : rightWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      if (side === 'left') {
        leftWidth = Math.max(160, Math.min(400, startW + delta));
      } else {
        rightWidth = Math.max(240, Math.min(520, startW - delta));
      }
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

  // Quick chips for mobile dock
  const MOBILE_CHIPS = $derived([
    { id: 'top-oi',    label: 'Top OI',         action: 'Show assets with highest OI expansion right now' },
    { id: 'alts',      label: 'Hot Alts',        action: 'Show hot altcoins with breakout signals' },
    { id: 'long-bias', label: 'LONG setups',     action: 'Show best long setups with high confluence' },
    { id: 'risk',      label: 'Risk check',      action: `What are the main risks for ${gPair.split('/')[0]}?` },
    { id: 'compare',   label: 'BTC vs ETH',      action: 'Compare BTC and ETH side by side' },
  ]);
</script>

<!-- ═══════════════════════════════════════════════════ -->
<!-- Terminal Shell                                      -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="terminal-shell">

  <!-- Command Bar -->
  <TerminalCommandBar
    {flowBias}
    {layout}
    assetsCount={boardAssets.length}
    onLayout={switchLayout}
    onClear={clearBoard}
    onCapture={() => showCaptureModal = true}
  />

  <!-- 3-column body -->
  <div class="terminal-body"
    class:has-right-panel={showRightPanel}
    style="--terminal-left-w: {leftWidth}px; --terminal-right-w: {rightWidth}px"
  >

    <!-- Left Rail -->
    <aside class="left-rail">
      <TerminalLeftRail
        {trendingData}
        alerts={scannerAlerts}
        {patternPhases}
        {activeSymbol}
        onQuery={handleQueryChip}
      />
    </aside>

    <!-- Left resize handle -->
    <div class="panel-resizer" onmousedown={(e) => startResize('left', e)} role="separator" aria-label="Resize left panel"></div>

    <!-- Center Board -->
    <main class="center-board">

      <!-- Desktop board (hidden on mobile via CSS) -->
      <div class="board-content desktop-board">

        <!-- ── Chart area — hero, full height ── -->
        <div class="chart-area">
          <ChartBoard
            symbol={activeSymbol || pairToSymbol(gPair) || 'BTCUSDT'}
            tf={symbolToTF(gTf)}
            verdictLevels={chartLevels}
            onTfChange={(t) => setActiveTimeframe(normalizeTimeframe(t))}
          />
          <PatternStatusBar />
          <EvidenceStrip
            evidence={activeEvidence}
            onExpand={() => { rightPanelTab = 'summary'; showRightPanel = true; }}
          />
        </div>

        <!-- ── Analysis rail — single verdict or scan list ── -->
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
                <VerdictCard
                  asset={heroAsset}
                  verdict={heroVerdict}
                  evidence={heroEvidence}
                  bars={ohlcvBars}
                  onPin={() => {}}
                  onViewDetail={() => { rightPanelTab = 'summary'; showRightPanel = true; }}
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
            <div class="compact-verdict">
              <!-- Bias header -->
              <div class="cv-bias" class:bullish={heroVerdict.direction === 'bullish'} class:bearish={heroVerdict.direction === 'bearish'}>
                <span class="cv-dot">●</span>
                <span class="cv-dir">{heroVerdict.direction?.toUpperCase() ?? 'NEUTRAL'}</span>
                <span class="cv-conf">{heroVerdict.confidence}</span>
                <span class="cv-sym">{heroAsset.symbol.replace('USDT','')} · {$activePairState.timeframe.toUpperCase()}</span>
              </div>

              <!-- Price strip -->
              <div class="cv-price">
                <span class="cv-last">{heroAsset.lastPrice > 0 ? heroAsset.lastPrice.toLocaleString('en-US',{maximumFractionDigits:2}) : '—'}</span>
                <span class="cv-meta">Vol {heroAsset.volumeRatio1h.toFixed(1)}×</span>
                <span class="cv-meta">F {(heroAsset.fundingRate*100).toFixed(3)}%</span>
              </div>

              <!-- Action -->
              {#if heroVerdict.action && heroVerdict.action !== '—'}
                <div class="cv-action">{heroVerdict.action}</div>
              {/if}

              <!-- WHY -->
              {#if heroVerdict.reason}
                <div class="cv-section">
                  <span class="cv-label">WHY</span>
                  <p class="cv-text">{heroVerdict.reason}</p>
                </div>
              {/if}

              <!-- AGAINST -->
              {#if heroVerdict.against?.length}
                <div class="cv-section">
                  <span class="cv-label">AGAINST</span>
                  <div class="cv-tags">
                    {#each heroVerdict.against as a}
                      <span class="cv-tag warn">{a}</span>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- LEVELS -->
              {#if chartLevels.entry || chartLevels.stop || chartLevels.target}
                <div class="cv-section">
                  <span class="cv-label">LEVELS</span>
                  <div class="cv-levels">
                    {#if chartLevels.entry}
                      <div class="cv-level"><span class="lv-name">Entry</span><span class="lv-val">{chartLevels.entry.toLocaleString('en-US',{maximumFractionDigits:2})}</span></div>
                    {/if}
                    {#if chartLevels.stop}
                      <div class="cv-level bad"><span class="lv-name">Stop</span><span class="lv-val">{chartLevels.stop.toLocaleString('en-US',{maximumFractionDigits:2})}</span></div>
                    {/if}
                    {#if chartLevels.target}
                      <div class="cv-level good"><span class="lv-name">TP1</span><span class="lv-val">{chartLevels.target.toLocaleString('en-US',{maximumFractionDigits:2})}</span></div>
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- Invalidation -->
              {#if heroVerdict.invalidation && heroVerdict.invalidation !== '—'}
                <div class="cv-invalidation">{heroVerdict.invalidation}</div>
              {/if}

              <!-- Expand to full panel -->
              <button class="cv-expand" onclick={() => { rightPanelTab = 'summary'; showRightPanel = true; }}>
                Evidence + Detail →
              </button>
            </div>
          {:else}
            <div class="board-empty">
              <p class="empty-icon">◈</p>
              <p class="empty-text">아래에서 {activePairDisplay} 분석 시작</p>
            </div>
          {/if}

        </div>

      </div>

      <!-- Desktop bottom dock -->
      <div class="desktop-dock">
        <TerminalBottomDock
          loading={isStreaming || isLoadingActive}
          onSend={sendCommand}
        />
      </div>

      <!-- Mobile board + dock -->
      <div class="mobile-board-wrap">
        <MobileActiveBoard
          asset={activeAsset}
          verdict={activeVerdict}
          evidence={activeEvidence}
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

    <!-- Right Context Panel — appears only after first search -->
    {#if showRightPanel}
    <!-- Right resize handle -->
    <div class="panel-resizer" onmousedown={(e) => startResize('right', e)} role="separator" aria-label="Resize right panel"></div>
    <aside class="right-panel">
      <TerminalContextPanel
        analysisData={activeSymbol ? analysisData : null}
        {newsData}
        activeTab={rightPanelTab}
        onTabChange={(t) => rightPanelTab = t}
      />
    </aside>
    {/if}

  </div>
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
  newsItems={newsData?.records ?? []}
  onClose={() => showDetailSheet = false}
/>

<style>
  .terminal-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--sc-terminal-bg, #000);
    color: var(--sc-text-0);
    overflow: hidden;
    font-family: var(--sc-font-body);
  }

  .terminal-body {
    flex: 1;
    display: grid;
    /* left | handle | center */
    grid-template-columns: var(--terminal-left-w, 240px) 4px 1fr;
    overflow: hidden;
    min-height: 0;
  }

  .terminal-body.has-right-panel {
    /* left | handle | center | handle | right */
    grid-template-columns: var(--terminal-left-w, 240px) 4px 1fr 4px var(--terminal-right-w, 320px);
  }

  /* Resize handles */
  .panel-resizer {
    width: 4px;
    background: var(--sc-terminal-border, rgba(255,255,255,0.07));
    cursor: col-resize;
    position: relative;
    z-index: 20;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .panel-resizer:hover { background: rgba(255,255,255,0.18); }
  /* Widen hit area without changing visual size */
  .panel-resizer::before {
    content: '';
    position: absolute;
    inset: 0 -5px;
  }

  .left-rail {
    background: var(--sc-terminal-bg, #000);
    /* border handled by panel-resizer */
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
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
    display: flex;
    flex-direction: row;   /* ← chart + analysis side by side */
    min-height: 0;
  }

  /* Chart area — center, takes all available width */
  .chart-area {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
  }

  /* Analysis rail — always visible right panel, scrollable */
  .analysis-rail {
    width: 380px;
    min-width: 320px;
    max-width: 480px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: var(--sc-terminal-bg, #000);
    position: relative;
  }

  /* Rail header */
  .rail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    flex-shrink: 0;
    min-height: 34px;
  }
  .rail-mode {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.2);
  }
  .rail-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.7);
    margin-left: auto;
  }
  .rail-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    border-radius: 3px;
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
    padding: 2px 7px;
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
    gap: 10px;
    padding: 10px 12px;
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
  .sc-sym  { font-family: var(--sc-font-mono, monospace); font-size: 12px; font-weight: 700; color: #fff; }
  .sc-venue{ font-size: 9px; color: rgba(255,255,255,0.25); font-family: var(--sc-font-mono, monospace); }
  .sc-right{ display: flex; flex-direction: column; gap: 3px; flex: 1; align-items: flex-end; }
  .sc-dir  { font-family: var(--sc-font-mono, monospace); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); }
  .sc-reason { font-size: 10px; color: rgba(255,255,255,0.35); text-align: right; line-height: 1.4; }
  .sc-loading{ font-size: 9px; color: rgba(255,255,255,0.2); font-family: var(--sc-font-mono, monospace); animation: sc-pulse 1.4s ease-in-out infinite; }

  /* Scan detail (VerdictCard below scan list) */
  .scan-detail { flex: 1; }

  .right-panel {
    background: var(--sc-terminal-bg, #000);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
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

  /* Streaming overlay */
  .stream-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.6) 60%, transparent 100%);
    padding: 24px 20px 8px;
    display: flex; align-items: flex-end; gap: 8px;
    pointer-events: none; z-index: 5;
  }
  .stream-overlay.minimal {
    padding: 12px 20px; background: none;
  }
  .stream-inner {
    display: flex; gap: 8px; align-items: flex-start; max-width: 100%;
  }
  .stream-dot {
    font-size: 8px; color: #4ade80; flex-shrink: 0; margin-top: 4px;
  }
  .stream-dot.pulsing { animation: sc-pulse 1s ease-in-out infinite; }
  .stream-text {
    font-family: var(--sc-font-body);
    font-size: 12px; color: var(--sc-text-1); margin: 0;
    line-height: 1.5; max-height: 80px; overflow: hidden;
  }
  .stream-label {
    font-family: var(--sc-font-mono);
    font-size: 10px; color: var(--sc-text-2);
  }

  .desktop-dock {
    flex-shrink: 0;
  }

  /* Tablet */
  @media (max-width: 1024px) and (min-width: 769px) {
    .terminal-body {
      --terminal-left-w: 200px;
      --terminal-right-w: 280px;
    }
  }

  /* Tablet — analysis rail gets narrower */
  @media (max-width: 1200px) and (min-width: 769px) {
    .analysis-rail { width: 320px; min-width: 280px; }
  }

  /* Mobile */
  @media (max-width: 768px) {
    .terminal-body {
      grid-template-columns: 1fr !important;
    }
    .left-rail     { display: none; }
    .right-panel   { display: none; }
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

  .mobile-board-wrap {
    display: none;
  }

  /* ── Compact Verdict Panel (analysis-rail MODE A) ────────── */
  .compact-verdict {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
  }

  .cv-bias {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--sc-terminal-border);
  }
  .cv-bias.bullish { background: rgba(74,222,128,0.04); }
  .cv-bias.bearish { background: rgba(248,113,113,0.04); }

  .cv-dot { font-size: 8px; }
  .cv-bias.bullish .cv-dot { color: #4ade80; }
  .cv-bias.bearish .cv-dot { color: #f87171; }
  .cv-bias:not(.bullish):not(.bearish) .cv-dot { color: rgba(247,242,234,0.3); }

  .cv-dir {
    font-family: var(--sc-font-mono); font-size: 12px; font-weight: 700;
    color: var(--sc-text-0);
  }
  .cv-conf {
    font-family: var(--sc-font-mono); font-size: 9px; letter-spacing: 0.06em;
    color: var(--sc-text-2);
    background: rgba(255,255,255,0.06); border-radius: 3px; padding: 1px 5px;
  }
  .cv-sym {
    font-family: var(--sc-font-mono); font-size: 9px; color: var(--sc-text-2);
    margin-left: auto;
  }

  .cv-price {
    display: flex; align-items: baseline; gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--sc-terminal-border);
  }
  .cv-last {
    font-family: var(--sc-font-mono); font-size: 18px; font-weight: 700;
    color: var(--sc-text-0);
  }
  .cv-meta {
    font-family: var(--sc-font-mono); font-size: 10px;
    color: var(--sc-text-2);
  }

  .cv-action {
    padding: 8px 14px;
    font-family: var(--sc-font-mono); font-size: 11px; font-weight: 600;
    color: rgba(173,202,124,0.9);
    border-bottom: 1px solid var(--sc-terminal-border);
    background: rgba(173,202,124,0.04);
  }

  .cv-section {
    padding: 9px 14px;
    border-bottom: 1px solid var(--sc-terminal-border);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .cv-label {
    font-family: var(--sc-font-mono); font-size: 8px; font-weight: 700;
    letter-spacing: 0.12em; color: var(--sc-text-3);
  }
  .cv-text {
    font-family: var(--sc-font-mono); font-size: 11px;
    color: var(--sc-text-1); margin: 0; line-height: 1.5;
  }

  .cv-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .cv-tag {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 600;
    padding: 2px 7px; border-radius: 3px;
  }
  .cv-tag.warn { background: rgba(251,191,36,0.1); color: #fbbf24; }

  .cv-levels { display: flex; flex-direction: column; gap: 4px; }
  .cv-level {
    display: flex; justify-content: space-between; align-items: center;
    padding: 3px 0;
  }
  .cv-level.good .lv-val { color: #4ade80; }
  .cv-level.bad  .lv-val { color: #f87171; }
  .lv-name {
    font-family: var(--sc-font-mono); font-size: 10px; color: var(--sc-text-2);
  }
  .lv-val {
    font-family: var(--sc-font-mono); font-size: 11px; font-weight: 700;
    color: var(--sc-text-1);
  }

  .cv-invalidation {
    padding: 7px 14px;
    font-family: var(--sc-font-mono); font-size: 10px;
    color: rgba(248,113,113,0.7);
    border-bottom: 1px solid var(--sc-terminal-border);
  }

  .cv-expand {
    margin: 10px 14px;
    font-family: var(--sc-font-mono); font-size: 10px;
    color: rgba(255,255,255,0.3);
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px; padding: 6px 12px; cursor: pointer;
    text-align: center; transition: all 0.12s;
  }
  .cv-expand:hover { color: var(--sc-text-0); border-color: rgba(255,255,255,0.2); }
</style>
