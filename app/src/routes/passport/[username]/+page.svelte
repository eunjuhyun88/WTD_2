<script lang="ts">
  import type { PageData } from './$types';

  interface PassportStats {
    username: string;
    accuracy: number;
    verdict_count: number;
    streak_days: number;
    streak_next_threshold: number | null;
    best_pattern: string | null;
    badges: string[];
  }

  const STREAK_TIERS = [
    { days: 1,  label: '1일 시작',  icon: '🌱' },
    { days: 3,  label: '3일 연속',  icon: '🔥' },
    { days: 7,  label: '7일 연속',  icon: '⚡' },
    { days: 14, label: '2주 연속',  icon: '💎' },
    { days: 30, label: '30일 연속', icon: '👑' },
  ];

  let { data }: { data: PageData } = $props();

  const username = $derived(data.username as string);
  const stats = $derived(data.stats as PassportStats | null);

  const accuracy = $derived(stats ? (stats.accuracy * 100).toFixed(1) : null);

  let copied = $state(false);

  const BADGE_DEFS: { key: string; label: string; check: (s: PassportStats) => boolean }[] = [
    { key: 'first_verdict',  label: '첫 Verdict',    check: (s) => s.verdict_count >= 1 },
    { key: 'fifty_verdicts', label: '50 Verdict',    check: (s) => s.verdict_count >= 50 },
    { key: 'streak_1',       label: '1일 시작',       check: (s) => s.streak_days >= 1 },
    { key: 'streak_3',       label: '3일 연속',       check: (s) => s.streak_days >= 3 },
    { key: 'streak_7',       label: '7일 연속',       check: (s) => s.streak_days >= 7 },
    { key: 'streak_14',      label: '2주 연속',       check: (s) => s.streak_days >= 14 },
    { key: 'streak_30',      label: '30일 연속',      check: (s) => s.streak_days >= 30 },
    { key: 'acc_70',         label: '정확도 70%+',    check: (s) => s.accuracy >= 0.7 },
    { key: 'acc_80',         label: '정확도 80%+',    check: (s) => s.accuracy >= 0.8 },
  ];

  function computeBadges(s: PassportStats): string[] {
    const serverBadges = new Set(s.badges ?? []);
    const earned: string[] = [];
    for (const def of BADGE_DEFS) {
      if (def.check(s) || serverBadges.has(def.key) || serverBadges.has(def.label)) {
        earned.push(def.label);
      }
    }
    return earned;
  }

  const earnedBadges = $derived(stats ? computeBadges(stats) : []);

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      // fallback: select + copy
    }
  }
</script>

