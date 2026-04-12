<script lang="ts">
  import type { BinanceKline } from '$lib/engine/types';
  import ChartStage from '../chart/ChartStage.svelte';
  import { fromLabReplay } from '$lib/chart-engine/app';

  export interface ChartMarker {
    time: number;
    position: 'aboveBar' | 'belowBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown' | 'circle';
    text: string;
  }

  export interface PriceLine {
    price: number;
    color: string;
    lineWidth: number;
    lineStyle: number;
    title: string;
  }

  const {
    klines = [],
    revealedCount = 0,
    markers = [],
    priceLines = [],
    mode = 'auto',
  } = $props<{
    klines: BinanceKline[];
    revealedCount: number;
    markers: ChartMarker[];
    priceLines: PriceLine[];
    mode: 'auto' | 'manual';
  }>();

  const spec = $derived(
    fromLabReplay({
      klines,
      revealedCount,
      markers,
      priceLines,
      mode,
    })
  );
</script>

<div class="lab-chart">
  <ChartStage spec={spec} presentation="fill" chrome="workbench" />
</div>

<style>
  .lab-chart {
    width: 100%;
    height: 100%;
    min-height: 300px;
    border-radius: 8px;
    overflow: hidden;
    background: #0a0f1a;
  }
</style>
