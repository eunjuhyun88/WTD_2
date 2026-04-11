<script lang="ts">
  import type { AlphaBuckets } from '$lib/stores/alphaBuckets';

  interface ThermometerData {
    fearGreed: number | null;
    btcDominance: number | null;
    kimchiPremium: number | null;
    usdKrw: number | null;
    btcTx: number | null;
    mempoolPending: number | null;
    fastestFee: number | null;
  }

  let {
    thermo,
    buckets,
  }: {
    thermo: ThermometerData;
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
    ...thermoChips.map((chip) => ({ ...chip, group: 'thermo' })),
    ...bucketChips.map((chip) => ({ ...chip, group: 'breadth' }))
  ]);
</script>

<aside class="market-dock" aria-label="Global market pulse">
  <div class="dock-head">
    <div class="dock-title-wrap">
      <span class="dock-dot" aria-hidden="true"></span>
      <span class="dock-title">Market Pulse</span>
    </div>
    <span class="dock-copy">macro + breadth</span>
  </div>

  <div class="strip-row">
    {#each stripItems as chip}
      <div class="chip" style={`--chip-tone:${chip.tone}`}>
        <span class="chip-group">{chip.group === 'thermo' ? 'T' : 'B'}</span>
        <span class="chip-key">{chip.short}</span>
        <span class="chip-value" style="color:{chip.tone}">{chip.value}</span>
        <span class="chip-meta">{chip.meta}</span>
      </div>
    {/each}
  </div>
</aside>

<style>
  .market-dock {
    position: relative;
    width: 100%;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    background:
      linear-gradient(180deg, rgba(10, 10, 10, 0.9), rgba(5, 5, 5, 0.84)),
      radial-gradient(circle at top right, rgba(219, 154, 159, 0.08), transparent 30%);
    backdrop-filter: blur(16px) saturate(1.04);
    -webkit-backdrop-filter: blur(16px) saturate(1.04);
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }

  .dock-head {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
  }

  .dock-title-wrap {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .dock-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(219, 154, 159, 0.88);
    box-shadow: 0 0 12px rgba(219, 154, 159, 0.28);
    flex-shrink: 0;
  }

  .dock-title {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--sc-text-0);
  }

  .dock-copy {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--sc-text-2);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .strip-row {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .strip-row::-webkit-scrollbar {
    display: none;
  }

  .chip {
    --chip-tone: var(--sc-accent);
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 8px 5px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 999px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.022), rgba(255, 255, 255, 0.012)),
      linear-gradient(180deg, color-mix(in srgb, var(--chip-tone) 8%, transparent), transparent 82%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    white-space: nowrap;
  }

  .chip-group {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: rgba(219, 154, 159, 0.68);
    text-transform: uppercase;
  }

  .chip-key {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .chip-value {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    color: var(--sc-text-0);
    font-variant-numeric: tabular-nums;
  }

  .chip-meta {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    line-height: 1.1;
    letter-spacing: 0.02em;
    color: var(--sc-text-3);
  }

  @media (max-width: 1200px) {
    .market-dock {
      gap: 10px;
    }
  }

  @media (max-width: 768px) {
    .market-dock {
      padding: 5px 8px;
      gap: 8px;
    }

    .dock-head {
      gap: 8px;
    }

    .dock-title {
      font-size: 13px;
    }

    .dock-copy {
      display: none;
    }

    .chip {
      gap: 5px;
      padding: 4px 7px;
    }

    .chip-value {
      font-size: 10px;
    }

    .chip-meta,
    .chip-key,
    .chip-group {
      font-size: 8px;
    }
  }
</style>
