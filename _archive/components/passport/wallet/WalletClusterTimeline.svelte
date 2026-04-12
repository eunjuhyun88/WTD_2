<script lang="ts">
  import type { WalletFlowLayer, WalletCluster } from '$lib/wallet-intel/walletIntelTypes';

  let {
    layers,
    clusters,
  }: {
    layers: WalletFlowLayer[];
    clusters: WalletCluster[];
  } = $props();
</script>

<section class="dossier-card">
  <div class="eyebrow">Cluster History</div>
  <div class="timeline">
    {#each layers as layer}
      <div class="step">
        <div class="stamp">{layer.stamp}</div>
        <div class="body">
          <strong>{layer.headline}</strong>
          <p>{layer.detail}</p>
        </div>
      </div>
    {/each}
  </div>
  <div class="cluster-row">
    {#each clusters as cluster}
      <div class="cluster-pill">
        <strong>{cluster.label}</strong>
        <span>{cluster.members} wallets · {cluster.role}</span>
      </div>
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
  .timeline {
    display: grid;
    gap: 12px;
    margin-top: 14px;
  }
  .step {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    align-items: start;
  }
  .stamp {
    font-size: 11px;
    color: rgba(255,255,255,0.46);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding-top: 3px;
  }
  .body {
    border-radius: 14px;
    padding: 12px;
    background: rgba(255,255,255,0.035);
  }
  .body p {
    margin: 6px 0 0;
    line-height: 1.55;
    color: rgba(255,255,255,0.68);
    font-size: 13px;
  }
  .cluster-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }
  .cluster-pill {
    border-radius: 14px;
    padding: 10px 12px;
    background: rgba(54,215,255,0.06);
    border: 1px solid rgba(54,215,255,0.18);
    display: grid;
    gap: 3px;
  }
  .cluster-pill span {
    font-size: 12px;
    color: rgba(255,255,255,0.58);
  }
</style>
