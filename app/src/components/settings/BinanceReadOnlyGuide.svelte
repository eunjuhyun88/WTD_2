<script lang="ts">
  import { trackExchangeGuideViewed } from '$lib/telemetry/exchange';

  let open = false;

  function toggleGuide() {
    open = !open;
    if (open) trackExchangeGuideViewed('binance');
  }
</script>

<div class="guide">
  <button type="button" class="guide-toggle" onclick={toggleGuide}>
    <span class="guide-icon">{open ? '▾' : '▸'}</span>
    Read-Only API Key 발급 가이드
  </button>
  {#if open}
    <div class="guide-body">
      <div class="guide-warn">⚠ Read-Only 권한 키만 허용됩니다. Trading 권한이 있는 키는 거부됩니다.</div>
      <ol class="guide-steps">
        <li>Binance → 계정 → <strong>API Management</strong></li>
        <li><strong>Enable Reading</strong> ✓ 체크<br/>
            <span class="guide-red">Enable Spot &amp; Margin Trading</span> ✗ 해제<br/>
            <span class="guide-red">Enable Futures</span> ✗ 해제</li>
        <li>IP 제한 설정 권장 (선택사항)</li>
      </ol>
    </div>
  {/if}
</div>

<style>
.guide { margin-bottom: 10px; }
.guide-toggle {
  background: none; border: 1px solid #2a2a3a; border-radius: 4px;
  color: #E8967D; font-size: var(--ui-text-xs); font-weight: 700; font-family: var(--fd);
  letter-spacing: 1px; cursor: pointer; padding: 4px 8px; width: 100%; text-align: left;
  display: flex; align-items: center; gap: 6px;
}
.guide-toggle:hover { background: rgba(232,150,125,.08); }
.guide-icon { font-size: var(--ui-text-xs); }
.guide-body {
  background: #0d0d1e; border: 1px solid #2a2a3a; border-top: none;
  border-radius: 0 0 4px 4px; padding: 10px;
}
.guide-warn {
  color: #ffaa44; font-size: var(--ui-text-xs); font-family: var(--fm);
  margin-bottom: 8px; padding: 4px 6px;
  background: rgba(255,170,68,.08); border-radius: 3px;
}
.guide-steps {
  margin: 0; padding-left: 18px;
  color: #888; font-size: var(--ui-text-xs); font-family: var(--fm); line-height: 1.8;
}
.guide-steps strong { color: #aaa; }
.guide-red { color: #ff6680; }
</style>
