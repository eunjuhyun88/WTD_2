<script lang="ts">
  import type { WalletActionPlan } from '$lib/wallet-intel/walletIntelTypes';

  let { actionPlan }: { actionPlan: WalletActionPlan } = $props();
</script>

<section class="wallet-card action-card">
  <div class="eyebrow">Action Output</div>
  <div class="primary">{actionPlan.primary.toUpperCase()}</div>
  <p class="rationale">{actionPlan.rationale}</p>

  <div class="section-title">Checklist</div>
  <div class="list">
    {#each actionPlan.checklist as item}
      <div class="item">{item}</div>
    {/each}
  </div>

  <div class="section-title">Alerts</div>
  <div class="list">
    {#each actionPlan.alerts as alert}
      <div class="item alert">{alert}</div>
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

  .eyebrow,
  .section-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(128, 192, 255, 0.72);
  }

  .primary {
    margin-top: 10px;
    display: inline-flex;
    padding: 9px 12px;
    border-radius: 999px;
    background: rgba(255, 191, 95, 0.12);
    border: 1px solid rgba(255, 191, 95, 0.22);
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .rationale {
    margin: 12px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.72);
  }

  .section-title {
    margin-top: 16px;
  }

  .list {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }

  .item {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.035);
    font-size: 12px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.68);
  }

  .item.alert {
    border: 1px solid rgba(54, 215, 255, 0.18);
  }
</style>
