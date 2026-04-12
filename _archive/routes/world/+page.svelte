<script lang="ts">
  import { goto } from '$app/navigation';
  import { gameState } from '$lib/stores/gameState';
  import { buildAgentLink, buildBattleLink, buildTerminalLink } from '$lib/utils/deepLinks';

  const gs = $derived($gameState);

  const readinessItems = [
    'Model connection',
    'Doctrine selection',
    'First train / validation run',
  ];
</script>

<svelte:head>
  <title>World — Cogochi</title>
</svelte:head>

<main class="world-page">
  <section class="world-hero">
    <p class="eyebrow">World</p>
    <h1>Deploy the run onto the BTC map.</h1>
    <p class="subtitle">
      World is the chart reinterpreted as traversal. This bridge page keeps the route alive while the full map,
      era progression, and encounter system are split out of the old Terminal shell.
    </p>

    <div class="world-status">
      <span class="status-chip">Pair {gs.pair}</span>
      <span class="status-chip">Era staging</span>
      <span class="status-chip">Battle handoff ready</span>
    </div>

    <div class="action-row">
      <button class="primary-btn" type="button" onclick={() => goto(buildTerminalLink())}>
        Prepare In Terminal
      </button>
      <button class="secondary-btn" type="button" onclick={() => goto(buildBattleLink())}>
        Open Battle Shell
      </button>
      <button class="ghost-btn" type="button" onclick={() => goto(buildAgentLink())}>
        Open Agent
      </button>
    </div>
  </section>

  <section class="world-layout">
    <article class="map-card">
      <div class="card-head">
        <span class="card-kicker">Chart Map</span>
        <strong>{gs.pair}</strong>
      </div>
      <div class="map-preview">
        <div class="map-line"></div>
        <div class="agent-marker">Agent</div>
        <div class="encounter-marker">Whale</div>
      </div>
      <p class="card-copy">
        The final World surface will render era segments, traversal speed, markers, HP, streak, and encounter
        timing over the BTC-history map.
      </p>
    </article>

    <article class="checklist-card">
      <div class="card-head">
        <span class="card-kicker">Unlock Rules</span>
        <strong>Terminal readiness</strong>
      </div>
      <div class="checklist">
        {#each readinessItems as item}
          <div class="check-row">
            <span class="check-dot"></span>
            <span>{item}</span>
          </div>
        {/each}
      </div>
      <p class="card-copy">
        This route is still a bridge. Use Terminal as the real readiness gate until world progression is server-backed.
      </p>
    </article>
  </section>
</main>

<style>
  .world-page {
    min-height: 100%;
    padding: var(--sc-sp-6) var(--sc-sp-4) var(--sc-sp-8);
    display: grid;
    gap: var(--sc-sp-4);
    background:
      radial-gradient(circle at top right, rgba(173, 202, 124, 0.08), transparent 26%),
      linear-gradient(180deg, rgba(7, 11, 20, 0.98), rgba(8, 12, 22, 0.98));
  }

  .world-hero,
  .map-card,
  .checklist-card {
    border-radius: 24px;
    border: 1px solid rgba(173, 202, 124, 0.16);
    background: linear-gradient(180deg, rgba(13, 21, 34, 0.94), rgba(9, 15, 25, 0.95));
    box-shadow: 0 20px 54px rgba(0, 0, 0, 0.22);
  }

  .world-hero,
  .map-card,
  .checklist-card {
    padding: clamp(20px, 3vw, 28px);
  }

  .eyebrow,
  .card-kicker {
    margin: 0 0 8px;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--sc-accent-2);
  }

  h1,
  .card-head strong {
    margin: 0;
    color: var(--sc-text-0);
    font-family: var(--sc-font-display);
    letter-spacing: 0.04em;
  }

  h1 {
    font-size: clamp(2rem, 4vw, 3.2rem);
    line-height: 0.96;
    max-width: 11ch;
  }

  .subtitle,
  .card-copy {
    margin: 0;
    color: var(--sc-text-1);
    line-height: 1.5;
    max-width: 64ch;
  }

  .world-status,
  .action-row,
  .world-layout,
  .checklist {
    display: grid;
    gap: 10px;
  }

  .world-status {
    grid-template-columns: repeat(3, minmax(0, max-content));
  }

  .status-chip {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(173, 202, 124, 0.14);
    color: var(--sc-text-1);
    background: rgba(10, 16, 26, 0.78);
  }

  .action-row {
    grid-template-columns: repeat(3, minmax(0, max-content));
    align-items: center;
  }

  .primary-btn,
  .secondary-btn,
  .ghost-btn {
    min-height: 42px;
    padding: 0 var(--sc-sp-4);
    border-radius: 16px;
    cursor: pointer;
    font-family: var(--sc-font-body);
    font-weight: 700;
  }

  .primary-btn {
    border: 1px solid rgba(173, 202, 124, 0.34);
    background: linear-gradient(135deg, #adca7c, #f2d193 42%, #f7f2ea 100%);
    color: #09111b;
  }

  .secondary-btn {
    border: 1px solid rgba(173, 202, 124, 0.16);
    background: rgba(10, 16, 26, 0.88);
    color: var(--sc-text-0);
  }

  .ghost-btn {
    border: none;
    background: transparent;
    color: var(--sc-text-2);
  }

  .world-layout {
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
  }

  .card-head {
    display: grid;
    gap: 6px;
    margin-bottom: 14px;
  }

  .map-preview {
    position: relative;
    min-height: 260px;
    border-radius: 20px;
    border: 1px solid rgba(173, 202, 124, 0.12);
    background:
      radial-gradient(circle at 20% 18%, rgba(173, 202, 124, 0.1), transparent 26%),
      linear-gradient(180deg, rgba(9, 15, 25, 0.96), rgba(8, 14, 23, 0.98));
    overflow: hidden;
    margin-bottom: 14px;
  }

  .map-line {
    position: absolute;
    left: 8%;
    right: 8%;
    top: 50%;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(173, 202, 124, 0.6), rgba(242, 209, 147, 0.8), transparent);
    transform: translateY(-50%) rotate(-8deg);
    box-shadow: 0 0 20px rgba(173, 202, 124, 0.18);
  }

  .agent-marker,
  .encounter-marker {
    position: absolute;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .agent-marker {
    left: 18%;
    top: 56%;
    background: rgba(173, 202, 124, 0.16);
    border: 1px solid rgba(173, 202, 124, 0.24);
    color: #edf4df;
  }

  .encounter-marker {
    right: 18%;
    top: 30%;
    background: rgba(242, 209, 147, 0.14);
    border: 1px solid rgba(242, 209, 147, 0.22);
    color: #f2e6c7;
  }

  .checklist {
    margin-bottom: 14px;
  }

  .check-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid rgba(173, 202, 124, 0.1);
    background: rgba(10, 16, 26, 0.7);
    color: var(--sc-text-1);
  }

  .check-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sc-accent-2);
    box-shadow: 0 0 10px rgba(173, 202, 124, 0.2);
  }

  @media (max-width: 900px) {
    .world-status,
    .action-row,
    .world-layout {
      grid-template-columns: 1fr;
    }

    .ghost-btn {
      justify-self: start;
      padding-inline: 0;
      min-height: auto;
    }
  }
</style>
