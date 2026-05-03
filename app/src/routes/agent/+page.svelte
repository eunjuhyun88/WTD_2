<script lang="ts">
  import { track } from '$lib/analytics';
  import { onMount } from 'svelte';

  onMount(() => {
    track('page_view', { route: '/agent' });
  });

  const CAPABILITIES = [
    {
      title: '패턴 인식',
      desc: '과거 verdict 데이터로 학습한 패턴을 실시간으로 감지합니다.',
      icon: '◈',
    },
    {
      title: '알림 발송',
      desc: '진입 조건 충족 시 Telegram 또는 앱 내 알림을 보냅니다.',
      icon: '◉',
    },
    {
      title: '성과 추적',
      desc: '각 신호의 결과를 기록해 다음 학습 사이클에 반영합니다.',
      icon: '◐',
    },
  ];
</script>

<svelte:head>
  <title>Agent — Cogochi</title>
  <meta name="description" content="Cogochi 에이전트 — 패턴 인식 · 알림 · 성과 추적. 자동매매가 아닙니다." />
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="agent-page">
  <div class="agent-container">

    <!-- AC10: explicit not-auto-trading notice -->
    <div class="notice-banner" role="note">
      <span class="notice-icon">ⓘ</span>
      <p class="notice-text">
        Cogochi 에이전트는 <strong>자동매매 봇이 아닙니다.</strong>
        주문을 직접 실행하거나 자산을 관리하지 않습니다.
        에이전트는 패턴을 감지하고 알림을 보낼 뿐이며,
        최종 판단과 실행은 항상 사용자 본인이 합니다.
      </p>
    </div>

    <header class="agent-header">
      <span class="agent-kicker">Agent</span>
      <h1 class="agent-title">패턴 감지 에이전트</h1>
      <p class="agent-subtitle">
        내 판단 이력을 학습한 에이전트가 유사한 시장 상황을 발견하면 알려줍니다.
      </p>
    </header>

    <div class="capabilities-grid">
      {#each CAPABILITIES as cap}
        <div class="capability-card">
          <span class="cap-icon" aria-hidden="true">{cap.icon}</span>
          <h2 class="cap-title">{cap.title}</h2>
          <p class="cap-desc">{cap.desc}</p>
        </div>
      {/each}
    </div>

    <div class="agent-status-card">
      <div class="status-row">
        <span class="status-label">상태</span>
        <span class="status-chip status-chip--coming">준비 중</span>
      </div>
      <p class="status-desc">
        에이전트 기능은 현재 개발 중입니다.
        Cogochi에서 verdict를 쌓으면 에이전트가 더 정확하게 학습합니다.
      </p>
      <div class="agent-actions">
        <a class="agent-cta" href="/cogochi">Cogochi 열기 →</a>
        <a class="agent-secondary" href="/patterns">패턴 보기</a>
      </div>
    </div>

  </div>
</div>

<style>
  .agent-page {
    display: flex;
    justify-content: center;
    min-height: 100dvh;
    padding: 48px 24px 80px;
    background: var(--sc-bg, #0d0d0d);
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255, 255, 255, 0.85);
  }

  .agent-container {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .notice-banner {
    display: flex;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 8px;
    border: 1px solid rgba(250, 204, 21, 0.25);
    background: rgba(250, 204, 21, 0.05);
  }

  .notice-icon {
    font-size: 1rem;
    color: rgba(250, 204, 21, 0.7);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .notice-text {
    font-size: var(--ui-text-sm, 0.8rem);
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
    line-height: 1.6;
  }

  .notice-text strong {
    color: rgba(250, 204, 21, 0.9);
    font-weight: 600;
  }

  .agent-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .agent-kicker {
    font-size: var(--ui-text-xs, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.35);
  }

  .agent-title {
    font-size: clamp(1.4rem, 3vw, 1.8rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: rgba(255, 255, 255, 0.95);
    margin: 0;
  }

  .agent-subtitle {
    font-size: var(--ui-text-sm, 0.8rem);
    color: rgba(255, 255, 255, 0.45);
    margin: 0;
    line-height: 1.6;
    max-width: 480px;
  }

  .capabilities-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }

  .capability-card {
    padding: 20px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.02);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cap-icon {
    font-size: 1.3rem;
    color: var(--amb, #f5a623);
    line-height: 1;
  }

  .cap-title {
    font-size: var(--ui-text-md, 0.85rem);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    margin: 0;
  }

  .cap-desc {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
    line-height: 1.5;
  }

  .agent-status-card {
    padding: 24px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .status-label {
    font-size: var(--ui-text-xs, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.3);
  }

  .status-chip {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: var(--ui-text-xs, 0.75rem);
    font-weight: 600;
  }

  .status-chip--coming {
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: rgba(148, 163, 184, 0.8);
  }

  .status-desc {
    font-size: var(--ui-text-sm, 0.8rem);
    color: rgba(255, 255, 255, 0.45);
    margin: 0;
    line-height: 1.6;
  }

  .agent-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .agent-cta {
    padding: 10px 20px;
    border-radius: 8px;
    background: rgba(245, 166, 35, 0.15);
    border: 1px solid rgba(245, 166, 35, 0.3);
    color: var(--amb, #f5a623);
    font-size: var(--ui-text-sm, 0.8rem);
    font-weight: 600;
    text-decoration: none;
    transition: background 80ms;
  }

  .agent-cta:hover {
    background: rgba(245, 166, 35, 0.25);
  }

  .agent-secondary {
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: rgba(255, 255, 255, 0.55);
    font-size: var(--ui-text-sm, 0.8rem);
    text-decoration: none;
    transition: border-color 80ms, color 80ms;
  }

  .agent-secondary:hover {
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.75);
  }

  @media (max-width: 480px) {
    .capabilities-grid {
      grid-template-columns: 1fr;
    }
    .agent-actions {
      flex-direction: column;
    }
    .agent-cta,
    .agent-secondary {
      text-align: center;
    }
  }
</style>
