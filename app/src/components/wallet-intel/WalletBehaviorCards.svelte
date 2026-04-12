<script lang="ts">
  import type { WalletBehavior } from '$lib/wallet-intel/walletIntelTypes';

  let { behavior }: { behavior: WalletBehavior } = $props();

  const cards = $derived([
    { label: 'Accumulation', value: behavior.accumulation, note: 'inventory build-up' },
    { label: 'Distribution', value: behavior.distribution, note: 'split / exit bias' },
    { label: 'CEX Deposit', value: behavior.cexDeposit, note: 'exit risk proxy' },
    { label: 'Bridge', value: behavior.bridgeScore, note: `${behavior.holdingHorizon} horizon` },
  ]);

  function tone(value: number) {
    if (value >= 70) return 'hot';
    if (value >= 50) return 'warm';
    return 'cool';
  }
</script>

<section class="wallet-card behavior-card">
  <div class="eyebrow">Behavior Cards</div>
  <div class="grid">
    {#each cards as card}
      <article class="metric metric-{tone(card.value)}">
        <div class="metric-top">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
        <div class="meter">
          <div class="meter-fill" style={`width:${Math.min(card.value, 100)}%`}></div>
        </div>
        <p>{card.note}</p>
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

  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(128, 192, 255, 0.72);
    margin-bottom: 12px;
  }

  .grid {
    display: grid;
    gap: 10px;
  }

  .metric {
    border-radius: 14px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .metric-hot { border-color: rgba(255, 83, 122, 0.18); }
  .metric-warm { border-color: rgba(255, 191, 95, 0.18); }
  .metric-cool { border-color: rgba(0, 233, 184, 0.18); }

  .metric-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.7);
  }

  strong {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.95);
  }

  .meter {
    margin-top: 10px;
    height: 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }

  .meter-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(54, 215, 255, 0.9), rgba(0, 233, 184, 0.9));
  }

  p {
    margin: 9px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.52);
  }
</style>
