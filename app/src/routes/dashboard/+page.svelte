<script lang="ts">
  import { goto } from '$app/navigation';
  import { allStrategies, setActiveStrategy } from '$lib/stores/strategyStore';
  import type { StrategyEntry } from '$lib/stores/strategyStore';
  import { MARKET_CYCLES } from '$lib/data/cycles';
  import { priceStore } from '$lib/stores/priceStore';

  const WATCHING_QUERIES = [
    {
      title: 'BTC momentum watch',
      query: 'btc 4h recent_rally 10% bollinger_expansion',
      note: '저장해둔 리듬을 다시 확인하는 빠른 진입점입니다.'
    },
    {
      title: 'ETH compression watch',
      query: 'eth 1d squeeze expansion cvd uptick',
      note: '느린 타임프레임에서 다시 볼 세팅을 바로 엽니다.'
    }
  ] as const;

  const ADAPTER_STATES = [
    {
      title: 'Adapter deployment',
      state: 'Phase 2 placeholder',
      note: '검증을 통과한 어댑터 상태가 이곳에 모일 예정입니다.'
    }
  ] as const;

  const strategies = $derived($allStrategies);
  const prices = $derived($priceStore);
  const btcEntry = $derived(prices?.BTC);
  const btcPrice = $derived(typeof btcEntry === 'object' && btcEntry ? btcEntry.price : 0);
  const testedChallengeCount = $derived(strategies.filter((entry) => entry.lastResult).length);
  const waitingChallengeCount = $derived(Math.max(strategies.length - testedChallengeCount, 0));
  const latestActivityText = $derived(
    strategies.length > 0
      ? timeSince(Math.max(...strategies.map((entry) => entry.lastModified)))
      : '아직 없음'
  );

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

  function openWatching(query: string) {
    goto(`/terminal?q=${encodeURIComponent(query)}`);
  }
</script>

<svelte:head>
  <title>Dashboard — Cogochi</title>
</svelte:head>

