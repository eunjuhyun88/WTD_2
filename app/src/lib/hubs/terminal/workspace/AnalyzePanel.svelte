<script lang="ts">
  // Reuse types from composition layer if available, else inline
  interface PhaseNode { state: 'done' | 'active' | 'pending'; label: string }
  interface DomRow { isMid: boolean; delta: number; bidWidth: string; bid: string; price: string; askWidth: string; ask: string }
  interface TapeRow { side: 'BUY' | 'SELL'; time: string; price: string; size: string; intensity: string }
  interface FootprintRow { delta: number; bid: string; price: string; ask: string; deltaLabel: string; width: string }
  interface HeatmapCell { side: 'buy' | 'sell'; intensity: number; label: string }
  interface HeatmapRow { price: string; cells: HeatmapCell[] }
  interface EvidenceRow { pos: boolean; feature: string; value: string; threshold: string; status: string; why: string }
  interface CompareCard { label: string; value: string; note: string; action: () => void }
  interface LedgerStat { label: string; value: string; note: string }
  interface JudgmentOption { label: string; tone: 'pos' | 'neg' | 'warn' }
  interface ExecProposal { label: string; val: string; tone: '' | 'pos' | 'neg' }

  // Bundled data object — all panel data in one place
  interface AnalyzeData {
    direction: string;
    thesis: string;
    phaseTimeline: PhaseNode[];
    microstructureView: string;
    domLadderRows: DomRow[];
    timeSalesRows: TapeRow[];
    footprintRows: FootprintRow[];
    heatmapRows: HeatmapRow[];
    evidenceTableRows: EvidenceRow[];
    compareCards: CompareCard[];
    ledgerStats: LedgerStat[];
    judgmentOptions: JudgmentOption[];
    executionProposal: ExecProposal[];
  }

  // Bundled actions object — all callbacks in one place
  interface AnalyzeActions {
    onOpenCompareWorkspace: () => void;
    onSetJudgeVerdict: (v: 'agree' | 'disagree') => void;
    onOpenJudgeWorkspace: () => void;
    onOpenAnalyzeAIDetail: () => void;
    onStartSaveSetup: () => void;
  }

  interface Props {
    data: AnalyzeData;
    actions: AnalyzeActions;
    state?: { microstructureView?: string };
  }

  let { data, actions, state }: Props = $props();

  // For convenience, destructure commonly used properties
  const {
    direction,
    thesis,
    phaseTimeline,
    microstructureView,
    domLadderRows,
    timeSalesRows,
    footprintRows,
    heatmapRows,
    evidenceTableRows,
    compareCards,
    ledgerStats,
    judgmentOptions,
    executionProposal,
  } = data;

  const {
    onOpenCompareWorkspace,
    onSetJudgeVerdict,
    onOpenJudgeWorkspace,
    onOpenAnalyzeAIDetail,
    onStartSaveSetup,
  } = actions;
</script>

