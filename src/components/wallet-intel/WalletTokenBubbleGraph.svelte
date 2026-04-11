<script lang="ts">
  import type { WalletGraphNode } from '$lib/wallet-intel/walletIntelTypes';

  let {
    nodes,
    selectedNodeId = '',
    onSelectNode = () => {},
  }: {
    nodes: WalletGraphNode[];
    selectedNodeId?: string;
    onSelectNode?: (id: string) => void;
  } = $props();

  function bubbleColor(type: WalletGraphNode['type']) {
    if (type === 'token') return 'rgba(0, 233, 184, 0.12)';
    if (type === 'cex') return 'rgba(255, 83, 122, 0.12)';
    if (type === 'bridge') return 'rgba(54, 215, 255, 0.12)';
    if (type === 'contract') return 'rgba(255, 191, 95, 0.12)';
    if (type === 'cluster') return 'rgba(160, 120, 255, 0.12)';
    return 'rgba(255, 255, 255, 0.05)';
  }
</script>

<div class="bubble-field">
  {#each nodes as node}
    <button
      type="button"
      class="bubble"
      class:active={selectedNodeId === node.id}
      onclick={() => onSelectNode(node.id)}
      style={`--size:${node.size}px;--bubble:${bubbleColor(node.type)}`}
    >
      <span class="bubble-label">{node.shortLabel}</span>
      <span class="bubble-value">{node.valueLabel}</span>
      <span class="bubble-type">{node.type}</span>
    </button>
  {/each}
</div>

<style>
  .bubble-field {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    justify-content: center;
    min-height: 280px;
  }

  .bubble {
    width: var(--size);
    height: var(--size);
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.08), var(--bubble));
    color: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    cursor: pointer;
    padding: 10px;
    transition: transform 140ms ease, border-color 140ms ease;
  }

  .bubble:hover,
  .bubble.active {
    transform: translateY(-2px) scale(1.02);
    border-color: rgba(54, 215, 255, 0.35);
  }

  .bubble-label {
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  }

  .bubble-value {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.62);
    text-align: center;
  }

  .bubble-type {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.44);
  }
</style>
