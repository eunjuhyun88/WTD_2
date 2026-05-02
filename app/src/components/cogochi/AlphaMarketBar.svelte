<script lang="ts">
  import type { AlphaBuckets } from '$lib/stores/alphaBuckets';
  import { EMPTY_THERMO_DATA, type ThermoData } from '$lib/hubs/terminal/marketPulse';

  let {
    thermo = EMPTY_THERMO_DATA,
    buckets,
  }: {
    thermo?: ThermoData;
    buckets: AlphaBuckets | null;
  } = $props();

  const bucket = $derived(
    buckets ?? {
      strongBull: null,
      bull: null,
      neutral: null,
      bear: null,
      strongBear: null,
      extremeFR: null
    }
  );

  function fmtK(v: number | null): string {
    if (v == null) return '--';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
    return String(v);
  }

  function fmtKrw(v: number | null): string {
    if (v == null) return '--';
    return Math.round(v).toLocaleString('en-US');
  }

  function fmtKimchi(v: number | null): string {
    if (v == null) return '--';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  }

  function bucketNum(n: number | undefined | null): string {
    return n == null ? '--' : String(n);
  }

  function fgLabel(v: number | null): string {
    if (v == null) return 'neutral';
    if (v <= 30) return 'fear';
    if (v >= 70) return 'greed';
    return 'balanced';
  }

  function fgColor(v: number | null): string {
    if (v == null) return 'var(--sc-text-3)';
    if (v <= 30) return 'var(--sc-good)';
    if (v >= 70) return 'var(--sc-bad)';
    return 'var(--sc-accent)';
  }

  function kimchiLabel(v: number | null): string {
    if (v == null) return 'premium';
    if (v > 3) return 'hot';
    if (v < -2) return 'discount';
    return 'flat';
  }

  function kimchiColor(v: number | null): string {
    if (v == null) return 'var(--sc-text-2)';
    if (v > 2) return 'var(--sc-bad)';
    if (v < -1) return 'var(--sc-good)';
    return 'var(--sc-text-0)';
  }

  function btcTxLabel(v: number | null): string {
    if (v == null) return 'network';
    if (v > 450000) return 'active';
    if (v < 250000) return 'slow';
    return 'normal';
  }

  function btcTxColor(v: number | null): string {
    if (v == null) return 'var(--sc-text-2)';
    if (v > 450000) return 'var(--sc-good)';
    if (v < 250000) return 'var(--sc-bad)';
    return 'var(--sc-text-0)';
  }

  function mempoolLabel(v: number | null): string {
    if (v == null) return 'pending';
    if (v > 80000) return 'crowded';
    if (v < 30000) return 'clear';
    return 'normal';
  }

  function mempoolColor(v: number | null): string {
    if (v == null) return 'var(--sc-text-2)';
    if (v > 80000) return 'var(--sc-bad)';
    if (v < 30000) return 'var(--sc-good)';
    return 'var(--sc-text-0)';
  }

  function feeColor(v: number | null): string {
    if (v == null) return 'var(--sc-text-2)';
    if (v > 80) return 'var(--sc-bad)';
    if (v < 30) return 'var(--sc-good)';
    return 'var(--sc-warn)';
  }

  const thermoChips = $derived([
    {
      key: 'fg',
      short: 'F&G',
      value: thermo.fearGreed == null ? '--' : String(thermo.fearGreed),
      meta: fgLabel(thermo.fearGreed),
      tone: fgColor(thermo.fearGreed)
    },
    {
      key: 'kimchi',
      short: 'KIMP',
      value: fmtKimchi(thermo.kimchiPremium),
      meta: kimchiLabel(thermo.kimchiPremium),
      tone: kimchiColor(thermo.kimchiPremium)
    },
    {
      key: 'krw',
      short: 'KRW',
      value: fmtKrw(thermo.usdKrw),
      meta: 'usd/krw',
      tone: 'var(--sc-accent)'
    },
    {
      key: 'btcTx',
      short: 'BTC TX',
      value: fmtK(thermo.btcTx),
      meta: btcTxLabel(thermo.btcTx),
      tone: btcTxColor(thermo.btcTx)
    },
    {
      key: 'mempool',
      short: 'MEM',
      value: fmtK(thermo.mempoolPending),
      meta: mempoolLabel(thermo.mempoolPending),
      tone: mempoolColor(thermo.mempoolPending)
    },
    {
      key: 'fee',
      short: 'FEE',
      value: thermo.fastestFee == null ? '--' : String(thermo.fastestFee),
      meta: 'sat/vB',
      tone: feeColor(thermo.fastestFee)
    }
  ]);

  const bucketChips = $derived([
    { key: 'strongBull', short: 'SB', value: bucketNum(bucket.strongBull), meta: '>=55', tone: 'var(--sc-good)' },
    { key: 'bull', short: 'B', value: bucketNum(bucket.bull), meta: '25~54', tone: 'var(--sc-good)' },
    { key: 'neutral', short: 'N', value: bucketNum(bucket.neutral), meta: 'mid', tone: 'var(--sc-accent)' },
    { key: 'bear', short: 'BR', value: bucketNum(bucket.bear), meta: '-25~-54', tone: 'var(--sc-bad)' },
    { key: 'strongBear', short: 'SBR', value: bucketNum(bucket.strongBear), meta: '<=-55', tone: 'var(--sc-bad)' },
    { key: 'extremeFR', short: 'FR', value: bucketNum(bucket.extremeFR), meta: 'hot', tone: 'var(--sc-warn)' }
  ]);

  const stripItems = $derived([
    ...thermoChips.map((chip) => ({ ...chip, lane: 'thermo' })),
    ...bucketChips.map((chip) => ({ ...chip, lane: 'breadth' }))
  ]);

