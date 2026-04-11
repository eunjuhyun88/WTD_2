<script lang="ts">
  import WalletActionPlanCard from './WalletActionPlanCard.svelte';
  import WalletBehaviorCards from './WalletBehaviorCards.svelte';
  import WalletClusterView from './WalletClusterView.svelte';
  import WalletEvidenceRail from './WalletEvidenceRail.svelte';
  import WalletFlowMap from './WalletFlowMap.svelte';
  import WalletIdentityCard from './WalletIdentityCard.svelte';
  import WalletMarketOverlay from './WalletMarketOverlay.svelte';
  import WalletSummaryPanel from './WalletSummaryPanel.svelte';
  import WalletTokenBubbleGraph from './WalletTokenBubbleGraph.svelte';
  import type { WalletIntelDataset, WalletIntelTab } from '$lib/wallet-intel/walletIntelTypes';

  let {
    dataset,
    selectedTab = 'flow',
    selectedNodeId = '',
    selectedTokenSymbol = '',
    commandNote = '',
    dossierHref = '',
    onTabSelect = () => {},
    onNodeSelect = () => {},
    onTokenSelect = () => {},
    onExit = () => {},
  }: {
    dataset: WalletIntelDataset;
    selectedTab?: WalletIntelTab;
    selectedNodeId?: string;
    selectedTokenSymbol?: string;
    commandNote?: string;
    dossierHref?: string;
    onTabSelect?: (tab: WalletIntelTab) => void;
    onNodeSelect?: (id: string) => void;
    onTokenSelect?: (symbol: string) => void;
    onExit?: () => void;
  } = $props();

  const selectedNode = $derived(
    dataset.graph.nodes.find((node) => node.id === selectedNodeId)
      ?? dataset.clusters.find((cluster) => cluster.id === selectedNodeId)
      ?? dataset.flowLayers.find((layer) => layer.id === selectedNodeId)
      ?? null
  );
  const selectedTitle = $derived(
    selectedNode
      ? 'headline' in selectedNode
        ? selectedNode.headline
        : selectedNode.label
      : 'Selection'
  );
  const selectedDescription = $derived(
    selectedNode
      ? 'detail' in selectedNode
        ? selectedNode.detail
        : selectedNode.note
      : ''
  );
</script>

<section class="wallet-shell">
  <div class="wallet-left">
    <WalletIdentityCard identity={dataset.identity} onExit={onExit} dossierHref={dossierHref} />
    <WalletSummaryPanel summary={dataset.summary} commandNote={commandNote} />
    <WalletBehaviorCards behavior={dataset.behavior} />
  </div>

  <div class="wallet-center">
    <div class="canvas-card">
      <div class="canvas-head">
        <div>
          <div class="eyebrow">Investigation Canvas</div>
          <h2>{selectedTab === 'flow' ? 'Flow Map' : selectedTab === 'bubble' ? 'Token Bubble Graph' : 'Cluster View'}</h2>
        </div>
        <div class="tabs">
          <button type="button" class:active={selectedTab === 'flow'} onclick={() => onTabSelect('flow')}>Flow</button>
          <button type="button" class:active={selectedTab === 'bubble'} onclick={() => onTabSelect('bubble')}>Bubble</button>
          <button type="button" class:active={selectedTab === 'cluster'} onclick={() => onTabSelect('cluster')}>Cluster</button>
        </div>
      </div>

      {#if selectedNode}
        <div class="selected-strip">
          <strong>{selectedTitle}</strong>
          <span>{selectedDescription}</span>
        </div>
      {/if}

      {#if selectedTab === 'flow'}
        <WalletFlowMap
          layers={dataset.flowLayers}
          selectedLayerId={selectedNodeId}
          onSelectLayer={onNodeSelect}
        />
      {:else if selectedTab === 'bubble'}
        <WalletTokenBubbleGraph
          nodes={dataset.graph.nodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={onNodeSelect}
        />
      {:else}
        <WalletClusterView
          clusters={dataset.clusters}
          selectedClusterId={selectedNodeId}
          onSelectCluster={onNodeSelect}
        />
      {/if}
    </div>

    <WalletMarketOverlay
      tokens={dataset.market.tokens}
      selectedTokenSymbol={selectedTokenSymbol}
      onSelectToken={onTokenSelect}
    />
  </div>

  <div class="wallet-right">
    <WalletEvidenceRail rows={dataset.evidence} selectedTokenSymbol={selectedTokenSymbol} />
    <WalletActionPlanCard actionPlan={dataset.actionPlan} />
  </div>
</section>

<style>
  .wallet-shell {
    display: grid;
    grid-template-columns: minmax(280px, 22%) minmax(0, 1fr) minmax(280px, 25%);
    gap: 16px;
    min-height: 0;
    height: 100%;
  }

  .wallet-left,
  .wallet-right {
    display: grid;
    gap: 16px;
    align-content: start;
  }

  .wallet-center {
    display: grid;
    gap: 16px;
    min-height: 0;
  }

  .canvas-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(13, 19, 32, 0.96), rgba(8, 12, 22, 0.94));
    border-radius: 18px;
    padding: 18px;
  }

  .canvas-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }

  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(128, 192, 255, 0.72);
  }

  h2 {
    margin: 8px 0 0;
    font-size: 19px;
  }

  .tabs {
    display: flex;
    gap: 8px;
  }

  .tabs button {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    padding: 8px 12px;
    cursor: pointer;
  }

  .tabs button.active {
    border-color: rgba(54, 215, 255, 0.28);
    background: rgba(54, 215, 255, 0.08);
  }

  .selected-strip {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.05);
    display: grid;
    gap: 4px;
  }

  .selected-strip strong {
    font-size: 14px;
  }

  .selected-strip span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.5;
  }

  @media (max-width: 1180px) {
    .wallet-shell {
      grid-template-columns: 1fr;
    }
  }
</style>
