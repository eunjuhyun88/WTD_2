<script lang="ts">
  const { label, before, after, unit = '', format = 'number' }: {
    label: string;
    before: number;
    after: number;
    unit?: string;
    format?: 'number' | 'percent' | 'currency';
  } = $props();

  const delta = $derived(after - before);
  const isPositive = $derived(delta > 0);
  const isNegative = $derived(delta < 0);
  const arrow = $derived(isPositive ? '\u25B2' : isNegative ? '\u25BC' : '');

  function fmt(v: number): string {
    if (format === 'percent') return v.toFixed(1) + '%';
    if (format === 'currency') return '$' + v.toFixed(2);
    return v.toFixed(1) + unit;
  }

  const deltaStr = $derived((isPositive ? '+' : '') + fmt(delta));
</script>

<div class="delta-card">
  <span class="delta-label">{label}</span>
  <div class="delta-body">
    <div class="delta-col before">
      <span class="delta-col-label">BEFORE</span>
      <span class="delta-col-value">{fmt(before)}</span>
    </div>
    <div class="delta-arrow" class:up={isPositive} class:down={isNegative}>
      {arrow}
    </div>
    <div class="delta-col after">
      <span class="delta-col-label">AFTER</span>
      <span class="delta-col-value" class:good={isPositive} class:bad={isNegative}>{fmt(after)}</span>
    </div>
  </div>
  <span class="delta-change" class:good={isPositive} class:bad={isNegative}>
    {deltaStr}
  </span>
</div>

<style>
  .delta-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-radius: var(--sc-radius-lg);
    border: 1px solid rgba(247, 242, 234, 0.05);
    background: linear-gradient(180deg, rgba(11, 18, 32, 0.5), rgba(5, 9, 20, 0.6));
  }

  .delta-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--sc-text-3);
  }

  .delta-body {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .delta-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .delta-col-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    letter-spacing: 1px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .delta-col-value {
    font-family: var(--sc-font-display);
    font-size: var(--sc-fs-2xl);
    letter-spacing: 1px;
    color: var(--sc-text-1);
  }

  .delta-col-value.good { color: var(--lis-positive); }
  .delta-col-value.bad { color: var(--lis-negative); }

  .delta-arrow {
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
    flex-shrink: 0;
  }
  .delta-arrow.up { color: var(--lis-positive); }
  .delta-arrow.down { color: var(--lis-negative); }

  .delta-change {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    font-weight: 700;
    letter-spacing: 0.5px;
    color: var(--sc-text-2);
  }
  .delta-change.good { color: var(--lis-positive); }
  .delta-change.bad { color: var(--lis-negative); }

  @media (max-width: 480px) {
    .delta-col-value { font-size: var(--sc-fs-xl); }
  }
</style>
