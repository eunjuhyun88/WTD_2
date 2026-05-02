<script lang="ts">
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

  interface Props {
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
    onOpenCompareWorkspace: () => void;
    onSetJudgeVerdict: (v: 'agree' | 'disagree') => void;
    onOpenJudgeWorkspace: () => void;
    onOpenAnalyzeAIDetail: () => void;
    onStartSaveSetup: () => void;
  }

  let {
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
    onOpenCompareWorkspace,
    onSetJudgeVerdict,
    onOpenJudgeWorkspace,
    onOpenAnalyzeAIDetail,
    onStartSaveSetup,
  }: Props = $props();
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
