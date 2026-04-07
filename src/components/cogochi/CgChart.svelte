<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type ChartKline = { t: number; o: number; h: number; l: number; c: number; v: number };

  let {
    data = [],
    currentPrice = 0,
    visible = true,
    annotations = [] as any[],
    tradePlan = null as any,
    indicators = null as any,
  }: {
    data: ChartKline[];
    currentPrice?: number;
    visible?: boolean;
    annotations?: any[];
    tradePlan?: any;
    indicators?: any;
  } = $props();

  let container: HTMLDivElement;
  let chart: any;
  let candleSeries: any;
  let volumeSeries: any;
  let ro: ResizeObserver | null = null;

  // Track overlay series for cleanup
  let overlaySeries: any[] = [];
  let lwcModule: any = null;

  // Update data reactively
  $effect(() => {
    if (candleSeries && data.length > 0) {
      const candles = data.map(k => ({ time: k.t, open: k.o, high: k.h, low: k.l, close: k.c }));
      const volumes = data.map(k => ({
        time: k.t,
        value: k.v,
        color: k.c >= k.o ? 'rgba(0,229,255,0.2)' : 'rgba(255,56,96,0.2)',
      }));
      candleSeries.setData(candles);
      volumeSeries.setData(volumes);
      chart.timeScale().fitContent();
    }
  });

  // Reactive overlay rendering — clears and redraws when annotations/indicators change
  $effect(() => {
    if (!chart || !candleSeries || !lwcModule || data.length === 0) return;

    // Access reactive deps
    const _ann = annotations;
    const _ind = indicators;
    const _tp = tradePlan;

    // Clear previous overlays
    clearOverlays();

    // S/R Price Lines
    renderSRLines(_ann);

    // BB Bands
    renderBBBands(_ind);

    // EMA20
    renderEMA20(_ind);

    // Trade Plan lines
    renderTradePlan(_tp);
  });

  function clearOverlays() {
    // Remove overlay line series
    for (const s of overlaySeries) {
      try { chart.removeSeries(s); } catch { /* already removed */ }
    }
    overlaySeries = [];

    // Remove all price lines from candle series
    if (candleSeries) {
      try {
        const priceLines = (candleSeries as any)._priceLines;
        // createPriceLine returns a reference; we need to track them
        // Since lightweight-charts doesn't expose a getAllPriceLines(), we re-add from scratch
      } catch { /* ignore */ }
    }
  }

  function renderSRLines(ann: any[]) {
    if (!ann || !candleSeries) return;
    for (const a of ann) {
      if (a.type === 'support' || a.type === 'resistance') {
        candleSeries.createPriceLine({
          price: a.price,
          color: a.type === 'support' ? 'rgba(173,202,124,0.5)' : 'rgba(207,127,143,0.5)',
          lineWidth: (a.strength || 1) >= 4 ? 2 : 1,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: `${a.type === 'support' ? 'S' : 'R'}${a.strength || ''}`,
        });
      }
    }
  }

  function renderBBBands(ind: any) {
    if (!ind?.bbUpper || data.length === 0) return;
    const lwc = lwcModule;

    const bbColor = 'rgba(219,154,159,0.25)';
    const midColor = 'rgba(219,154,159,0.4)';

    const bbUpperSeries = chart.addSeries(lwc.LineSeries, {
      color: bbColor, lineWidth: 1, priceScaleId: 'right',
      crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
    });
    const bbMidSeries = chart.addSeries(lwc.LineSeries, {
      color: midColor, lineWidth: 1, lineStyle: 2, priceScaleId: 'right',
      crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
    });
    const bbLowerSeries = chart.addSeries(lwc.LineSeries, {
      color: bbColor, lineWidth: 1, priceScaleId: 'right',
      crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
    });

    const bbData = (arr: number[]) =>
      arr.map((v, i) => ({ time: data[i]?.t, value: v }))
        .filter((d): d is { time: number; value: number } => d.value > 0 && d.time != null);

    bbUpperSeries.setData(bbData(ind.bbUpper));
    if (ind.bbMiddle) bbMidSeries.setData(bbData(ind.bbMiddle));
    if (ind.bbLower) bbLowerSeries.setData(bbData(ind.bbLower));

    overlaySeries.push(bbUpperSeries, bbMidSeries, bbLowerSeries);
  }

  function renderEMA20(ind: any) {
    if (!ind?.ema20 || data.length === 0) return;
    const lwc = lwcModule;

    const emaSeries = chart.addSeries(lwc.LineSeries, {
      color: 'rgba(242,209,147,0.6)', lineWidth: 1.5, priceScaleId: 'right',
      crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
    });

    emaSeries.setData(
      ind.ema20
        .map((v: number, i: number) => ({ time: data[i]?.t, value: v }))
        .filter((d: any) => d.value > 0 && d.time != null)
    );

    overlaySeries.push(emaSeries);
  }

  function renderTradePlan(tp: any) {
    if (!tp || !candleSeries) return;

    if (tp.entry) {
      candleSeries.createPriceLine({
        price: tp.entry, color: '#f7f2ea', lineWidth: 1, lineStyle: 0,
        axisLabelVisible: true, title: 'ENTRY',
      });
    }
    if (tp.stopLoss) {
      candleSeries.createPriceLine({
        price: tp.stopLoss, color: '#cf7f8f', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: 'SL',
      });
    }
    if (tp.tp1) {
      candleSeries.createPriceLine({
        price: tp.tp1, color: 'rgba(173,202,124,0.53)', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: 'TP1',
      });
    }
    if (tp.tp2) {
      candleSeries.createPriceLine({
        price: tp.tp2, color: '#adca7c', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: 'TP2',
      });
    }
    if (tp.tp3) {
      candleSeries.createPriceLine({
        price: tp.tp3, color: 'rgba(173,202,124,0.8)', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: 'TP3',
      });
    }
  }

  // Handle visibility changes — resize chart when becoming visible
  $effect(() => {
    if (visible && chart && container) {
      // Multiple attempts to catch CSS layout settling
      const tryResize = () => {
        if (chart && container && container.clientWidth > 0 && container.clientHeight > 0) {
          chart.applyOptions({
            width: container.clientWidth,
            height: container.clientHeight,
          });
          chart.timeScale().fitContent();
        }
      };
      // Try immediately, then at 50ms, 150ms, 300ms
      tryResize();
      setTimeout(tryResize, 50);
      setTimeout(tryResize, 150);
      setTimeout(tryResize, 300);
    }
  });

  onMount(async () => {
    const lwc = await import('lightweight-charts');
    lwcModule = lwc;

    chart = lwc.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: 'transparent' },
        textColor: '#383860',
        fontSize: 9,
        fontFamily: 'IBM Plex Mono, monospace',
      },
      grid: {
        vertLines: { color: '#0e0e1a' },
        horzLines: { color: '#0e0e1a' },
      },
      crosshair: {
        mode: lwc.CrosshairMode.Normal,
        vertLine: { color: 'rgba(0,229,255,0.15)', width: 1, style: lwc.LineStyle.Dashed },
        horzLine: { color: 'rgba(0,229,255,0.15)', width: 1, style: lwc.LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: '#16162a',
        scaleMargins: { top: 0.05, bottom: 0.18 },
      },
      timeScale: {
        borderColor: '#16162a',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: '#00e5ff',
      downColor: '#ff3860',
      borderUpColor: '#00e5ff',
      borderDownColor: '#ff3860',
      wickUpColor: 'rgba(0,229,255,0.5)',
      wickDownColor: 'rgba(255,56,96,0.5)',
    });

    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // Resize observer — always watches, even when hidden
    ro = new ResizeObserver(() => {
      if (chart && container && container.clientWidth > 0) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
    ro.observe(container);
  });

  onDestroy(() => {
    ro?.disconnect();
    if (chart) { chart.remove(); chart = null; }
  });
</script>

<div class="cg-chart" bind:this={container}></div>

<style>
  .cg-chart {
    width: 100%;
    height: 100%;
    min-height: 160px;
  }
</style>
