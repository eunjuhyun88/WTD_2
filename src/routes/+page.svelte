<script lang="ts">
  import { goto } from '$app/navigation';
  import { isWalletConnected } from '$lib/stores/walletStore';
  import { openWalletModal } from '$lib/stores/walletModalStore';
  import { gameState } from '$lib/stores/gameState';
  import { livePrices } from '$lib/stores/priceStore';
  import HomeBackground from '../components/home/HomeBackground.svelte';
  import {
    buildAgentLink,
    buildBattleLink,
    buildCreateLink,
    buildTerminalLink,
  } from '$lib/utils/deepLinks';
  import { MAIN_CAST_SHEETS } from '$lib/data/mainCastAssets';

  const connected = $derived($isWalletConnected);
  const gs = $derived($gameState);
  const prices = $derived($livePrices);

  const selectedToken = $derived(gs.pair.split('/')[0] || 'BTC');
  const selectedPrice = $derived(prices[selectedToken] || 0);
  const selectedPriceText = $derived(
    selectedPrice > 0
      ? '$' + Number(selectedPrice).toLocaleString('en-US', {
          minimumFractionDigits: selectedPrice >= 1000 ? 2 : 4,
          maximumFractionDigits: selectedPrice >= 1000 ? 2 : 4,
        })
      : 'Loading...'
  );

  function nav(href: string) {
    goto(href);
  }

  function openCreate() {
    goto(buildCreateLink());
  }

  function openTerminal() {
    goto(buildTerminalLink());
  }

  function openAgentOrWallet() {
    if (connected) {
      goto(buildAgentLink());
      return;
    }
    openWalletModal();
  }
</script>

<svelte:head>
  <title>Cogochi — Create, Train, Deploy</title>
</svelte:head>

<HomeBackground />

<main class="home">
  <section class="hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">Create. Train. Deploy. Prove.</p>
      <h1>Mint the agent. Train the brain.</h1>
      <p class="subtitle">
        Start by creating your character-agent. Train its doctrine in Terminal, unlock the World run,
        resolve whale encounters in Battle, and grow proof inside Agent.
      </p>

      <div class="live-line" aria-label="Current market context">
        <span class="live-chip">{gs.pair}</span>
        <span class="live-chip">{selectedPriceText}</span>
        <span class="live-chip">Stage 1 entry</span>
      </div>

      <div class="cta-row">
        <button class="cta-primary" type="button" onclick={openCreate}>Create My Agent</button>
        <button class="cta-secondary" type="button" onclick={openTerminal}>Open Terminal</button>
        <button class="cta-tertiary" type="button" onclick={() => nav(buildBattleLink())}>Open Battle</button>
      </div>
    </div>

    <aside class="companion-bay">
      <div class="bay-header">
        <div>
          <p class="bay-kicker">Standby / Hangar</p>
          <h2>Duckee Green // Stage 1</h2>
        </div>
        <span class="bay-stage">Terminal first</span>
      </div>

      <div class="bay-meta">
        <span class="bay-meta-pill">Character-agent</span>
        <span class="bay-meta-pill">Brain console</span>
        <span class="bay-meta-pill">World staged</span>
        <span class="bay-meta-pill">Bond {Math.round(gs.score)}</span>
      </div>

      <div class="bay-visual">
        <img class="bay-portrait" src={MAIN_CAST_SHEETS.duckeeGreen} alt="Duckee Green companion sprite" />
        <div class="bay-visual-caption">
          <span>Active companion</span>
          <strong>Ready for {gs.pair}</strong>
        </div>
      </div>

      <div class="bay-stats">
        <div class="stat-card">
          <span class="stat-label">Bond</span>
          <strong>{Math.round(gs.score)}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Matches</span>
          <strong>{gs.matchN}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Battle</span>
          <strong>{gs.wins}/{Math.max(gs.matchN, 1)}</strong>
        </div>
      </div>

      <div class="bay-footer">
        <button class="footer-action" type="button" onclick={openAgentOrWallet}>
          {connected ? 'Open Agent' : 'Connect Wallet'}
        </button>
      </div>
    </aside>
  </section>
</main>

