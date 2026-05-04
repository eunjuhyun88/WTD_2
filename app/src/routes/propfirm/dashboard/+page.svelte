<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  $: eval_ = data.evaluation;
  $: tier = data.tier;

  // Derived metrics
  $: totalPnl = (eval_.equity_current ?? eval_.equity_start) - eval_.equity_start;
  $: pnlPct = eval_.equity_start > 0 ? (totalPnl / eval_.equity_start) * 100 : 0;
  $: profitGoalPct = (tier.profit_goal_pct ?? 0.08) * 100;
  $: profitProgress = Math.min((pnlPct / profitGoalPct) * 100, 100);

  $: daysProgress = Math.min(
    (eval_.trading_days / (tier.min_trading_days ?? 10)) * 100,
    100,
  );

  function fmt(n: number, digits = 2) {
    return n.toFixed(digits);
  }
  function fmtPct(n: number) {
    return `${n >= 0 ? '+' : ''}${fmt(n)}%`;
  }
</script>

<svelte:head>
  <title>평가 대시보드 — PropFirm WTD</title>
</svelte:head>

<main class="dashboard">
  <header class="dash-header">
    <h1>PropFirm 평가 대시보드</h1>
    <span class="status-badge status--active">ACTIVE</span>
  </header>

  <div class="metrics-grid">
    <!-- Profit Goal -->
    <div class="metric-card">
      <div class="metric-label">수익 목표</div>
      <div class="metric-value {pnlPct >= 0 ? 'positive' : 'negative'}">
        {fmtPct(pnlPct)}
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: {profitProgress}%"></div>
      </div>
      <div class="metric-sub">목표: +{profitGoalPct}%</div>
    </div>

    <!-- Trading Days -->
    <div class="metric-card">
      <div class="metric-label">거래일</div>
      <div class="metric-value">{eval_.trading_days} / {tier.min_trading_days}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: {daysProgress}%"></div>
      </div>
      <div class="metric-sub">최소 {tier.min_trading_days}일 필요</div>
    </div>

    <!-- MLL -->
    <div class="metric-card">
      <div class="metric-label">최대 일일 손실 한도 (MLL)</div>
      <div class="metric-value neutral">
        {fmt((tier.mll_pct ?? 0.05) * 100)}% 이내 유지 중
      </div>
      <div class="metric-sub">
        위반 시 즉시 실패 · 한도: -{fmt((tier.mll_pct ?? 0.05) * 100)}%
      </div>
    </div>

    <!-- Equity -->
    <div class="metric-card">
      <div class="metric-label">현재 잔고</div>
      <div class="metric-value">
        ${(eval_.equity_current ?? eval_.equity_start).toLocaleString()}
      </div>
      <div class="metric-sub">시작: ${eval_.equity_start.toLocaleString()}</div>
    </div>
  </div>

  {#if data.violations.length > 0}
    <section class="violations">
      <h2>룰 위반 기록</h2>
      <ul>
        {#each data.violations as v}
          <li>
            <span class="rule-tag">{v.rule.toUpperCase()}</span>
            <span class="viol-time">{new Date(v.violated_at).toLocaleString('ko-KR')}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>

<style>
  .dashboard {
    max-width: 720px;
    margin: 2rem auto;
    padding: 0 1.5rem;
  }
  .dash-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  h1 { font-size: 1.5rem; font-weight: 700; }
  .status-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 9999px;
  }
  .status--active { background: #22c55e22; color: #22c55e; border: 1px solid #22c55e; }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .metric-card {
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 1.25rem;
  }
  .metric-label { font-size: 0.8rem; color: var(--color-text-muted, #888); margin-bottom: 0.5rem; }
  .metric-value { font-size: 1.4rem; font-weight: 700; margin-bottom: 0.75rem; }
  .positive { color: #22c55e; }
  .negative { color: #ef4444; }
  .neutral { color: inherit; font-size: 1rem; }
  .metric-sub { font-size: 0.78rem; color: var(--color-text-muted, #888); margin-top: 0.4rem; }

  .progress-bar {
    height: 4px;
    background: var(--color-border, #333);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--color-accent, #6366f1);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .violations h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; }
  .violations ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .violations li { display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; }
  .rule-tag {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 8px;
    background: #ef444422;
    color: #ef4444;
    border-radius: 4px;
  }
  .viol-time { color: var(--color-text-muted, #888); }
</style>
