<script lang="ts">
  /**
   * Mini indicator chart for EvidenceCard — renders the appropriate
   * visualization based on the layer type.
   *
   * Layer types and their visualizations:
   *   cvd       → CVD line (cumulative volume delta)
   *   vsurge    → Volume bars with buy/sell coloring
   *   flow/fr   → Funding rate bars (green/red)
   *   oi        → OI line vs price overlay
   *   bb14/bb16 → Bollinger band width sparkline
   *   atr       → ATR sparkline
   *   fg        → Fear/Greed gauge
   *   basis     → Spread line (spot vs futures)
   *   wyckoff   → Price mini-candles
   *   mtf       → Multi-TF alignment bars
   *   breakout  → Price with range lines
   *   onchain   → Simple bar chart
   *   kimchi    → Spread line
   *   default   → Price sparkline
   */

  interface BarData {
    t: number;
    o: number; h: number; l: number; c: number;
    v: number; bv: number; sv: number;
    delta: number; cvd: number;
  }

  interface Props {
    layerKey: string;
    bars?: BarData[];
    width?: number;
    height?: number;
  }
  let { layerKey, bars = [], width = 140, height = 36 }: Props = $props();

  const pad = 2;
  const w = $derived(width - pad * 2);
  const h = $derived(height - pad * 2);

  // ─── Path generators ──────────────────────────────────────

  function linePath(values: number[]): string {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values
      .map((v, i) => {
        const x = pad + (i / (values.length - 1)) * w;
        const y = pad + h - ((v - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function areaPath(values: number[]): string {
    const line = linePath(values);
    if (!line) return '';
    return `${line} L${(pad + w).toFixed(1)},${(pad + h).toFixed(1)} L${pad},${(pad + h).toFixed(1)} Z`;
  }

  // ─── Derived data per layer type ──────────────────────────

  // CVD line
  const cvdValues = $derived(bars.map(b => b.cvd));
  const cvdUp = $derived(bars.length > 1 ? bars[bars.length - 1].cvd >= bars[0].cvd : true);

  // Volume delta bars
  const volBars = $derived.by(() => {
    if (bars.length === 0) return [];
    const maxVol = Math.max(...bars.map(b => Math.abs(b.delta)));
    const barW = Math.max(1, w / bars.length - 0.5);
    return bars.map((b, i) => ({
      x: pad + (i / bars.length) * w,
      h: maxVol > 0 ? (Math.abs(b.delta) / maxVol) * h : 0,
      positive: b.delta >= 0,
      w: barW,
    }));
  });

  // Price closes
  const closes = $derived(bars.map(b => b.c));
  const priceUp = $derived(bars.length > 1 ? bars[bars.length - 1].c >= bars[0].c : true);

  // Volumes
  const volumes = $derived(bars.map(b => b.v));

  // Mini candle rects
  const candles = $derived.by(() => {
    if (bars.length === 0) return [];
    const allH = bars.map(b => b.h);
    const allL = bars.map(b => b.l);
    const pMin = Math.min(...allL);
    const pMax = Math.max(...allH);
    const pRange = pMax - pMin || 1;
    const barW = Math.max(1, w / bars.length - 1);
    return bars.map((b, i) => {
      const x = pad + (i / bars.length) * w;
      const yH = pad + h - ((b.h - pMin) / pRange) * h;
      const yL = pad + h - ((b.l - pMin) / pRange) * h;
      const yO = pad + h - ((b.o - pMin) / pRange) * h;
      const yC = pad + h - ((b.c - pMin) / pRange) * h;
      const bull = b.c >= b.o;
      return {
        x, wickY: yH, wickH: yL - yH,
        bodyY: Math.min(yO, yC), bodyH: Math.max(1, Math.abs(yC - yO)),
        w: barW, bull,
      };
    });
  });

  // Fear/Greed gauge value (extracted from interpretation text if available)
  // For now just show a gauge based on the state

  // Determine which chart type to render
  const chartType = $derived.by((): string => {
    const k = layerKey.toLowerCase();
    if (k === 'cvd') return 'cvd';
    if (k === 'vsurge' || k === 'vol surge') return 'volume';
    if (k.includes('flow') || k === 'fr / flow') return 'delta';
    if (k === 'oi' || k.includes('squeeze')) return 'line_overlay';
    if (k.includes('bb') || k === 'bb(14)' || k === 'bb(16)') return 'bands';
    if (k === 'atr') return 'atr';
    if (k.includes('fear') || k.includes('greed') || k === 'fear/greed') return 'gauge';
    if (k === 'basis') return 'spread';
    if (k === 'wyckoff') return 'candles';
    if (k === 'mtf' || k.includes('conf')) return 'candles';
    if (k === 'breakout') return 'candles';
    if (k.includes('chain') || k === 'on-chain') return 'volume';
    if (k === 'kimchi') return 'spread';
    if (k.includes('liq')) return 'delta';
    if (k === 'sector') return 'none';
    return 'price';
  });
</script>

{#if bars.length > 2 && chartType !== 'none'}
<svg {width} {height} viewBox="0 0 {width} {height}" class="mini-chart">
  {#if chartType === 'cvd'}
    <!-- CVD area + line -->
    <path d={areaPath(cvdValues)} fill={cvdUp ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)'} />
    <path d={linePath(cvdValues)} fill="none"
      stroke={cvdUp ? '#4ade80' : '#f87171'} stroke-width="1.2" stroke-linecap="round" />
    <!-- Zero line -->
    {@const cvdMin = Math.min(...cvdValues)}
    {@const cvdMax = Math.max(...cvdValues)}
    {@const cvdRange = cvdMax - cvdMin || 1}
    {@const zeroY = pad + h - ((0 - cvdMin) / cvdRange) * h}
    {#if zeroY > pad && zeroY < pad + h}
      <line x1={pad} y1={zeroY} x2={pad + w} y2={zeroY} stroke="rgba(255,255,255,0.12)" stroke-width="0.5" stroke-dasharray="2,2" />
    {/if}

  {:else if chartType === 'volume' || chartType === 'delta'}
    <!-- Volume delta bars (green=buy, red=sell) -->
    {#each volBars as bar}
      <rect
        x={bar.x}
        y={pad + h - bar.h}
        width={bar.w}
        height={Math.max(0.5, bar.h)}
        fill={bar.positive ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)'}
        rx="0.5"
      />
    {/each}

  {:else if chartType === 'candles'}
    <!-- Mini candlesticks -->
    {#each candles as c}
      <!-- Wick -->
      <line
        x1={c.x + c.w / 2} y1={c.wickY}
        x2={c.x + c.w / 2} y2={c.wickY + c.wickH}
        stroke={c.bull ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)'}
        stroke-width="0.6"
      />
      <!-- Body -->
      <rect
        x={c.x} y={c.bodyY}
        width={c.w} height={c.bodyH}
        fill={c.bull ? '#4ade80' : '#f87171'}
        rx="0.3"
      />
    {/each}

  {:else if chartType === 'line_overlay'}
    <!-- Price line + OI/volume area underneath -->
    <path d={areaPath(volumes)} fill="rgba(99,179,237,0.06)" />
    <path d={linePath(closes)} fill="none"
      stroke="rgba(247,242,234,0.5)" stroke-width="0.8" stroke-linecap="round" />
    <path d={linePath(volumes)} fill="none"
      stroke="rgba(99,179,237,0.5)" stroke-width="1" stroke-linecap="round" />

  {:else if chartType === 'bands'}
    <!-- Price line (simulates BB visual) -->
    <path d={areaPath(closes)} fill="rgba(167,139,250,0.06)" />
    <path d={linePath(closes)} fill="none"
      stroke="rgba(167,139,250,0.7)" stroke-width="1.2" stroke-linecap="round" />

  {:else if chartType === 'atr'}
    <!-- ATR-like range visualization using high-low spread -->
    {@const ranges = bars.map(b => b.h - b.l)}
    <path d={areaPath(ranges)} fill="rgba(251,191,36,0.08)" />
    <path d={linePath(ranges)} fill="none"
      stroke="rgba(251,191,36,0.7)" stroke-width="1.2" stroke-linecap="round" />

  {:else if chartType === 'gauge'}
    <!-- Fear/Greed gauge arc -->
    {@const cx = width / 2}
    {@const cy = height - 2}
    {@const r = Math.min(cx - 4, cy - 2)}
    <!-- Background arc -->
    <path d="M {cx - r} {cy} A {r} {r} 0 0 1 {cx + r} {cy}" fill="none"
      stroke="rgba(255,255,255,0.06)" stroke-width="3" stroke-linecap="round" />
    <!-- Gradient sections -->
    <path d="M {cx - r} {cy} A {r} {r} 0 0 1 {cx - r * 0.5} {cy - r * 0.87}" fill="none"
      stroke="rgba(248,113,113,0.4)" stroke-width="3" stroke-linecap="round" />
    <path d="M {cx - r * 0.5} {cy - r * 0.87} A {r} {r} 0 0 1 {cx + r * 0.5} {cy - r * 0.87}" fill="none"
      stroke="rgba(251,191,36,0.4)" stroke-width="3" stroke-linecap="round" />
    <path d="M {cx + r * 0.5} {cy - r * 0.87} A {r} {r} 0 0 1 {cx + r} {cy}" fill="none"
      stroke="rgba(74,222,128,0.4)" stroke-width="3" stroke-linecap="round" />

  {:else if chartType === 'spread'}
    <!-- Spread line (simulates basis/kimchi premium) -->
    {@const deltas = bars.map(b => b.delta)}
    <path d={areaPath(deltas)} fill="rgba(99,179,237,0.06)" />
    <path d={linePath(deltas)} fill="none"
      stroke="rgba(99,179,237,0.7)" stroke-width="1.2" stroke-linecap="round" />
    <!-- Zero line -->
    {@const dMin = Math.min(...deltas)}
    {@const dMax = Math.max(...deltas)}
    {@const dRange = dMax - dMin || 1}
    {@const dzY = pad + h - ((0 - dMin) / dRange) * h}
    {#if dzY > pad && dzY < pad + h}
      <line x1={pad} y1={dzY} x2={pad + w} y2={dzY} stroke="rgba(255,255,255,0.1)" stroke-width="0.5" stroke-dasharray="2,2" />
    {/if}

  {:else}
    <!-- Default: price sparkline -->
    <path d={areaPath(closes)} fill={priceUp ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)'} />
    <path d={linePath(closes)} fill="none"
      stroke={priceUp ? '#4ade80' : '#f87171'} stroke-width="1" stroke-linecap="round" />
  {/if}
</svg>
{/if}

<style>
  .mini-chart { display: block; flex-shrink: 0; border-radius: 2px; }
</style>
