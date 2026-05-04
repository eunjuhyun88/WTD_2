<script lang="ts">
  interface Props {
    streak_days: number;
    streak_next_threshold: number | null;
  }

  const STREAK_TIERS = [
    { days: 1,  label: '1일 시작',  icon: '🌱' },
    { days: 3,  label: '3일 연속',  icon: '🔥' },
    { days: 7,  label: '7일 연속',  icon: '⚡' },
    { days: 14, label: '2주 연속',  icon: '💎' },
    { days: 30, label: '30일 연속', icon: '👑' },
  ];

  let { streak_days, streak_next_threshold }: Props = $props();
</script>

<div class="streak-card">
  <div class="streak-card-header">
    <span class="passport-section-label">Streak</span>
    <span class="streak-days-count">{streak_days}일 🔥</span>
  </div>
  <div class="streak-tiers">
    {#each STREAK_TIERS as tier}
      {@const earned = streak_days >= tier.days}
      {@const isCurrent = earned && (streak_next_threshold === null || streak_next_threshold > tier.days)}
      <div class="streak-tier" class:streak-tier--earned={earned} class:streak-tier--current={isCurrent}>
        <span class="streak-tier-icon">{tier.icon}</span>
        <span class="streak-tier-label">{tier.label}</span>
        <span class="streak-tier-days">{tier.days}d</span>
      </div>
    {/each}
  </div>
  {#if streak_next_threshold !== null}
    <p class="streak-next-hint">다음 배지까지 {streak_next_threshold - streak_days}일</p>
  {:else}
    <p class="streak-next-hint streak-next-hint--complete">모든 streak 배지 달성 🎉</p>
  {/if}
</div>

<style>
  .streak-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: 10px;
    background: rgba(255, 165, 0, 0.05);
    border: 1px solid rgba(255, 165, 0, 0.15);
  }

  .streak-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .streak-days-count {
    font-size: var(--ui-text-base, 14px);
    font-weight: 700;
    color: #ffa500;
  }

  .streak-tiers {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .streak-tier {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    opacity: 0.4;
    transition: opacity 0.2s, border-color 0.2s;
    min-width: 48px;
  }

  .streak-tier--earned {
    opacity: 0.75;
    border-color: rgba(255, 165, 0, 0.3);
  }

  .streak-tier--current {
    opacity: 1;
    border-color: rgba(255, 165, 0, 0.7);
    background: rgba(255, 165, 0, 0.08);
  }

  .streak-tier-icon {
    font-size: 18px;
    line-height: 1;
  }

  .streak-tier-label {
    font-size: var(--ui-text-xs, 11px);
    color: rgba(255,255,255,0.7);
    text-align: center;
  }

  .streak-tier-days {
    font-size: var(--ui-text-xs, 11px);
    color: rgba(255,255,255,0.35);
  }

  .streak-next-hint {
    font-size: var(--ui-text-xs, 11px);
    color: rgba(255,255,255,0.5);
    margin: 0;
    text-align: center;
  }

  .streak-next-hint--complete {
    color: #ffa500;
  }

  .passport-section-label {
    font-size: var(--ui-text-xs, 11px);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.4);
  }
</style>
