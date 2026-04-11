<script lang="ts">
  import type { WalletGraphNode } from '$lib/wallet-intel/walletIntelTypes';

  let { nodes }: { nodes: WalletGraphNode[] } = $props();
</script>

<section class="dossier-card">
  <div class="eyebrow">Related Tokens / Wallets</div>
  <div class="entity-grid">
    {#each nodes.filter((node) => node.id !== 'wallet-root').slice(0, 8) as node}
      <div class="entity-card">
        <strong>{node.shortLabel}</strong>
        <span>{node.type}</span>
        <small>{node.valueLabel}</small>
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
  .entity-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0,1fr));
    gap: 10px;
    margin-top: 14px;
  }
  .entity-card {
    border-radius: 14px;
    padding: 12px;
    background: rgba(255,255,255,0.035);
    display: grid;
    gap: 4px;
  }
  .entity-card span,
  .entity-card small {
    color: rgba(255,255,255,0.56);
  }
  .entity-card span {
    text-transform: uppercase;
    font-size: 11px;
  }
  .entity-card small {
    font-size: 12px;
  }
</style>
