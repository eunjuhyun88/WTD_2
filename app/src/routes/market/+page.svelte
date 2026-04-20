<script lang="ts">
</script>

<svelte:head>
  <title>Market · Cogochi</title>
</svelte:head>

<div class="market-page">
  <div class="coming-soon">
    <span class="label">MARKET</span>
    <p>Live prices, flows, and macro context — coming soon.</p>
  </div>
</div>

<style>
  .market-page {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 60vh;
  }

  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    opacity: 0.4;
  }

  .label {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--sc-text-0);
  }

  p {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 13px;
    color: var(--sc-text-2);
  }
</style>
