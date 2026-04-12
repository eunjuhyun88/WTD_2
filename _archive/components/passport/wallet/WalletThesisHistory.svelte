<script lang="ts">
  import type { WalletSummary, WalletActionPlan } from '$lib/wallet-intel/walletIntelTypes';

  let {
    summary,
    actionPlan,
  }: {
    summary: WalletSummary;
    actionPlan: WalletActionPlan;
  } = $props();
</script>

<section class="dossier-card">
  <div class="eyebrow">Saved Theses</div>
  <div class="headline">{summary.headline}</div>
  <div class="thesis-list">
    {#each summary.claims as claim}
      <article class="thesis-item">
        <h3>{claim.title}</h3>
        <p>{claim.detail}</p>
      </article>
    {/each}
  </div>
  <div class="primary-action">
    <span>Current stance</span>
    <strong>{actionPlan.primary.toUpperCase()}</strong>
  </div>
</section>

<style>
  .dossier-card {
    border: 1px solid rgba(255,255,255,0.08);
    background: linear-gradient(180deg, rgba(12,18,31,0.98), rgba(8,12,21,0.96));
    border-radius: 18px;
    padding: 20px;
  }
  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(128, 192, 255, 0.72);
  }
  .headline {
    margin-top: 10px;
    line-height: 1.6;
    color: rgba(246,245,242,0.92);
  }
  .thesis-list {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }
  .thesis-item {
    border-radius: 14px;
    padding: 12px;
    background: rgba(255,255,255,0.035);
  }
  .thesis-item h3 {
    margin: 0 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .thesis-item p {
    margin: 0;
    line-height: 1.55;
    color: rgba(255,255,255,0.68);
    font-size: 13px;
  }
  .primary-action {
    margin-top: 14px;
    display: inline-flex;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 999px;
    background: rgba(255,191,95,0.1);
    border: 1px solid rgba(255,191,95,0.22);
  }
</style>
