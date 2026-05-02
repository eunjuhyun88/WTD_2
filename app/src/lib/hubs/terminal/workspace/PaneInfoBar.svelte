<!--
  PaneInfoBar — TradingView × Santiment style header strip for indicator panes.

  Sits as an absolute overlay at the top-left of each indicator pane in the
  multi-pane chart. Shows:
    • Indicator title (e.g. "CVD", "Funding")
    • One info chip per series (raw / 7d / 14d / 30d MA) with: dot color +
      label + current value (e.g. "▼ 7d MA  +1.23M (+12.3%)")
    • A close (×) button that toggles the pane off via the chartIndicators store

  Patterns referenced (user-supplied screenshots):
    - TradingView "MA 7 close" colored pill stack (top-left)
    - Santiment series chips with Δ% color tone
    - Velo per-pane subtle metadata legend
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  export interface InfoChip {
    /** Unique key for animation tracking. */
    key: string;
    /** Color of the leading dot, matches the line in the pane. */
    color: string;
    /** Label e.g. "raw" / "7d MA" / "14d". */
    label: string;
    /** Last value at the right edge (formatted). */
    value: string;
    /** Optional Δ vs previous bar — drives tone. */
    delta?: number;
    /** Optional formatter override for delta display. */
    deltaText?: string;
    /** Bull/bear/warn — overrides delta-based tone if present. */
    tone?: 'bull' | 'bear' | 'warn' | 'neutral';
  }

  interface Props {
    /** Pane heading, e.g. "CVD", "Funding", "Open Interest". */
    title: string;
    /** Optional sub-label shown next to title, e.g. "1h" / "USD". */
    sublabel?: string;
    /** Series chips. */
    chips: InfoChip[];
    /** Whether the pane can be hidden (shows × button). */
    closable?: boolean;
    onClose?: () => void;
    children?: Snippet;
  }

  let { title, sublabel, chips, closable = false, onClose, children }: Props = $props();

  function chipTone(c: InfoChip): 'bull' | 'bear' | 'warn' | 'neutral' {
    if (c.tone) return c.tone;
    if (c.delta == null || !Number.isFinite(c.delta)) return 'neutral';
    if (c.delta > 0)  return 'bull';
    if (c.delta < 0)  return 'bear';
    return 'neutral';
  }

  function deltaLabel(c: InfoChip): string {
    if (c.deltaText) return c.deltaText;
    if (c.delta == null || !Number.isFinite(c.delta)) return '';
    const sign = c.delta > 0 ? '+' : '';
    return `${sign}${(c.delta * 100).toFixed(2)}%`;
  }
</script>

<div class="pib">
  <div class="pib-row">
    <span class="pib-title">{title}</span>
    {#if sublabel}<span class="pib-sub">{sublabel}</span>{/if}
    <div class="pib-chips">
      {#each chips as c (c.key)}
        {@const tone = chipTone(c)}
        <span class="pib-chip" data-tone={tone}>
          <i class="dot" style:background={c.color}></i>
          <em>{c.label}</em>
          <strong>{c.value}</strong>
          {#if deltaLabel(c)}<small>{deltaLabel(c)}</small>{/if}
        </span>
      {/each}
    </div>
    {#if children}{@render children()}{/if}
    {#if closable}
      <button class="pib-close" type="button" aria-label="Hide pane" onclick={onClose}>×</button>
    {/if}
  </div>
</div>

<style>
  .pib {
    position: absolute;
    top: 4px;
    left: 8px;
    z-index: 6;
    pointer-events: none;
    /* Allow chip hovers/clicks even though parent is non-interactive */
    user-select: none;
  }
  .pib-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px 3px 8px;
    background: rgba(19, 23, 34, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    pointer-events: auto;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }
  .pib-title {
    font: 600 10px/1 var(--sc-font-mono, monospace);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247, 242, 234, 0.9);
  }
  .pib-sub {
    font: 9px/1 var(--sc-font-mono, monospace);
    color: rgba(177, 181, 189, 0.5);
    padding: 0 4px;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    margin-left: 2px;
  }
  .pib-chips {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
  }
  .pib-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    font: 9px/1 var(--sc-font-mono, monospace);
    color: rgba(247, 242, 234, 0.88);
    white-space: nowrap;
  }
  .pib-chip[data-tone='bull']    { border-color: rgba(74, 222, 128, 0.25); }
  .pib-chip[data-tone='bear']    { border-color: rgba(248, 113, 113, 0.25); }
  .pib-chip[data-tone='warn']    { border-color: rgba(232, 184, 75, 0.30); }
  .pib-chip .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .pib-chip em {
    font-style: normal;
    color: rgba(177, 181, 189, 0.7);
  }
  .pib-chip strong {
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .pib-chip small {
    font-size: var(--ui-text-xs);
    padding-left: 2px;
  }
  .pib-chip[data-tone='bull'] small { color: #4ade80; }
  .pib-chip[data-tone='bear'] small { color: #f87171; }
  .pib-chip[data-tone='warn'] small { color: #e8b84b; }
  .pib-close {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    color: rgba(247, 242, 234, 0.7);
    font: 600 12px/1 var(--sc-font-mono, monospace);
    cursor: pointer;
    padding: 0;
    margin-left: 4px;
  }
  .pib-close:hover {
    background: rgba(248, 113, 113, 0.15);
    border-color: rgba(248, 113, 113, 0.4);
    color: #f87171;
  }
</style>
