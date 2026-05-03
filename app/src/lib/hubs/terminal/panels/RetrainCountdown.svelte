<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props {
    nextRetrainAt: string | null;
  }

  const { nextRetrainAt }: Props = $props();

  let remaining = $state('');

  function formatCountdown(isoDate: string): string {
    const target = new Date(isoDate).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) return '재훈련 준비됨';
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1_000);
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }

  function tick() {
    if (nextRetrainAt) {
      remaining = formatCountdown(nextRetrainAt);
    } else {
      remaining = '일정 없음';
    }
  }

  tick();
  const interval = setInterval(tick, 1_000);
  onDestroy(() => clearInterval(interval));
</script>

<div class="retrain-countdown">
  <span class="countdown-label">다음 재훈련</span>
  <span class="countdown-value">{remaining}</span>
</div>

<style>
  .retrain-countdown {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .countdown-label {
    font-size: var(--ui-text-xs);
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .countdown-value {
    font-size: var(--ui-text-xs);
    font-family: 'JetBrains Mono', monospace;
    color: var(--amb, #f5a623);
    letter-spacing: 0.06em;
  }
</style>
