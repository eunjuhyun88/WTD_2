<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
  import type { DrawingManager, Drawing } from '$lib/chart/DrawingManager';
  import { chartAIOverlay, type AIOverlayShape, type AIRangeBox, type AIArrow, type AIAnnotation } from '$lib/stores/chartAIOverlay';

  const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
  const FIB_COLORS: Record<number, string> = {
    0: '#787B86', 0.236: '#F23645', 0.382: '#FF9800',
    0.5: '#4CAF50', 0.618: '#089981', 0.786: '#2196F3', 1: '#787B86',
  };

  interface Props {
    chart: IChartApi | null;
    series: ISeriesApi<SeriesType> | null;
    containerEl: HTMLElement | undefined;
    mgr: DrawingManager | null;
    symbol: string;
  }
  let { chart, series, containerEl, mgr, symbol }: Props = $props();

  let vpv = $state(0);
  let drawVersion = $state(0);
  let svgW = $state(0);
  let svgH = $state(0);

  function toX(time: number): number {
    if (!chart) return -9999;
    return chart.timeScale().timeToCoordinate(time as UTCTimestamp) ?? -9999;
  }
  function toY(price: number): number {
    if (!series) return -9999;
    return series.priceToCoordinate(price) ?? -9999;
  }

  const drawings = $derived.by<Drawing[]>(() => {
    void vpv; void drawVersion;
    return mgr?.getDrawings() ?? [];
  });
  const preview = $derived.by<Drawing | null>(() => {
    void vpv; void drawVersion;
    return mgr?.getPreviewDrawing() ?? null;
  });
  const aiShapes = $derived.by<AIOverlayShape[]>(() => {
    void vpv;
    const ov = $chartAIOverlay;
    if (!ov.symbol || ov.symbol !== symbol) return [];
    return ov.shapes.filter(s => s.kind !== 'line');
  });

  let unsubRange: (() => void) | null = null;
  let unsubCross: (() => void) | null = null;
  $effect(() => {
    if (!chart) return;
    const bump = () => { vpv++; };
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    chart.subscribeCrosshairMove(bump as Parameters<IChartApi['subscribeCrosshairMove']>[0]);
    unsubRange = () => chart?.timeScale().unsubscribeVisibleLogicalRangeChange(bump);
    unsubCross = () => chart?.unsubscribeCrosshairMove(bump as Parameters<IChartApi['subscribeCrosshairMove']>[0]);
    return () => { unsubRange?.(); unsubCross?.(); unsubRange = unsubCross = null; };
  });

  $effect(() => {
    if (!mgr) return;
    mgr.onRenderNeeded = () => { drawVersion++; };
    return () => { if (mgr) mgr.onRenderNeeded = null; };
  });

  let resizeObs: ResizeObserver | null = null;
  $effect(() => {
    if (!containerEl) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) { svgW = r.width; svgH = r.height; }
      vpv++;
    });
    obs.observe(containerEl);
    resizeObs = obs;
    const r = containerEl.getBoundingClientRect();
    svgW = r.width; svgH = r.height;
    return () => { obs.disconnect(); resizeObs = null; };
  });

  onDestroy(() => {
    unsubRange?.(); unsubCross?.();
    resizeObs?.disconnect();
  });

  function fibLines(d: Drawing): Array<{ y: number; level: number; price: number }> {
    if (d.points.length < 2) return [];
    const hi = Math.max(d.points[0].price, d.points[1].price);
    const lo = Math.min(d.points[0].price, d.points[1].price);
    const range = hi - lo;
    return FIB_LEVELS.map(lv => ({ y: toY(lo + range * (1 - lv)), level: lv, price: lo + range * (1 - lv) }));
  }

  function extendedPts(x1: number, y1: number, x2: number, y2: number): [number, number, number, number] {
    if (x1 === x2) return [x1, 0, x2, svgH];
    const slope = (y2 - y1) / (x2 - x1);
    return [0, y1 + slope * (0 - x1), svgW, y1 + slope * (svgW - x1)];
  }

  function hexAlpha(color: string, a: number): string {
    if (color.startsWith('#') && color.length <= 7) {
      return color + Math.round(a * 255).toString(16).padStart(2, '0');
    }
    return color;
  }
</script>

