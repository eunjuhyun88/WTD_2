<script lang="ts">
  import type { ShellSummaryCard, StatusStripItem } from '$lib/terminal/terminalDerived';

  interface Props {
    cards?: ShellSummaryCard[];
    subtitle?: string;
    statusItems?: StatusStripItem[];
  }

  let {
    cards = [],
    subtitle = '',
    statusItems = [],
  }: Props = $props();
</script>

{#if cards.length > 0 || subtitle || statusItems.length > 0}
  <section class="context-summary">
    {#if cards.length > 0}
      <div class="summary-grid">
        {#each cards as card}
          <div class="summary-card" data-tone={card.tone}>
            <span class="summary-label">{card.label}</span>
            <strong class="summary-value">{card.value}</strong>
            <small class="summary-meta">{card.meta}</small>
          </div>
        {/each}
      </div>
    {/if}

    {#if subtitle || statusItems.length > 0}
      <div class="summary-statusline">
        {#if subtitle}
          <p class="summary-copy">{subtitle}</p>
        {/if}
        {#if statusItems.length > 0}
          <div class="summary-pills">
            {#each statusItems as item}
              <span class="summary-pill" data-tone={item.tone}>
                <em>{item.label}</em>
                <strong>{item.value}</strong>
              </span>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .context-summary {
    display: grid;
    gap: 4px;
    padding: 4px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.012);
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
  }

  .summary-card {
    min-width: 0;
    display: grid;
    gap: 1px;
    padding: 5px 6px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.022);
  }

  .summary-card[data-tone='bull'] {
    background: rgba(74,222,128,0.08);
    border-color: rgba(74,222,128,0.2);
  }

  .summary-card[data-tone='bear'] {
    background: rgba(248,113,113,0.08);
    border-color: rgba(248,113,113,0.2);
  }

  .summary-card[data-tone='warn'] {
    background: rgba(251,191,36,0.08);
    border-color: rgba(251,191,36,0.2);
  }

  .summary-card[data-tone='info'] {
    background: rgba(99,179,237,0.09);
    border-color: rgba(99,179,237,0.18);
  }

  .summary-label,
  .summary-value,
  .summary-meta,
  .summary-pill em,
  .summary-pill strong {
    font-family: var(--sc-font-mono);
  }

  .summary-label {
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247,242,234,0.42);
  }

  .summary-value {
    font-size: 10px;
    color: rgba(247,242,234,0.9);
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-meta {
    font-size: 7px;
    color: rgba(247,242,234,0.36);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-statusline {
    display: grid;
    gap: 4px;
    padding: 4px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(6,10,16,0.82);
  }

  .summary-copy {
    margin: 0;
    font-size: 10px;
    color: rgba(247,242,234,0.62);
    line-height: 1.25;
  }

  .summary-pills {
    display: flex;
    align-items: center;
    gap: 3px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .summary-pills::-webkit-scrollbar {
    display: none;
  }

  .summary-pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 5px;
    border-radius: 2px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.03);
  }

  .summary-pill em {
    font-style: normal;
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247,242,234,0.4);
  }

  .summary-pill strong {
    font-size: 8px;
    color: rgba(247,242,234,0.86);
  }

  .summary-pill[data-tone='bull'] strong { color: #8fdd9d; }
  .summary-pill[data-tone='bear'] strong { color: #f19999; }
  .summary-pill[data-tone='warn'] strong { color: #e9c167; }
  .summary-pill[data-tone='info'] strong { color: #83bcff; }

  @media (max-width: 1200px) and (min-width: 769px) {
    .summary-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
