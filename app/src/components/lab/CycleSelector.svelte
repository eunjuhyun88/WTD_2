<script lang="ts">
  import { MARKET_CYCLES } from '$lib/data/cycles';
  import type { MarketCycle } from '$lib/data/cycles';

  const { selected, onChange, onRun, isRunning } = $props<{
    selected: string[];
    onChange: (ids: string[]) => void;
    onRun: () => void;
    isRunning: boolean;
  }>();

  const total = MARKET_CYCLES.length;
  const count = $derived(selected.length);
  const canRun = $derived(count > 0 && !isRunning);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s: string) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  function selectAll() {
    onChange(MARKET_CYCLES.map(c => c.id));
  }

  function clearAll() {
    onChange([]);
  }

  function regimeColor(regime: MarketCycle['regime']): string {
    switch (regime) {
      case 'bull': return 'var(--lis-positive)';
      case 'bear': return 'var(--sc-bad)';
      case 'crash': return 'var(--lis-highlight)';
      case 'recovery': return '#6ba3d6';
      case 'sideways': return '#7a8599';
    }
  }

  function regimeTag(regime: MarketCycle['regime']): string {
    switch (regime) {
      case 'bull': return 'BULL';
      case 'bear': return 'BEAR';
      case 'crash': return 'CRASH';
      case 'recovery': return 'RECV';
      case 'sideways': return 'SIDE';
    }
  }

  function formatChange(pct: number): string {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct}%`;
  }
</script>

<div class="cycle-bar">
  <div class="bar-left">
    <div class="bar-meta">
      <span class="meta-count">
        <span class="count-num">{count}</span><span class="count-sep">/</span><span class="count-total">{total}</span>
        <span class="count-label">선택</span>
      </span>
      <button class="meta-btn" onclick={count < total ? selectAll : clearAll}>
        {count < total ? '전체' : '해제'}
      </button>
    </div>
  </div>

  <div class="chips-track">
    <div class="chips-scroll">
      {#each MARKET_CYCLES as cycle (cycle.id)}
        {@const active = selected.includes(cycle.id)}
        {@const color = regimeColor(cycle.regime)}
        <button
          class="chip"
          class:active
          style:--regime-color={color}
          onclick={() => toggle(cycle.id)}
          title={cycle.description}
        >
          <span class="chip-regime" style:background={color}>{regimeTag(cycle.regime)}</span>
          <span class="chip-label">{cycle.label}</span>
          <span class="chip-change" class:positive={cycle.btcChangePercent >= 0} class:negative={cycle.btcChangePercent < 0}>
            {formatChange(cycle.btcChangePercent)}
          </span>
        </button>
      {/each}
    </div>
  </div>

  <div class="bar-right">
    <button class="run-btn" disabled={!canRun} onclick={onRun}>
      {#if isRunning}
        <span class="spinner"></span>
        실행 중
      {:else}
        <span class="run-icon">▶</span>
        실행
      {/if}
    </button>
  </div>
</div>

<style>
  .cycle-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 10px;
    min-height: 56px;
  }

  /* ── Left: count + toggle ── */
  .bar-left {
    flex-shrink: 0;
  }

  .bar-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .meta-count {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    color: rgba(255 255 255 / 0.5);
    display: flex;
    align-items: baseline;
    gap: 1px;
  }

  .count-num {
    color: var(--lis-accent);
    font-size: 15px;
    font-weight: 600;
  }

  .count-sep {
    opacity: 0.3;
    margin: 0 1px;
  }

  .count-total {
    font-size: 11px;
  }

  .count-label {
    margin-left: 4px;
    font-family: var(--sc-font-body);
    font-size: 11px;
    opacity: 0.4;
    letter-spacing: 0.02em;
  }

  .meta-btn {
    font-family: var(--sc-font-body);
    font-size: 11px;
    color: var(--lis-accent);
    background: rgba(var(--lis-rgb-pink), 0.08);
    border: 1px solid rgba(var(--lis-rgb-pink), 0.18);
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.02em;
  }

  .meta-btn:hover {
    background: rgba(var(--lis-rgb-pink), 0.16);
    border-color: rgba(var(--lis-rgb-pink), 0.32);
  }

  /* ── Center: scrollable chips ── */
  .chips-track {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    mask-image: linear-gradient(90deg, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%);
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%);
  }

  .chips-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 4px;
    scrollbar-width: none;
  }

  .chips-scroll::-webkit-scrollbar {
    display: none;
  }

  /* ── Individual chip ── */
  .chip {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 5px 6px;
    background: var(--lis-bg-0);
    border: 1px solid rgba(255 255 255 / 0.06);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    opacity: 0.45;
    font-family: var(--sc-font-body);
  }

  .chip:hover {
    opacity: 0.7;
    background: var(--lis-surface-1);
  }

  .chip.active {
    opacity: 1;
    border-color: var(--regime-color, var(--lis-border));
    background: var(--lis-surface-1);
    box-shadow: 0 0 12px rgba(var(--lis-rgb-pink), 0.08), inset 0 0 0 1px rgba(255 255 255 / 0.04);
  }

  .chip-regime {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--lis-bg-0);
    padding: 2px 5px;
    border-radius: 3px;
    line-height: 1;
  }

  .chip-label {
    font-size: 12px;
    color: rgba(255 255 255 / 0.82);
    white-space: nowrap;
    letter-spacing: -0.01em;
  }

  .chip.active .chip-label {
    color: rgba(255 255 255 / 0.95);
  }

  .chip-change {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  .chip-change.positive { color: var(--lis-positive); }
  .chip-change.negative { color: var(--sc-bad); }

  .chip:not(.active) .chip-change {
    opacity: 0.6;
  }

  /* ── Right: run button ── */
  .bar-right {
    flex-shrink: 0;
  }

  .run-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    background: linear-gradient(135deg, rgba(var(--lis-rgb-pink), 0.2) 0%, rgba(var(--lis-rgb-pink), 0.12) 100%);
    border: 1px solid rgba(var(--lis-rgb-pink), 0.35);
    border-radius: 7px;
    color: var(--lis-accent);
    font-family: var(--sc-font-body);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .run-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(var(--lis-rgb-pink), 0.3) 0%, rgba(var(--lis-rgb-pink), 0.2) 100%);
    border-color: rgba(var(--lis-rgb-pink), 0.5);
    box-shadow: var(--lis-glow-pink);
    transform: translateY(-1px);
  }

  .run-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .run-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .run-icon {
    font-size: 10px;
    display: inline-flex;
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(var(--lis-rgb-pink), 0.2);
    border-top-color: var(--lis-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .cycle-bar {
      flex-wrap: wrap;
      padding: 8px 12px;
      gap: 8px;
    }

    .bar-left {
      order: 1;
    }

    .bar-right {
      order: 2;
      margin-left: auto;
    }

    .chips-track {
      order: 3;
      flex-basis: 100%;
    }

    .run-btn {
      padding: 7px 14px;
      font-size: 12px;
    }
  }
</style>
