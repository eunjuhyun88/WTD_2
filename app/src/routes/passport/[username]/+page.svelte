<script lang="ts">
  import type { PageData } from './$types';

  interface PassportStats {
    username: string;
    accuracy: number;
    verdict_count: number;
    streak_days: number;
    best_pattern: string | null;
    badges: string[];
  }

  let { data }: { data: PageData } = $props();

  const username = $derived(data.username as string);
  const stats = $derived(data.stats as PassportStats | null);

  const accuracy = $derived(stats ? (stats.accuracy * 100).toFixed(1) : null);

  const BADGE_LABELS: Record<string, string> = {
    '7일 연속': '7일 연속',
    '첫 50 verdict': '첫 50 verdict',
    '정확도 70%+': '정확도 70%+',
  };

  function computeBadges(s: PassportStats): string[] {
    const earned: string[] = [];
    if (s.streak_days >= 7) earned.push('7일 연속');
    if (s.verdict_count >= 50) earned.push('첫 50 verdict');
    if (s.accuracy >= 0.7) earned.push('정확도 70%+');
    // also include server-supplied badges
    for (const b of s.badges ?? []) {
      if (!earned.includes(b)) earned.push(b);
    }
    return earned;
  }

  const earnedBadges = $derived(stats ? computeBadges(stats) : []);
</script>

<svelte:head>
  <title>@{username} — Cogochi 트레이더</title>
  <meta name="description" content="@{username} 의 Cogochi 트레이딩 패스포트" />
  {#if stats}
    <meta property="og:title" content="@{username} — Cogochi 트레이더" />
    <meta property="og:description" content="정확도 {accuracy}% · verdict {stats.verdict_count}개" />
    <meta property="og:image" content="/api/og/passport/{username}" />
    <meta property="og:type" content="profile" />
  {:else}
    <meta property="og:title" content="@{username} — Cogochi" />
    <meta property="og:description" content="Cogochi 트레이더 패스포트" />
  {/if}
  <meta name="robots" content="index, follow" />
</svelte:head>

<div class="passport-public">
  {#if !stats}
    <!-- 404 state -->
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

      {#if earnedBadges.length > 0}
        <div class="passport-badges">
          <span class="passport-section-label">Badges</span>
          <div class="passport-badge-row">
            {#each earnedBadges as badge}
              <span class="passport-badge">{BADGE_LABELS[badge] ?? badge}</span>
            {/each}
          </div>
        </div>
      {/if}

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
  }

  .passport-username {
    font-size: 1.5rem;
    font-weight: 700;
    color: rgba(255,255,255,0.95);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .passport-desc {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255,255,255,0.45);
    margin: 0;
  }

  .passport-desc--muted {
    color: rgba(255,255,255,0.3);
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
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255,255,255,0.7);
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
