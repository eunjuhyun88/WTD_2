<script lang="ts">
  import type { WalletSummary } from '$lib/wallet-intel/walletIntelTypes';

  let {
    summary,
    commandNote = '',
  }: {
    summary: WalletSummary;
    commandNote?: string;
  } = $props();
</script>

<section class="wallet-card summary-card">
  <div class="summary-head">
    <span class="eyebrow">Executive Summary</span>
    <span class="confidence">{summary.confidence}% confidence</span>
  </div>

  <p class="headline">{summary.headline}</p>

  {#if commandNote}
    <div class="command-note">{commandNote}</div>
  {/if}

  <div class="claims">
    {#each summary.claims as claim}
      <article class="claim claim-{claim.tone}">
        <h3>{claim.title}</h3>
        <p>{claim.detail}</p>
      </article>
    {/each}
  </div>

  <div class="follow-ups">
    {#each summary.followUps as followUp}
      <div class="follow-chip">{followUp}</div>
    {/each}
  </div>
</section>

<style>
  .wallet-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(13, 19, 32, 0.96), rgba(8, 12, 22, 0.94));
    border-radius: 18px;
    padding: 18px;
  }

  .summary-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(128, 192, 255, 0.72);
  }

  .confidence {
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
  }

  .headline {
    margin: 12px 0 0;
    font-size: 15px;
    line-height: 1.6;
    color: rgba(246, 245, 242, 0.94);
  }

  .command-note {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(54, 215, 255, 0.08);
    border: 1px solid rgba(54, 215, 255, 0.18);
    color: rgba(173, 234, 255, 0.95);
    font-size: 12px;
  }

  .claims {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }

  .claim {
    border-radius: 14px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
  }

  .claim h3 {
    margin: 0 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .claim p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: rgba(245, 245, 245, 0.74);
  }

  .claim-bull { border-color: rgba(0, 233, 184, 0.18); }
  .claim-bear { border-color: rgba(255, 83, 122, 0.18); }
  .claim-cyan { border-color: rgba(54, 215, 255, 0.18); }
  .claim-warn { border-color: rgba(255, 191, 95, 0.18); }

  .follow-ups {
    display: grid;
    gap: 8px;
    margin-top: 14px;
  }

  .follow-chip {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.025);
    color: rgba(236, 236, 236, 0.68);
    font-size: 12px;
  }
</style>
