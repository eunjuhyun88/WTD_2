<script lang="ts">
  import type { TerminalSource } from '$lib/types/terminal';
  import FreshnessBadge from './FreshnessBadge.svelte';

  interface Props { source: TerminalSource }
  let { source }: Props = $props();
  let open = $state(false);

  const catColor: Record<string, string> = {
    Market: '#38bdf8', Derived: '#fbbf24', News: 'rgba(255,255,255,0.5)', Model: '#a78bfa'
  };
</script>

<button class="source-pill" onclick={() => open = !open} style="--cat: {catColor[source.category] || 'rgba(255,255,255,0.4)'}">
  <span class="label">{source.label}</span>
  <span class="sep">·</span>
  <FreshnessBadge status={source.freshness} updatedAt={source.updatedAt} />
  {#if open}
    <div class="citation-drawer" role="tooltip">
      <div class="row"><span>Type</span><span>{source.category}</span></div>
      {#if source.rawValue}<div class="row"><span>Value</span><span class="mono">{source.rawValue}</span></div>{/if}
      {#if source.method}<div class="row"><span>Method</span><span>{source.method}</span></div>{/if}
      {#if source.updatedAt}<div class="row"><span>Updated</span><span class="mono">{new Date(source.updatedAt).toLocaleTimeString()}</span></div>{/if}
      {#if source.link}<a href={source.link} target="_blank" rel="noopener" class="link">Open source ↗</a>{/if}
    </div>
  {/if}
</button>

<style>
  .source-pill {
    position: relative;
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--cat);
    border-radius: 20px;
    background: transparent;
    cursor: pointer;
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--cat);
    transition: background 0.15s;
  }
  .source-pill:hover { background: rgba(255,255,255,0.04); }
  .sep { opacity: 0.4; color: var(--sc-text-2); }
  .citation-drawer {
    position: absolute; bottom: calc(100% + 6px); left: 0;
    background: var(--sc-bg-2); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px; padding: 8px 10px;
    min-width: 180px; z-index: 50;
    font-size: 11px; color: var(--sc-text-1);
    text-align: left;
  }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .row span:first-child { color: var(--sc-text-2); }
  .mono { font-family: var(--sc-font-mono); }
  .link { display: block; margin-top: 6px; color: #38bdf8; font-size: 10px; }
</style>
