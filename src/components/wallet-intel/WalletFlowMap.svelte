<script lang="ts">
  import type { WalletFlowLayer } from '$lib/wallet-intel/walletIntelTypes';

  let {
    layers,
    selectedLayerId = '',
    onSelectLayer = () => {},
  }: {
    layers: WalletFlowLayer[];
    selectedLayerId?: string;
    onSelectLayer?: (id: string) => void;
  } = $props();
</script>

<div class="flow-shell">
  {#each layers as layer, index}
    <button
      type="button"
      class="flow-layer"
      class:active={selectedLayerId === layer.id}
      onclick={() => onSelectLayer(layer.id)}
    >
      <div class="flow-stamp">{layer.stamp}</div>
      <div class="flow-box tone-{layer.tone}">
        <div class="flow-label">{layer.label}</div>
        <h3>{layer.headline}</h3>
        <p>{layer.detail}</p>
        <div class="flow-foot">
          <span>{layer.amountLabel}</span>
          <span>{layer.addresses.length} addr</span>
        </div>
      </div>
      {#if index < layers.length - 1}
        <div class="flow-connector"></div>
      {/if}
    </button>
  {/each}
</div>

<style>
  .flow-shell {
    display: grid;
    gap: 10px;
  }

  .flow-layer {
    background: transparent;
    border: 0;
    padding: 0;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }

  .flow-stamp {
    margin-bottom: 8px;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45);
  }

  .flow-box {
    border-radius: 18px;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    transition: transform 140ms ease, border-color 140ms ease;
  }

  .active .flow-box,
  .flow-layer:hover .flow-box {
    transform: translateY(-1px);
    border-color: rgba(54, 215, 255, 0.28);
  }

  .tone-bull { background: rgba(0, 233, 184, 0.08); }
  .tone-bear { background: rgba(255, 83, 122, 0.08); }
  .tone-warn { background: rgba(255, 191, 95, 0.08); }
  .tone-cyan { background: rgba(54, 215, 255, 0.08); }

  .flow-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.6);
  }

  h3 {
    margin: 7px 0 6px;
    font-size: 17px;
  }

  p {
    margin: 0;
    line-height: 1.55;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.72);
  }

  .flow-foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.58);
  }

  .flow-connector {
    width: 1px;
    height: 22px;
    margin: 0 auto;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(54, 215, 255, 0.45));
  }
</style>