<svelte:head>
  <title>@{username} — Cogochi 트레이더</title>
  <meta name="description" content="@{username}의 Cogochi 트레이딩 패스포트" />
  {#if stats}
    <meta property="og:title" content="@{username} — Cogochi 트레이더" />
    <meta property="og:description" content="정확도 {accuracy}% · verdict {stats.verdict_count}개 · {earnedBadges.length}개 배지" />
    <meta property="og:image" content="/api/og/passport/{username}" />
    <meta property="og:type" content="profile" />
    <meta property="og:url" content="https://cogotchi.com/passport/{username}" />
  {:else}
    <meta property="og:title" content="@{username} — Cogochi" />
    <meta property="og:description" content="Cogochi 트레이더 패스포트" />
  {/if}
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://cogotchi.com/passport/{username}" />
</svelte:head>

<div class="passport-public">
  {#if !stats}
    <div class="passport-card passport-card--not-found">
      <div class="passport-not-found-icon">?</div>
      <h1 class="passport-username">@{username}</h1>
      <p class="passport-desc">이 트레이더를 찾을 수 없습니다.</p>
      <p class="passport-desc passport-desc--muted">아직 공개 패스포트가 없거나 비공개로 설정되어 있습니다.</p>
      <a class="passport-cta" href="/cogochi">나도 만들기 →</a>
    </div>

  {:else}
    <div class="passport-card">
      <header class="passport-header">
        <div class="passport-avatar" aria-hidden="true">
          {username.charAt(0).toUpperCase()}
        </div>
        <div class="passport-identity">
          <h1 class="passport-username">@{username}</h1>
          <p class="passport-desc">Cogochi 트레이더</p>
        </div>
        <button class="share-btn" onclick={copyShareUrl} title="링크 복사">
          {#if copied}
            <span class="share-icon">✓</span>
            <span class="share-label">복사됨</span>
          {:else}
            <span class="share-icon">⎘</span>
            <span class="share-label">공유</span>
          {/if}
        </button>
      </header>

      <div class="passport-stats">
        <div class="passport-stat">
          <span class="passport-stat-label">정확도</span>
          <strong class="passport-stat-value passport-stat-value--pos">{accuracy}%</strong>
        </div>
        <div class="passport-stat">
          <span class="passport-stat-label">Verdict</span>
          <strong class="passport-stat-value">{stats.verdict_count}개</strong>
        </div>
        <div class="passport-stat">
          <span class="passport-stat-label">연속</span>
          <strong class="passport-stat-value">{stats.streak_days}일 🔥</strong>
        </div>
      </div>

      {#if stats.best_pattern}
        <div class="passport-best-pattern">
          <span class="passport-section-label">Best Pattern</span>
          <span class="passport-pattern-name">{stats.best_pattern}</span>
        </div>
      {/if}

      <div class="streak-card">
        <div class="streak-card-header">
          <span class="passport-section-label">Streak</span>
          <span class="streak-days-count">{stats.streak_days}일 🔥</span>
        </div>
        <div class="streak-tiers">
          {#each STREAK_TIERS as tier}
            {@const earned = stats.streak_days >= tier.days}
            {@const isCurrent = earned && (stats.streak_next_threshold === null || stats.streak_next_threshold > tier.days)}
            <div class="streak-tier" class:streak-tier--earned={earned} class:streak-tier--current={isCurrent}>
              <span class="streak-tier-icon">{tier.icon}</span>
              <span class="streak-tier-label">{tier.label}</span>
              <span class="streak-tier-days">{tier.days}d</span>
            </div>
          {/each}
        </div>
        {#if stats.streak_next_threshold !== null}
          <p class="streak-next-hint">다음 배지까지 {stats.streak_next_threshold - stats.streak_days}일</p>
        {:else}
          <p class="streak-next-hint streak-next-hint--complete">모든 streak 배지 달성 🎉</p>
        {/if}
      </div>

      <div class="passport-badges">
        <span class="passport-section-label">Badges ({earnedBadges.length} / {BADGE_DEFS.length})</span>
        <div class="passport-badge-row">
          {#each BADGE_DEFS as def}
            {@const earned = earnedBadges.includes(def.label)}
            <span class="passport-badge" class:passport-badge--earned={earned} class:passport-badge--locked={!earned}>
              {def.label}
            </span>
          {/each}
        </div>
      </div>

      <a class="passport-cta" href="/cogochi">나도 만들기 →</a>
    </div>
  {/if}
</div>

<style>
  .passport-public {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100dvh;
    padding: 24px 16px;
    background: #0d1117;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
  }

  .passport-card {
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 36px 28px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.03);
  }

  .passport-card--not-found {
    align-items: center;
    text-align: center;
    gap: 16px;
  }

  .passport-not-found-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    font-size: 1.8rem;
    color: rgba(255,255,255,0.3);
  }

  .passport-header {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .passport-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: rgba(245, 166, 35, 0.15);
    border: 1px solid rgba(245, 166, 35, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--amb, #f5a623);
    flex-shrink: 0;
  }

  .passport-identity {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .passport-username {
    font-size: 1.5rem;
    font-weight: 700;
    color: rgba(255,255,255,0.95);
    margin: 0;
    letter-spacing: -0.02em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .passport-desc {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255,255,255,0.45);
    margin: 0;
  }

  .passport-desc--muted {
    color: rgba(255,255,255,0.3);
  }

  .share-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    cursor: pointer;
    color: rgba(255,255,255,0.5);
    transition: border-color 80ms, color 80ms;
    flex-shrink: 0;
  }

  .share-btn:hover {
    border-color: rgba(255,255,255,0.25);
    color: rgba(255,255,255,0.8);
  }

  .share-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .share-label {
    font-size: var(--ui-text-xs, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .passport-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .passport-stat {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.02);
  }

  .passport-stat-label {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255,255,255,0.4);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .passport-stat-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: rgba(255,255,255,0.9);
    line-height: 1.1;
  }

  .passport-stat-value--pos {
    color: var(--pos, #4ade80);
  }

  .passport-section-label {
    display: block;
    font-size: var(--ui-text-xs, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.35);
    margin-bottom: 8px;
  }

  .passport-best-pattern {
    padding: 14px 16px;
    border-radius: 8px;
    border: 1px solid rgba(245, 166, 35, 0.15);
    background: rgba(245, 166, 35, 0.05);
  }

  .passport-pattern-name {
    font-size: 0.92rem;
    color: var(--amb, #f5a623);
    font-weight: 600;
  }

  .streak-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 100, 50, 0.18);
    background: rgba(255, 100, 50, 0.04);
  }

  .streak-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .streak-days-count {
    font-size: 0.9rem;
    font-weight: 700;
    color: #ff6432;
  }

  .streak-tiers {
    display: flex;
    gap: 6px;
  }

  .streak-tier {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 4px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.02);
    opacity: 0.35;
    transition: opacity 80ms;
  }

  .streak-tier--earned {
    opacity: 1;
    border-color: rgba(255, 100, 50, 0.25);
    background: rgba(255, 100, 50, 0.08);
  }

  .streak-tier--current {
    border-color: rgba(255, 100, 50, 0.5);
    box-shadow: 0 0 0 1px rgba(255, 100, 50, 0.2);
  }

  .streak-tier-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .streak-tier-label {
    font-size: 0.6rem;
    color: rgba(255,255,255,0.5);
    text-align: center;
    line-height: 1.2;
  }

  .streak-tier--earned .streak-tier-label {
    color: rgba(255, 100, 50, 0.9);
  }

  .streak-tier-days {
    font-size: 0.6rem;
    color: rgba(255,255,255,0.3);
  }

  .streak-next-hint {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255,255,255,0.4);
    margin: 0;
    text-align: center;
  }

  .streak-next-hint--complete {
    color: #ff6432;
  }

  .passport-badges {
    display: flex;
    flex-direction: column;
  }

  .passport-badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .passport-badge {
    padding: 5px 12px;
    border-radius: 999px;
    font-size: var(--ui-text-xs, 0.75rem);
    transition: opacity 80ms;
  }

  .passport-badge--earned {
    background: rgba(245, 166, 35, 0.12);
    border: 1px solid rgba(245, 166, 35, 0.35);
    color: var(--amb, #f5a623);
  }

  .passport-badge--locked {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.25);
  }

  .passport-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 24px;
    border-radius: 8px;
    background: rgba(245, 166, 35, 0.15);
    border: 1px solid rgba(245, 166, 35, 0.3);
    color: var(--amb, #f5a623);
    font-size: 0.9rem;
    font-weight: 600;
    text-decoration: none;
    transition: background 80ms;
    margin-top: 4px;
  }

  .passport-cta:hover {
    background: rgba(245, 166, 35, 0.25);
  }

  @media (max-width: 480px) {
    .passport-card {
      padding: 24px 20px;
    }
    .passport-stats {
      gap: 8px;
    }
  }
</style>
