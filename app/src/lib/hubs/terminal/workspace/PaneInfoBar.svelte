<!--
  PaneInfoBar — TradingView-native style indicator legend.

  Sits at the top-left of each indicator sub-pane, mirroring how TV shows
  indicator labels (flat text, no card background, dot + label + value inline).
  Controls (close) appear on hover only.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  export interface InfoChip {
    key: string;
    color: string;
    label: string;
    value: string;
    delta?: number;
    deltaText?: string;
    tone?: 'bull' | 'bear' | 'warn' | 'neutral';
  }

  interface Props {
    title: string;
    sublabel?: string;
    chips: InfoChip[];
    closable?: boolean;
    onClose?: () => void;
    children?: Snippet;
  }

  let { title, sublabel, chips, closable = false, onClose, children }: Props = $props();

  function tone(c: InfoChip): 'bull' | 'bear' | 'warn' | 'neutral' {
    if (c.tone) return c.tone;
    if (c.delta == null || !Number.isFinite(c.delta)) return 'neutral';
    return c.delta > 0 ? 'bull' : c.delta < 0 ? 'bear' : 'neutral';
  }

  function deltaStr(c: InfoChip): string {
    if (c.deltaText) return c.deltaText;
    if (c.delta == null || !Number.isFinite(c.delta)) return '';
    const sign = c.delta > 0 ? '+' : '';
    return `${sign}${(c.delta * 100).toFixed(2)}%`;
  }
</script>

<div class="pib">
  <span class="pib-name">{title}</span>
  {#if sublabel}<span class="pib-tf">{sublabel}</span>{/if}
  {#each chips as c (c.key)}
    {@const t = tone(c)}
    {@const d = deltaStr(c)}
    <span class="pib-series" data-tone={t}>
      <i class="dot" style:background={c.color}></i>
      <em>{c.label}</em>
      <strong>{c.value}</strong>
      {#if d}<span class="delta">{d}</span>{/if}
    </span>
  {/each}
  {#if children}{@render children()}{/if}
  {#if closable}
    <button class="pib-x" type="button" aria-label="Hide" onclick={onClose}>✕</button>
  {/if}
</div>

<style>
  .pib {
    position: absolute;
    top: 3px;
    left: 6px;
    z-index: 6;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    user-select: none;
    /* fade in */
    opacity: 0.82;
    transition: opacity 0.15s;
  }
  .pib:hover {
    opacity: 1;
    pointer-events: auto;
  }

  .pib-name {
    font: 600 10px/1 var(--sc-font-mono, monospace);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(235, 237, 242, 0.88);
    pointer-events: auto;
  }

  .pib-tf {
    font: 9px/1 var(--sc-font-mono, monospace);
    color: rgba(162, 166, 178, 0.52);
    pointer-events: auto;
  }

  /* separator between title and series */
  .pib-name::after {
    content: '';
  }

  .pib-series {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font: 10px/1 var(--sc-font-mono, monospace);
    color: rgba(235, 237, 242, 0.72);
    white-space: nowrap;
    pointer-events: auto;
  }

  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    opacity: 0.9;
  }

  .pib-series em {
    font-style: normal;
    color: rgba(162, 166, 178, 0.55);
    font-size: 9px;
  }

  .pib-series strong {
    font-weight: 500;
    color: rgba(235, 237, 242, 0.88);
  }

  .delta {
    font-size: 9px;
  }
  .pib-series[data-tone='bull'] .delta { color: #4ade80; }
  .pib-series[data-tone='bear'] .delta { color: #f87171; }
  .pib-series[data-tone='warn'] .delta { color: #e8b84b; }
  .pib-series[data-tone='bull'] strong { color: rgba(144, 222, 161, 0.92); }
  .pib-series[data-tone='bear'] strong { color: rgba(241, 153, 153, 0.92); }

  /* Close button — only revealed on .pib hover */
  .pib-x {
    display: none;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: transparent;
    border: none;
    color: rgba(200, 200, 210, 0.4);
    font-size: 9px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    pointer-events: auto;
    border-radius: 2px;
    transition: color 0.1s, background 0.1s;
  }
  .pib:hover .pib-x {
    display: inline-flex;
  }
  .pib-x:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.12);
  }
</style>