<div class="workspace-body">
  <section class="workspace-hero" aria-label="Analyze thesis and phase path">
    <div class="workspace-hero-copy">
      <span class="workspace-kicker">PHASE TIMELINE</span>
      <div class="workspace-thesis">
        <span class="bull">{direction} view ·</span>
        {' '}{thesis}
      </div>
    </div>
    <div class="phase-timeline" role="list" aria-label="Pattern phase timeline">
      {#each phaseTimeline as phase}
        <div class="phase-node" class:done={phase.state === 'done'} class:active={phase.state === 'active'} role="listitem">
          <span class="phase-dot"></span>
          <span class="phase-label">{phase.label}</span>
        </div>
      {/each}
    </div>
  </section>

  <div class="market-depth-grid" aria-label="Market microstructure workspace">
    <section class="workspace-panel depth-panel dom-ladder-panel" class:selected={microstructureView === 'footprint'} aria-label="DOM ladder">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">DOM LADDER</span>
        <span class="workspace-panel-copy">bid depth · ask depth · mid liquidity</span>
      </div>
      <div class="dom-ladder" role="table" aria-label="Depth of market ladder">
        <div class="dom-row dom-head" role="row">
          <span role="columnheader">BID</span>
          <span role="columnheader">PRICE</span>
          <span role="columnheader">ASK</span>
        </div>
        {#each domLadderRows as row}
          <div class="dom-row" class:mid={row.isMid} class:bid-heavy={row.delta > 0} class:ask-heavy={row.delta < 0} role="row">
            <span class="dom-side bid" role="cell">
              <span class="dom-bar bid" style:width={row.bidWidth}></span>
              <span class="dom-val">{row.bid}</span>
            </span>
            <span class="dom-price" role="cell">{row.price}</span>
            <span class="dom-side ask" role="cell">
              <span class="dom-bar ask" style:width={row.askWidth}></span>
              <span class="dom-val">{row.ask}</span>
            </span>
          </div>
        {/each}
      </div>
    </section>

    <section class="workspace-panel depth-panel tape-panel" aria-label="Time and sales">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">TIME & SALES</span>
        <span class="workspace-panel-copy">aggressor side and print intensity</span>
      </div>
      <div class="tm-tape-list" aria-label="Recent trade tape">
        {#each timeSalesRows as row}
          <div class="tm-tape-row" class:buy={row.side === 'BUY'} class:sell={row.side === 'SELL'}>
            <span class="tm-tape-time">{row.time}</span>
            <span class="tm-tape-side">{row.side}</span>
            <span class="tm-tape-price">{row.price}</span>
            <span class="tm-tape-size">{row.size}</span>
            <span class="tm-tape-intensity"><span style:width={row.intensity}></span></span>
          </div>
        {/each}
        {#if timeSalesRows.length === 0}
          <div class="depth-empty">waiting for trade tape payload</div>
        {/if}
      </div>
    </section>

    <section class="workspace-panel depth-panel footprint-panel" class:selected={microstructureView === 'footprint'} aria-label="Footprint table">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">FOOTPRINT</span>
        <span class="workspace-panel-copy">bid x ask delta by price bucket</span>
      </div>
      <div class="footprint-table" role="table" aria-label="Footprint buckets">
        <div class="footprint-row footprint-head" role="row">
          <span role="columnheader">BID</span>
          <span role="columnheader">PRICE</span>
          <span role="columnheader">ASK</span>
          <span role="columnheader">DELTA</span>
        </div>
        {#each footprintRows as row}
          <div class="footprint-row" class:buy={row.delta >= 0} class:sell={row.delta < 0} role="row">
            <span role="cell">{row.bid}</span>
            <span role="cell">{row.price}</span>
            <span role="cell">{row.ask}</span>
            <span role="cell">{row.deltaLabel}</span>
            <span class="footprint-volume" style:width={row.width}></span>
          </div>
        {/each}
      </div>
    </section>

    <section class="workspace-panel depth-panel heatmap-panel" class:selected={microstructureView === 'heatmap'} aria-label="Liquidity heatmap">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">LIQ HEATMAP</span>
        <span class="workspace-panel-copy">volume/liquidation concentration bands</span>
      </div>
      <div class="heatmap-grid" aria-label="Liquidity heatmap matrix">
        {#each heatmapRows as band}
          <div class="heatmap-row">
            <span class="heat-price">{band.price}</span>
            <span class="heat-cells">
              {#each band.cells as cell}
                <span
                  class="heat-cell"
                  class:buy={cell.side === 'buy'}
                  class:sell={cell.side === 'sell'}
                  style:opacity={0.16 + cell.intensity * 0.84}
                  title={cell.label}
                ></span>
              {/each}
            </span>
          </div>
        {/each}
      </div>
    </section>
  </div>

  <div class="workspace-grid">
    <section class="workspace-panel evidence-table-panel" aria-label="Feature evidence table">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">EVIDENCE TABLE</span>
        <span class="workspace-panel-copy">raw values and threshold status stay here, not in the HUD</span>
      </div>
      <div class="evidence-table" role="table" aria-label="Evidence table">
        <div class="evidence-table-row header" role="row">
          <span role="columnheader">Feature</span>
          <span role="columnheader">Value</span>
          <span role="columnheader">Threshold</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Why</span>
        </div>
        {#each evidenceTableRows as row}
          <div class="evidence-table-row" class:pass={row.pos} class:fail={!row.pos} role="row">
            <span role="cell">{row.feature}</span>
            <span role="cell">{row.value}</span>
            <span role="cell">{row.threshold}</span>
            <span role="cell">{row.status}</span>
            <span role="cell">{row.why}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="workspace-panel compare-panel" aria-label="Compare workspace">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">COMPARE</span>
        <span class="workspace-panel-copy">pattern-object comparisons</span>
      </div>
      <div class="compare-card-stack">
        {#each compareCards as card}
          <button class="compare-card" type="button" onclick={card.action}>
            <span class="compare-label">{card.label}</span>
            <span class="compare-value">{card.value}</span>
            <span class="compare-note">{card.note}</span>
          </button>
        {/each}
      </div>
      <button class="workspace-primary-action" type="button" onclick={onOpenCompareWorkspace}>Open Compare Workspace</button>
    </section>
  </div>

  <div class="workspace-bottom-grid">
    <section class="workspace-panel ledger-panel" aria-label="Pattern ledger">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">LEDGER</span>
        <span class="workspace-panel-copy">saved evidence memory</span>
      </div>
      <div class="tm-ledger-stats">
        {#each ledgerStats as stat}
          <div class="tm-ledger-stat">
            <span class="tm-ledger-label">{stat.label}</span>
            <span class="tm-ledger-value">{stat.value}</span>
            <span class="tm-ledger-note">{stat.note}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="workspace-panel judgment-panel" aria-label="User refinement judgment">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">JUDGMENT</span>
        <span class="workspace-panel-copy">turn reading into refinement data</span>
      </div>
      <div class="judgment-options">
        {#each judgmentOptions as option}
          <button
            class="judgment-option"
            class:tone-pos={option.tone === 'pos'}
            class:tone-neg={option.tone === 'neg'}
            class:tone-warn={option.tone === 'warn'}
            type="button"
            onclick={() => {
              if (option.label === 'Valid') onSetJudgeVerdict('agree');
              if (option.label === 'Invalid') onSetJudgeVerdict('disagree');
              onOpenJudgeWorkspace();
            }}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </section>

    <section class="workspace-panel execution-panel" aria-label="Execution handoff">
      <div class="workspace-panel-head">
        <span class="workspace-kicker">EXECUTION</span>
        <span class="workspace-panel-copy">isolated from decision HUD</span>
      </div>
      <div class="execution-mini-grid">
        {#each executionProposal as p}
          <div class="prop-cell" class:tone-pos={p.tone === 'pos'} class:tone-neg={p.tone === 'neg'}>
            <span class="prop-l">{p.label}</span>
            <span class="prop-v">{p.val}</span>
          </div>
        {/each}
      </div>
    </section>
  </div>

  <div class="workspace-action-strip">
    <button class="analyze-action-btn ai" type="button" onclick={onOpenAnalyzeAIDetail}>
      <span class="analyze-action-k">AI</span>
      <span class="analyze-action-t">Explain current workspace</span>
    </button>
    <button class="analyze-action-btn" type="button" onclick={onStartSaveSetup}>
      <span class="analyze-action-k">SAVE</span>
      <span class="analyze-action-t">Select range and save setup</span>
    </button>
    <button class="analyze-action-btn" type="button" onclick={onOpenJudgeWorkspace}>
      <span class="analyze-action-k">04</span>
      <span class="analyze-action-t">Move to Judge</span>
    </button>
  </div>
</div>

<style>

  /* Fix 1: 모바일에서 ChartBoard 데스크탑 툴바 숨김 (+98px 확보) */
  :global(.mobile-chart-section .chart-toolbar) { display: none; }
  :global(.mobile-chart-section .chart-header--tv) { display: none; }
  /* Fix 2: ChartBoard min-height 420px 오버라이드 → 42vh 컨테이너에 맞춤 */
  :global(.mobile-chart-section .chart-board) { min-height: 0 !important; }

  /* Chart section */

  /* PEEK overlay */

  @keyframes peekSlide {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* ANALYZE workspace shared primitives */

  .analyze-action-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 4px;
    border: 0.5px solid var(--g4);
    background: var(--g1);
    color: var(--g8);
    cursor: pointer;
  }
  .analyze-action-btn.ai {
    border-color: color-mix(in srgb, var(--amb) 34%, var(--g4));
    background: color-mix(in srgb, var(--amb) 10%, var(--g1));
  }
  .analyze-action-btn:hover {
    border-color: var(--g5);
    background: var(--g2);
    color: var(--g9);
  }
  .analyze-action-btn.ai:hover {
    border-color: color-mix(in srgb, var(--amb) 52%, var(--g4));
    background: color-mix(in srgb, var(--amb) 14%, var(--g2));
  }
  .analyze-action-k {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.14em;
    color: var(--brand);
    flex-shrink: 0;
  }
  .analyze-action-t {
    font-size: var(--ui-text-xs);
    font-weight: 600;
  }

  .prop-cell {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 10px;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .prop-l { font-size: var(--ui-text-xs); color: var(--g6); letter-spacing: 0.14em; width: 44px; }
  .prop-v { font-size: 14px; color: var(--g9); font-weight: 600; }
  .prop-cell.tone-neg .prop-v { color: var(--neg); }
  .prop-cell.tone-pos .prop-v { color: var(--pos); }

  /* ── SCAN panel (trade_scan.jsx) ── */

  @keyframes scan-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

  @keyframes skeleton-fade { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

  /* ── Analyze workspace: bottom owns verification/comparison/refinement ── */
  .workspace-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background:
      radial-gradient(circle at 12% 0%, rgba(122,162,224,0.08), transparent 28%),
      linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.12));
  }
  .workspace-hero, .workspace-panel {
    border: 0.5px solid var(--g4);
    border-radius: 8px;
    background: rgba(10,12,16,0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.025);
  }
  .workspace-hero {
    display: grid;
    grid-template-columns: minmax(210px, 0.75fr) minmax(420px, 1.25fr);
    gap: 14px;
    align-items: center;
    padding: 12px 14px;
    flex-shrink: 0;
  }
  .workspace-hero-copy {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }
  .workspace-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--brand);
    letter-spacing: 0.2em;
    font-weight: 800;
  }
  .workspace-thesis {
    font-size: 12px;
    line-height: 1.55;
    color: var(--g8);
    min-width: 0;
  }
  .workspace-thesis .bull { color: var(--pos); font-weight: 700; }
  .phase-timeline {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: stretch;
    gap: 4px;
  }
  .phase-node {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    min-height: 48px;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: var(--g0);
  }
  .phase-node.done {
    border-color: color-mix(in srgb, var(--brand) 28%, var(--g4));
    background: color-mix(in srgb, var(--brand) 7%, var(--g0));
  }
  .phase-node.active {
    border-color: color-mix(in srgb, var(--amb) 55%, var(--g4));
    background: color-mix(in srgb, var(--amb) 11%, var(--g0));
  }
  .phase-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--g5);
  }
  .phase-node.done .phase-dot { background: var(--brand); }
  .phase-node.active .phase-dot { background: var(--amb); box-shadow: 0 0 0 4px var(--amb-dd); }
  .phase-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g7);
    letter-spacing: 0.07em;
  }
  .phase-node.active .phase-label { color: var(--g9); font-weight: 700; }
  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(460px, 1.6fr) minmax(240px, 0.8fr);
    gap: 10px;
    min-height: 0;
  }
  .workspace-bottom-grid {
    display: grid;
    grid-template-columns: 0.8fr 1.25fr 1fr;
    gap: 10px;
    flex-shrink: 0;
  }
  .workspace-panel {
    padding: 10px;
    min-width: 0;
  }
  .workspace-panel-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .workspace-panel-copy {
    font-size: var(--ui-text-xs);
    color: var(--g6);
    line-height: 1.4;
    text-align: right;
  }
  .market-depth-grid {
    display: grid;
    grid-template-columns: minmax(210px, 0.82fr) minmax(250px, 1fr) minmax(260px, 1.1fr) minmax(280px, 1.2fr);
    gap: 10px;
    flex-shrink: 0;
  }
  .depth-panel {
    min-height: 212px;
    border-color: color-mix(in srgb, var(--g4) 72%, #7aa2e0);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.02), transparent),
      rgba(5,7,10,0.82);
  }
  .depth-panel.selected {
    border-color: color-mix(in srgb, var(--amb) 58%, var(--g4));
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.075), 0 0 22px rgba(232,184,106,0.035);
  }
  .dom-ladder, .tm-tape-list, .footprint-table, .heatmap-grid {
    font-family: 'JetBrains Mono', monospace;
  }
  .dom-ladder {
    display: grid;
    gap: 2px;
  }
  .dom-row {
    display: grid;
    grid-template-columns: minmax(58px, 1fr) 72px minmax(58px, 1fr);
    align-items: center;
    min-height: 12px;
    gap: 5px;
    color: var(--g7);
    font-size: var(--ui-text-xs);
  }
  .dom-head {
    color: var(--g5);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.14em;
  }
  .dom-row.mid {
    min-height: 16px;
    border-block: 0.5px solid color-mix(in srgb, var(--amb) 32%, var(--g4));
    color: var(--g9);
    background: rgba(232,184,106,0.055);
  }
  .dom-side {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 12px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(255,255,255,0.018);
  }
  .dom-side.bid { justify-content: flex-end; }
  .dom-side.ask { justify-content: flex-start; }
  .dom-bar {
    position: absolute;
    top: 1px;
    bottom: 1px;
    border-radius: 3px;
    opacity: 0.76;
  }
  .dom-bar.bid {
    right: 0;
    background: linear-gradient(90deg, rgba(74,187,142,0.05), rgba(74,187,142,0.72));
  }
  .dom-bar.ask {
    left: 0;
    background: linear-gradient(90deg, rgba(226,91,91,0.72), rgba(226,91,91,0.05));
  }
  .dom-val {
    position: relative;
    z-index: 1;
    padding: 0 4px;
    font-variant-numeric: tabular-nums;
  }
  .dom-price {
    text-align: center;
    color: var(--g8);
    font-variant-numeric: tabular-nums;
  }
  .dom-row.bid-heavy .dom-price { color: var(--pos); }
  .dom-row.ask-heavy .dom-price { color: var(--neg); }
  .footprint-table {
    display: grid;
    gap: 3px;
  }
  .footprint-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(44px, 0.8fr) minmax(64px, 1fr) minmax(44px, 0.8fr) minmax(48px, 0.8fr);
    align-items: center;
    gap: 6px;
    min-height: 14px;
    padding: 2px 5px;
    border-radius: 3px;
    overflow: hidden;
    color: var(--g7);
    font-size: var(--ui-text-xs);
    background: rgba(255,255,255,0.014);
  }
  .footprint-head {
    color: var(--g5);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.12em;
    background: transparent;
  }
  .footprint-row.buy span:nth-child(4) { color: var(--pos); font-weight: 900; }
  .footprint-row.sell span:nth-child(4) { color: var(--neg); font-weight: 900; }
  .footprint-row span {
    position: relative;
    z-index: 1;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .footprint-row span:nth-child(2) { color: var(--g8); text-align: center; }
  .footprint-volume {
    position: absolute !important;
    left: 0;
    top: 1px;
    bottom: 1px;
    z-index: 0 !important;
    border-radius: 3px;
    background: linear-gradient(90deg, rgba(122,162,224,0.18), transparent);
  }
  .heatmap-grid {
    display: grid;
    gap: 4px;
  }
  .heatmap-row {
    display: grid;
    grid-template-columns: 62px 1fr;
    align-items: center;
    gap: 6px;
  }
  .heat-price {
    color: var(--g5);
    font-size: var(--ui-text-xs);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .heat-cells {
    display: grid;
    grid-template-columns: repeat(18, minmax(4px, 1fr));
    gap: 2px;
    min-height: 16px;
  }
  .heat-cell {
    min-height: 16px;
    border-radius: 2px;
    background: #7aa2e0;
    box-shadow: 0 0 18px currentColor;
  }
  .heat-cell.buy {
    color: var(--pos);
    background: linear-gradient(180deg, rgba(74,187,142,0.95), rgba(74,187,142,0.32));
  }
  .heat-cell.sell {
    color: var(--neg);
    background: linear-gradient(180deg, rgba(226,91,91,0.95), rgba(226,91,91,0.3));
  }
  .depth-empty {
    padding: 18px 8px;
    border: 0.5px dashed var(--g4);
    border-radius: 6px;
    color: var(--g5);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.1em;
    text-align: center;
    text-transform: uppercase;
  }
  .evidence-table {
    display: grid;
    gap: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .evidence-table-row {
    display: grid;
    grid-template-columns: minmax(84px, 1.2fr) minmax(58px, 0.75fr) minmax(72px, 0.85fr) 56px minmax(120px, 1.4fr);
    gap: 8px;
    align-items: center;
    min-height: 28px;
    padding: 5px 7px;
    border: 0.5px solid var(--g3);
    border-radius: 4px;
    background: var(--g0);
    color: var(--g7);
    font-size: var(--ui-text-xs);
  }
  .evidence-table-row.header {
    min-height: 22px;
    color: var(--g5);
    background: transparent;
    border-color: transparent;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .evidence-table-row.pass span:nth-child(4) { color: var(--pos); font-weight: 800; }
  .evidence-table-row.fail span:nth-child(4) { color: var(--neg); font-weight: 800; }
  .evidence-table-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compare-card-stack {
    display: grid;
    gap: 7px;
  }
  .compare-card {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "label value"
      "note note";
    gap: 3px 8px;
    padding: 9px 10px;
    text-align: left;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: var(--g0);
    color: var(--g8);
    cursor: pointer;
  }
  .compare-card:hover { border-color: #7aa2e0; background: var(--g2); }
  .compare-label {
    grid-area: label;
    font-size: var(--ui-text-xs);
    font-weight: 700;
  }
  .compare-value {
    grid-area: value;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: #7aa2e0;
  }
  .compare-note {
    grid-area: note;
    font-size: var(--ui-text-xs);
    color: var(--g6);
  }
  .workspace-primary-action {
    width: 100%;
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 5px;
    border: 0.5px solid color-mix(in srgb, #7aa2e0 42%, var(--g4));
    background: color-mix(in srgb, #7aa2e0 10%, var(--g0));
    color: #9bbcf0;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .execution-mini-grid {
    display: grid;
    gap: 6px;
  }
  .judgment-options {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .judgment-option {
    min-height: 34px;
    padding: 6px 5px;
    border-radius: 6px;
    border: 0.5px solid var(--g4);
    background: var(--g0);
    color: var(--g8);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.05em;
    cursor: pointer;
  }
  .judgment-option:hover { background: var(--g2); color: var(--g9); }
  .judgment-option.tone-pos { border-color: color-mix(in srgb, var(--pos) 40%, var(--g4)); color: var(--pos); }
  .judgment-option.tone-neg { border-color: color-mix(in srgb, var(--neg) 40%, var(--g4)); color: var(--neg); }
  .judgment-option.tone-warn { border-color: color-mix(in srgb, var(--amb) 40%, var(--g4)); color: var(--amb); }
  .workspace-action-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    flex-shrink: 0;
  }

  /* Visual salvage pass: less card noise, more trading-terminal density. */

  .workspace-body {
    padding: 8px;
    gap: 8px;
    background:
      radial-gradient(circle at 12% -6%, rgba(232,184,106,0.045), transparent 28%),
      #05070a;
  }
  .workspace-hero, .workspace-panel {
    border-color: rgba(255,255,255,0.065);
    background: rgba(255,255,255,0.018);
    box-shadow: none;
  }
  .workspace-hero {
    grid-template-columns: minmax(190px, 0.58fr) minmax(420px, 1.42fr);
    padding: 8px 10px;
  }
  .phase-node {
    min-height: 34px;
    padding: 6px 7px;
    border-color: rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.018);
  }
  .phase-node.active {
    background: rgba(232,184,106,0.105);
  }
  .market-depth-grid {
    grid-template-columns: minmax(190px, 0.84fr) minmax(230px, 1fr) minmax(230px, 1.02fr) minmax(250px, 1.1fr);
    gap: 8px;
  }
  .workspace-panel {
    padding: 8px;
    border-radius: 7px;
  }
  .workspace-panel-head {
    margin-bottom: 6px;
  }
  .depth-panel {
    min-height: 178px;
    background: rgba(3,5,8,0.70);
    border-color: rgba(122,162,224,0.10);
  }
  .dom-row, .tm-tape-row, .footprint-row {
    min-height: 13px;
  }

  @media (max-width: 1120px) {

    .workspace-hero, .market-depth-grid, .workspace-grid, .workspace-bottom-grid {
      grid-template-columns: 1fr;
    }
    .phase-timeline {
      grid-template-columns: repeat(5, minmax(96px, 1fr));
      overflow-x: auto;
    }
    .judgment-options {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .workspace-action-strip {
      grid-template-columns: 1fr;
    }
  }

  /* ── Mobile layout ── */

  /* ── Accessibility: Screen reader only text ── */

  /* ── Mobile loading ── */

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Proposal AI CTA (mobile) ── */

  /* ── JUDGE context header ── */

</style>
