<!-- ═══════════════════════════════════════════
  HPBar.svelte — Pokemon-style HP/energy bar
  Angular corners, color transitions, drain animation
═══════════════════════════════════════════ -->
<script lang="ts">
  const {
    value = 100,
    max = 100,
    label = 'HP',
    showValue = true,
    size = 'md',
  }: {
    value: number;
    max: number;
    label?: string;
    showValue?: boolean;
    size?: 'sm' | 'md' | 'lg';
  } = $props();

  const pct = $derived(max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

  // Color: green > 50%, yellow 20-50%, red < 20%
  const barColor = $derived(
    pct > 50 ? '#48d868' : pct > 20 ? '#f8d030' : '#f85858'
  );
  const heightMap = { sm: 4, md: 8, lg: 12 };
  const barHeight = $derived(heightMap[size] ?? 8);
</script>

<div class="hp-bar-wrap">
  {#if label}
    <span class="hp-label">{label}</span>
  {/if}
  <div class="hp-track" style:height="{barHeight}px">
    <div
      class="hp-fill"
      style:width="{pct}%"
      style:background={barColor}
    />
  </div>
  {#if showValue}
    <span class="hp-val">{Math.round(value)}<span class="hp-max">/{Math.round(max)}</span></span>
  {/if}
</div>

<style>
  .hp-bar-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
  }
  .hp-label {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #f8d030;
    min-width: 18px;
    font-family: 'JetBrains Mono', monospace;
  }
  .hp-track {
    flex: 1;
    background: #303030;
    border-radius: 1px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.08);
  }
  .hp-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 800ms cubic-bezier(0.4, 0, 0.2, 1), background 400ms;
    box-shadow: inset 0 -1px 0 rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15);
  }
  .hp-val {
    font-size: 10px;
    font-weight: 800;
    color: #e0e0e0;
    min-width: 44px;
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
  }
  .hp-max {
    font-size: 8px;
    color: rgba(224,224,224,0.4);
  }
</style>
