<script lang="ts">
  import type { CallDir } from '$lib/stores/battleStore';

  let {
    aiCall = 'SKIP' as CallDir,
    aiConfidence = 0,
    aiConfTarget = 75,
    aiReason = '',
  }: {
    aiCall: CallDir;
    aiConfidence?: number;
    aiConfTarget: number;
    aiReason: string;
  } = $props();

  // Animate confidence progress
  let displayConf = $state(0);
  let animTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    const target = aiConfTarget;
    displayConf = 0;
    if (animTimer) clearInterval(animTimer);

    animTimer = setInterval(() => {
      displayConf = Math.min(displayConf + 2, target);
      if (displayConf >= target) {
        if (animTimer) clearInterval(animTimer);
        animTimer = null;
      }
    }, 30);

    return () => {
      if (animTimer) clearInterval(animTimer);
    };
  });

  const dirLabel = $derived(
    aiCall === 'LONG' ? 'LONG' : aiCall === 'SHORT' ? 'SHORT' : 'NEUTRAL'
  );

  const dirIcon = $derived(
    aiCall === 'LONG' ? '\u25B2' : aiCall === 'SHORT' ? '\u25BC' : '\u25CF'
  );
</script>

<div class="ai-advisor">
  <div class="ai-header">
    <span class="ai-label">AI Trend</span>
    <span
      class="ai-dir"
      class:long={aiCall === 'LONG'}
      class:short={aiCall === 'SHORT'}
      class:neutral={aiCall === 'SKIP'}
    >
      {dirIcon} {dirLabel}
    </span>
    <span class="ai-conf-val">{displayConf}%</span>
  </div>

  <!-- Confidence bar -->
  <div class="ai-conf-wrap">
    <div class="ai-conf-bar">
      <div
        class="ai-conf-fill"
        class:long={aiCall === 'LONG'}
        class:short={aiCall === 'SHORT'}
        style="width: {displayConf}%"
      ></div>
    </div>
  </div>

  <!-- Reason -->
  <div class="ai-reason">{aiReason}</div>
</div>

<style>
  .ai-advisor {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1, 4px);
    padding: var(--sc-sp-1_5, 6px) var(--sc-sp-3, 12px);
    background: var(--sc-surface, #0f1828);
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: var(--sc-radius-md, 6px);
  }

  .ai-header {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-2, 8px);
  }

  .ai-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .ai-dir {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    font-weight: 700;
  }

  .ai-dir.long { color: var(--sc-good, #adca7c); }
  .ai-dir.short { color: var(--sc-bad, #cf7f8f); }
  .ai-dir.neutral { color: var(--sc-text-2, rgba(247,242,234,0.68)); }

  .ai-conf-wrap {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-2, 8px);
  }

  .ai-conf-bar {
    flex: 1;
    height: 4px;
    background: var(--sc-bg-2, #111b2c);
    border-radius: 2px;
    overflow: hidden;
  }

  .ai-conf-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 60ms linear;
    background: var(--sc-accent, #db9a9f);
  }

  .ai-conf-fill.long { background: var(--sc-good, #adca7c); }
  .ai-conf-fill.short { background: var(--sc-bad, #cf7f8f); }

  .ai-conf-val {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-1, rgba(247,242,234,0.84));
    min-width: 30px;
    text-align: right;
    margin-left: auto;
  }

  .ai-reason {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-2xs, 9px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    font-style: italic;
    line-height: var(--sc-lh-normal, 1.45);
  }
</style>
