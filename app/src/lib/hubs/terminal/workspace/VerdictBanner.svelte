<script lang="ts">
  interface VerdictLevels {
    entry?:  number;
    target?: number;
    stop?:   number;
  }

  interface Props {
    verdictLevels?: VerdictLevels | null;
    livePrice?: number;
  }

  const { verdictLevels = null, livePrice = 0 }: Props = $props();

  let collapsed = $state(false);

  const hasLevels = $derived(
    verdictLevels != null &&
    (verdictLevels.entry != null || verdictLevels.target != null || verdictLevels.stop != null),
  );

  const tone = $derived(() => {
    if (!verdictLevels?.entry || !livePrice) return 'neutral';
    return livePrice >= verdictLevels.entry ? 'bull' : 'bear';
  });

  function fmt(p: number | undefined): string {
    if (p == null || p === 0) return '—';
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 100)   return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return p.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function rPct(level: number | undefined): string {
    if (!level || !verdictLevels?.entry) return '';
    const pct = ((level - verdictLevels.entry) / verdictLevels.entry) * 100;
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  }
</script>

{#if hasLevels}
  <div class="vb-strip" data-tone={tone()} aria-label="Verdict levels">
    <button
      class="vb-toggle"
      onclick={() => (collapsed = !collapsed)}
      title={collapsed ? 'Expand verdict' : 'Collapse verdict'}
    >
      <span class="vb-icon">▸</span>
      <span class="vb-title">Verdict</span>
    </button>

    {#if !collapsed}
      <div class="vb-levels">
        {#if verdictLevels?.entry != null}
          <span class="vb-chip entry">
            <span class="vb-lbl">Entry</span>
            <span class="vb-val">{fmt(verdictLevels.entry)}</span>
          </span>
        {/if}
        {#if verdictLevels?.target != null}
          <span class="vb-chip target">
            <span class="vb-lbl">TP</span>
            <span class="vb-val">{fmt(verdictLevels.target)}</span>
            {#if verdictLevels.entry}<span class="vb-pct">{rPct(verdictLevels.target)}</span>{/if}
          </span>
        {/if}
        {#if verdictLevels?.stop != null}
          <span class="vb-chip stop">
            <span class="vb-lbl">SL</span>
            <span class="vb-val">{fmt(verdictLevels.stop)}</span>
            {#if verdictLevels.entry}<span class="vb-pct">{rPct(verdictLevels.stop)}</span>{/if}
          </span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .vb-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    flex-shrink: 0;
    background: rgba(11, 13, 18, 0.92);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    font-family: var(--fb, 'Space Grotesk', sans-serif);
    overflow: hidden;
  }

  .vb-strip[data-tone='bull'] { border-bottom-color: rgba(38, 166, 154, 0.3); }
  .vb-strip[data-tone='bear'] { border-bottom-color: rgba(239, 83, 80, 0.3); }

  .vb-toggle {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.42);
    flex-shrink: 0;
  }
  .vb-toggle:hover { color: rgba(255, 255, 255, 0.72); }

  .vb-icon {
    font-size: 9px;
    line-height: 1;
    transition: transform 0.1s;
  }
  .vb-title {
    font-size: var(--ui-text-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.38);
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }

  .vb-levels {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .vb-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 18px;
    padding: 0 6px;
    border-radius: 2px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
  }

  .vb-chip.target {
    border-color: rgba(38, 166, 154, 0.4);
    background: rgba(38, 166, 154, 0.08);
  }
  .vb-chip.stop {
    border-color: rgba(239, 83, 80, 0.4);
    background: rgba(239, 83, 80, 0.08);
  }

  .vb-lbl {
    font-family: var(--fb, 'Space Grotesk', sans-serif);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.42);
  }
  .vb-val {
    font-family: var(--fm, 'JetBrains Mono', monospace);
    font-size: var(--ui-text-xs, 11px);
    font-weight: 700;
    color: rgba(255, 255, 255, 0.88);
  }
  .vb-chip.target .vb-val { color: var(--bull, #26a69a); }
  .vb-chip.stop .vb-val   { color: var(--bear, #ef5350); }

  .vb-pct {
    font-family: var(--fm, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.38);
  }
  .vb-chip.target .vb-pct { color: rgba(38, 166, 154, 0.7); }
  .vb-chip.stop .vb-pct   { color: rgba(239, 83, 80, 0.7); }
</style>
