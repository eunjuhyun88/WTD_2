<script lang="ts">
  interface ThermometerData {
    fearGreed?: number;
    btcDominance?: number;
    kimchiPremium?: number;
    btcTx?: number;
    mempoolPending?: number;
    fastestFee?: number;
    usdKrw?: number;
  }

  let { data }: { data: ThermometerData } = $props();

  // --- derived formatting helpers ---

  let fgColor = $derived.by(() => {
    const v = data.fearGreed;
    if (v == null) return 'var(--sc-text-3)';
    if (v < 30) return 'var(--sc-good)';
    if (v > 70) return 'var(--sc-bad)';
    return 'var(--sc-text-2)';
  });

  let fgLabel = $derived.by(() => {
    const v = data.fearGreed;
    if (v == null) return '--';
    if (v < 25) return 'EXT FEAR';
    if (v < 40) return 'FEAR';
    if (v <= 60) return 'NEUTRAL';
    if (v <= 75) return 'GREED';
    return 'EXT GREED';
  });

  let kimchiStr = $derived.by(() => {
    const v = data.kimchiPremium;
    if (v == null) return '--';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  });

  let kimchiColor = $derived.by(() => {
    const v = data.kimchiPremium;
    if (v == null) return 'var(--sc-text-2)';
    if (Math.abs(v) > 3) return 'var(--sc-bad)';
    return 'var(--sc-text-2)';
  });

  function fmtK(v: number | undefined): string {
    if (v == null) return '--';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  }

  function fmtKrw(v: number | undefined): string {
    if (v == null) return '--';
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
</script>

<div class="thermo">
  <!-- Fear & Greed -->
  <div class="item">
    <span class="label">F&G</span>
    <span class="value" style="color:{fgColor}">
      {data.fearGreed ?? '--'}
    </span>
    <span class="tag" style="color:{fgColor}">{fgLabel}</span>
  </div>

  <span class="sep">|</span>

  <!-- BTC Dominance -->
  <div class="item">
    <span class="label">BTC.D</span>
    <span class="value">{data.btcDominance != null ? `${data.btcDominance.toFixed(1)}%` : '--'}</span>
  </div>

  <span class="sep">|</span>

  <!-- Kimchi Premium -->
  <div class="item">
    <span class="label">KIMCHI</span>
    <span class="value" style="color:{kimchiColor}">{kimchiStr}</span>
  </div>

  <span class="sep">|</span>

  <!-- BTC On-chain Tx -->
  <div class="item">
    <span class="label">TX</span>
    <span class="value">{fmtK(data.btcTx)}</span>
  </div>

  <span class="sep">|</span>

  <!-- Mempool Pending -->
  <div class="item">
    <span class="label">MEMPOOL</span>
    <span class="value">{fmtK(data.mempoolPending)}</span>
  </div>

  <span class="sep">|</span>

  <!-- Fastest Fee -->
  <div class="item">
    <span class="label">FEE</span>
    <span class="value">{data.fastestFee != null ? `${data.fastestFee} sat/vB` : '--'}</span>
  </div>

  <span class="sep">|</span>

  <!-- USD/KRW -->
  <div class="item">
    <span class="label">USD/KRW</span>
    <span class="value">{fmtKrw(data.usdKrw)}</span>
  </div>
</div>

<style>
  .thermo {
    display: flex;
    align-items: center;
    gap: 0;
    height: 24px;
    padding: 0 12px;
    background: var(--sc-bg-0);
    border-bottom: 1px solid var(--sc-line-soft);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    scrollbar-width: none;
  }

  .thermo::-webkit-scrollbar {
    display: none;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 0 6px;
  }

  .label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.8px;
    color: var(--sc-text-3);
    text-transform: uppercase;
    user-select: none;
  }

  .value {
    font-size: 10px;
    font-weight: 700;
    color: var(--sc-text-2);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.2px;
  }

  .tag {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }

  .sep {
    color: var(--sc-line-soft);
    font-size: 10px;
    line-height: 24px;
    flex-shrink: 0;
    user-select: none;
  }
</style>
