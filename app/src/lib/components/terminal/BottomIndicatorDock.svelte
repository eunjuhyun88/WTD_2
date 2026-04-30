<script lang="ts">
  /**
   * BottomIndicatorDock — W-0332
   *
   * Persistent 100px strip below the chart surface.
   * Three tiles: OI × FUNDING × CVD
   *
   * Data comes from existing page state — no new fetches.
   * Color semantics are explicitly inverted for FUNDING:
   *   extreme positive funding = red (crowded longs at risk)
   *   extreme negative funding = green (crowded shorts = squeeze fuel)
   */

  import type { TerminalAsset } from '$lib/types/terminal';

  interface MarketBar { t: number; c: number; v: number; delta: number; cvd: number; }

  interface Props {
    /** layerBarsMap.oi — OI time series */
    oiBars?: MarketBar[];
    /** layerBarsMap.flow — funding time series (c = funding rate) */
    flowBars?: MarketBar[];
    /** main ohlcvBars — each bar has .cvd */
    ohlcvBars?: MarketBar[];
    /** active asset for fallback scalar values */
    heroAsset?: TerminalAsset | null;
    loading?: boolean;
  }

  let {
    oiBars = [],
    flowBars = [],
    ohlcvBars = [],
    heroAsset = null,
    loading = false,
  }: Props = $props();

  // ── Sparkline rendering ────────────────────────────────────────────────────

  function sparklinePath(values: number[], w = 80, h = 26): string {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${pts.join(' L ')}`;
  }

  function sparklineColor(tier: 'extreme-pos' | 'extreme-neg' | 'warn' | 'neutral'): string {
    if (tier === 'extreme-pos') return 'rgba(38,194,129,0.8)';
    if (tier === 'extreme-neg') return 'rgba(237,79,79,0.8)';
    if (tier === 'warn')        return 'rgba(224,168,48,0.8)';
    return 'rgba(255,255,255,0.2)';
  }

  // ── Tile 1: OI ─────────────────────────────────────────────────────────────

  const oiSparkValues = $derived(oiBars.slice(-24).map(b => b.c));

  const oiChangePct = $derived(() => {
    if (oiBars.length >= 24) {
      const latest = oiBars.at(-1)!.c;
      const prev   = oiBars.at(-24)!.c;
      return prev > 0 ? ((latest - prev) / prev) * 100 : 0;
    }
    return heroAsset?.oiChangePct1h ?? 0;
  });

  const oiAbsB = $derived(() => {
    const latest = oiBars.at(-1)?.c ?? 0;
    return latest > 1e9 ? (latest / 1e9).toFixed(2) + 'B' :
           latest > 1e6 ? (latest / 1e6).toFixed(0) + 'M' : '—';
  });

  /** Cross-reference: OI direction × price direction */
  const oiTier = $derived((): 'extreme-pos' | 'extreme-neg' | 'warn' | 'neutral' => {
    const oi = oiChangePct();
    const price4h = heroAsset?.changePct4h ?? 0;
    const absOi = Math.abs(oi);

    if (absOi < 3) return 'neutral';

    // Rising OI
    if (oi > 0) {
      if (price4h > 0) return 'extreme-pos';   // trend confirmed
      if (price4h < 0) return 'extreme-neg';   // shorts piling in
      return 'warn';
    }
    // Falling OI
    if (price4h > 0) return 'warn';            // short squeeze (fading)
    if (price4h < 0) return 'extreme-neg';     // bearish deleveraging
    return 'neutral';
  });

  // ── Tile 2: FUNDING ────────────────────────────────────────────────────────

  const fundingSparkValues = $derived(flowBars.slice(-28).map(b => b.c));

  const fundingRate = $derived(flowBars.at(-1)?.c ?? heroAsset?.fundingRate ?? 0);

  const fundingAnn = $derived(() => {
    // 3 periods/day × 365 × rate
    return (fundingRate * 3 * 365 * 100).toFixed(0);
  });

  /** Funding semantics INTENTIONALLY inverted:
   *  extreme positive rate = crowded longs = liquidation risk = RED
   *  extreme negative rate = crowded shorts = squeeze fuel    = GREEN
   */
  const fundingTier = $derived((): 'extreme-pos' | 'extreme-neg' | 'warn' | 'neutral' => {
    const r = fundingRate;
    if (r >  0.0005) return 'extreme-neg';  // crowded long → danger (red)
    if (r >  0.0001) return 'warn';
    if (r < -0.0005) return 'extreme-pos';  // crowded short → squeeze (green)
    if (r < -0.0001) return 'warn';
    return 'neutral';
  });

  // ── Tile 3: CVD ────────────────────────────────────────────────────────────

  const cvdSparkValues = $derived(ohlcvBars.slice(-32).map(b => b.cvd ?? 0));

  /** 4h cumulative delta: sum last 16 bars' delta field */
  const cvd4h = $derived(() => {
    const bars = ohlcvBars.slice(-16);
    return bars.reduce((sum, b) => sum + (b.delta ?? 0), 0);
  });

  const cvdTier = $derived((): 'extreme-pos' | 'extreme-neg' | 'warn' | 'neutral' => {
    const val = cvd4h();
    // Normalize against last 30d stddev of 4h windows
    const windows: number[] = [];
    for (let i = 16; i <= ohlcvBars.length; i += 16) {
      const w = ohlcvBars.slice(i - 16, i);
      windows.push(w.reduce((s, b) => s + (b.delta ?? 0), 0));
    }
    if (windows.length < 3) {
      // Fallback: sign-only
      if (val > 0) return 'extreme-pos';
      if (val < 0) return 'extreme-neg';
      return 'neutral';
    }
    const mean = windows.reduce((a, b) => a + b, 0) / windows.length;
    const variance = windows.reduce((a, b) => a + (b - mean) ** 2, 0) / windows.length;
    const sigma = Math.sqrt(variance) || 1;
    const z = (val - mean) / sigma;

    if (z >=  2.0) return 'extreme-pos';
    if (z >=  1.0) return 'warn';
    if (z <= -2.0) return 'extreme-neg';
    if (z <= -1.0) return 'warn';
    return 'neutral';
  });

  function fmtPct(n: number, sign = true): string {
    const s = sign && n > 0 ? '+' : '';
    return `${s}${n.toFixed(2)}%`;
  }

  function fmtFunding(r: number): string {
    return `${r >= 0 ? '+' : ''}${(r * 100).toFixed(4)}%`;
  }

  function tierLabel(tier: 'extreme-pos' | 'extreme-neg' | 'warn' | 'neutral', labels: [string, string, string, string]): string {
    // [extreme-pos, extreme-neg, warn, neutral]
    if (tier === 'extreme-pos') return labels[0];
    if (tier === 'extreme-neg') return labels[1];
    if (tier === 'warn')        return labels[2];
    return labels[3];
  }
</script>

<div class="dock" class:loading>
  <!-- Tile 1: OI -->
  <div class="tile" data-tier={oiTier()}>
    <div class="tile-top">
      <span class="tile-label">OPEN INTEREST</span>
      <span class="tile-status" title={tierLabel(oiTier(), [
        'OI↑ + 가격↑: 추세 확인',
        'OI↑ + 가격↓: 숏 누적',
        'OI 변화 주의',
        'OI 변화 미미'
      ])}>{tierLabel(oiTier(), ['추세확인', '숏누적', '주의', '보통'])}</span>
    </div>
    <div class="tile-value" style="color: {sparklineColor(oiTier())}">
      {#if loading}
        <span class="skel"></span>
      {:else}
        {fmtPct(oiChangePct())}
        <span class="tile-secondary">{oiAbsB()}</span>
      {/if}
    </div>
    <svg class="sparkline" viewBox="0 0 80 26" preserveAspectRatio="none">
      {#if oiSparkValues.length >= 2}
        <path d={sparklinePath(oiSparkValues)} stroke={sparklineColor(oiTier())} stroke-width="1.5" fill="none" />
      {/if}
    </svg>
  </div>

  <div class="tile-divider"></div>

  <!-- Tile 2: FUNDING -->
  <div class="tile" data-tier={fundingTier()}>
    <div class="tile-top">
      <span class="tile-label">FUNDING RATE</span>
      <span
        class="tile-status"
        title="⚠ 방향 주의: 극단 양수 = 롱 과밀(위험/빨강), 극단 음수 = 숏 과밀(스퀴즈 가능/초록)"
      >{tierLabel(fundingTier(), ['숏스퀴즈 가능', '롱 과밀 위험', '편향 주의', '균형'])}</span>
    </div>
    <div class="tile-value" style="color: {sparklineColor(fundingTier())}">
      {#if loading}
        <span class="skel"></span>
      {:else}
        {fmtFunding(fundingRate)}
        <span class="tile-secondary">≈{fundingAnn()}% ann.</span>
      {/if}
    </div>
    <svg class="sparkline" viewBox="0 0 80 26" preserveAspectRatio="none">
      {#if fundingSparkValues.length >= 2}
        <path d={sparklinePath(fundingSparkValues)} stroke={sparklineColor(fundingTier())} stroke-width="1.5" fill="none" />
      {/if}
    </svg>
  </div>

  <div class="tile-divider"></div>

  <!-- Tile 3: CVD 15m -->
  <div class="tile" data-tier={cvdTier()}>
    <div class="tile-top">
      <span class="tile-label">CVD 4H FLOW</span>
      <span class="tile-status" title="최근 16봉 매수-매도 압력 누적 (z-score 기준)"
        >{tierLabel(cvdTier(), ['매수세 강함', '매도세 강함', '유의 편향', '균형'])}</span>
    </div>
    <div class="tile-value" style="color: {sparklineColor(cvdTier())}">
      {#if loading}
        <span class="skel"></span>
      {:else}
        {@const val = cvd4h()}
        <span>{val >= 0 ? '▲' : '▼'}</span>
        {(Math.abs(val) / 1e6).toFixed(1)}M
        <span class="tile-secondary">{tierLabel(cvdTier(), ['매수우위', '매도우위', '추세편향', '중립'])}</span>
      {/if}
    </div>
    <svg class="sparkline" viewBox="0 0 80 26" preserveAspectRatio="none">
      {#if cvdSparkValues.length >= 2}
        {@const zeroY = 26 - ((0 - Math.min(...cvdSparkValues)) / (Math.max(...cvdSparkValues) - Math.min(...cvdSparkValues) || 1)) * 26}
        <line x1="0" y1={zeroY} x2="80" y2={zeroY} stroke="rgba(255,255,255,0.1)" stroke-width="0.5" />
        <path d={sparklinePath(cvdSparkValues)} stroke={sparklineColor(cvdTier())} stroke-width="1.5" fill="none" />
      {/if}
    </svg>
  </div>
</div>

<style>
  .dock {
    display: flex;
    align-items: stretch;
    height: 96px;
    flex-shrink: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(11, 14, 20, 0.98);
  }

  /* Hide on narrow viewports */
  @media (max-width: 959px) { .dock { display: none; } }

  /* On mid-width screens, hide CVD tile (third child) */
  @media (max-width: 1279px) {
    .dock > .tile:last-child,
    .dock > .tile-divider:last-of-type {
      display: none;
    }
  }

  .tile {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 10px 14px 8px;
    min-width: 0;
    transition: background 0.15s;
  }
  .tile:hover {
    background: rgba(255, 255, 255, 0.025);
  }

  .tile-divider {
    width: 1px;
    background: rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
    margin: 10px 0;
  }

  .tile-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .tile-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(196, 202, 214, 0.35);
    text-transform: uppercase;
  }

  .tile-status {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(196, 202, 214, 0.4);
    cursor: help;
  }

  .tile-value {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.01em;
    color: rgba(196, 202, 214, 0.75); /* overridden by inline style */
  }

  .tile-secondary {
    font-size: 9px;
    font-weight: 400;
    color: rgba(196, 202, 214, 0.3);
    letter-spacing: 0;
  }

  .sparkline {
    width: 100%;
    height: 26px;
    overflow: visible;
  }

  /* skeleton */
  .skel {
    display: inline-block;
    width: 64px;
    height: 14px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 1; }
  }

  .loading .tile-value {
    opacity: 0.4;
  }
</style>
