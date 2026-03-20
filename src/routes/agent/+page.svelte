<script lang="ts">
  import { goto } from '$app/navigation';
  import { gameState } from '$lib/stores/gameState';
  import { buildLabLink, buildPassportLink, buildTerminalLink, buildWorldLink } from '$lib/utils/deepLinks';

  const gs = $derived($gameState);

  const trainCards = [
    'Doctrine and temperament tuning',
    'Retained memory review',
    'Backtest and version comparison',
  ];

  const recordCards = [
    'Stage and streak',
    'Battle history and proof',
    'Trainer card, share, and rental state',
  ];
</script>

<svelte:head>
  <title>Agent — Cogochi</title>
</svelte:head>

<main class="agent-page">
  <section class="hero-card">
    <div>
      <p class="eyebrow">Agent</p>
      <h1>Standby, train, and publish proof.</h1>
      <p class="subtitle">
        This route is the bridge hub for the future merged Agent surface. For now it gathers the old Lab and
        Passport responsibilities under one entry point.
      </p>
    </div>

    <div class="status-strip">
      <span class="status-chip">Bond {Math.round(gs.score)}</span>
      <span class="status-chip">Train and record</span>
      <span class="status-chip">Release readiness staged</span>
    </div>

    <div class="action-row">
      <button class="primary-btn" type="button" onclick={() => goto(buildLabLink())}>Open Train</button>
      <button class="secondary-btn" type="button" onclick={() => goto(buildPassportLink())}>Open Record</button>
      <button class="ghost-btn" type="button" onclick={() => goto(buildTerminalLink())}>Back to Terminal</button>
    </div>
  </section>

  <section class="hub-grid">
    <article class="hub-card">
      <div class="card-head">
        <span class="card-kicker">Standby / Hangar</span>
        <strong>Current companion state</strong>
      </div>
      <p class="card-copy">
        Keep one living agent identity visible even when the real logic still lives in separate routes. The final hub
        should always make the next action obvious.
      </p>
      <div class="chip-grid">
        <span class="mini-chip">Ready for Terminal</span>
        <span class="mini-chip">World staged</span>
        <span class="mini-chip">Battle history</span>
      </div>
    </article>

    <article class="hub-card">
      <div class="card-head">
        <span class="card-kicker">Train</span>
        <strong>Bridge into Lab</strong>
      </div>
      <div class="list-grid">
        {#each trainCards as item}
          <div class="list-row">{item}</div>
        {/each}
      </div>
      <button class="inline-btn" type="button" onclick={() => goto(buildLabLink())}>Open Train Surface</button>
    </article>

    <article class="hub-card">
      <div class="card-head">
        <span class="card-kicker">Record</span>
        <strong>Bridge into Passport</strong>
      </div>
      <div class="list-grid">
        {#each recordCards as item}
          <div class="list-row">{item}</div>
        {/each}
      </div>
      <div class="inline-actions">
        <button class="inline-btn" type="button" onclick={() => goto(buildPassportLink())}>Open Record Surface</button>
        <button class="inline-btn inline-btn-ghost" type="button" onclick={() => goto(buildWorldLink())}>Preview World</button>
      </div>
    </article>
  </section>
</main>

<style>
  .agent-page {
    min-height: 100%;
    padding: var(--sc-sp-6) var(--sc-sp-4) var(--sc-sp-8);
    display: grid;
    gap: var(--sc-sp-4);
    background:
      radial-gradient(circle at top left, rgba(173, 202, 124, 0.08), transparent 22%),
      radial-gradient(circle at bottom right, rgba(242, 209, 147, 0.06), transparent 20%),
      linear-gradient(180deg, rgba(7, 11, 20, 0.98), rgba(8, 12, 22, 0.98));
  }

  .hero-card,
  .hub-card {
    border-radius: 24px;
    border: 1px solid rgba(173, 202, 124, 0.16);
    background: linear-gradient(180deg, rgba(13, 21, 34, 0.94), rgba(9, 15, 25, 0.95));
    box-shadow: 0 20px 54px rgba(0, 0, 0, 0.22);
  }

  .hero-card {
    padding: clamp(22px, 3vw, 30px);
    display: grid;
    gap: 14px;
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

  .status-strip,
  .action-row,
  .hub-grid,
  .chip-grid,
  .list-grid,
  .inline-actions {
    display: grid;
    gap: 10px;
  }

  .status-strip {
    grid-template-columns: repeat(3, minmax(0, max-content));
  }

  .status-chip,
  .mini-chip,
  .list-row {
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
  .ghost-btn,
  .inline-btn {
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

  .secondary-btn,
  .inline-btn {
    border: 1px solid rgba(173, 202, 124, 0.16);
    background: rgba(10, 16, 26, 0.88);
    color: var(--sc-text-0);
  }

  .ghost-btn,
  .inline-btn-ghost {
    border: none;
    background: transparent;
    color: var(--sc-text-2);
  }

  .hub-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .hub-card {
    padding: 20px;
    display: grid;
    gap: 14px;
  }

  .card-head {
    display: grid;
    gap: 6px;
  }

  .list-row {
    border-radius: 14px;
  }

  .inline-actions {
    grid-template-columns: repeat(2, minmax(0, max-content));
  }

  @media (max-width: 900px) {
    .status-strip,
    .action-row,
    .hub-grid,
    .inline-actions {
      grid-template-columns: 1fr;
    }

    .ghost-btn {
      justify-self: start;
      padding-inline: 0;
      min-height: auto;
    }
  }
</style>
