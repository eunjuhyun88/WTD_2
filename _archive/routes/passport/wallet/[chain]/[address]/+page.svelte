<script lang="ts">
  import WalletAlertHistory from '../../../../../components/passport/wallet/WalletAlertHistory.svelte';
  import WalletClusterTimeline from '../../../../../components/passport/wallet/WalletClusterTimeline.svelte';
  import WalletDossierHeader from '../../../../../components/passport/wallet/WalletDossierHeader.svelte';
  import WalletEvidenceSnapshots from '../../../../../components/passport/wallet/WalletEvidenceSnapshots.svelte';
  import WalletRelatedEntities from '../../../../../components/passport/wallet/WalletRelatedEntities.svelte';
  import WalletThesisHistory from '../../../../../components/passport/wallet/WalletThesisHistory.svelte';
  import { buildTerminalLink } from '$lib/utils/deepLinks';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const openInTerminalHref = $derived(
    buildTerminalLink({
      mode: 'wallet',
      chain: data.chain,
      address: data.address,
    })
  );
</script>

<svelte:head>
  <title>Wallet Dossier · {data.dataset.identity.displayAddress}</title>
</svelte:head>

<div class="wallet-dossier-page">
  <WalletDossierHeader identity={data.dataset.identity} {openInTerminalHref} />

  <div class="dossier-grid">
    <div class="dossier-main">
      <WalletThesisHistory summary={data.dataset.summary} actionPlan={data.dataset.actionPlan} />
      <WalletClusterTimeline layers={data.dataset.flowLayers} clusters={data.dataset.clusters} />
      <WalletEvidenceSnapshots evidence={data.dataset.evidence} />
    </div>

    <div class="dossier-side">
      <WalletAlertHistory actionPlan={data.dataset.actionPlan} />
      <WalletRelatedEntities nodes={data.dataset.graph.nodes} />
    </div>
  </div>
</div>

<style>
  .wallet-dossier-page {
    min-height: 100%;
    padding: 24px;
    background:
      radial-gradient(circle at top right, rgba(54,215,255,0.08), transparent 26%),
      linear-gradient(180deg, #07111d, #040a13);
    color: #f6f5f2;
  }
  .dossier-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 16px;
    margin-top: 16px;
  }
  .dossier-main,
  .dossier-side {
    display: grid;
    gap: 16px;
    align-content: start;
  }
  @media (max-width: 1100px) {
    .dossier-grid { grid-template-columns: 1fr; }
  }
</style>
