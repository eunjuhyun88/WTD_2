<script lang="ts">
  import type { TerminalAsset, TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';
  import VerdictHeader from './VerdictHeader.svelte';
  import EvidenceGrid from './EvidenceGrid.svelte';
  import SourceRow from './SourceRow.svelte';

  interface Props {
    asset: TerminalAsset;
    verdict?: TerminalVerdict;
    evidence?: TerminalEvidence[];
    active?: boolean;
    onclick?: () => void;
  }
  let { asset, verdict, evidence = [], active = false, onclick }: Props = $props();

  function pctColor(v: number): string {
    return v > 0 ? '#4ade80' : v < 0 ? '#f87171' : 'rgba(247,242,234,0.48)';
  }
</script>

<div class="asset-card" class:active role="button" tabindex="0" {onclick} onkeydown={e => e.key === 'Enter' && onclick?.()}>
  <div class="card-top">
    <span class="symbol">{asset.symbol.replace('USDT','').replace('USDC','')}</span>
    <div class="tf-row">
      <span style="color:{pctColor(asset.changePct15m)}">15m{asset.tf15m}</span>
      <span class="sep">|</span>
      <span style="color:{pctColor(asset.changePct1h)}">1H{asset.tf1h}</span>
      <span class="sep">|</span>
      <span style="color:{pctColor(asset.changePct4h)}">4H{asset.tf4h}</span>
    </div>
  </div>
  <div class="price-row">
    <span class="price">{asset.lastPrice >= 1000 ? asset.lastPrice.toLocaleString('en-US', {maximumFractionDigits:2}) : asset.lastPrice.toFixed(4)}</span>
    <span class="chg" style="color:{pctColor(asset.changePct1h)}">{asset.changePct1h>=0?'+':''}{asset.changePct1h.toFixed(2)}%</span>
  </div>
  <div class="metrics-row">
    <span class="chip">Vol {asset.volumeRatio1h.toFixed(1)}x</span>
    <span class="chip">OI {asset.oiChangePct1h>=0?'+':''}{asset.oiChangePct1h.toFixed(1)}%</span>
    <span class="chip" style="color:{asset.fundingRate>0.01?'#fbbf24':'inherit'}">F {(asset.fundingRate*100).toFixed(3)}%</span>
  </div>
  {#if verdict}
    <p class="verdict-line">
      <span class="bias-dot" style="color:{verdict.direction==='bullish'?'#4ade80':verdict.direction==='bearish'?'#f87171':'rgba(247,242,234,0.4)'}">●</span>
      {verdict.reason.length > 60 ? verdict.reason.slice(0, 60) + '…' : verdict.reason}
    </p>
  {/if}
  {#if verdict?.action}
    <p class="action-line">{verdict.action}</p>
  {/if}
  {#if evidence.length > 0}
    <EvidenceGrid {evidence} cols={2} />
  {/if}
  {#if asset.sources.length > 0}
    <SourceRow sources={asset.sources.slice(0, 3)} />
  {/if}
</div>

<style>
  .asset-card {
    background: linear-gradient(180deg, rgba(11,14,19,0.98), rgba(8,10,14,0.98));
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 5px; padding: 10px;
    display: flex; flex-direction: column; gap: 8px;
    cursor: pointer; transition: border-color 0.15s;
  }
  .asset-card:hover, .asset-card.active { border-color: rgba(77,143,245,0.18); }
  .asset-card.active { outline: 1px solid rgba(77,143,245,0.14); }

  .card-top { display: flex; align-items: center; justify-content: space-between; }
  .symbol { font-family: var(--sc-font-mono); font-size: 12px; font-weight: 700; color: var(--sc-text-0); letter-spacing: 0.04em; }
  .tf-row { display: flex; align-items: center; gap: 4px; font-family: var(--sc-font-mono); font-size: 9px; font-weight: 600; }
  .sep { color: rgba(255,255,255,0.2); }

  .price-row { display: flex; align-items: baseline; gap: 8px; }
  .price { font-family: var(--sc-font-mono); font-size: 14px; font-weight: 700; color: var(--sc-text-0); }
  .chg { font-family: var(--sc-font-mono); font-size: 11px; font-weight: 600; }

  .metrics-row { display: flex; gap: 4px; flex-wrap: wrap; }
  .chip { font-family: var(--sc-font-mono); font-size: 8px; color: var(--sc-text-2); padding: 2px 5px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 3px; }

  .verdict-line { margin: 0; font-size: 10px; color: var(--sc-text-1); line-height: 1.4; display: flex; align-items: flex-start; gap: 5px; }
  .bias-dot { font-size: 8px; flex-shrink: 0; margin-top: 2px; }
  .action-line { margin: 0; font-family: var(--sc-font-mono); font-size: 9px; color: #89d39a; padding: 3px 6px; background: rgba(74,222,128,0.05); border: 1px solid rgba(74,222,128,0.08); border-radius: 3px; }
</style>
