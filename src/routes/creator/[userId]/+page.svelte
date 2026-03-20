<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { buildSignalsLink, buildTerminalLink } from '$lib/utils/deepLinks';

  const userId = $derived(page.params.userId);
</script>

<svelte:head>
  <title>Creator — Cogochi</title>
</svelte:head>

<main class="bridge-page">
  <section class="hero-card">
    <p class="eyebrow">Creator Profile</p>
    <h1>Review the operator behind the signal.</h1>
    <p class="subtitle">
      This bridge route reserves the public creator view described in the community signal spec. The final page will
      show profile context, recent posts, track record, and Terminal handoff cues for <code>{userId}</code>.
    </p>

    <div class="status-row">
      <span class="status-chip">Creator {userId}</span>
      <span class="status-chip">Public profile bridge</span>
      <span class="status-chip">Signal record next</span>
    </div>

    <div class="action-row">
      <button class="primary-btn" type="button" onclick={() => goto(buildSignalsLink('feed'))}>
        Browse Signals
      </button>
      <button class="secondary-btn" type="button" onclick={() => goto(buildTerminalLink({ source: 'creator-profile', userId }))}>
        Open Terminal
      </button>
    </div>
  </section>
</main>

<style>
  .bridge-page {
    min-height: 100%;
    padding: var(--sc-sp-6) var(--sc-sp-4) var(--sc-sp-8);
    display: grid;
    gap: var(--sc-sp-4);
    background:
      radial-gradient(circle at top left, rgba(173, 202, 124, 0.08), transparent 24%),
      linear-gradient(180deg, rgba(7, 11, 20, 0.98), rgba(8, 12, 22, 0.98));
  }

  .hero-card {
    border-radius: 24px;
    border: 1px solid rgba(173, 202, 124, 0.16);
    background: linear-gradient(180deg, rgba(13, 21, 34, 0.94), rgba(9, 15, 25, 0.95));
    box-shadow: 0 20px 54px rgba(0, 0, 0, 0.22);
    padding: clamp(22px, 3vw, 30px);
    display: grid;
    gap: 14px;
  }

  .eyebrow {
    margin: 0;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--sc-accent-2);
  }

  h1 {
    margin: 0;
    color: var(--sc-text-0);
    font-family: var(--sc-font-display);
    font-size: clamp(2rem, 4vw, 3.1rem);
    line-height: 0.96;
    letter-spacing: 0.04em;
    max-width: 12ch;
  }

  .subtitle {
    margin: 0;
    color: var(--sc-text-1);
    line-height: 1.5;
    max-width: 62ch;
  }

  code {
    font-family: var(--sc-font-mono);
    color: var(--sc-text-0);
  }

  .status-row,
  .action-row {
    display: grid;
    gap: 10px;
  }

  .status-row {
    grid-template-columns: repeat(3, minmax(0, max-content));
  }

  .status-chip {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid rgba(173, 202, 124, 0.14);
    display: inline-flex;
    align-items: center;
    color: var(--sc-text-1);
    background: rgba(10, 16, 26, 0.78);
  }

  .action-row {
    grid-template-columns: repeat(2, minmax(0, max-content));
    align-items: center;
  }

  .primary-btn,
  .secondary-btn {
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
</style>
