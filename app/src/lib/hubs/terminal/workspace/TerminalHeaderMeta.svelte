<script lang="ts">
  import type { TerminalHeaderBadge } from '$lib/terminal/terminalHeaderModel';

  interface Props {
    subjectLabel?: string;
    sourceLabel?: string;
    badges?: TerminalHeaderBadge[];
  }

  let {
    subjectLabel = 'BTC',
    sourceLabel = 'system',
    badges = [],
  }: Props = $props();
</script>

<div class="header-meta">
  <div class="header-subject">
    <strong>{subjectLabel}</strong>
    <small>{sourceLabel}</small>
  </div>
  <div class="header-badges">
    {#each badges as badge}
      <span class="header-badge" data-tone={badge.tone ?? 'neutral'}>
        <em>{badge.label}</em>
        <strong>{badge.value}</strong>
      </span>
    {/each}
  </div>
</div>

<style>
  .header-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.015);
    min-width: 0;
  }
  .header-subject {
    display: grid;
    gap: 1px;
    min-width: 52px;
    flex-shrink: 0;
  }
  .header-subject strong,
  .header-subject small,
  .header-badge em,
  .header-badge strong {
    font-family: var(--sc-font-mono);
  }
  .header-subject strong {
    font-size: 11px;
    color: rgba(247,242,234,0.96);
    letter-spacing: 0.04em;
  }
  .header-subject small {
    font-size: var(--ui-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247,242,234,0.38);
  }
  .header-badges {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
  }
  .header-badges::-webkit-scrollbar { display: none; }
  .header-badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 5px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
  }
  .header-badge em {
    font-style: normal;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.42);
  }
  .header-badge strong {
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.88);
  }
  .header-badge[data-tone='bull'] strong { color: #8fdd9d; }
  .header-badge[data-tone='bear'] strong { color: #f19999; }
  .header-badge[data-tone='warn'] strong { color: #e9c167; }
  .header-badge[data-tone='info'] strong { color: #83bcff; }
</style>
