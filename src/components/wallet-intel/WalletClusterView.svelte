<script lang="ts">
  import type { WalletCluster } from '$lib/wallet-intel/walletIntelTypes';

  let {
    clusters,
    selectedClusterId = '',
    onSelectCluster = () => {},
  }: {
    clusters: WalletCluster[];
    selectedClusterId?: string;
    onSelectCluster?: (id: string) => void;
  } = $props();
</script>

<div class="cluster-grid">
  {#each clusters as cluster}
    <button
      type="button"
      class="cluster-card"
      class:active={selectedClusterId === cluster.id}
      onclick={() => onSelectCluster(cluster.id)}
    >
      <div class="cluster-top">
        <span>{cluster.label}</span>
        <strong>{cluster.members}</strong>
      </div>
      <div class="cluster-role">{cluster.role}</div>
      <p>{cluster.note}</p>
      <div class="cluster-foot">
        <span>{cluster.valueLabel}</span>
        <span>{cluster.tags.join(' · ')}</span>
      </div>
    </button>
  {/each}
</div>

<style>
  .cluster-grid {
    display: grid;
    gap: 12px;
  }

  .cluster-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    border-radius: 16px;
    padding: 15px;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .cluster-card.active,
  .cluster-card:hover {
    border-color: rgba(54, 215, 255, 0.24);
    background: rgba(54, 215, 255, 0.06);
  }

  .cluster-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
    font-size: 15px;
    font-weight: 600;
  }

  .cluster-role {
    margin-top: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.5);
  }

  p {
    margin: 10px 0 0;
    color: rgba(255, 255, 255, 0.72);
    line-height: 1.55;
    font-size: 13px;
  }

  .cluster-foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.54);
  }
</style>
