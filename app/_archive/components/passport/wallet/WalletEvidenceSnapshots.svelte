<script lang="ts">
  import type { WalletEvidenceRow } from '$lib/wallet-intel/walletIntelTypes';

  let { evidence }: { evidence: WalletEvidenceRow[] } = $props();
</script>

<section class="dossier-card">
  <div class="eyebrow">Evidence Snapshots</div>
  <div class="list">
    {#each evidence.slice(0, 6) as row}
      <article class="row">
        <div class="top">
          <span>{row.at}</span>
          <strong>{row.action}</strong>
        </div>
        <div class="mid">
          <span>{row.amountLabel}</span>
          <span>{row.usdLabel}</span>
        </div>
        <div class="foot">{row.counterparty} · {row.txHash}</div>
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
  .row {
    border-radius: 14px;
    padding: 12px;
    background: rgba(255,255,255,0.035);
  }
  .top, .mid {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .top {
    font-size: 11px;
    color: rgba(255,255,255,0.46);
    text-transform: uppercase;
  }
  .mid {
    margin-top: 8px;
    font-size: 13px;
  }
  .foot {
    margin-top: 8px;
    font-size: 12px;
    color: rgba(255,255,255,0.58);
  }
</style>
