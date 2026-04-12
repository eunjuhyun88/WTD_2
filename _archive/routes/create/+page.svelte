<script lang="ts">
  import { goto } from '$app/navigation';
  import { isWalletConnected, walletStore } from '$lib/stores/walletStore';
  import { openWalletModal } from '$lib/stores/walletModalStore';
  import { buildAgentLink, buildTerminalLink } from '$lib/utils/deepLinks';

  const connected = $derived($isWalletConnected);
  const wallet = $derived($walletStore);

  const steps = [
    {
      label: 'Shell',
      title: 'Choose a character shell',
      detail: 'Pick the companion identity that will anchor specialization and future proof.',
    },
    {
      label: 'Mint',
      title: 'Secure ownership',
      detail: 'Connect a wallet so the character-agent can be activated under your account.',
    },
    {
      label: 'Bind',
      title: 'Attach the first brain',
      detail: 'Terminal becomes the next step for doctrine, data source, and validation setup.',
    },
  ];

  function handlePrimaryAction() {
    if (!connected) {
      openWalletModal();
      return;
    }
    goto(buildTerminalLink({ entry: 'create' }));
  }
</script>

<svelte:head>
  <title>Create Agent — Cogochi</title>
</svelte:head>

<main class="bridge-page">
  <section class="hero-card">
    <p class="eyebrow">Create Agent</p>
    <h1>Mint the character. Bind the brain.</h1>
    <p class="subtitle">
      This bridge page marks the first-run ceremony. The final mint and AI bind flow will live here. For now,
      wallet connection and the first readiness setup hand off into Terminal.
    </p>

    <div class="status-row">
      <span class="status-chip" class:connected={connected}>{connected ? wallet.shortAddr : 'Wallet not connected'}</span>
      <span class="status-chip">Stage 1 bridge</span>
      <span class="status-chip">Terminal unlock next</span>
    </div>

    <div class="action-row">
      <button class="primary-btn" type="button" onclick={handlePrimaryAction}>
        {connected ? 'Mint & Activate' : 'Connect Wallet'}
      </button>
      <button class="secondary-btn" type="button" onclick={() => goto(buildTerminalLink({ entry: 'create' }))}>
        Enter Terminal
      </button>
      <button class="ghost-btn" type="button" onclick={() => goto(buildAgentLink())}>
        Open Agent Hub
      </button>
    </div>
  </section>

  <section class="step-grid" aria-label="Create Agent flow">
    {#each steps as step, index}
      <article class="step-card">
        <span class="step-index">0{index + 1}</span>
        <span class="step-label">{step.label}</span>
        <h2>{step.title}</h2>
        <p>{step.detail}</p>
      </article>
    {/each}
  </section>
</main>

<style>
  .bridge-page {
    min-height: 100%;
    padding: var(--sc-sp-6) var(--sc-sp-4) var(--sc-sp-8);
    display: grid;
    gap: var(--sc-sp-4);
    background:
      radial-gradient(circle at top right, rgba(173, 202, 124, 0.1), transparent 28%),
      radial-gradient(circle at bottom left, rgba(242, 209, 147, 0.08), transparent 24%),
      linear-gradient(180deg, rgba(7, 12, 22, 0.96), rgba(7, 11, 20, 0.98));
  }

  .hero-card,
  .step-card {
    border-radius: 24px;
    border: 1px solid rgba(173, 202, 124, 0.16);
    background: linear-gradient(180deg, rgba(14, 22, 35, 0.92), rgba(10, 16, 27, 0.94));
    box-shadow: 0 20px 56px rgba(0, 0, 0, 0.24);
  }

  .hero-card {
    padding: clamp(22px, 3vw, 30px);
    display: grid;
    gap: 14px;
  }

  .eyebrow,
  .step-label,
  .step-index {
    margin: 0;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .eyebrow,
  .step-label {
    color: var(--sc-accent-2);
  }

  h1,
  h2 {
    margin: 0;
    color: var(--sc-text-0);
    font-family: var(--sc-font-display);
    letter-spacing: 0.04em;
  }

  h1 {
    font-size: clamp(2rem, 4vw, 3.25rem);
    line-height: 0.96;
    max-width: 10ch;
  }

  h2 {
    font-size: 1.2rem;
  }

  .subtitle,
  .step-card p {
    margin: 0;
    color: var(--sc-text-1);
    line-height: 1.5;
    max-width: 60ch;
  }

  .status-row,
  .action-row,
  .step-grid {
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

  .status-chip.connected {
    color: #edf4df;
    border-color: rgba(173, 202, 124, 0.26);
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
    transition:
      transform var(--sc-duration-fast) var(--sc-ease),
      border-color var(--sc-duration-fast) var(--sc-ease),
      background var(--sc-duration-fast) var(--sc-ease);
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

  .primary-btn:hover,
  .secondary-btn:hover,
  .ghost-btn:hover {
    transform: translateY(-2px);
  }

  .step-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .step-card {
    padding: 18px;
    display: grid;
    gap: 8px;
  }

  .step-index {
    color: var(--sc-accent-3);
  }

  @media (max-width: 900px) {
    .action-row,
    .status-row,
    .step-grid {
      grid-template-columns: 1fr;
    }

    .ghost-btn {
      justify-self: start;
      padding-inline: 0;
      min-height: auto;
    }
  }
</style>
