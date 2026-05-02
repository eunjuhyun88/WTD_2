<script lang="ts">
  import type { TradeRecord } from '$lib/contracts/backtest';
  import { fmtPct, fmtDuration } from '$lib/lab/equityCurve';

  interface Props {
    trades: TradeRecord[];
    selectedIndex?: number;
    interval?: string;
    onSelectTrade?: (idx: number) => void;
  }
  let {
    trades = [],
    selectedIndex = -1,
    interval = '4h',
    onSelectTrade,
  }: Props = $props();

  function fmtPrice(p: number): string {
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 100)   return p.toFixed(1);
    return p.toFixed(4);
  }

  function fmtTime(ms: number): string {
    const d = new Date(ms < 1e12 ? ms * 1000 : ms);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function exitLabel(t: TradeRecord['exitType']): string {
    const map: Record<string, string> = {
      TP_HIT: 'TP', SL_HIT: 'SL', SL_GAP: 'SL↙', TP_GAP: 'TP↗',
      TRAILING: 'TR', END_OF_DATA: 'EOD',
    };
    return map[t] ?? t;
  }

  function exitClass(t: TradeRecord['exitType']): string {
    if (t === 'TP_HIT' || t === 'TP_GAP') return 'pos';
    if (t === 'SL_HIT' || t === 'SL_GAP') return 'neg';
    return 'muted';
  }

  function handleKey(e: KeyboardEvent, idx: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectTrade?.(idx);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onSelectTrade?.(Math.min(idx + 1, trades.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onSelectTrade?.(Math.max(idx - 1, 0));
    }
  }
</script>

<div class="trade-log">
  {#if trades.length === 0}
    <div class="empty">
      <span>No trades matched the entry conditions</span>
    </div>
  {:else}
    <table role="table" aria-label="Trade log">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">SIDE</th>
          <th scope="col">ENTRY</th>
          <th scope="col">EXIT</th>
          <th scope="col">HOLD</th>
          <th scope="col">NET%</th>
          <th scope="col">R</th>
          <th scope="col">EXIT</th>
        </tr>
      </thead>
      <tbody>
        {#each trades as t, i}
          <tr
            class="trade-row"
            class:selected={i === selectedIndex}
            class:win={t.netPnlPercent > 0}
            class:loss={t.netPnlPercent < 0}
            role="row"
            tabindex="0"
            onclick={() => onSelectTrade?.(i)}
            onkeydown={(e) => handleKey(e, i)}
          >
            <td class="col-num">{i + 1}</td>
            <td class="col-side">
              <span class="side-badge" class:long={t.direction === 'long'} class:short={t.direction === 'short'}>
                {t.direction === 'long' ? 'LONG' : 'SHORT'}
              </span>
            </td>
            <td class="col-price">{fmtPrice(t.entryPrice)}</td>
            <td class="col-price">{fmtPrice(t.exitPrice)}</td>
            <td class="col-hold">{fmtDuration(t.holdBars, interval)}</td>
            <td class="col-pnl" class:pos={t.netPnlPercent > 0} class:neg={t.netPnlPercent < 0}>
              {fmtPct(t.netPnlPercent)}
            </td>
            <td class="col-r" class:pos={t.rMultiple > 0} class:neg={t.rMultiple < 0}>
              {t.rMultiple >= 0 ? '+' : ''}{t.rMultiple.toFixed(2)}R
            </td>
            <td class="col-exit">
              <span class="exit-tag {exitClass(t.exitType)}">{exitLabel(t.exitType)}</span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
.trade-log {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--g4) transparent;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--g5);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 10px;
}

thead tr {
  position: sticky;
  top: 0;
  background: var(--g1);
  z-index: 2;
  border-bottom: 1px solid var(--g3);
}

th {
  padding: 0 8px;
  height: 24px;
  text-align: left;
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--g6);
  white-space: nowrap;
  user-select: none;
}

.trade-row {
  height: 28px;
  border-bottom: 1px solid var(--g2);
  cursor: pointer;
  outline: none;
  transition: background 0.06s;
}

.trade-row:hover {
  background: rgba(245, 166, 35, 0.04);
}

.trade-row:focus-visible {
  background: rgba(245, 166, 35, 0.06);
  outline: 1px solid var(--amb);
}

.trade-row.selected {
  background: rgba(245, 166, 35, 0.07);
  border-left: 2px solid var(--amb);
}

td {
  padding: 0 8px;
  vertical-align: middle;
  white-space: nowrap;
}

/* Columns */
.col-num { color: var(--g5); font-size: 9px; width: 28px; }
.col-price { color: var(--g8); font-size: 10px; }
.col-hold { color: var(--g7); font-size: 9px; }
.col-pnl { font-weight: 700; font-size: 11px; }
.col-r { font-size: 9px; }

/* Side badge */
.side-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 5px;
  height: 16px;
  border-radius: 2px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.side-badge.long {
  color: var(--pos);
  background: var(--pos-d);
}
.side-badge.short {
  color: var(--neg);
  background: var(--neg-d);
}

/* P&L color */
td.pos { color: var(--pos); }
td.neg { color: var(--neg); }
td.muted { color: var(--g6); }

/* Exit tag */
.exit-tag {
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.exit-tag.pos { color: var(--pos); }
.exit-tag.neg { color: var(--neg); }
.exit-tag.muted { color: var(--g6); }
</style>
