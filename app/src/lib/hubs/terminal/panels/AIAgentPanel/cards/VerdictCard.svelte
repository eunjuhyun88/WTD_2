<script lang="ts">
  import type { VerdictCardPayload } from '$lib/agent/directives';
  interface Props {
    payload: VerdictCardPayload;
    onSelectSymbol?: (symbol: string) => void;
  }
  let { payload, onSelectSymbol }: Props = $props();

  const dirColor = payload.direction === 'LONG'
    ? '#4caf50' : payload.direction === 'SHORT' ? '#f44336' : '#9e9e9e';
  const pct = Math.round(payload.p_win * 100);
</script>

<button class="verdict-card" onclick={() => onSelectSymbol?.(payload.symbol)}>
  <div class="vc-symbol">{payload.symbol}{payload.timeframe ? ` · ${payload.timeframe}` : ''}</div>
  <div class="vc-direction" style="color:{dirColor}">{payload.direction}</div>
  <div class="vc-pwin">
    <div class="vc-pwin-bar" style="width:{pct}%;background:{dirColor}"></div>
    <span class="vc-pwin-label">p_win {pct}%</span>
  </div>
  {#if onSelectSymbol}
    <div class="vc-hint">↗ open chart</div>
  {/if}
</button>

<style>
.verdict-card {
  display: flex; flex-direction: column; gap: 4px;
  background: #111222; border: 1px solid #2a2a3a; border-radius: 8px;
  padding: 8px 12px; cursor: pointer; text-align: left; width: 100%;
  transition: border-color 0.15s;
}
.verdict-card:hover { border-color: #4a6fa5; }
.vc-symbol { font-size: 11px; color: #7a8a9a; font-family: monospace; }
.vc-direction { font-size: 15px; font-weight: 700; letter-spacing: 0.05em; }
.vc-pwin { position: relative; height: 14px; background: #1a1a2e; border-radius: 3px; overflow: hidden; }
.vc-pwin-bar { position: absolute; top: 0; left: 0; height: 100%; border-radius: 3px; opacity: 0.35; transition: width 0.3s; }
.vc-pwin-label { position: relative; font-size: 10px; color: #8a9ab0; padding: 0 4px; line-height: 14px; }
.vc-hint { font-size: 10px; color: #4a6fa5; }
</style>
