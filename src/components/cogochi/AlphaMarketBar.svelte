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
</script>

<aside class="market-dock" aria-label="Global market pulse">
  <div class="dock-head">
    <span class="dock-title">MARKET PULSE</span>
    <span class="dock-copy">macro + scan breadth</span>
  </div>

  <div class="dock-section">
    <span class="section-label">THERMO</span>
    <div class="chip-row">
      {#each thermoChips as chip}
        <div class="chip">
          <span class="chip-key">{chip.short}</span>
          <span class="chip-value" style="color:{chip.tone}">{chip.value}</span>
          <span class="chip-meta">{chip.meta}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="dock-section">
    <span class="section-label">BREADTH</span>
    <div class="chip-row chip-row-buckets">
      {#each bucketChips as chip}
        <div class="chip chip-bucket">
          <span class="chip-key">{chip.short}</span>
          <span class="chip-value" style="color:{chip.tone}">{chip.value}</span>
          <span class="chip-meta">{chip.meta}</span>
        </div>
      {/each}
    </div>
  </div>
</aside>

<style>
  .market-dock {
    position: fixed;
    top: calc(var(--sc-header-h, 44px) + 12px);
    right: max(14px, calc((100vw - 1080px) / 2 + 14px));
    width: min(500px, calc(100vw - 28px));
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid rgba(219, 154, 159, 0.14);
    border-radius: 12px;
    background:
      linear-gradient(180deg, rgba(8, 13, 23, 0.9), rgba(8, 13, 23, 0.82)),
      radial-gradient(circle at top right, rgba(219, 154, 159, 0.12), transparent 30%);
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
    z-index: calc(var(--sc-z-header) - 1);
  }

  .dock-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .dock-title {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 15px;
    letter-spacing: 0.1em;
    color: var(--sc-text-0);
  }

  .dock-copy {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .dock-section {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .section-label {
    width: 50px;
    flex-shrink: 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .chip-row {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
  }

  .chip {
    min-width: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'key value'
      'meta meta';
    gap: 2px 6px;
    padding: 6px 8px 7px;
    border: 1px solid rgba(219, 154, 159, 0.1);
    border-radius: 9px;
    background: rgba(14, 22, 35, 0.74);
  }

  .chip-bucket {
    padding-inline: 8px;
  }

  .chip-key {
    grid-area: key;
    align-self: center;
    font-family: var(--sc-font-body, sans-serif);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .chip-value {
    grid-area: value;
    justify-self: end;
    font-family: var(--sc-font-mono, monospace);
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    color: var(--sc-text-0);
    font-variant-numeric: tabular-nums;
  }

  .chip-meta {
    grid-area: meta;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    line-height: 1.1;
    letter-spacing: 0.02em;
    color: var(--sc-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 1200px) {
    .market-dock {
      width: min(500px, calc(100vw - 24px));
      right: 12px;
    }

    .chip-row {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 768px) {
    .market-dock {
      top: calc(var(--sc-header-h-mobile, 36px) + 10px);
      bottom: auto;
      left: 10px;
      right: 10px;
      width: auto;
      padding: 8px 9px;
      gap: 7px;
    }

    .dock-head {
      gap: 8px;
    }

    .dock-title {
      font-size: 14px;
    }

    .dock-copy {
      font-size: 9px;
    }

    .dock-section {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }

    .section-label {
      width: auto;
    }

    .chip-row {
      display: flex;
      overflow-x: auto;
      padding-bottom: 2px;
      gap: 6px;
      scrollbar-width: none;
    }

    .chip-row::-webkit-scrollbar {
      display: none;
    }

    .chip {
      min-width: 88px;
      flex: 0 0 auto;
      padding: 6px 8px 7px;
    }

    .chip-value {
      font-size: 12px;
    }

    .chip-meta,
    .chip-key,
    .section-label {
      font-size: 8px;
    }
  }
</style>