</script>

<div class="market-pulse" aria-label="Global market pulse">
  <div class="pulse-label">
    <span class="pulse-dot" aria-hidden="true"></span>
    <span class="pulse-title">Market Pulse</span>
  </div>

  <div class="pulse-marquee">
    {#each [0, 1] as copyIndex}
      <div class="pulse-track" aria-hidden={copyIndex === 1}>
        {#each stripItems as chip}
          <div class="chip" style={`--chip-tone:${chip.tone}`}>
            <span class="chip-lane">{chip.lane === 'thermo' ? 'T' : 'B'}</span>
            <span class="chip-key">{chip.short}</span>
            <span class="chip-value" style={`color:${chip.tone}`}>{chip.value}</span>
            <span class="chip-meta">{chip.meta}</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .market-pulse {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }

  .pulse-label {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 22px;
    padding: 0 9px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: linear-gradient(180deg, rgba(12, 18, 29, 0.86), rgba(8, 11, 18, 0.7));
    white-space: nowrap;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: rgba(219, 154, 159, 0.88);
    box-shadow: 0 0 12px rgba(219, 154, 159, 0.28);
    flex-shrink: 0;
  }

  .pulse-title {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--sc-text-0);
    text-transform: uppercase;
  }

  .pulse-marquee {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    mask-image: linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%);
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%);
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background:
      linear-gradient(180deg, rgba(12, 18, 29, 0.68), rgba(8, 11, 18, 0.52)),
      radial-gradient(circle at left center, rgba(219, 154, 159, 0.07), transparent 26%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    min-height: 22px;
  }

  .pulse-track {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: max-content;
    padding: 0 6px;
    flex: 0 0 auto;
    animation: market-pulse-marquee 34s linear infinite;
  }

  .chip {
    --chip-tone: var(--sc-accent);
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    padding: 2px 7px 3px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 999px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
      linear-gradient(180deg, color-mix(in srgb, var(--chip-tone) 8%, transparent), transparent 84%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    white-space: nowrap;
    flex: 0 0 auto;
  }

  .chip-lane {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: rgba(219, 154, 159, 0.64);
    text-transform: uppercase;
  }

  .chip-key {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .chip-value {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    color: var(--sc-text-0);
    font-variant-numeric: tabular-nums;
  }

  .chip-meta {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    line-height: 1.1;
    letter-spacing: 0.05em;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  @keyframes market-pulse-marquee {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(calc(-100% - 6px));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse-track {
      animation: none;
    }
  }

  @media (max-width: 900px) {
    .pulse-label {
      display: none;
    }
    .pulse-marquee {
      min-height: 20px;
    }
    .pulse-track {
      animation-duration: 28s;
    }
    .chip {
      padding: 2px 6px 3px;
    }
  }
</style>
