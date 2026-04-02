<script lang="ts">
  import { goto } from '$app/navigation';
  import { allStrategies, setActiveStrategy } from '$lib/stores/strategyStore';
  import type { StrategyEntry } from '$lib/stores/strategyStore';
  import { MARKET_CYCLES } from '$lib/data/cycles';
  import { priceStore } from '$lib/stores/priceStore';

  // ─── Derived ──────────────────────────────────────────────

  const strategies = $derived($allStrategies);
  const prices = $derived($priceStore);
  const btcEntry = $derived(prices?.['BTCUSDT']);
  const btcPrice = $derived(typeof btcEntry === 'object' && btcEntry ? btcEntry.price : 0);

  // ─── Helpers ──────────────────────────────────────────────

  function fmtPct(v: number | null | undefined): string {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }

  function fmtNum(v: number | null | undefined): string {
    if (v == null) return '—';
    return v.toFixed(2);
  }

  function fmtPrice(v: number): string {
    if (!v) return '—';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function pnlClass(v: number | null | undefined): string {
    if (v == null) return '';
    return v >= 0 ? 'positive' : 'negative';
  }

  function cyclesTested(entry: StrategyEntry): number {
    return entry.lastResult?.cycleBreakdown.length ?? 0;
  }

  function timeSince(ms: number): string {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  }

  function goToLab(strategyId: string) {
    setActiveStrategy(strategyId);
    goto('/lab');
  }
</script>

<svelte:head>
  <title>Dashboard — STOCKCLAW</title>
</svelte:head>

<div class="dash-page">
  <!-- Market context -->
  <div class="market-bar">
    <div class="market-price">
      <span class="price-label">BTC</span>
      <span class="price-value">{fmtPrice(btcPrice)}</span>
    </div>
    <button class="market-link" onclick={() => goto('/terminal')}>
      Terminal에서 자세히 →
    </button>
  </div>

  <!-- Strategy cards -->
  <div class="section-header">
    <h2 class="section-title">내 전략</h2>
    <span class="section-count">{strategies.length}</span>
  </div>

  {#if strategies.length === 0}
    <div class="empty-card">
      <p>아직 전략이 없습니다.</p>
      <button class="action-btn" onclick={() => goto('/lab')}>Lab에서 시작 →</button>
    </div>
  {:else}
    <div class="strat-grid">
      {#each strategies as entry (entry.strategy.id)}
        {@const s = entry.strategy}
        {@const r = entry.lastResult}
        <button class="strat-card" onclick={() => goToLab(s.id)}>
          <div class="sc-top">
            <span class="sc-name">{s.name}</span>
            <span class="sc-ver">v{s.version}</span>
          </div>

          {#if r}
            <div class="sc-stats">
              <div class="sc-stat">
                <span class="sc-stat-label">Win</span>
                <span class="sc-stat-value {pnlClass(r.winRate >= 55 ? 1 : r.winRate < 45 ? -1 : 0)}">{r.winRate.toFixed(0)}%</span>
              </div>
              <div class="sc-stat">
                <span class="sc-stat-label">Sharpe</span>
                <span class="sc-stat-value {pnlClass(r.sharpeRatio)}">{fmtNum(r.sharpeRatio)}</span>
              </div>
              <div class="sc-stat">
                <span class="sc-stat-label">MDD</span>
                <span class="sc-stat-value negative">-{r.maxDrawdownPercent.toFixed(1)}%</span>
              </div>
              <div class="sc-stat">
                <span class="sc-stat-label">PnL</span>
                <span class="sc-stat-value {pnlClass(r.totalPnlPercent)}">{fmtPct(r.totalPnlPercent)}</span>
              </div>
            </div>

            <div class="sc-progress">
              <div class="sc-progress-bar">
                <div class="sc-progress-fill" style:width="{(cyclesTested(entry) / MARKET_CYCLES.length) * 100}%"></div>
              </div>
              <span class="sc-progress-text">{cyclesTested(entry)}/{MARKET_CYCLES.length} 사이클</span>
            </div>
          {:else}
            <div class="sc-untested">미테스트 — Lab에서 실행하세요</div>
          {/if}

          <div class="sc-footer">
            <span class="sc-time">{timeSince(entry.lastModified)}</span>
            <span class="sc-cta">이어서 작업 →</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Quick actions -->
  <div class="quick-bar">
    <button class="quick-btn" onclick={() => goto('/lab')}>
      <span class="qb-icon">⚗</span>
      <span class="qb-label">새 백테스트</span>
    </button>
    <button class="quick-btn" onclick={() => goto('/terminal')}>
      <span class="qb-icon">📊</span>
      <span class="qb-label">실시간 차트</span>
    </button>
  </div>
</div>

<style>
  .dash-page {
    max-width: 960px;
    margin: 0 auto;
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Market bar ── */
  .market-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 10px;
  }

  .market-price {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .price-label {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: rgba(255 255 255 / 0.35);
  }

  .price-value {
    font-family: var(--sc-font-mono);
    font-size: 20px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.9);
  }

  .market-link {
    font-family: var(--sc-font-body);
    font-size: 12px;
    color: var(--lis-accent);
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .market-link:hover { opacity: 1; }

  /* ── Section header ── */
  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title {
    font-family: var(--sc-font-body);
    font-size: 16px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.85);
    margin: 0;
  }

  .section-count {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    background: rgba(var(--lis-rgb-pink), 0.12);
    color: var(--lis-accent);
    padding: 2px 7px;
    border-radius: 8px;
  }

  /* ── Strategy grid ── */
  .strat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
  }

  .strat-card {
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 10px;
    padding: 14px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .strat-card:hover {
    border-color: var(--lis-border);
    background: var(--lis-surface-1);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0 0 0 / 0.3);
  }

  .sc-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sc-name {
    font-family: var(--sc-font-body);
    font-size: 14px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.9);
    flex: 1;
  }

  .sc-ver {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--lis-accent);
    background: rgba(var(--lis-rgb-pink), 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .sc-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .sc-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .sc-stat-label {
    font-family: var(--sc-font-body);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255 255 255 / 0.3);
  }

  .sc-stat-value {
    font-family: var(--sc-font-mono);
    font-size: 14px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.8);
  }

  .sc-stat-value.positive { color: var(--lis-positive); }
  .sc-stat-value.negative { color: var(--sc-bad); }

  .sc-progress {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sc-progress-bar {
    flex: 1;
    height: 3px;
    background: rgba(255 255 255 / 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .sc-progress-fill {
    height: 100%;
    background: var(--lis-accent);
    border-radius: 2px;
    transition: width 0.3s;
  }

  .sc-progress-text {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: rgba(255 255 255 / 0.3);
    flex-shrink: 0;
  }

  .sc-untested {
    font-size: 12px;
    color: rgba(255 255 255 / 0.2);
    font-style: italic;
    padding: 8px 0;
  }

  .sc-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 4px;
    border-top: 1px solid rgba(255 255 255 / 0.04);
  }

  .sc-time {
    font-family: var(--sc-font-body);
    font-size: 10px;
    color: rgba(255 255 255 / 0.2);
  }

  .sc-cta {
    font-family: var(--sc-font-body);
    font-size: 11px;
    color: var(--lis-accent);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .strat-card:hover .sc-cta { opacity: 1; }

  /* ── Empty ── */
  .empty-card {
    background: var(--lis-surface-0);
    border: 1px dashed var(--lis-border-soft);
    border-radius: 10px;
    padding: 40px 20px;
    text-align: center;
    color: rgba(255 255 255 / 0.25);
    font-size: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .empty-card p { margin: 0; }

  .action-btn {
    font-family: var(--sc-font-body);
    font-size: 13px;
    padding: 10px 20px;
    background: rgba(var(--lis-rgb-pink), 0.12);
    border: 1px solid rgba(var(--lis-rgb-pink), 0.25);
    border-radius: 7px;
    color: var(--lis-accent);
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: rgba(var(--lis-rgb-pink), 0.2);
    box-shadow: var(--lis-glow-pink);
  }

  /* ── Quick actions ── */
  .quick-bar {
    display: flex;
    gap: 8px;
  }

  .quick-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px;
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .quick-btn:hover {
    border-color: var(--lis-border);
    background: var(--lis-surface-1);
  }

  .qb-icon { font-size: 18px; }

  .qb-label {
    font-family: var(--sc-font-body);
    font-size: 13px;
    color: rgba(255 255 255 / 0.6);
  }

  .quick-btn:hover .qb-label { color: rgba(255 255 255 / 0.85); }

  @media (max-width: 768px) {
    .strat-grid {
      grid-template-columns: 1fr;
    }

    .sc-stats {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
  }
</style>
