<script lang="ts">
  import ChartStage from '../../shared/chart/ChartStage.svelte';
  import { fromAnalyzeSnapshot } from '$lib/chart-engine/app';

  type ChartKline = { t: number; o: number; h: number; l: number; c: number; v: number };
  type TimePoint = { t: number; v: number };
  type Tone = 'bull' | 'bear' | 'neutral' | 'warn' | 'cyan';
  type SignalChip = { key: string; label: string; value: string; tone: Tone };
  type TrackCard = {
    id: string;
    label: string;
    value: string;
    tone: Tone;
    mode: 'line' | 'histogram';
    points: TimePoint[];
  };

  let {
    data = [],
    currentPrice = 0,
    visible = true,
    annotations = [] as any[],
    tradePlan = null as any,
    indicators = null as any,
    symbol = '',
    timeframe = '',
    changePct = 0,
    snapshot = null as any,
    derivatives = null as any,
  }: {
    data: ChartKline[];
    currentPrice?: number;
    visible?: boolean;
    annotations?: any[];
    tradePlan?: any;
    indicators?: any;
    symbol?: string;
    timeframe?: string;
    changePct?: number;
    snapshot?: any;
    derivatives?: any;
  } = $props();

  const cvdSeries = $derived(buildCvdSeries(data));
  const volumeDeltaSeries = $derived(buildVolumeDeltaSeries(data));
  const bbWidthSeries = $derived(buildBbWidthSeries(indicators, data));
  const sessionHigh = $derived(data.length ? Math.max(...data.map((k) => k.h)) : null);
  const sessionLow = $derived(data.length ? Math.min(...data.map((k) => k.l)) : null);
  const latestVolume = $derived(data.length ? data[data.length - 1]?.v ?? null : null);
  const avgVolume = $derived(data.length ? average(data.slice(-20).map((k) => k.v)) : null);
  const srLevels = $derived(buildSrLevels(annotations));
  const trackCards = $derived(
    [
      {
        id: 'cvd',
        label: 'CVD',
        value: formatSignedCompact(cvdSeries.length ? cvdSeries[cvdSeries.length - 1]?.v ?? null : null),
        tone: (snapshot?.l11?.score > 0 ? 'bull' : snapshot?.l11?.score < 0 ? 'bear' : 'cyan') as Tone,
        mode: 'line' as const,
        points: cvdSeries,
      },
      {
        id: 'delta',
        label: 'VOL DELTA',
        value: formatSignedCompact(
          volumeDeltaSeries.length ? volumeDeltaSeries[volumeDeltaSeries.length - 1]?.v ?? null : null
        ),
        tone: ((volumeDeltaSeries.length && (volumeDeltaSeries[volumeDeltaSeries.length - 1]?.v ?? 0) >= 0)
          ? 'bull'
          : 'bear') as Tone,
        mode: 'histogram' as const,
        points: volumeDeltaSeries,
      },
      {
        id: 'bb',
        label: 'BB WIDTH',
        value: bbWidthSeries.length ? `${(bbWidthSeries[bbWidthSeries.length - 1]?.v ?? 0).toFixed(2)}%` : '--',
        tone: (snapshot?.l14?.bb_squeeze ? 'warn' : 'neutral') as Tone,
        mode: 'line' as const,
        points: bbWidthSeries,
      },
    ].filter((track): track is TrackCard => track.points.length > 1)
  );
  const signalChips = $derived(
    buildSignalChips({
      symbol,
      timeframe,
      changePct,
      currentPrice,
      snapshot,
      derivatives,
      latestVolume,
      avgVolume,
    })
  );
  const spec = $derived.by(() => {
    const base = fromAnalyzeSnapshot({
      symbol,
      timeframe,
      chart: data,
      annotations,
      indicators,
    });
    const referenceLines = [
      tradePlan?.entry
        ? { id: 'entry', price: tradePlan.entry, color: '#f5f7ff', lineWidth: 1, lineStyle: 0, title: 'ENTRY' }
        : null,
      tradePlan?.stopLoss
        ? { id: 'sl', price: tradePlan.stopLoss, color: '#ff537a', lineWidth: 1, lineStyle: 2, title: 'SL' }
        : null,
      tradePlan?.tp1
        ? { id: 'tp1', price: tradePlan.tp1, color: 'rgba(0, 233, 184, 0.52)', lineWidth: 1, lineStyle: 2, title: 'TP1' }
        : null,
      tradePlan?.tp2
        ? { id: 'tp2', price: tradePlan.tp2, color: 'rgba(0, 233, 184, 0.72)', lineWidth: 1, lineStyle: 2, title: 'TP2' }
        : null,
      tradePlan?.tp3
        ? { id: 'tp3', price: tradePlan.tp3, color: 'rgba(0, 233, 184, 0.92)', lineWidth: 1, lineStyle: 2, title: 'TP3' }
        : null,
    ].filter((line) => line !== null);

    return {
      ...base,
      referenceLines,
    };
  });

  function average(values: number[]): number | null {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function buildCvdSeries(klines: ChartKline[]): TimePoint[] {
    if (klines.length === 0) return [];
    let cumulative = 0;
    return klines.map((kline) => {
      const delta = signedVolumeDelta(kline);
      cumulative += delta;
      return { t: kline.t, v: cumulative };
    });
  }

  function buildVolumeDeltaSeries(klines: ChartKline[]): TimePoint[] {
    return klines.map((kline) => ({ t: kline.t, v: signedVolumeDelta(kline) }));
  }

  function buildBbWidthSeries(ind: any, klines: ChartKline[]): TimePoint[] {
    if (!ind?.bbUpper || !ind?.bbLower || !ind?.bbMiddle) return [];
    return ind.bbMiddle
      .map((mid: number, index: number) => {
        const upper = ind.bbUpper[index];
        const lower = ind.bbLower[index];
        const time = klines[index]?.t;
        if (!Number.isFinite(mid) || !Number.isFinite(upper) || !Number.isFinite(lower) || !time || mid === 0) {
          return null;
        }
        return { t: time, v: ((upper - lower) / mid) * 100 };
      })
      .filter((point: TimePoint | null): point is TimePoint => point !== null);
  }

  function buildSrLevels(ann: any[]): Array<{ label: string; price: number; tone: Tone }> {
    return (ann ?? [])
      .filter((item) => item?.price && (item.type === 'support' || item.type === 'resistance'))
      .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
      .slice(0, 4)
      .map((item) => ({
        label: `${item.type === 'support' ? 'S' : 'R'}${item.strength ? ` ${item.strength}` : ''}`,
        price: item.price,
        tone: item.type === 'support' ? 'bull' : 'bear',
      }));
  }

  function buildSignalChips(input: {
    symbol: string;
    timeframe: string;
    changePct: number;
    currentPrice: number;
    snapshot: any;
    derivatives: any;
    latestVolume: number | null;
    avgVolume: number | null;
  }): SignalChip[] {
    const priceTone: Tone = input.changePct > 0 ? 'bull' : input.changePct < 0 ? 'bear' : 'neutral';
    const funding = input.derivatives?.funding;
    const fundingTone: Tone =
      funding > 0.0005 ? 'bear' : funding < -0.0005 ? 'bull' : 'neutral';
    const volumeRatio =
      input.latestVolume != null && input.avgVolume != null && input.avgVolume > 0
        ? input.latestVolume / input.avgVolume
        : null;

    return [
      {
        key: 'price',
        label: input.symbol ? `${input.symbol.replace('USDT', '')} ${input.timeframe.toUpperCase()}` : 'PRICE',
        value: input.currentPrice ? `$${formatPrice(input.currentPrice)}` : '--',
        tone: priceTone,
      },
      {
        key: 'change',
        label: '24H',
        value: formatSignedPercent(input.changePct),
        tone: priceTone,
      },
      {
        key: 'alpha',
        label: 'ALPHA',
        value: input.snapshot?.alphaScore != null ? formatSignedInt(input.snapshot.alphaScore) : '--',
        tone: input.snapshot?.alphaScore > 0 ? 'bull' : input.snapshot?.alphaScore < 0 ? 'bear' : 'neutral',
      },
      {
        key: 'regime',
        label: 'REGIME',
        value: input.snapshot?.regime ?? '--',
        tone: 'cyan' as Tone,
      },
      {
        key: 'cvd',
        label: 'CVD',
        value: input.snapshot?.l11?.cvd_state ?? '--',
        tone: input.snapshot?.l11?.score > 0 ? 'bull' : input.snapshot?.l11?.score < 0 ? 'bear' : 'neutral',
      },
      {
        key: 'funding',
        label: 'FUNDING',
        value: funding != null ? `${(funding * 100).toFixed(4)}%` : '--',
        tone: fundingTone,
      },
      {
        key: 'ls',
        label: 'L/S',
        value: input.derivatives?.lsRatio != null ? input.derivatives.lsRatio.toFixed(2) : '--',
        tone:
          input.derivatives?.lsRatio > 1.1
            ? 'bear'
            : input.derivatives?.lsRatio < 0.9
              ? 'bull'
              : 'neutral',
      },
      {
        key: 'volume',
        label: 'VOL x20',
        value: volumeRatio != null ? `${volumeRatio.toFixed(2)}x` : '--',
        tone: volumeRatio != null && volumeRatio > 1.4 ? 'warn' : 'neutral',
      },
    ];
  }

  function signedVolumeDelta(kline: ChartKline): number {
    const body = Math.abs(kline.c - kline.o);
    const range = Math.max(kline.h - kline.l, 1e-9);
    const bias = body / range;
    return (kline.c >= kline.o ? 1 : -1) * kline.v * bias;
  }

  function formatCompact(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '--';
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(2);
  }

  function formatSignedCompact(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${value > 0 ? '+' : ''}${formatCompact(value)}`;
  }

  function formatSignedPercent(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  }

  function formatSignedInt(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${value > 0 ? '+' : ''}${Math.round(value)}`;
  }

  function formatPrice(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '--';
    if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  function toneStroke(tone: Tone): string {
    switch (tone) {
      case 'bull':
        return '#00e9b8';
      case 'bear':
        return '#ff537a';
      case 'warn':
        return '#ffbf5f';
      case 'cyan':
        return '#36d7ff';
      default:
        return '#8aa6be';
    }
  }

  function linePath(points: TimePoint[], width: number, height: number): string {
    if (points.length < 2) return '';
    const values = points.map((point) => point.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * width;
        const y = height - ((point.v - min) / range) * height;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  function histogramBars(
    points: TimePoint[],
    width: number,
    height: number
  ): Array<{ x: number; y: number; w: number; h: number; tone: Tone }> {
    if (points.length === 0) return [];
    const values = points.map((point) => point.v);
    const maxAbs = Math.max(...values.map((value) => Math.abs(value))) || 1;
    const barWidth = Math.max(width / Math.max(points.length, 1) - 1, 1);
    return points.map((point, index) => {
      const normalized = Math.abs(point.v) / maxAbs;
      const h = normalized * (height / 2);
      const x = (index / Math.max(points.length, 1)) * width;
      const y = point.v >= 0 ? height / 2 - h : height / 2;
      return {
        x,
        y,
        w: barWidth,
        h,
        tone: point.v >= 0 ? 'bull' : 'bear',
      };
    });
  }

  function toneClass(tone: Tone): string {
    switch (tone) {
      case 'bull':
        return 'tone-bull';
      case 'bear':
        return 'tone-bear';
      case 'warn':
        return 'tone-warn';
      case 'cyan':
        return 'tone-cyan';
      default:
        return 'tone-neutral';
    }
  }
</script>

<div class:muted={!visible} class="cg-shell">
  <div class="cg-topbar">
    {#each signalChips as chip}
      <div class={`cg-chip ${toneClass(chip.tone)}`}>
        <span class="cg-chip-label">{chip.label}</span>
        <span class="cg-chip-value">{chip.value}</span>
      </div>
    {/each}
  </div>

  <div class="cg-stage">
    <div class="cg-canvas">
      <ChartStage spec={spec} presentation="fill" />
    </div>

    <div class="cg-hud cg-hud-left">
      <div class="cg-hud-head">MARKET FRAME</div>
      <div class="cg-hud-row">
        <span>HIGH</span>
        <strong>{formatPrice(sessionHigh)}</strong>
      </div>
      <div class="cg-hud-row">
        <span>LOW</span>
        <strong>{formatPrice(sessionLow)}</strong>
      </div>
      <div class="cg-hud-row">
        <span>VOL</span>
        <strong>{formatCompact(latestVolume)}</strong>
      </div>
      <div class="cg-hud-row">
        <span>AVG20</span>
        <strong>{formatCompact(avgVolume)}</strong>
      </div>
      <div class="cg-hud-row">
        <span>SQZ</span>
        <strong>{snapshot?.l14?.bb_squeeze ? 'ACTIVE' : 'OFF'}</strong>
      </div>
    </div>

    <div class="cg-hud cg-hud-right">
      <div class="cg-hud-head">LEVEL STACK</div>
      {#if srLevels.length > 0}
        {#each srLevels as level}
          <div class="cg-level">
            <span class={`cg-level-tag ${toneClass(level.tone)}`}>{level.label}</span>
            <strong>{formatPrice(level.price)}</strong>
          </div>
        {/each}
      {:else}
        <div class="cg-level cg-level-empty">
          <span>No S/R</span>
          <strong>--</strong>
        </div>
      {/if}
    </div>
  </div>

  {#if trackCards.length > 0}
    <div class="cg-tracks">
      {#each trackCards as track}
        <div class="cg-track">
          <div class="cg-track-meta">
            <span class="cg-track-label">{track.label}</span>
            <span class={`cg-track-value ${toneClass(track.tone)}`}>{track.value}</span>
          </div>
          <svg class="cg-track-svg" viewBox="0 0 640 56" preserveAspectRatio="none">
            <line x1="0" y1="28" x2="640" y2="28" stroke="rgba(84, 118, 150, 0.16)" stroke-width="1"></line>
            {#if track.mode === 'histogram'}
              {#each histogramBars(track.points, 640, 56) as bar}
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.w}
                  height={bar.h}
                  fill={toneStroke(bar.tone)}
                  opacity="0.72"
                ></rect>
              {/each}
            {:else}
              <path d={linePath(track.points, 640, 48)} fill="none" stroke={toneStroke(track.tone)} stroke-width="2"></path>
            {/if}
          </svg>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cg-shell {
    height: 100%;
    min-height: 280px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    border: 1px solid rgba(39, 63, 86, 0.9);
    border-radius: 8px;
    background:
      radial-gradient(circle at top left, rgba(54, 215, 255, 0.07), transparent 30%),
      radial-gradient(circle at top right, rgba(0, 233, 184, 0.06), transparent 28%),
      linear-gradient(180deg, rgba(5, 12, 20, 0.98), rgba(3, 8, 14, 0.99));
    box-shadow:
      inset 0 1px 0 rgba(128, 171, 206, 0.05),
      0 12px 28px rgba(2, 5, 9, 0.34);
    overflow: hidden;
    position: relative;
  }

  .cg-shell.muted {
    opacity: 0.72;
  }

  .cg-topbar {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid rgba(39, 63, 86, 0.85);
    background: linear-gradient(180deg, rgba(7, 16, 28, 0.96), rgba(5, 10, 18, 0.85));
  }

  .cg-chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid rgba(39, 63, 86, 0.9);
    border-radius: 4px;
    background: rgba(8, 19, 32, 0.9);
  }

  .cg-chip-label,
  .cg-track-label,
  .cg-hud-head {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(122, 156, 185, 0.68);
  }

  .cg-chip-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(223, 236, 247, 0.92);
  }

  .cg-stage {
    position: relative;
    min-height: 0;
    padding: 10px;
  }

  .cg-canvas {
    height: 100%;
    min-height: 320px;
  }

  .cg-hud {
    position: absolute;
    top: 18px;
    z-index: 3;
    width: 148px;
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid rgba(39, 63, 86, 0.88);
    border-radius: 6px;
    background: rgba(4, 12, 21, 0.84);
    backdrop-filter: blur(10px);
  }

  .cg-hud-left { left: 18px; }
  .cg-hud-right { right: 18px; }

  .cg-hud-row,
  .cg-level {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    color: rgba(223, 236, 247, 0.92);
  }

  .cg-level-tag {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .cg-tracks {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 8px 10px 10px;
    border-top: 1px solid rgba(39, 63, 86, 0.85);
    background: rgba(5, 12, 20, 0.82);
  }

  .cg-track {
    padding: 8px;
    border: 1px solid rgba(39, 63, 86, 0.75);
    border-radius: 6px;
    background: rgba(7, 16, 28, 0.88);
  }

  .cg-track-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .cg-track-value {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
  }

  .cg-track-svg {
    width: 100%;
    height: 56px;
    display: block;
  }

  .tone-bull { color: #00e9b8; }
  .tone-bear { color: #ff537a; }
  .tone-warn { color: #ffbf5f; }
  .tone-cyan { color: #36d7ff; }
  .tone-neutral { color: #8aa6be; }

  @media (max-width: 960px) {
    .cg-topbar,
    .cg-tracks {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .cg-hud {
      position: static;
      width: auto;
      margin-top: 8px;
    }

    .cg-stage {
      display: grid;
      gap: 8px;
    }
  }
</style>
