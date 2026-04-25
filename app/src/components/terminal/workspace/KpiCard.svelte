<!--
  KpiCard — single CryptoQuant/Velo-style KPI card.

  Layout:
    ┌────────────────────────────┐
    │ LABEL                  ▾   │  ← top: label + (optional) sublabel
    │ −85.3%                     │  ← large value, color = tone
    │ ▁▂▅▇▆▄▂  +12.3%            │  ← sparkline + delta (color = tone)
    └────────────────────────────┘

  Tone drives left-border color + value-text color; sparkline takes
  matching tint. Click cycles a chart pane indicator if the card has
  one (CVD/OI/Funding/Liq).
-->
<script lang="ts">
  import { sparklinePath, type KpiSnapshot } from '$lib/chart/kpiStrip';

  interface Props {
    snap: KpiSnapshot;
    onActivate?: (id: KpiSnapshot['id']) => void;
  }

  let { snap, onActivate }: Props = $props();

  const sparkPath = $derived(sparklinePath(snap.sparkline, 64, 18));
  const sparkColor = $derived(
    snap.tone === 'bull'  ? '#4ade80' :
    snap.tone === 'bear'  ? '#f87171' :
    snap.tone === 'warn'  ? '#e8b84b' :
    snap.tone === 'live'  ? '#4ade80' :
    snap.tone === 'stale' ? 'rgba(177,181,189,0.3)' :
                            'rgba(177,181,189,0.6)',
  );

  function handleClick() {
    onActivate?.(snap.id);
  }
</script>

<button
  class="kpi-card"
  type="button"
  data-tone={snap.tone}
  data-pulse={snap.id === 'ws_status' && snap.tone === 'live'}
  onclick={handleClick}
  title={snap.label}
>
  <header class="row top">
    <span class="label">{snap.label}</span>
    {#if snap.id === 'ws_status' && snap.tone === 'live'}
      <span class="pulse-dot"></span>
    {/if}
  </header>
  <div class="value">{snap.value}</div>
  <div class="row bottom">
    {#if snap.sparkline.length > 1}
      <svg class="spark" viewBox="0 0 64 18" preserveAspectRatio="none" aria-hidden="true">
        <path d={sparkPath} fill="none" stroke={sparkColor} stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    {:else}
      <span class="spark-placeholder"></span>
    {/if}
    {#if snap.delta}
      <small class="delta">{snap.delta}</small>
    {/if}
  </div>
</button>

<style>
  .kpi-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 110px;
    padding: 6px 10px 6px 11px;
    background: rgba(19, 23, 34, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-left: 2px solid rgba(177, 181, 189, 0.25);
    border-radius: 4px;
    color: rgba(247, 242, 234, 0.92);
    font-family: var(--sc-font-mono, monospace);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }
  .kpi-card:hover {
    background: rgba(19, 23, 34, 0.85);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
  }
  .kpi-card[data-tone='bull']  { border-left-color: #4ade80; }
  .kpi-card[data-tone='bear']  { border-left-color: #f87171; }
  .kpi-card[data-tone='warn']  { border-left-color: #e8b84b; }
  .kpi-card[data-tone='live']  { border-left-color: #4ade80; }
  .kpi-card[data-tone='stale'] { border-left-color: rgba(177,181,189,0.3); }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .top { font-size: 9px; }
  .bottom { font-size: 9px; }

  .label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(177, 181, 189, 0.65);
    font-size: 9px;
  }
  .value {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.1;
  }
  .kpi-card[data-tone='bull']  .value { color: #4ade80; }
  .kpi-card[data-tone='bear']  .value { color: #f87171; }
  .kpi-card[data-tone='warn']  .value { color: #e8b84b; }
  .kpi-card[data-tone='live']  .value { color: #4ade80; }
  .kpi-card[data-tone='stale'] .value { color: rgba(177,181,189,0.55); }

  .spark {
    width: 64px;
    height: 18px;
    flex-shrink: 0;
  }
  .spark-placeholder {
    display: inline-block;
    width: 64px;
    height: 18px;
  }
  .delta {
    color: rgba(177, 181, 189, 0.7);
    font-size: 9px;
    white-space: nowrap;
  }
  .kpi-card[data-tone='bull'] .delta { color: #4ade80; }
  .kpi-card[data-tone='bear'] .delta { color: #f87171; }
  .kpi-card[data-tone='warn'] .delta { color: #e8b84b; }

  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.65);
    animation: kpi-pulse 1.6s infinite;
  }
  @keyframes kpi-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.55); }
    70%  { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
    100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
  }
</style>
