<script lang="ts">
  let loading = $state(false);
  let error = $state('');

  async function checkoutPro() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status}`);
      const { url } = await res.json();
      window.location.href = url;
    } catch (e) {
      error = 'Checkout failed. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Upgrade — WTD</title></svelte:head>

<div class="upgrade-page">
  <h1 class="page-title">Upgrade your plan</h1>
  <p class="subtitle">더 많은 분석, 더 강력한 AI 모델</p>

  <div class="tier-grid">
    <div class="tier-card tier-card--free">
      <div class="tier-name">Free</div>
      <div class="tier-price">$0<span class="period">/mo</span></div>
      <ul class="tier-features">
        <li>20 messages/day</li>
        <li>Ollama qwen3.5 model</li>
        <li>4 tools per turn</li>
        <li>explain, scan, similar</li>
      </ul>
    </div>

    <div class="tier-card tier-card--pro tier-card--highlight">
      <div class="tier-badge">Most Popular</div>
      <div class="tier-name">Pro</div>
      <div class="tier-price">$19<span class="period">/mo</span></div>
      <ul class="tier-features">
        <li>500 messages/day</li>
        <li>Claude Haiku 4.5</li>
        <li>6 tools per turn</li>
        <li>+ judge, save, passport</li>
      </ul>
      <button class="upgrade-btn" onclick={() => checkoutPro()} disabled={loading}>
        {loading ? 'Redirecting…' : 'Upgrade to Pro'}
      </button>
      {#if error}<p class="err">{error}</p>{/if}
    </div>

    <div class="tier-card tier-card--team">
      <div class="tier-name">Team</div>
      <div class="tier-price">$79<span class="period">/mo</span></div>
      <ul class="tier-features">
        <li>2000 messages/day</li>
        <li>Claude Sonnet 4.7</li>
        <li>Priority queue</li>
        <li>Coming soon: multi-agent</li>
      </ul>
      <button class="upgrade-btn upgrade-btn--muted" disabled>Coming soon</button>
    </div>
  </div>

  <p class="back-link"><a href="/terminal">← Back to terminal</a></p>
</div>

<style>
.upgrade-page { max-width: 900px; margin: 0 auto; padding: 40px 24px; }
.page-title { font-size: 28px; font-weight: 700; color: #e8eaf0; margin: 0 0 8px; }
.subtitle { color: #8a9ab0; font-size: 14px; margin: 0 0 40px; }
.tier-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
@media (max-width: 700px) { .tier-grid { grid-template-columns: 1fr; } }
.tier-card {
  background: #111222; border: 1px solid #2a2a3a; border-radius: 12px;
  padding: 24px; display: flex; flex-direction: column; gap: 12px; position: relative;
}
.tier-card--highlight { border-color: #4a6fa5; }
.tier-badge {
  position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
  background: #4a6fa5; color: #cce8ff; font-size: 11px; font-weight: 600;
  padding: 2px 12px; border-radius: 20px;
}
.tier-name { font-size: 18px; font-weight: 700; color: #e8eaf0; }
.tier-price { font-size: 32px; font-weight: 800; color: #cce8ff; }
.period { font-size: 14px; font-weight: 400; color: #8a9ab0; }
.tier-features { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.tier-features li { font-size: 13px; color: #c8ccd4; padding-left: 16px; position: relative; }
.tier-features li::before { content: '✓'; position: absolute; left: 0; color: #4caf50; font-size: 11px; }
.upgrade-btn {
  background: #4a6fa5; color: #fff; border: none; border-radius: 8px;
  padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: background 0.15s; margin-top: auto;
}
.upgrade-btn:hover:not(:disabled) { background: #5a7fc0; }
.upgrade-btn:disabled { opacity: 0.5; cursor: default; }
.upgrade-btn--muted { background: #2a2a3a; color: #7a8a9a; }
.err { color: #f44336; font-size: 12px; margin: 0; }
.back-link { margin-top: 24px; }
.back-link a { color: #4a6fa5; font-size: 13px; text-decoration: none; }
.back-link a:hover { text-decoration: underline; }
</style>
