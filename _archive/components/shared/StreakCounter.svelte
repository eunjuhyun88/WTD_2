<script lang="ts">
  const { days }: { days: number } = $props();

  const hasGlow = $derived(days > 7);
</script>

<span class="streak-pill" class:glow={hasGlow}>
  <span class="streak-fire">{'\uD83D\uDD25'}</span>
  <span class="streak-count">{days}</span>
  <span class="streak-label">day streak</span>
</span>

<style>
  .streak-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 12px;
    border-radius: var(--sc-radius-pill);
    background: rgba(var(--lis-rgb-cream), 0.08);
    border: 1px solid rgba(var(--lis-rgb-cream), 0.15);
    font-family: var(--sc-font-mono);
    white-space: nowrap;
    transition: box-shadow var(--sc-duration-normal) var(--sc-ease);
  }

  .streak-fire {
    font-size: 13px;
    line-height: 1;
  }

  .streak-count {
    font-size: var(--sc-fs-md);
    font-weight: 700;
    color: var(--lis-highlight);
    letter-spacing: 0.3px;
  }

  .streak-label {
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-2);
    letter-spacing: 0.5px;
  }

  .streak-pill.glow {
    box-shadow: 0 0 14px rgba(var(--lis-rgb-cream), 0.18);
    border-color: rgba(var(--lis-rgb-cream), 0.28);
  }

  @media (prefers-reduced-motion: reduce) {
    .streak-pill { transition: none; }
  }
</style>
