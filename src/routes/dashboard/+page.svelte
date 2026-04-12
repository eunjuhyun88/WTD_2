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
    return v >= 0 ? 'surface-value-positive' : 'surface-value-negative';
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

<div class="surface-page dashboard-page">
  <section class="surface-hero split">
    <div class="surface-copy">
      <span class="surface-kicker">Dashboard</span>
      <h1 class="surface-title">저장된 판단과 최근 변화가 다시 모이는 inbox.</h1>
      <p class="surface-subtitle">
        Dashboard는 설명용 홈이 아니다. 내가 남긴 세팅, 다시 봐야 할 검색, 다음에 이어볼 상태만
        빠르게 재진입할 수 있게 정리된 복귀 surface다.
      </p>
      <div class="surface-inline-actions">
        <button class="surface-button" onclick={() => goto('/terminal')}>Open Terminal</button>
        <button class="surface-button-secondary" onclick={() => goto('/lab')}>Open Lab</button>
      </div>
    </div>

    <div class="surface-stats">
      <article class="surface-stat">
        <span class="surface-meta">Challenges</span>
        <strong>{strategies.length}</strong>
        <p>저장된 챌린지 수</p>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Tested</span>
        <strong>{testedChallengeCount}</strong>
        <p>검증이 완료된 세팅</p>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Last Activity</span>
        <strong>{latestActivityText}</strong>
        <p>최근 변경 시점</p>
      </article>
    </div>
  </section>

  <section class="surface-card soft market-banner">
    <div>
      <span class="surface-kicker">Market Context</span>
      <h2>BTC {fmtPrice(btcPrice)}</h2>
      <p>현재 관찰 중인 시장 맥락으로 바로 복귀한다.</p>
    </div>
    <button class="surface-button-secondary" onclick={() => goto('/terminal')}>Return to Terminal</button>
  </section>

  <section class="surface-grid">
    <div class="surface-section-head">
      <div>
        <span class="surface-kicker">My Challenges</span>
        <h2>지금 이어서 볼 세팅</h2>
        <p>Terminal에서 저장한 판단을 Lab으로 다시 열 수 있다.</p>
      </div>
      <span class="surface-chip">{strategies.length} saved</span>
    </div>

    {#if strategies.length === 0}
      <div class="surface-card empty-card">
        <p>아직 저장된 챌린지가 없습니다.</p>
        <button class="surface-button" onclick={() => goto('/terminal')}>Terminal에서 시작</button>
      </div>
    {:else}
      <div class="challenge-grid">
        {#each strategies as entry (entry.strategy.id)}
          {@const s = entry.strategy}
          {@const r = entry.lastResult}
          <button class="surface-card challenge-card" onclick={() => goToLab(s.id)}>
            <div class="challenge-top">
              <div>
                <span class="surface-meta">Challenge</span>
                <strong>{s.name}</strong>
              </div>
              <span class="surface-chip">v{s.version}</span>
            </div>

            {#if r}
              <div class="challenge-stats">
                <div>
                  <span class="surface-meta">Win</span>
                  <strong class={pnlClass(r.winRate >= 55 ? 1 : r.winRate < 45 ? -1 : 0)}>{r.winRate.toFixed(0)}%</strong>
                </div>
                <div>
                  <span class="surface-meta">Sharpe</span>
                  <strong class={pnlClass(r.sharpeRatio)}>{fmtNum(r.sharpeRatio)}</strong>
                </div>
                <div>
                  <span class="surface-meta">MDD</span>
                  <strong class="surface-value-negative">-{r.maxDrawdownPercent.toFixed(1)}%</strong>
                </div>
                <div>
                  <span class="surface-meta">PnL</span>
                  <strong class={pnlClass(r.totalPnlPercent)}>{fmtPct(r.totalPnlPercent)}</strong>
                </div>
              </div>

              <div class="progress-block">
                <div class="progress-track">
                  <div class="progress-fill" style:width={`${(cyclesTested(entry) / MARKET_CYCLES.length) * 100}%`}></div>
                </div>
                <span class="surface-meta">{cyclesTested(entry)}/{MARKET_CYCLES.length} cycles</span>
              </div>
            {:else}
              <p class="untested-copy">아직 첫 검증 전입니다. Lab에서 첫 실행을 시작하세요.</p>
            {/if}

            <div class="challenge-footer">
              <span class="surface-meta">{timeSince(entry.lastModified)}</span>
              <span class="surface-chip">Open Lab</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="surface-grid cols-2">
    <div class="surface-grid">
      <div class="surface-section-head">
        <div>
          <span class="surface-kicker">Watching</span>
          <h2>다시 볼 검색</h2>
        </div>
        <span class="surface-chip">{WATCHING_QUERIES.length} saved</span>
      </div>

      {#each WATCHING_QUERIES as item}
        <button class="surface-card watcher-card" onclick={() => openWatching(item.query)}>
          <div class="watcher-top">
            <span class="surface-meta">Terminal Query</span>
            <span class="surface-chip">Open</span>
          </div>
          <strong>{item.title}</strong>
          <p>{item.note}</p>
          <code class="surface-code">{item.query}</code>
        </button>
      {/each}
    </div>

    <div class="surface-grid">
      <div class="surface-section-head">
        <div>
          <span class="surface-kicker">My Adapters</span>
          <h2>검증 이후 상태</h2>
        </div>
        <span class="surface-chip">{waitingChallengeCount} waiting</span>
      </div>

      {#each ADAPTER_STATES as item}
        <article class="surface-card watcher-card">
          <div class="watcher-top">
            <span class="surface-meta">Status</span>
            <span class="surface-chip">{item.state}</span>
          </div>
          <strong>{item.title}</strong>
          <p>{item.note}</p>
        </article>
      {/each}

      <div class="surface-cta">
        <span class="surface-kicker">Next Move</span>
        <h2>새로운 세팅을 저장하거나 기존 결과를 재검토한다.</h2>
        <div class="surface-inline-actions">
          <button class="surface-button" onclick={() => goto('/terminal')}>Open Terminal</button>
          <button class="surface-button-secondary" onclick={() => goto('/lab')}>Review in Lab</button>
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  .dashboard-page {
    padding-top: 12px;
  }

  .market-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .market-banner h2,
  .surface-cta h2 {
    margin: 6px 0 0;
    font-size: clamp(1.5rem, 2.6vw, 2.2rem);
    line-height: 1.02;
    letter-spacing: -0.05em;
    color: rgba(250, 247, 235, 0.98);
  }

  .market-banner p {
    margin: 8px 0 0;
    color: rgba(250, 247, 235, 0.62);
  }

  .challenge-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .challenge-card,
  .watcher-card {
    display: grid;
    gap: 16px;
    text-align: left;
    cursor: pointer;
    transition: transform var(--sc-duration-fast), border-color var(--sc-duration-fast);
  }

  .challenge-card:hover,
  .watcher-card:hover {
    transform: translateY(-2px);
    border-color: var(--home-ref-border-strong);
  }

  .challenge-top,
  .watcher-top,
  .challenge-footer {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 10px;
  }

  .challenge-top strong,
  .watcher-card strong {
    display: block;
    margin-top: 4px;
    color: rgba(250, 247, 235, 0.98);
    font-size: 1.14rem;
    line-height: 1.14;
    letter-spacing: -0.03em;
  }

  .challenge-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .challenge-stats strong {
    display: block;
    margin-top: 5px;
    font-size: 1rem;
    color: rgba(250, 247, 235, 0.96);
  }

  .progress-block {
    display: grid;
    gap: 8px;
  }

  .progress-track {
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
  }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(255, 127, 133, 0.92), rgba(249, 216, 194, 0.84));
  }

  .untested-copy,
  .watcher-card p,
  .empty-card p {
    margin: 0;
    color: rgba(250, 247, 235, 0.64);
    line-height: 1.6;
  }

  .surface-code {
    display: inline-flex;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: rgba(250, 247, 235, 0.82);
  }

  .empty-card {
    display: grid;
    gap: 14px;
    justify-items: start;
  }

  @media (max-width: 960px) {
    .challenge-grid,
    .challenge-stats {
      grid-template-columns: 1fr;
    }

    .market-banner {
      align-items: start;
      flex-direction: column;
    }
  }

  @media (max-width: 640px) {
    .dashboard-page {
      padding-top: 4px;
    }

    .challenge-card,
    .watcher-card {
      gap: 14px;
    }

    .challenge-top,
    .watcher-top,
    .challenge-footer {
      flex-direction: column;
      align-items: start;
    }

    .surface-code {
      white-space: normal;
      word-break: break-word;
    }
  }
</style>