<div class="dash-page">
  <section class="hero-card">
    <div class="hero-copy">
      <span class="hero-kicker">DASHBOARD</span>
      <h1>저장된 판단과 바뀐 상태가 다시 모이는 곳.</h1>
      <p>
        Dashboard는 새 기능을 설명하는 곳이 아니라, 내가 남긴 세팅과 최근 변화만 빠르게 다시 읽는 inbox입니다.
      </p>
    </div>

    <div class="hero-stats">
      <article class="hero-stat">
        <span class="hero-stat-label">Challenges</span>
        <strong>{strategies.length}</strong>
        <p>저장된 세팅</p>
      </article>
      <article class="hero-stat">
        <span class="hero-stat-label">Tested</span>
        <strong>{testedChallengeCount}</strong>
        <p>최근 검증 완료</p>
      </article>
      <article class="hero-stat">
        <span class="hero-stat-label">Last activity</span>
        <strong>{latestActivityText}</strong>
        <p>마지막 변화</p>
      </article>
    </div>
  </section>

  <section class="market-card">
    <div class="market-copy">
      <span class="section-kicker">Market context</span>
      <strong>BTC {fmtPrice(btcPrice)}</strong>
    </div>
    <button class="market-link" onclick={() => goto('/terminal')}>
      Open Terminal
    </button>
  </section>

  <section class="section-block">
    <div class="section-head">
      <div>
        <span class="section-kicker">My Challenges</span>
        <h2>지금 이어서 볼 세팅</h2>
      </div>
      <span class="section-count">{strategies.length}</span>
    </div>

    {#if strategies.length === 0}
      <div class="empty-card">
        <p>아직 저장된 챌린지가 없습니다.</p>
        <button class="action-btn" onclick={() => goto('/terminal')}>Terminal에서 시작</button>
      </div>
    {:else}
      <div class="strat-grid">
        {#each strategies as entry (entry.strategy.id)}
          {@const s = entry.strategy}
          {@const r = entry.lastResult}
          <button class="strat-card" onclick={() => goToLab(s.id)}>
            <div class="sc-top">
              <div class="sc-title">
                <span class="sc-kicker">Challenge</span>
                <strong>{s.name}</strong>
              </div>
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
                <span class="sc-progress-text">{cyclesTested(entry)}/{MARKET_CYCLES.length} cycles</span>
              </div>
            {:else}
              <div class="sc-untested">아직 첫 검증 전입니다.</div>
            {/if}

            <div class="sc-footer">
              <span class="sc-time">{timeSince(entry.lastModified)}</span>
              <span class="sc-cta">Open Lab</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="section-block">
    <div class="section-head">
      <div>
        <span class="section-kicker">Watching</span>
        <h2>다시 볼 검색</h2>
      </div>
      <span class="section-count">{WATCHING_QUERIES.length}</span>
    </div>

    <div class="aux-grid">
      {#each WATCHING_QUERIES as item}
        <button class="aux-card" onclick={() => openWatching(item.query)}>
          <div class="aux-top">
            <span class="aux-label">Terminal</span>
            <span class="aux-chip">Saved query</span>
          </div>
          <strong>{item.title}</strong>
          <p>{item.note}</p>
          <code>{item.query}</code>
        </button>
      {/each}
    </div>
  </section>

  <section class="section-block">
    <div class="section-head">
      <div>
        <span class="section-kicker">My Adapters</span>
        <h2>검증 이후에 모일 상태</h2>
      </div>
      <span class="section-count">{waitingChallengeCount}</span>
    </div>

    <div class="aux-grid">
      {#each ADAPTER_STATES as item}
        <article class="aux-card static">
          <div class="aux-top">
            <span class="aux-label">Status</span>
            <span class="aux-chip muted">{item.state}</span>
          </div>
          <strong>{item.title}</strong>
          <p>{item.note}</p>
        </article>
      {/each}
    </div>
  </section>

  <section class="quick-bar">
    <button class="quick-btn primary" onclick={() => goto('/terminal')}>
      <span class="qb-copy">
        <span class="qb-kicker">Next move</span>
        <strong>Open Terminal</strong>
      </span>
    </button>
    <button class="quick-btn" onclick={() => goto('/lab')}>
      <span class="qb-copy">
        <span class="qb-kicker">Review</span>
        <strong>Open Lab</strong>
      </span>
    </button>
  </section>
</div>

<style>
  .dash-page {
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: 24px 20px 40px;
    display: grid;
    gap: 22px;
    font-family: var(--sc-font-body);
  }

  .hero-card,
  .market-card,
  .strat-card,
  .aux-card,
  .empty-card,
  .quick-btn {
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(18, 18, 20, 0.82), rgba(10, 10, 12, 0.78));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 18px 42px rgba(0, 0, 0, 0.18);
  }

  .hero-card {
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(280px, 0.92fr);
    gap: 18px;
    padding: 24px;
    align-items: start;
  }

  .hero-copy {
    display: grid;
    gap: 10px;
    max-width: 36rem;
  }

  .hero-kicker,
  .section-kicker,
  .hero-stat-label,
  .aux-label,
  .aux-chip,
  .sc-kicker,
  .sc-ver,
  .sc-stat-label,
  .sc-progress-text,
  .qb-kicker {
    font-family: var(--sc-font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .hero-kicker,
  .section-kicker,
  .aux-chip,
  .sc-ver,
  .qb-kicker {
    color: rgba(var(--lis-rgb-pink), 0.92);
  }

  .hero-copy h1,
  .section-head h2 {
    margin: 0;
    font-family: var(--sc-font-body);
    letter-spacing: -0.05em;
    color: rgba(255, 247, 244, 0.97);
  }

  .hero-copy h1 {
    font-size: clamp(2.2rem, 4vw, 3.8rem);
    line-height: 0.98;
    max-width: 11ch;
  }

  .hero-copy p {
    margin: 0;
    color: rgba(255, 247, 244, 0.78);
    font-size: 1.08rem;
    line-height: 1.7;
  }

  .hero-stats {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .hero-stat {
    display: grid;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .hero-stat-label,
  .aux-label,
  .sc-kicker,
  .sc-stat-label,
  .sc-progress-text,
  .qb-kicker {
    color: rgba(255, 247, 244, 0.46);
  }

  .hero-stat strong {
    color: rgba(255, 247, 244, 0.94);
    font-size: 1.3rem;
    line-height: 1.2;
  }

  .hero-stat p {
    margin: 0;
    color: rgba(255, 247, 244, 0.7);
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .market-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 18px;
  }

  .market-copy {
    display: grid;
    gap: 4px;
  }

  .market-copy strong {
    color: rgba(255, 247, 244, 0.94);
    font-size: 1.16rem;
    line-height: 1.25;
  }

  .market-link,
  .action-btn {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(180deg, rgba(248, 243, 236, 0.96), rgba(231, 224, 216, 0.94));
    color: #0a0908;
    font-family: var(--sc-font-body);
    font-size: 0.96rem;
    font-weight: 600;
    cursor: pointer;
  }

  .section-block {
    display: grid;
    gap: 14px;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 12px;
  }

  .section-head div {
    display: grid;
    gap: 4px;
  }

  .section-head h2 {
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
    line-height: 1.06;
  }

  .section-count {
    min-width: 34px;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: rgba(var(--lis-rgb-pink), 0.1);
    color: rgba(var(--lis-rgb-pink), 0.92);
    font-family: var(--sc-font-mono);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
  }

  .strat-grid,
  .aux-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .strat-card,
  .aux-card {
    display: grid;
    gap: 12px;
    padding: 18px;
    text-align: left;
    cursor: pointer;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast);
  }

  .strat-card:hover,
  .aux-card:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--lis-rgb-pink), 0.18);
    background: linear-gradient(180deg, rgba(22, 22, 24, 0.84), rgba(11, 11, 13, 0.8));
  }

  .aux-card.static {
    cursor: default;
  }

  .aux-card.static:hover {
    transform: none;
  }

  .sc-top,
  .aux-top {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 10px;
  }

  .sc-title {
    display: grid;
    gap: 4px;
  }

  .sc-title strong,
  .aux-card strong {
    color: rgba(255, 247, 244, 0.94);
    font-size: 1.14rem;
    line-height: 1.28;
  }

  .sc-ver,
  .aux-chip {
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(var(--lis-rgb-pink), 0.1);
  }

  .aux-chip.muted {
    color: rgba(255, 247, 244, 0.62);
    background: rgba(255, 255, 255, 0.06);
  }

  .sc-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    padding: 12px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .sc-stat {
    display: grid;
    gap: 4px;
  }

  .sc-stat-value {
    font-family: var(--sc-font-body);
    font-size: 1.04rem;
    font-weight: 600;
    color: rgba(255, 247, 244, 0.88);
  }

  .sc-stat-value.positive {
    color: var(--lis-positive);
  }

  .sc-stat-value.negative {
    color: var(--sc-bad);
  }

  .sc-progress {
    display: grid;
    gap: 8px;
  }

  .sc-progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
    overflow: hidden;
  }

  .sc-progress-fill {
    height: 100%;
    background: var(--lis-accent);
    border-radius: 999px;
  }

  .sc-untested {
    color: rgba(255, 247, 244, 0.58);
    font-size: 1rem;
    line-height: 1.5;
    padding: 6px 0;
  }

  .sc-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .sc-time {
    color: rgba(255, 247, 244, 0.52);
    font-size: 0.92rem;
  }

  .sc-cta {
    color: rgba(var(--lis-rgb-pink), 0.92);
    font-size: 0.94rem;
    font-weight: 500;
  }

  .aux-card p {
    margin: 0;
    color: rgba(255, 247, 244, 0.72);
    font-size: 0.98rem;
    line-height: 1.62;
  }

  .aux-card code {
    color: rgba(255, 247, 244, 0.62);
    font-family: var(--sc-font-mono);
    font-size: 0.84rem;
    line-height: 1.6;
    word-break: break-word;
  }

  .empty-card {
    display: grid;
    justify-items: center;
    gap: 14px;
    padding: 36px 20px;
    text-align: center;
  }

  .empty-card p {
    margin: 0;
    color: rgba(255, 247, 244, 0.68);
    font-size: 1.04rem;
    line-height: 1.6;
  }

  .quick-bar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .quick-btn {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    padding: 18px;
    text-align: left;
    cursor: pointer;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast);
  }

  .quick-btn:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--lis-rgb-pink), 0.18);
  }

  .quick-btn.primary {
    background: linear-gradient(180deg, rgba(248, 243, 236, 0.96), rgba(231, 224, 216, 0.94));
    color: #0a0908;
  }

  .quick-btn.primary .qb-kicker,
  .quick-btn.primary strong {
    color: #0a0908;
  }

  .qb-copy {
    display: grid;
    gap: 4px;
  }

  .qb-copy strong {
    font-size: 1.08rem;
    line-height: 1.2;
    color: rgba(255, 247, 244, 0.94);
  }

  @media (max-width: 900px) {
    .hero-card {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .dash-page {
      padding: 18px 16px 28px;
      gap: 18px;
    }

    .strat-grid,
    .aux-grid,
    .quick-bar {
      grid-template-columns: 1fr;
    }

    .sc-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 540px) {
    .dash-page {
      padding-left: 14px;
      padding-right: 14px;
    }

    .hero-card,
    .market-card,
    .strat-card,
    .aux-card,
    .quick-btn,
    .empty-card {
      padding: 16px;
      border-radius: 18px;
    }

    .market-card,
    .section-head,
    .sc-footer {
      flex-direction: column;
      align-items: flex-start;
    }

    .market-link,
    .action-btn {
      width: 100%;
    }
  }
</style>