<style>
  .home {
    position: relative;
    z-index: 1;
    min-height: 100%;
    padding: var(--sc-sp-6) var(--sc-sp-4) var(--sc-sp-8);
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-3);
    overflow: auto;
  }

  .hero-grid {
    display: grid;
    width: min(1140px, 100%);
    margin: clamp(16px, 4vh, 36px) auto 0;
    grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
    gap: clamp(24px, 3vw, 40px);
    align-items: start;
  }

  .companion-bay {
    border: 1px solid rgba(173, 202, 124, 0.18);
    background:
      linear-gradient(180deg, rgba(10, 16, 28, 0.92), rgba(8, 12, 20, 0.94)),
      radial-gradient(circle at top right, rgba(173, 202, 124, 0.12), transparent 38%),
      radial-gradient(circle at bottom left, rgba(242, 209, 147, 0.08), transparent 40%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(18px);
  }

  .hero-copy {
    position: relative;
    isolation: isolate;
    overflow: visible;
    max-width: 620px;
    padding: 18px 0 14px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .hero-copy::before {
    content: '';
    position: absolute;
    inset: -32px -56px -48px -28px;
    z-index: -1;
    background:
      radial-gradient(circle at 4% 18%, rgba(173, 202, 124, 0.22), transparent 28%),
      radial-gradient(circle at 36% 80%, rgba(242, 209, 147, 0.12), transparent 24%),
      linear-gradient(120deg, rgba(173, 202, 124, 0.05), transparent 46%);
    filter: blur(12px);
    pointer-events: none;
  }

  .hero-copy::after {
    content: none;
  }

  .eyebrow {
    margin: 0;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sc-accent-2);
  }

  h1 {
    margin: 0;
    font-family: var(--sc-font-display);
    font-size: clamp(2.2rem, 4.4vw, 3.8rem);
    line-height: 0.96;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--sc-text-0);
    max-width: 9ch;
    text-shadow:
      0 3px 0 rgba(0, 0, 0, 0.34),
      0 0 18px rgba(173, 202, 124, 0.14);
  }

  .subtitle {
    margin: 0;
    max-width: 42ch;
    font-family: var(--sc-font-body);
    font-size: clamp(0.95rem, 1.08vw, 1.03rem);
    line-height: 1.5;
    color: var(--sc-text-1);
    letter-spacing: 0.01em;
  }

  .live-line,
  .cta-row,
  .bay-stats {
    display: grid;
    gap: var(--sc-sp-2);
  }

  .live-line {
    grid-template-columns: repeat(auto-fit, minmax(110px, max-content));
  }

  .live-chip,
  .bay-stage {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .live-chip {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--sc-sp-3);
    border-radius: 999px;
    border: 1px solid rgba(173, 202, 124, 0.14);
    background:
      linear-gradient(180deg, rgba(14, 22, 33, 0.92), rgba(10, 16, 24, 0.92));
    color: #f3f1e7;
    box-shadow: inset 0 0 0 1px rgba(173, 202, 124, 0.05);
  }

  .cta-row {
    grid-template-columns: repeat(3, minmax(0, max-content));
    align-items: center;
    width: fit-content;
  }

  .cta-primary,
  .cta-secondary,
  .cta-tertiary,
  .footer-action {
    transition:
      transform var(--sc-duration-fast) var(--sc-ease),
      border-color var(--sc-duration-fast) var(--sc-ease),
      background var(--sc-duration-fast) var(--sc-ease),
      box-shadow var(--sc-duration-fast) var(--sc-ease);
  }

  .cta-primary,
  .cta-secondary,
  .cta-tertiary,
  .footer-action {
    min-height: 42px;
    padding: 0 var(--sc-sp-4);
    border-radius: 16px;
    cursor: pointer;
    white-space: nowrap;
    font-family: var(--sc-font-body);
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .cta-primary {
    border: 1px solid rgba(173, 202, 124, 0.34);
    background:
      linear-gradient(135deg, #adca7c, #f2d193 42%, #f7f2ea 100%);
    color: #0f1520;
    box-shadow:
      0 10px 18px rgba(0, 0, 0, 0.22),
      0 0 24px rgba(173, 202, 124, 0.14);
  }

  .cta-secondary,
  .footer-action {
    border: 1px solid rgba(173, 202, 124, 0.16);
    background:
      linear-gradient(180deg, rgba(13, 21, 31, 0.86), rgba(9, 15, 23, 0.88));
    color: var(--sc-text-0);
  }

  .cta-tertiary {
    border: none;
    background: transparent;
    color: var(--sc-text-2);
    padding-inline: 0;
    min-height: auto;
    justify-self: start;
  }

  .cta-primary:hover,
  .cta-secondary:hover,
  .cta-tertiary:hover,
  .footer-action:hover {
    transform: translateY(-2px);
    border-color: rgba(173, 202, 124, 0.3);
    box-shadow: 0 0 18px rgba(173, 202, 124, 0.12);
  }

  .cta-tertiary:hover {
    border-color: transparent;
    box-shadow: none;
    color: var(--sc-text-0);
  }

  .companion-bay {
    width: 100%;
    max-width: 420px;
    justify-self: end;
    border-radius: 28px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    overflow: hidden;
  }

  .companion-bay::before {
    content: '';
    position: absolute;
    inset: 12px;
    border-radius: 24px;
    border: 1px solid rgba(173, 202, 124, 0.08);
    pointer-events: none;
  }

  .bay-header,
  .bay-footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sc-sp-3);
  }

  .bay-kicker {
    margin: 0 0 6px;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .bay-header h2 {
    margin: 0;
    font-family: var(--sc-font-display);
    color: var(--sc-text-0);
    letter-spacing: 0.04em;
    text-shadow: 0 0 14px rgba(173, 202, 124, 0.08);
  }

  .bay-header h2 {
    font-size: clamp(1.1rem, 1.8vw, 1.5rem);
  }

  .bay-stage {
    padding: 7px 12px;
    border-radius: 999px;
    background: rgba(173, 202, 124, 0.08);
    color: #edf4df;
    border: 1px solid rgba(173, 202, 124, 0.16);
  }

  .bay-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .bay-meta-pill {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(173, 202, 124, 0.12);
    background: rgba(12, 20, 30, 0.72);
    color: var(--sc-text-2);
    font-family: var(--sc-font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .bay-visual {
    position: relative;
    min-height: 188px;
    border-radius: 20px;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(14, 21, 33, 0.9), rgba(8, 14, 22, 0.97)),
      radial-gradient(circle at 20% 20%, rgba(173, 202, 124, 0.1), transparent 38%),
      radial-gradient(circle at 80% 14%, rgba(242, 209, 147, 0.08), transparent 32%);
    border: 1px solid rgba(173, 202, 124, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px 18px 54px;
  }

  .bay-visual::before {
    content: '';
    position: absolute;
    inset: auto 50% 26px auto;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(173, 202, 124, 0.16), rgba(242, 209, 147, 0.08), transparent 68%);
    transform: translateX(50%);
    filter: blur(10px);
  }

  .bay-portrait {
    width: min(100%, 178px);
    image-rendering: pixelated;
    filter: drop-shadow(0 20px 32px rgba(0, 0, 0, 0.42));
    position: relative;
    z-index: 1;
  }

  .bay-visual-caption {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 14px;
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 10px;
    z-index: 1;
  }

  .bay-visual-caption span,
  .bay-visual-caption strong {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .bay-visual-caption span {
    color: var(--sc-text-3);
    font-size: 0.7rem;
  }

  .bay-visual-caption strong {
    color: #fff1d8;
    font-size: 0.78rem;
    text-align: right;
  }

  .bay-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .stat-card {
    border-radius: 16px;
    padding: 10px 12px;
    background: rgba(12, 19, 28, 0.8);
    border: 1px solid rgba(173, 202, 124, 0.1);
    display: grid;
    gap: 2px;
  }

  .stat-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
  }

  .stat-label {
    color: var(--sc-text-3);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .stat-card strong {
    font-family: var(--sc-font-display);
    font-size: 1.08rem;
    color: #fff2ce;
    letter-spacing: 0.04em;
  }

  @media (max-width: 1100px) {
    .hero-grid {
      width: 100%;
      margin-top: 0;
      grid-template-columns: 1fr;
      align-items: start;
    }

    h1 {
      max-width: 9ch;
    }

    .hero-copy {
      max-width: none;
      padding-inline: 0;
    }

    .companion-bay {
      max-width: none;
      justify-self: stretch;
    }
  }

  @media (max-width: 768px) {
    .home {
      padding: var(--sc-sp-4) var(--sc-sp-3) var(--sc-sp-8);
    }

    .hero-copy::before {
      inset: -24px -20px -28px -16px;
    }

    .hero-copy,
    .companion-bay {
      padding: var(--sc-sp-3);
      border-radius: 22px;
    }

    h1 {
      font-size: clamp(1.7rem, 9vw, 2.6rem);
      max-width: none;
    }

    .cta-row {
      grid-template-columns: 1fr;
    }

    .bay-header,
    .bay-footer,
    .bay-stats {
      grid-template-columns: 1fr;
      display: grid;
    }

    .bay-visual-caption {
      flex-direction: column;
      align-items: flex-start;
    }

  }
</style>
