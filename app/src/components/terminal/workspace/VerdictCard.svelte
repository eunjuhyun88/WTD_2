<script lang="ts">
  import type { TerminalAsset, TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';
  import VerdictHeader from './VerdictHeader.svelte';
  import EvidenceGrid from './EvidenceGrid.svelte';
  import ActionStrip from './ActionStrip.svelte';
  import WhyPanel from './WhyPanel.svelte';
  import SourceRow from './SourceRow.svelte';

  interface Props {
    asset: TerminalAsset;
    verdict: TerminalVerdict;
    evidence: TerminalEvidence[];
    bars?: any[];
    layerBarsMap?: Record<string, any[]>;
    onPin?: () => void;
    onViewDetail?: () => void;
  }
  let { asset, verdict, evidence, bars = [], layerBarsMap = {}, onPin, onViewDetail }: Props = $props();

  function formatPrice(p: number): string {
    return p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.toFixed(4);
  }
  function pctColor(v: number): string {
    return v > 0 ? '#4ade80' : v < 0 ? '#f87171' : 'rgba(247,242,234,0.48)';
  }
</script>

<article class="verdict-card">
  <!-- Card header -->
  <header class="card-header">
    <div class="symbol-group">
      <span class="symbol">{asset.symbol.replace('USDT','').replace('USDC','')}</span>
      <span class="venue">USDT · Perp</span>
    </div>
    <div class="tf-alignment">
      <span class="tf-badge" style="color: {pctColor(asset.changePct15m)}">15m {asset.tf15m}</span>
      <span class="sep">|</span>
      <span class="tf-badge" style="color: {pctColor(asset.changePct1h)}">1H {asset.tf1h}</span>
      <span class="sep">|</span>
      <span class="tf-badge" style="color: {pctColor(asset.changePct4h)}">4H {asset.tf4h}</span>
    </div>
    <div class="card-actions">
      {#if onPin}
        <button class="icon-btn" onclick={onPin} title="Pin">⊕</button>
      {/if}
      {#if onViewDetail}
        <button class="icon-btn" onclick={onViewDetail} title="View detail">→</button>
      {/if}
    </div>
  </header>

  <!-- Price strip -->
  <div class="price-strip">
    <span class="price">{formatPrice(asset.lastPrice)}</span>
    <span class="change" style="color: {pctColor(asset.changePct1h)}">
      {asset.changePct1h >= 0 ? '+' : ''}{asset.changePct1h.toFixed(2)}%
    </span>
    <span class="meta-badge">Vol {asset.volumeRatio1h.toFixed(1)}x</span>
    <span class="meta-badge" style="color: {asset.fundingRate > 0.01 ? '#fbbf24' : 'inherit'}">
      F {(asset.fundingRate * 100).toFixed(3)}%
    </span>
    {#if asset.oiChangePct1h !== 0}
      <span class="meta-badge" style="color: {pctColor(asset.oiChangePct1h)}">
        OI {asset.oiChangePct1h >= 0 ? '+' : ''}{asset.oiChangePct1h.toFixed(1)}%
      </span>
    {/if}
  </div>

  <!-- Verdict -->
  <VerdictHeader {verdict} symbol={asset.symbol} timeframe="1H" />

  <!-- Action strip -->
  <ActionStrip action={verdict.action} invalidation={verdict.invalidation} avoid={verdict.against[0]} />

  <!-- Evidence grid -->
  <EvidenceGrid {evidence} {bars} {layerBarsMap} />

  <!-- Why panel -->
  <WhyPanel why={verdict.reason} against={verdict.against} />

  <!-- Sources -->
  <SourceRow sources={asset.sources} />
</article>

<style>
  .verdict-card {
    background: linear-gradient(180deg, rgba(13,16,22,0.98), rgba(8,10,14,0.98));
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    padding: 12px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .verdict-card:hover { border-color: rgba(255,255,255,0.12); }

  .card-header { display: flex; align-items: center; gap: 10px; }
  .symbol-group { display: flex; flex-direction: column; gap: 1px; }
  .symbol { font-family: var(--sc-font-mono); font-size: 13px; font-weight: 700; color: var(--sc-text-0); letter-spacing: 0.04em; }
  .venue { font-family: var(--sc-font-mono); font-size: 8px; color: var(--sc-text-2); text-transform: uppercase; letter-spacing: 0.08em; }

  .tf-alignment { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .tf-badge { font-family: var(--sc-font-mono); font-size: 9px; font-weight: 600; }
  .sep { color: rgba(255,255,255,0.2); font-size: 10px; }

  .card-actions { display: flex; gap: 4px; }
  .icon-btn {
    background: none; border: none; cursor: pointer;
    color: var(--sc-text-2); font-size: 14px; padding: 2px 4px;
    border-radius: 3px;
  }
  .icon-btn:hover { color: var(--sc-text-0); background: rgba(255,255,255,0.06); }

  .price-strip {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .price { font-family: var(--sc-font-mono); font-size: 16px; font-weight: 700; color: var(--sc-text-0); }
  .change { font-family: var(--sc-font-mono); font-size: 12px; font-weight: 600; }
  .meta-badge {
    font-family: var(--sc-font-mono); font-size: 9px; color: var(--sc-text-2);
    padding: 2px 5px; background: rgba(255,255,255,0.035);
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.05);
  }
</style>
