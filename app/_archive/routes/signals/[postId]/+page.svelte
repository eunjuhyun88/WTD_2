<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { buildDeepLink, buildSignalsLink, buildTerminalLink } from '$lib/utils/deepLinks';

  const postId = $derived(page.params.postId);

  function openCreatorBridge() {
    goto(buildDeepLink('/creator/unknown', { ref: postId }));
  }
</script>

<svelte:head>
  <title>Signal Detail — Cogochi</title>
</svelte:head>

<main class="bridge-page">
  <section class="hero-card">
    <p class="eyebrow">Signal Detail</p>
    <h1>Inspect one post before you act.</h1>
    <p class="subtitle">
      This bridge route reserves the single-post drilldown surface described in the current docs. The final page
      will hydrate canonical evidence, comments, and creator context for post <code>{postId}</code>.
    </p>

    <div class="status-row">
      <span class="status-chip">Post {postId}</span>
      <span class="status-chip">Evidence pending</span>
      <span class="status-chip">Terminal handoff ready</span>
    </div>

    <div class="action-row">
      <button class="primary-btn" type="button" onclick={() => goto(buildTerminalLink({ source: 'signal-detail', postId }))}>
        Open in Terminal
      </button>
      <button class="secondary-btn" type="button" onclick={() => goto(buildSignalsLink('feed'))}>
        Back to Signals
      </button>
      <button class="ghost-btn" type="button" onclick={openCreatorBridge}>
        Creator Bridge
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
      radial-gradient(circle at top right, rgba(173, 202, 124, 0.08), transparent 24%),
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
    max-width: 11ch;
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
</style>
