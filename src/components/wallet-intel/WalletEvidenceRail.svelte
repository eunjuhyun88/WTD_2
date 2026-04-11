<script lang="ts">
  import type { WalletEvidenceRow } from '$lib/wallet-intel/walletIntelTypes';

  let {
    rows,
    selectedTokenSymbol = '',
  }: {
    rows: WalletEvidenceRow[];
    selectedTokenSymbol?: string;
  } = $props();

  const visibleRows = $derived(
    selectedTokenSymbol
      ? rows.filter((row) => row.token === selectedTokenSymbol)
      : rows
  );
</script>

<section class="wallet-card evidence-card">
  <div class="head">
    <div>
      <div class="eyebrow">Evidence Rail</div>
      <h3>Raw explorer truth</h3>
    </div>
    {#if selectedTokenSymbol}
      <span class="filter-chip">{selectedTokenSymbol}</span>
    {/if}
  </div>

  <div class="evidence-list">
    {#each visibleRows as row}
      <article class="evidence-row tone-{row.tone}">
        <div class="row-top">
          <span>{row.at}</span>
          <strong>{row.action}</strong>
        </div>
        <div class="row-main">
          <div>
            <div class="token">{row.amountLabel}</div>
            <div class="counterparty">{row.counterparty}</div>
          </div>
          <div class="usd">{row.usdLabel}</div>
        </div>
        <div class="row-foot">
          <span>{row.txHash}</span>
          <span>{row.note}</span>
        </div>
      </article>
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

  .head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(128, 192, 255, 0.72);
  }

  h3 {
    margin: 8px 0 0;
    font-size: 16px;
  }

  .filter-chip {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(54, 215, 255, 0.22);
    background: rgba(54, 215, 255, 0.08);
    font-size: 11px;
  }

  .evidence-list {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }

  .evidence-row {
    border-radius: 14px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .tone-bear { border-color: rgba(255, 83, 122, 0.18); }
  .tone-cyan { border-color: rgba(54, 215, 255, 0.18); }

  .row-top,
  .row-main,
  .row-foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .row-top {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .row-main {
    margin-top: 10px;
    align-items: flex-start;
  }

  .token {
    font-size: 14px;
    font-weight: 600;
  }

  .counterparty {
    margin-top: 4px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
  }

  .usd {
    font-size: 14px;
    font-weight: 600;
  }

  .row-foot {
    margin-top: 9px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.48);
    line-height: 1.4;
  }
</style>
