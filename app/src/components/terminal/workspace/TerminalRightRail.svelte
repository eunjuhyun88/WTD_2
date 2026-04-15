<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ShellSummaryCard, StatusStripItem } from '$lib/terminal/terminalDerived';
  import type { TerminalRightRailFocusItem } from '$lib/terminal/terminalAttentionModel';
  import TerminalContextPanelSummary from './TerminalContextPanelSummary.svelte';

  interface Props {
    isStreaming?: boolean;
    isScanMode?: boolean;
    resultCount?: number;
    activeLabel?: string;
    width?: number;
    summaryCards?: ShellSummaryCard[];
    subtitle?: string;
    statusItems?: StatusStripItem[];
    focusItems?: TerminalRightRailFocusItem[];
    onBack?: () => void;
    onToggle?: () => void;
    children?: Snippet;
  }

  let {
    isStreaming = false,
    isScanMode = false,
    resultCount = 0,
    activeLabel = 'BTC',
    width = 320,
    summaryCards = [],
    subtitle = '',
    statusItems = [],
    focusItems = [],
    onBack,
    onToggle,
    children,
  }: Props = $props();
</script>

<div class="analysis-rail-shell">
  <div class="rail-header">
    {#if isStreaming}
      <span class="rail-badge streaming">
        <span class="stream-dot pulsing">●</span>
        Analyzing…
      </span>
    {:else if isScanMode}
      <span class="rail-badge scan">{resultCount} RESULTS</span>
      <button class="rail-back" onclick={() => onBack?.()}>← Back</button>
    {:else}
      <span class="rail-mode">ANALYSIS</span>
      <span class="rail-sym">{activeLabel}</span>
    {/if}
    <span class="rail-width-indicator">{width}px</span>
    <button class="panel-head-toggle" type="button" onclick={() => onToggle?.()} aria-label="Hide analysis rail">
      <span class="panel-head-toggle-glyph">◨</span>
    </button>
  </div>

  <TerminalContextPanelSummary
    cards={summaryCards}
    {subtitle}
    statusItems={statusItems}
  />

  {#if focusItems.length > 0}
    <div class="rail-attention-stack" aria-label="Right rail attention priority">
      {#each focusItems as item}
        <div class="attention-item" data-tone={item.tone}>
          <span class="attention-label">{item.label}</span>
          <strong class="attention-value">{item.value}</strong>
          <small class="attention-reason">{item.reason}</small>
        </div>
      {/each}
    </div>
  {/if}

  <div class="rail-body">
    {@render children?.()}
  </div>
</div>

<style>
  .analysis-rail-shell {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: rgba(7, 10, 15, 0.98);
    border-left: 1px solid rgba(255,255,255,0.08);
  }

  .rail-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    min-width: 0;
  }

  .rail-badge,
  .rail-mode,
  .rail-sym,
  .rail-width-indicator,
  .rail-back {
    font-family: var(--sc-font-mono);
  }

  .rail-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 5px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    font-size: 7px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.62);
  }

  .rail-badge.streaming {
    color: rgba(74,222,128,0.9);
    border-color: rgba(74,222,128,0.2);
  }

  .rail-badge.scan {
    color: rgba(131,188,255,0.9);
    border-color: rgba(131,188,255,0.2);
  }

  .stream-dot.pulsing {
    animation: railPulse 1.3s ease-in-out infinite;
  }

  .rail-back {
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.03);
    color: rgba(247,242,234,0.72);
    border-radius: 999px;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 8px;
  }

  .rail-mode {
    font-size: 8px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.4);
  }

  .rail-sym {
    font-size: 11px;
    color: rgba(247,242,234,0.92);
    letter-spacing: 0.04em;
  }

  .rail-width-indicator {
    margin-left: auto;
    font-size: 8px;
    color: rgba(247,242,234,0.28);
  }

  .panel-head-toggle {
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: rgba(247,242,234,0.7);
    border-radius: 4px;
    width: 24px;
    height: 24px;
    cursor: pointer;
  }

  .rail-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .rail-attention-stack {
    display: grid;
    gap: 3px;
    padding: 4px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background:
      linear-gradient(90deg, rgba(131,188,255,0.05), transparent 42%),
      rgba(255,255,255,0.01);
  }

  .attention-item {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 6px;
    row-gap: 1px;
    align-items: baseline;
    padding: 4px 5px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(5,8,13,0.72);
  }

  .attention-item[data-tone='bull'] {
    border-color: rgba(74,222,128,0.18);
    background: rgba(74,222,128,0.06);
  }

  .attention-item[data-tone='bear'] {
    border-color: rgba(248,113,113,0.18);
    background: rgba(248,113,113,0.06);
  }

  .attention-item[data-tone='warn'] {
    border-color: rgba(251,191,36,0.18);
    background: rgba(251,191,36,0.06);
  }

  .attention-item[data-tone='info'] {
    border-color: rgba(99,179,237,0.18);
    background: rgba(99,179,237,0.06);
  }

  .attention-label,
  .attention-value,
  .attention-reason {
    font-family: var(--sc-font-mono);
  }

  .attention-label {
    font-size: 7px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.42);
  }

  .attention-value {
    min-width: 0;
    font-size: 9px;
    color: rgba(247,242,234,0.9);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .attention-reason {
    grid-column: 1 / -1;
    min-width: 0;
    font-size: 7px;
    color: rgba(247,242,234,0.38);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  @keyframes railPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
