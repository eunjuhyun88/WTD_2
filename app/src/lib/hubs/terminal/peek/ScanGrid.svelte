<script lang="ts">
  /**
   * ScanGrid — SCAN tab content.
   *
   * Left:  live scanner alerts table (from fetchScannerAlerts)
   * Right: similar past setups grid with mini sparklines
   *        (from fetchSimilarPatternCaptures if available, else
   *         recent patternCaptures filtered by symbol)
   *
   * No new API. Reuses Sparkline + existing data.
   */
  import Sparkline from '../workspace/Sparkline.svelte';
  import { setActivePair } from '$lib/stores/activePairStore';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

  interface AlertRow {
    id: string;
    symbol: string;
    timeframe: string;
    blocks_triggered: string[];
    p_win: number | null;
    created_at: string;
    preview?: { price?: number; rsi14?: number; funding_rate?: number; regime?: string };
  }

  interface Props {
    alerts?: AlertRow[];
    similar?: PatternCaptureRecord[];
    activeSymbol?: string;
    loadingSimilar?: boolean;
    onOpenCapture?: (record: PatternCaptureRecord) => void;
  }
  let {
    alerts = [],
    similar = [],
    activeSymbol = '',
    loadingSimilar = false,
    onOpenCapture,
  }: Props = $props();

  let view = $state<'grid' | 'table'>('grid');

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  }

  function blockLabel(b: string): string {
    return b.replace(/_/g, ' ');
  }

  function extractPrices(record: PatternCaptureRecord): number[] {
    // best-effort: look for prices in markers/context
    const ctx: any = record as any;
    const prices = ctx?.sparkPrices ?? ctx?.prices ?? ctx?.context?.prices ?? null;
    if (Array.isArray(prices) && prices.length > 1) return prices;
    // Fallback synthetic — draws based on verdict so the grid still communicates
    const verdict = record.decision?.verdict ?? 'neutral';
    const n = 24;
    const arr: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      if (verdict === 'bullish') arr.push(100 + t * 8 + Math.sin(i) * 1.5);
      else if (verdict === 'bearish') arr.push(100 - t * 8 + Math.sin(i) * 1.5);
      else arr.push(100 + Math.sin(i * 0.8) * 2);
    }
    return arr;
  }

  function outcomeTone(record: PatternCaptureRecord): 'win' | 'loss' | 'pending' {
    const r: any = record;
    const pnl = r?.decision?.outcomePct ?? r?.outcome?.pnlPct ?? null;
    if (pnl == null) return 'pending';
    return pnl > 0 ? 'win' : 'loss';
  }

  function outcomeValue(record: PatternCaptureRecord): string {
    const r: any = record;
    const pnl = r?.decision?.outcomePct ?? r?.outcome?.pnlPct ?? null;
    if (pnl == null) return '—';
    return `${pnl >= 0 ? '+' : ''}${Number(pnl).toFixed(1)}%`;
  }
</script>