{#if svgW > 0 && svgH > 0}
<svg class="drawing-overlay" width={svgW} height={svgH} aria-hidden="true">
  {#each [...drawings, ...(preview ? [preview] : [])] as d (d.id)}
    {@const col = d.style.color}
    {@const lw = d.style.lineWidth}
    {@const dash = d.style.dash?.join(',') ?? undefined}
    {@const op = d.style.opacity ?? 1}

    {#if d.type === 'horizontalLine' && d.points[0]}
      {@const y = toY(d.points[0].price)}
      <line x1={0} y1={y} x2={svgW} y2={y} stroke={col} stroke-width={lw} stroke-dasharray={dash} opacity={op}/>
      <text x={4} y={y - 3} fill={col} font-size="10" font-family="monospace" opacity={op}>{d.points[0].price.toFixed(2)}</text>

    {:else if d.type === 'verticalLine' && d.points[0]}
      {@const x = toX(d.points[0].time)}
      <line x1={x} y1={0} x2={x} y2={svgH} stroke={col} stroke-width={lw} stroke-dasharray={dash} opacity={op}/>

    {:else if d.type === 'trendLine' && d.points.length >= 2}
      <line x1={toX(d.points[0].time)} y1={toY(d.points[0].price)} x2={toX(d.points[1].time)} y2={toY(d.points[1].price)} stroke={col} stroke-width={lw} stroke-dasharray={dash} opacity={op}/>

    {:else if d.type === 'extendedLine' && d.points.length >= 2}
      {@const [ex1,ey1,ex2,ey2] = extendedPts(toX(d.points[0].time), toY(d.points[0].price), toX(d.points[1].time), toY(d.points[1].price))}
      <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke={col} stroke-width={lw} stroke-dasharray={dash} opacity={op}/>

    {:else if d.type === 'rectangle' && d.points.length >= 2}
      {@const x1=toX(d.points[0].time)} {@const y1=toY(d.points[0].price)}
      {@const x2=toX(d.points[1].time)} {@const y2=toY(d.points[1].price)}
      <rect x={Math.min(x1,x2)} y={Math.min(y1,y2)} width={Math.abs(x2-x1)} height={Math.abs(y2-y1)} fill={hexAlpha(col, 0.1)} stroke={col} stroke-width={lw} stroke-dasharray={dash} opacity={op}/>

    {:else if d.type === 'fibRetracement' && d.points.length >= 2}
      {@const x1=toX(d.points[0].time)} {@const x2=toX(d.points[1].time)}
      {#each fibLines(d) as fl}
        <line x1={Math.min(x1,x2)} y1={fl.y} x2={Math.max(x1,x2)} y2={fl.y} stroke={FIB_COLORS[fl.level] ?? '#888'} stroke-width={lw}/>
        <text x={Math.min(x1,x2)+2} y={fl.y-2} fill={FIB_COLORS[fl.level] ?? '#888'} font-size="9" font-family="monospace">{(fl.level*100).toFixed(1)}%  {fl.price.toFixed(2)}</text>
      {/each}

    {:else if d.type === 'textLabel' && d.points[0] && d.label}
      <text x={toX(d.points[0].time)} y={toY(d.points[0].price)} fill={col} font-size="11" font-weight="bold" font-family="sans-serif" opacity={op}>{d.label}</text>
    {/if}
  {/each}

  {#each aiShapes as shape, i (i)}
    {#if shape.kind === 'range'}
      {@const s = shape as AIRangeBox}
      {@const x1=toX(s.fromTime)} {@const y1=toY(s.fromPrice)}
      {@const x2=toX(s.toTime)}   {@const y2=toY(s.toPrice)}
      <rect x={Math.min(x1,x2)} y={Math.min(y1,y2)} width={Math.abs(x2-x1)} height={Math.abs(y2-y1)} fill={s.color} fill-opacity="0.10" stroke={s.color} stroke-width="1" stroke-opacity="0.45"/>
      {#if s.label}<text x={Math.min(x1,x2)+4} y={Math.min(y1,y2)+11} fill={s.color} font-size="8" opacity="0.75">{s.label}</text>{/if}

    {:else if shape.kind === 'arrow'}
      {@const s = shape as AIArrow}
      {@const ax=toX(s.fromTime)} {@const ay=toY(s.fromPrice)}
      {@const bx=toX(s.toTime)}   {@const by=toY(s.toPrice)}
      {@const ang=Math.atan2(by-ay,bx-ax)} {@const hd=6}
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke={s.color} stroke-width="1.5"/>
      <polygon points="{bx},{by} {bx-hd*Math.cos(ang-Math.PI/6)},{by-hd*Math.sin(ang-Math.PI/6)} {bx-hd*Math.cos(ang+Math.PI/6)},{by-hd*Math.sin(ang+Math.PI/6)}" fill={s.color}/>
      {#if s.label}<text x={bx+6} y={by} fill={s.color} font-size="9">{s.label}</text>{/if}

    {:else if shape.kind === 'annotation'}
      {@const s = shape as AIAnnotation}
      <circle cx={toX(s.time)} cy={toY(s.price)} r="3" fill={s.color}/>
      <text x={toX(s.time)+6} y={toY(s.price)} fill={s.color} font-size="9">{s.text}</text>
    {/if}
  {/each}
</svg>
{/if}

<style>
  .drawing-overlay {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 4;
    overflow: visible;
  }
</style>
