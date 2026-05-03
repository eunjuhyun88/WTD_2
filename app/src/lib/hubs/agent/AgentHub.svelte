<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import KpiCard from './panels/KpiCard.svelte';
  import EquityCurve from './panels/EquityCurve.svelte';
  import HoldTimeStrip from '$lib/components/shared/HoldTimeStrip.svelte';

  interface AgentStats {
    agent_id: string;
    stats: {
      total_decisions: number;
      decisions_30d: number;
      verdicts_with_signal: number;
      avg_latency_ms: number | null;
      p95_latency_ms: number | null;
      last_decision_at: string | null;
      first_decision_at: string | null;
      unique_users: number;
    } | null;
    recent_decisions: Array<{
      id: string;
      cmd: string;
      llm_verdict: string | null;
      latency_ms: number | null;
      created_at: string;
    }>;
  }

  interface Props {
    agentStats: AgentStats | null;
    notFound: boolean;
  }

  const { agentStats, notFound }: Props = $props();

  let activeTab = $state<'overview' | 'decisions' | 'performance'>('overview');
  let redirectCountdown = $state(5);

  function formatRelative(iso: string | null | undefined): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  }

  function formatLatency(ms: number | null | undefined): string {
    if (ms == null) return '—';
    return ms.toFixed(0) + 'ms';
  }

  onMount(() => {
    if (!notFound) return;

    const timer = setInterval(() => {
      redirectCountdown -= 1;
      if (redirectCountdown <= 0) {
        clearInterval(timer);
        goto('/agent', { replaceState: true });
      }
    }, 1000);

    return () => clearInterval(timer);
  });
</script>

<svelte:head>
  <title>{agentStats ? agentStats.agent_id + ' — Agent' : 'Agent Not Found'} — Cogochi</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<!-- AC10 badge: always at top -->
<div class="ac10-badge" role="note">
  <span class="ac10-icon">ⓘ</span>
  <span class="ac10-text">
    이 에이전트는 <strong>자동매매를 실행하지 않습니다.</strong>
    패턴 감지 및 알림 전용입니다. (AC10)
  </span>
</div>

