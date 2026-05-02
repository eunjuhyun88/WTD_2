<script lang="ts">
  import type { TerminalAsset, TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';
  import VerdictCard from './VerdictCard.svelte';
  import AssetInsightCard from './AssetInsightCard.svelte';

  interface Props {
    layout: 'hero3' | 'compare2x2' | 'focus';
    assets: TerminalAsset[];
    verdicts: Record<string, TerminalVerdict>;
    evidence: Record<string, TerminalEvidence[]>;
    activeSymbol?: string;
    onSelect?: (symbol: string) => void;
    onViewDetail?: (symbol: string) => void;
  }

  let {
    layout = 'hero3',
    assets = [],
    verdicts = {},
    evidence = {},
    activeSymbol,
    onSelect,
    onViewDetail,
  }: Props = $props();

  // Hero asset = first in list, or the activeSymbol
  let heroAsset = $derived(
    assets.find(a => a.symbol === activeSymbol) ?? assets[0] ?? null
  );
  let companionAssets = $derived(
    layout === 'hero3'
      ? assets.filter(a => a !== heroAsset).slice(0, 3)
      : assets.slice(0, 4)
  );
</script>

<div class="workspace-grid layout-{layout}">
  {#if layout === 'focus' && heroAsset}
    <!-- ── Focus: single full-width card ── -->
    <div class="focus-slot">
      <VerdictCard
        asset={heroAsset}
        verdict={verdicts[heroAsset.symbol] ?? heroAsset as any}
        evidence={evidence[heroAsset.symbol] ?? []}
        onPin={() => {}}
        onViewDetail={() => onViewDetail?.(heroAsset!.symbol)}
      />
    </div>

  {:else if layout === 'hero3'}
    <!-- ── Hero+3: large card left, 3 compact right ── -->
    <div class="hero-slot">
      {#if heroAsset && verdicts[heroAsset.symbol]}
        <VerdictCard
          asset={heroAsset}
          verdict={verdicts[heroAsset.symbol]}
          evidence={evidence[heroAsset.symbol] ?? []}
          onPin={() => {}}
          onViewDetail={() => onViewDetail?.(heroAsset!.symbol)}
        />
      {:else if heroAsset}
        <!-- Asset present but verdict still loading -->
        <div class="loading-card">
          <p class="loading-sym">{heroAsset.symbol.replace('USDT','')}</p>
          <p class="loading-text">Analyzing…</p>
        </div>
      {:else}
        <div class="empty-hero">
          <p class="empty-text">No asset selected</p>
          <p class="empty-hint">Use the command dock to ask about a specific asset</p>
        </div>
      {/if}
    </div>

    <div class="companion-col">
      {#each companionAssets as asset (asset.symbol)}
        <AssetInsightCard
          {asset}
          verdict={verdicts[asset.symbol]}
          evidence={evidence[asset.symbol] ?? []}
          active={asset.symbol === activeSymbol}
          onclick={() => onSelect?.(asset.symbol)}
        />
      {/each}
      {#if companionAssets.length === 0}
        <div class="companion-empty">
          <span class="ce-hint">Ask about more assets…</span>
        </div>
      {/if}
    </div>

  {:else if layout === 'compare2x2'}
    <!-- ── 2×2 Compare Grid ── -->
    <div class="compare-grid">
      {#each assets.slice(0, 4) as asset (asset.symbol)}
        <AssetInsightCard
          {asset}
          verdict={verdicts[asset.symbol]}
          evidence={evidence[asset.symbol] ?? []}
          active={asset.symbol === activeSymbol}
          onclick={() => onSelect?.(asset.symbol)}
        />
      {/each}
      {#if assets.length === 0}
        <div class="compare-empty">
          <span class="ce-hint">Compare BTC ETH SOL…</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .workspace-grid {
    display: contents;
  }

  /* ── Focus layout ── */
  .focus-slot {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 16px;
  }

  /* ── Hero+3 layout ── */
  .workspace-grid.layout-hero3 {
    display: grid;
    grid-template-columns: 1fr 320px;
    grid-template-rows: 1fr;
    gap: 0;
    height: 100%;
    overflow: hidden;
  }

  .hero-slot {
    overflow-y: auto;
    padding: 16px;
    border-right: 1px solid var(--sc-terminal-border);
  }

  .loading-card {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--sc-terminal-border);
    border-radius: 6px;
  }

  .loading-sym {
    font-family: var(--sc-font-mono);
    font-size: 28px;
    font-weight: 700;
    color: var(--sc-text-0);
    margin: 0;
  }

  .loading-text {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: var(--sc-text-2);
    margin: 0;
    animation: sc-pulse 1.4s ease-in-out infinite;
  }

  .empty-hero {
    height: 100%;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    opacity: 0.4;
  }

  .empty-text {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    color: var(--sc-text-1);
    margin: 0;
  }

  .empty-hint {
    font-size: 11px;
    color: var(--sc-text-2);
    margin: 0;
    text-align: center;
    max-width: 240px;
  }

  .companion-col {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    border-right: 1px solid var(--sc-terminal-border);
  }

  .companion-empty {
    padding: 24px 16px;
    text-align: center;
  }

  .ce-hint {
    font-size: 11px;
    color: var(--sc-text-3);
    font-family: var(--sc-font-mono);
  }

  /* ── 2×2 Compare layout ── */
  .workspace-grid.layout-compare2x2 {
    display: grid;
    grid-template-rows: 1fr;
    height: 100%;
    overflow: hidden;
  }

  .compare-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 1px;
    background: var(--sc-terminal-border);
    height: 100%;
    overflow: hidden;
  }

  .compare-empty {
    grid-column: 1 / -1;
    grid-row: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
