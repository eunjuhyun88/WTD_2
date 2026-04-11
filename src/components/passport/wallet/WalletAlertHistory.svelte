<script lang="ts">
  import type { WalletActionPlan } from '$lib/wallet-intel/walletIntelTypes';

  let { actionPlan }: { actionPlan: WalletActionPlan } = $props();
</script>

<section class="dossier-card">
  <div class="eyebrow">Alert History</div>
  <div class="list">
    {#each actionPlan.alerts as alert, index}
      <article class="alert-row">
        <strong>Alert {index + 1}</strong>
        <p>{alert}</p>
        <span>{index === 0 ? 'not triggered yet' : 'watching'}</span>
      </article>
    {/each}
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
  .list {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }
  .alert-row {
    border-radius: 14px;
    padding: 12px;
    background: rgba(54,215,255,0.05);
    border: 1px solid rgba(54,215,255,0.14);
  }
  .alert-row p {
    margin: 6px 0;
    line-height: 1.55;
    color: rgba(255,255,255,0.68);
  }
  .alert-row span {
    font-size: 12px;
    color: rgba(255,255,255,0.5);
  }
</style>
