<script lang="ts">
  import { onMount } from 'svelte';

  interface SubscriptionInfo {
    tier: 'free' | 'pro';
    tier_label: string;
    verdicts_this_month: number;
    verdict_limit: number;
    next_reset: string;
  }

  const TIER_COLORS: Record<string, string> = {
    free: 'var(--g6)',
    pro: 'var(--pos)',
  };

  let info = $state<SubscriptionInfo | null>(null);
  let loading = $state(true);

  onMount(async () => {
    try {
      const res = await fetch('/api/settings/subscription');
      if (res.ok) {
        info = await res.json();
      } else {
        info = { tier: 'free', tier_label: 'Free', verdicts_this_month: 0, verdict_limit: 50, next_reset: '' };
      }
    } catch {
      info = { tier: 'free', tier_label: 'Free', verdicts_this_month: 0, verdict_limit: 50, next_reset: '' };
    } finally {
      loading = false;
    }
  });

  const pct = $derived(
    info ? Math.min((info.verdicts_this_month / info.verdict_limit) * 100, 100) : 0
  );

  const barColor = $derived(
    pct > 90 ? 'var(--neg)' : pct > 70 ? 'var(--amb)' : 'var(--pos)'
  );

  const tierColor = $derived(info ? (TIER_COLORS[info.tier] ?? 'var(--g6)') : 'var(--g6)');
</script>

<div class="sub-panel">
  {#if loading}
    <div class="sub-skeleton"></div>
  {:else if info}
    <div class="tier-card">
      <!-- Tier header -->
      <div class="tier-header">
        <span class="tier-name" style="color: {tierColor}">{info.tier_label}</span>
        <span class="tier-badge" style="border-color: {tierColor}; color: {tierColor}">현재 플랜</span>
      </div>

      <!-- Verdict usage -->
      <div class="usage-section">
        <div class="usage-header">
          <span class="usage-label">이번 달 Verdict</span>
          <span class="usage-count">
            {info.verdicts_this_month}{info.verdict_limit < 9999 ? ` / ${info.verdict_limit}` : ''}
          </span>
        </div>
        {#if info.verdict_limit < 9999}
          <div class="usage-bar-bg">
            <div class="usage-bar-fill" style="width: {pct}%; background: {barColor}"></div>
          </div>
          {#if info.next_reset}
            <div class="usage-reset">{info.next_reset}에 초기화</div>
          {/if}
        {:else}
          <div class="usage-unlimited">무제한</div>
        {/if}
      </div>

      <!-- Upgrade CTA (free only) -->
      {#if info.tier === 'free'}
        <div class="upgrade-section">
          <div class="upgrade-text">Pro로 업그레이드하면 무제한 Verdict + Layer C 우선 학습</div>
          <a href="/pricing" class="upgrade-btn">업그레이드 →</a>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sub-panel { padding: 0; }

  .sub-skeleton {
    height: 200px;
    background: var(--g3);
    border-radius: 8px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .tier-card {
    background: var(--g2);
    border: 1px solid var(--g3);
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .tier-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tier-name {
    font-size: var(--ui-text-lg);
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
  }

  .tier-badge {
    font-size: var(--ui-text-xs);
    font-family: 'JetBrains Mono', monospace;
    border: 1px solid;
    border-radius: 12px;
    padding: 2px 8px;
  }

  .usage-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .usage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .usage-label {
    font-size: var(--ui-text-sm);
    color: var(--g7);
  }

  .usage-count {
    font-size: var(--ui-text-sm);
    color: var(--g8);
    font-family: 'JetBrains Mono', monospace;
  }

  .usage-bar-bg {
    height: 6px;
    background: var(--g3);
    border-radius: 3px;
    overflow: hidden;
  }

  .usage-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .usage-reset {
    font-size: var(--ui-text-xs);
    color: var(--g5);
  }

  .usage-unlimited {
    font-size: var(--ui-text-sm);
    color: var(--pos);
    font-family: 'JetBrains Mono', monospace;
  }

  .upgrade-section {
    background: var(--g3);
    border-radius: 6px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .upgrade-text {
    font-size: var(--ui-text-sm);
    color: var(--g7);
    line-height: 1.5;
  }

  .upgrade-btn {
    font-size: var(--ui-text-sm);
    color: var(--amb);
    text-decoration: none;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
  }

  .upgrade-btn:hover { text-decoration: underline; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