<div class="scan">
  <!-- Left: scanner alerts -->
  <section class="alerts">
    <header>
      <h3>Scanner alerts <small>({alerts.length})</small></h3>
      <span class="sub">15m cycle · backend</span>
    </header>
    <div class="alert-rows">
      {#if alerts.length === 0}
        <p class="empty">스캐너 알림 없음. 15분마다 갱신.</p>
      {:else}
        {#each alerts.slice(0, 12) as a}
          <button
            class="alert"
            class:active={a.symbol === activeSymbol}
            onclick={() => setActivePair(a.symbol.replace(/USDT$/, '') + '/USDT')}
          >
            <div class="a-top">
              <span class="a-sym">{a.symbol.replace(/USDT$/, '')}</span>
              <span class="a-tf">{a.timeframe}</span>
              {#if a.p_win != null}
                <span class="a-pwin" class:good={a.p_win >= 0.58}>{(a.p_win * 100).toFixed(0)}%</span>
              {/if}
              <span class="a-time">{relativeTime(a.created_at)}</span>
            </div>
            <div class="a-blocks">
              {#each a.blocks_triggered.slice(0, 3) as b}
                <span class="chip">{blockLabel(b)}</span>
              {/each}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </section>

  <!-- Right: similar past setups -->
  <section class="similar">
    <header>
      <h3>유사 셋업 <small>{activeSymbol ? `· ${activeSymbol.replace(/USDT$/, '')}` : ''}</small></h3>
      <div class="view-toggle">
        <button class:on={view === 'grid'} onclick={() => view = 'grid'}>Grid</button>
        <button class:on={view === 'table'} onclick={() => view = 'table'}>Table</button>
      </div>
    </header>

    {#if loadingSimilar}
      <p class="empty">유사 셋업 검색 중…</p>
    {:else if similar.length === 0}
      <p class="empty">저장된 유사 셋업 없음. 판정을 기록하면 여기 누적됨.</p>
    {:else if view === 'grid'}
      <div class="grid">
        {#each similar.slice(0, 12) as rec}
          {@const tone = outcomeTone(rec)}
          {@const prices = extractPrices(rec)}
          <button class="tile" data-tone={tone} onclick={() => onOpenCapture?.(rec)}>
            <div class="t-top">
              <span class="t-sym">{rec.symbol.replace(/USDT$/, '')}</span>
              <span class="t-tf">{rec.timeframe.toUpperCase()}</span>
              <span class="t-out">{outcomeValue(rec)}</span>
            </div>
            <Sparkline {prices} width={160} height={36} positive={tone !== 'loss'} />
            <div class="t-bot">
              <span class="t-verdict v-{rec.decision?.verdict ?? 'neutral'}">
                {(rec.decision?.verdict ?? '—').toUpperCase()}
              </span>
              <span class="t-origin">{rec.triggerOrigin ?? 'manual'}</span>
              <span class="t-date">{new Date(rec.updatedAt).toLocaleDateString()}</span>
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <table>
        <thead>
          <tr><th>Symbol</th><th>TF</th><th>Verdict</th><th>Origin</th><th>Outcome</th><th>Date</th></tr>
        </thead>
        <tbody>
          {#each similar.slice(0, 30) as rec}
            {@const tone = outcomeTone(rec)}
            <tr onclick={() => onOpenCapture?.(rec)} data-tone={tone}>
              <td><strong>{rec.symbol.replace(/USDT$/, '')}</strong></td>
              <td>{rec.timeframe.toUpperCase()}</td>
              <td class="v-{rec.decision?.verdict ?? 'neutral'}">{rec.decision?.verdict ?? '—'}</td>
              <td>{rec.triggerOrigin ?? 'manual'}</td>
              <td>{outcomeValue(rec)}</td>
              <td>{new Date(rec.updatedAt).toLocaleDateString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .scan {
    display: grid;
    grid-template-columns: minmax(280px, 360px) 1fr;
    gap: 1px;
    background: rgba(255,255,255,0.06);
    height: 100%;
    min-height: 0;
  }

  section {
    background: var(--sc-bg-0, #0b0e14);
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  h3 {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.75);
    margin: 0;
  }
  h3 small {
    font-weight: 400;
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.4);
    letter-spacing: 0;
  }
  .sub {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.32);
  }
  .empty {
    padding: 20px 12px;
    text-align: center;
    font-size: 11px;
    color: rgba(247,242,234,0.4);
  }

  /* Alerts list */
  .alert-rows {
    overflow-y: auto;
    flex: 1;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .alert {
    text-align: left;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 3px;
    padding: 6px 8px;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .alert:hover {
    background: rgba(99,179,237,0.06);
    border-color: rgba(99,179,237,0.2);
  }
  .alert.active {
    border-color: rgba(99,179,237,0.5);
    background: rgba(99,179,237,0.1);
  }
  .a-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .a-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--sc-text-0, #f7f2ea);
  }
  .a-tf {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    padding: 1px 5px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    color: rgba(247,242,234,0.6);
  }
  .a-pwin {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.45);
    margin-left: auto;
  }
  .a-pwin.good { color: var(--sc-good, #adca7c); }
  .a-time {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.35);
  }
  .a-blocks {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .chip {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    padding: 1px 5px;
    background: rgba(251,191,36,0.08);
    border: 1px solid rgba(251,191,36,0.2);
    border-radius: 2px;
    color: rgba(251,191,36,0.85);
  }

  /* Similar section */
  .view-toggle {
    display: flex;
    gap: 2px;
    background: rgba(255,255,255,0.04);
    border-radius: 3px;
    padding: 2px;
  }
  .view-toggle button {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    padding: 3px 8px;
    background: transparent;
    border: none;
    color: rgba(247,242,234,0.45);
    cursor: pointer;
    border-radius: 2px;
    letter-spacing: 0.06em;
  }
  .view-toggle button.on {
    background: rgba(255,255,255,0.08);
    color: rgba(247,242,234,0.95);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
    padding: 10px;
    overflow-y: auto;
    flex: 1;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-left: 2px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s, border-color 0.1s, transform 0.1s;
  }
  .tile:hover {
    background: rgba(255,255,255,0.04);
    transform: translateY(-1px);
  }
  .tile[data-tone='win']     { border-left-color: var(--sc-good, #adca7c); }
  .tile[data-tone='loss']    { border-left-color: var(--sc-bad, #cf7f8f); }
  .tile[data-tone='pending'] { border-left-color: rgba(247,242,234,0.2); }
  .t-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .t-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(247,242,234,0.95);
  }
  .t-tf {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.5);
  }
  .t-out {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    margin-left: auto;
    color: rgba(247,242,234,0.7);
  }
  .tile[data-tone='win']  .t-out { color: var(--sc-good, #adca7c); }
  .tile[data-tone='loss'] .t-out { color: var(--sc-bad, #cf7f8f); }
  .t-bot {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
  }
  .t-verdict {
    padding: 1px 5px;
    border-radius: 2px;
    background: rgba(255,255,255,0.06);
    letter-spacing: 0.06em;
    color: rgba(247,242,234,0.8);
  }
  .t-verdict.v-bullish { background: rgba(173,202,124,0.12); color: var(--sc-good, #adca7c); }
  .t-verdict.v-bearish { background: rgba(207,127,143,0.12); color: var(--sc-bad, #cf7f8f); }
  .t-origin {
    color: rgba(247,242,234,0.4);
  }
  .t-date {
    margin-left: auto;
    color: rgba(247,242,234,0.4);
  }

  /* Table */
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
  }
  thead {
    position: sticky;
    top: 0;
    background: rgba(8,10,14,0.98);
  }
  th {
    text-align: left;
    padding: 6px 10px;
    color: rgba(247,242,234,0.5);
    font-weight: 600;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    letter-spacing: 0.06em;
  }
  tbody {
    overflow-y: auto;
  }
  td {
    padding: 5px 10px;
    color: rgba(247,242,234,0.72);
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  tr {
    cursor: pointer;
  }
  tr:hover td {
    background: rgba(99,179,237,0.06);
  }
  td.v-bullish { color: var(--sc-good, #adca7c); }
  td.v-bearish { color: var(--sc-bad, #cf7f8f); }
  tr[data-tone='win']  td:nth-child(5) { color: var(--sc-good, #adca7c); }
  tr[data-tone='loss'] td:nth-child(5) { color: var(--sc-bad, #cf7f8f); }

  /* Responsive — stack vertically on narrow drawers */
  @media (max-width: 900px) {
    .scan { grid-template-columns: 1fr; grid-template-rows: minmax(120px, auto) 1fr; }
  }
</style>