{#if notFound}
  <div class="hub-page">
    <div class="hub-container">
      <div class="not-found-card">
        <span class="not-found-icon">◌</span>
        <h1 class="not-found-title">에이전트를 찾을 수 없습니다</h1>
        <p class="not-found-desc">
          {redirectCountdown}초 후 에이전트 목록으로 이동합니다.
        </p>
        <a class="not-found-link" href="/agent">에이전트 목록 →</a>
      </div>
    </div>
  </div>
{:else}
  <div class="hub-page">
    <div class="hub-container">

      <!-- Agent header -->
      <header class="agent-header">
        <span class="agent-kicker">Agent</span>
        <h1 class="agent-name">{agentStats?.agent_id ?? '—'}</h1>
        <p class="agent-meta">
          결정 {agentStats?.stats?.total_decisions ?? 0}건
          {#if agentStats?.stats?.last_decision_at}
            · 마지막 {formatRelative(agentStats.stats.last_decision_at)}
          {/if}
        </p>
      </header>

      <!-- KPI grid 2×2 -->
      <div class="kpi-grid">
        <KpiCard
          label="총 결정"
          value={agentStats?.stats?.total_decisions ?? 0}
        />
        <KpiCard
          label="30일 결정"
          value={agentStats?.stats?.decisions_30d ?? 0}
        />
        <KpiCard
          label="평균 응답"
          value={formatLatency(agentStats?.stats?.avg_latency_ms)}
          mono={true}
        />
        <KpiCard
          label="마지막 활동"
          value={formatRelative(agentStats?.stats?.last_decision_at)}
        />
      </div>

      <!-- Tab bar -->
      <nav class="tab-bar" role="tablist">
        <button
          class="tab-item"
          class:tab-item--active={activeTab === 'overview'}
          role="tab"
          aria-selected={activeTab === 'overview'}
          onclick={() => (activeTab = 'overview')}
        >
          Overview
        </button>
        <button
          class="tab-item tab-item--disabled"
          role="tab"
          aria-selected={false}
          aria-disabled="true"
          disabled
        >
          Decisions <span class="tab-soon">준비 중</span>
        </button>
        <button
          class="tab-item tab-item--disabled"
          role="tab"
          aria-selected={false}
          aria-disabled="true"
          disabled
        >
          Performance <span class="tab-soon">준비 중</span>
        </button>
      </nav>

      <!-- Tab content: Overview -->
      {#if activeTab === 'overview'}
        <div class="overview-section">
          <div class="overview-card">
            <h2 class="overview-title">이 에이전트는</h2>
            <ul class="overview-list">
              <li>내 verdict 이력을 학습해 유사한 시장 상황을 감지합니다.</li>
              <li>패턴 신호를 발견하면 알림을 보냅니다.</li>
              <li>주문을 실행하거나 자산을 관리하지 않습니다.</li>
            </ul>
          </div>

          <EquityCurve agentId={agentStats?.agent_id ?? ''} />
          <HoldTimeStrip p50={null} p90={null} label="결정 주기 (p50/p90)" />

          {#if agentStats?.stats}
            <div class="extra-stats-card">
              <div class="extra-stat">
                <span class="extra-stat-lbl">p95 응답</span>
                <span class="extra-stat-val">{formatLatency(agentStats.stats.p95_latency_ms)}</span>
              </div>
              <div class="extra-stat">
                <span class="extra-stat-lbl">신호 포함 결정</span>
                <span class="extra-stat-val">{agentStats.stats.verdicts_with_signal}</span>
              </div>
              <div class="extra-stat">
                <span class="extra-stat-lbl">활성 유저</span>
                <span class="extra-stat-val">{agentStats.stats.unique_users}</span>
              </div>
              <div class="extra-stat">
                <span class="extra-stat-lbl">첫 결정</span>
                <span class="extra-stat-val">{formatRelative(agentStats.stats.first_decision_at)}</span>
              </div>
            </div>
          {/if}
        </div>
      {/if}

    </div>
  </div>
{/if}

<style>
  .ac10-badge {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 20px;
    background: rgba(250, 204, 21, 0.06);
    border-bottom: 1px solid rgba(250, 204, 21, 0.2);
    font-family: 'JetBrains Mono', monospace;
  }

  .ac10-icon {
    font-size: 0.85rem;
    color: rgba(250, 204, 21, 0.7);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .ac10-text {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255, 255, 255, 0.5);
    line-height: 1.5;
  }

  .ac10-text strong {
    color: rgba(250, 204, 21, 0.85);
    font-weight: 600;
  }

  .hub-page {
    display: flex;
    justify-content: center;
    min-height: 100dvh;
    padding: 36px 24px 80px;
    background: var(--sc-bg, #0d0d0d);
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255, 255, 255, 0.85);
  }

  .hub-container {
    width: 100%;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* Not found */
  .not-found-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 48px 32px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.02);
    text-align: center;
    margin-top: 48px;
  }

  .not-found-icon {
    font-size: 2rem;
    color: rgba(255, 255, 255, 0.2);
  }

  .not-found-title {
    font-size: 1.2rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
  }

  .not-found-desc {
    font-size: var(--ui-text-sm, 0.8rem);
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
  }

  .not-found-link {
    font-size: var(--ui-text-sm, 0.8rem);
    color: var(--amb, #f5a623);
    text-decoration: none;
  }

  /* Agent header */
  .agent-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .agent-kicker {
    font-size: var(--ui-text-xs, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.3);
  }

  .agent-name {
    font-size: clamp(1.3rem, 3vw, 1.7rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: rgba(255, 255, 255, 0.95);
    margin: 0;
  }

  .agent-meta {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255, 255, 255, 0.35);
    margin: 0;
  }

  /* KPI grid */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  /* Tab bar */
  .tab-bar {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 0;
  }

  .tab-item {
    padding: 8px 16px 10px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 0.75rem);
    font-weight: 500;
    color: rgba(255, 255, 255, 0.35);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 80ms;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tab-item--active {
    color: rgba(255, 255, 255, 0.85);
    border-bottom-color: var(--amb, #f5a623);
  }

  .tab-item--disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .tab-soon {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(148, 163, 184, 0.12);
    border: 1px solid rgba(148, 163, 184, 0.15);
    color: rgba(148, 163, 184, 0.7);
  }

  /* Overview section */
  .overview-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .overview-card {
    padding: 20px 22px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.02);
  }

  .overview-title {
    font-size: var(--ui-text-sm, 0.8rem);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    margin: 0 0 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .overview-list {
    margin: 0;
    padding: 0 0 0 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .overview-list li {
    font-size: var(--ui-text-sm, 0.8rem);
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.5;
  }

  /* Extra stats */
  .extra-stats-card {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    overflow: hidden;
  }

  .extra-stat {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .extra-stat:nth-child(2n) {
    border-right: none;
  }

  .extra-stat:nth-last-child(-n+2) {
    border-bottom: none;
  }

  .extra-stat-lbl {
    font-size: var(--ui-text-xs, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.25);
  }

  .extra-stat-val {
    font-size: 1rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
    font-family: 'JetBrains Mono', monospace;
  }

  @media (max-width: 480px) {
    .kpi-grid {
      grid-template-columns: 1fr 1fr;
    }

    .extra-stats-card {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
