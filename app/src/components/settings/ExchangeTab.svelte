<script lang="ts">
  import BinanceKeyForm from './BinanceKeyForm.svelte';
  import BinanceReadOnlyGuide from './BinanceReadOnlyGuide.svelte';
</script>

<div class="exchange-tab">
  <div class="exchange-header">
    <span class="exchange-badge">🔗 BINANCE</span>
    <span class="exchange-note">Read-Only 연결 — 조회만 가능</span>
  </div>
  <BinanceReadOnlyGuide />
  <BinanceKeyForm />
</div>

<style>
.exchange-tab { display: flex; flex-direction: column; gap: 10px; }
.exchange-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.exchange-badge { font-size: var(--ui-text-xs); color: #E8967D; font-weight: 900; font-family: var(--fd); letter-spacing: 1px; }
.exchange-note { font-size: var(--ui-text-xs); color: #555; font-family: var(--fm); }
</style>
