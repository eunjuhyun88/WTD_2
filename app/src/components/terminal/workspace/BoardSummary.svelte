<script lang="ts">
  import type { BoardActionRow, HeroMetricTile } from '$lib/terminal/terminalDerived';
  import type { TerminalAsset } from '$lib/types/terminal';

  interface BoardHeaderModel {
    focusLabel: string;
    biasTone: 'bull' | 'bear' | 'neutral';
    biasLabel: string;
    timeframeLabel: string;
    regimeLabel: string;
    flowLabel: string;
  }

  interface BoardSummaryFact {
    label: string;
    value: string;
    tone?: string;
    emphasis?: 'primary' | 'secondary';
  }

  interface Props {
    header?: BoardHeaderModel | null;
    facts?: BoardSummaryFact[];
    metrics?: HeroMetricTile[];
    actions?: BoardActionRow[];
    sources?: TerminalAsset['sources'];
    onActionFocus?: (label: string) => void;
  }

  let {
    header = null,
    facts = [],
    metrics = [],
    actions = [],
    sources = [],
    onActionFocus,
  }: Props = $props();
</script>

{#if header || facts.length > 0 || metrics.length > 0 || actions.length > 0 || sources.length > 0}
  <section class="board-summary">
    {#if header}
      <div class="board-hero">
        <div class="board-hero-main">
          <span class="board-kicker">Focus Board</span>
          <strong class="board-focus">{header.focusLabel}</strong>
          <div class="board-badge-row">
            <span class="hero-badge" data-tone={header.biasTone}>{header.biasLabel}</span>
            <span class="hero-badge subtle">{header.timeframeLabel}</span>
            <span class="hero-badge subtle">{header.regimeLabel}</span>
          </div>
        </div>
        <div class="board-hero-flow">
          <span>Orderflow</span>
          <strong>{header.flowLabel}</strong>
        </div>
      </div>
    {/if}

    {#if facts.length > 0}
      <div class="board-summary-bar">
        {#each facts as item}
          <div class="summary-fact" data-tone={item.tone} data-emphasis={item.emphasis ?? 'secondary'}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        {/each}
      </div>
    {/if}

    {#if metrics.length > 0}
      <div class="metric-strip">
        {#each metrics as item}
          <div class="metric-card" data-tone={item.tone}>
            <span class="metric-label">{item.label}</span>
            <strong class="metric-value">{item.value}</strong>
            <small class="metric-note">{item.note}</small>
          </div>
        {/each}
      </div>
    {/if}

    {#if actions.length > 0}
      <div class="board-action-strip">
        {#each actions as item}
          <button
            class="action-cell"
            data-tone={item.tone}
            type="button"
            onclick={() => onActionFocus?.(item.label)}
          >
            <span class="action-label">{item.label}</span>
            <strong>{item.value}</strong>
          </button>
        {/each}
      </div>
    {/if}

    {#if sources.length > 0}
      <div class="board-source-row">
        <span class="board-source-label">Sources</span>
        {#each sources as source}
          <button class="board-source-pill" type="button" onclick={() => onActionFocus?.('Sources')}>
            {source.label} · {source.freshness}
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .board-summary {
    display: grid;
    gap: 1px;
    padding: 4px 5px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background:
      linear-gradient(180deg, rgba(77,143,245,0.055), rgba(255,255,255,0.01)),
      rgba(255,255,255,0.01);
  }

  .board-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: end;
    padding: 4px 6px 5px;
  }

  .board-hero-main {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .board-kicker,
  .board-hero-flow > span,
  .hero-badge {
    font-family: var(--sc-font-mono);
  }

  .board-kicker {
    font-size: 7px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.34);
  }

  .board-focus {
    font-family: var(--sc-font-mono);
    font-size: 18px;
    line-height: 1;
    letter-spacing: 0.04em;
    color: rgba(247,242,234,0.96);
  }

  .board-badge-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 5px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    font-size: 7px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.82);
  }

  .hero-badge[data-tone='bull'] {
    color: #8fdd9d;
    border-color: rgba(74,222,128,0.2);
    background: rgba(74,222,128,0.08);
  }

  .hero-badge[data-tone='bear'] {
    color: #f19999;
    border-color: rgba(248,113,113,0.2);
    background: rgba(248,113,113,0.08);
  }

  .hero-badge.subtle {
    color: rgba(247,242,234,0.56);
  }

  .board-hero-flow {
    display: grid;
    gap: 2px;
    justify-items: end;
    padding: 4px 6px;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 4px;
    background: rgba(10,12,16,0.72);
  }

  .board-hero-flow > span {
    font-size: 7px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.36);
  }

  .board-hero-flow > strong {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: rgba(247,242,234,0.88);
  }

  .board-summary-bar {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 3px;
    padding: 0 6px 4px;
  }

  .summary-fact {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px 6px;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 3px;
    background: rgba(255,255,255,0.018);
    font-family: var(--sc-font-mono);
    white-space: nowrap;
  }

  .summary-fact[data-emphasis='primary'] {
    background: rgba(255,255,255,0.035);
    border-color: rgba(255,255,255,0.1);
  }

  .summary-fact > span {
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.32);
  }

  .summary-fact > strong {
    font-size: 10px;
    color: rgba(247,242,234,0.9);
  }

  .summary-fact[data-tone='bull'] > strong { color: #8fdd9d; }
  .summary-fact[data-tone='bear'] > strong { color: #f19999; }
  .summary-fact[data-tone='warn'] > strong { color: #e9c167; }
  .summary-fact[data-tone='info'] > strong { color: #83bcff; }

  .metric-strip {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 3px;
    padding: 0 6px 4px;
  }

  .metric-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 3px 5px;
    border-radius: 2px;
    border: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.018);
  }

  .metric-card[data-tone='bull'] { background: rgba(74,222,128,0.06); }
  .metric-card[data-tone='bear'] { background: rgba(248,113,113,0.06); }
  .metric-card[data-tone='warn'] { background: rgba(251,191,36,0.06); }

  .metric-label,
  .metric-note,
  .metric-value {
    font-family: var(--sc-font-mono);
  }

  .metric-label,
  .metric-note {
    font-size: 7px;
    color: var(--sc-text-3);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .metric-value {
    font-size: 10px;
    font-weight: 700;
    color: var(--sc-text-0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .board-action-strip {
    display: grid;
    grid-template-columns: 0.8fr 1.35fr 1.1fr 0.8fr;
    gap: 1px;
    padding: 0 6px 4px;
  }

  .action-cell {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    padding: 7px 8px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.04);
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .action-cell[data-tone='bull'] { background: rgba(74,222,128,0.06); }
  .action-cell[data-tone='bear'],
  .action-cell[data-tone='risk'] { background: rgba(248,113,113,0.06); }
  .action-cell[data-tone='info'] { background: rgba(99,179,237,0.06); }
  .action-cell[data-tone='warn'] { background: rgba(251,191,36,0.06); }

  .action-label {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247,242,234,0.42);
  }

  .action-cell > strong {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: rgba(247,242,234,0.9);
    line-height: 1.2;
    text-align: right;
  }

  .board-source-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px 6px;
    min-width: 0;
  }

  .board-source-label {
    flex-shrink: 0;
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(247,242,234,0.42);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .board-source-pill {
    flex-shrink: 0;
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(131,188,255,0.62);
    background: rgba(77,143,245,0.055);
    border: 1px solid rgba(77,143,245,0.10);
    border-radius: 2px;
    padding: 1px 4px;
    cursor: pointer;
  }

  .board-source-pill:hover {
    color: rgba(180,215,255,0.9);
    border-color: rgba(77,143,245,0.22);
  }

  @media (max-width: 1200px) and (min-width: 769px) {
    .board-hero {
      grid-template-columns: 1fr;
    }
    .board-summary-bar,
    .metric-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .board-action-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
