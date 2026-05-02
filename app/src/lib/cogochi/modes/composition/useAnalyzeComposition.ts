import type { AnalyzeCompositionData, PhaseNode, DomRow, TapeRow, FootprintRow, HeatmapCell, HeatmapRow, EvidenceRow, CompareCard, LedgerStat, JudgmentOption, ExecProposal } from './types';

// Import from TradeMode's internal types
interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EvidenceItem {
  k: string;
  v: string;
  pos: boolean;
  note?: string;
}

interface MicroOrderbook {
  bestBid?: number;
  bestAsk?: number;
  bidNotional?: number;
  askNotional?: number;
  bids: Array<{ price: number; notional: number; weight: number }>;
  asks: Array<{ price: number; notional: number; weight: number }>;
}

interface MarketTradePrint {
  time: number;
  price: number;
  side: 'BUY' | 'SELL';
  notional: number;
  qty: number;
  isBuyerMaker: boolean;
}

interface MicrostructurePayload {
  currentPrice: number;
  orderbook: MicroOrderbook | null;
  tradeTape: { trades: MarketTradePrint[] };
  footprint: { buckets: any[] };
  heatmap: { bands: any[] };
}

interface PastCapture {
  capture_id: string;
  symbol: string;
  timeframe: string;
  status: string;
}

// Utility function used in composition
function buildFootprintBucketsFromTrades(trades: MarketTradePrint[], midPrice: number) {
  // Simplified stub — real implementation in TradeMode
  return [];
}

function _fmtNum(n: number): string {
  return n.toFixed(2);
}

/**
 * Composition function for AnalyzePanel data
 * Extracts all derived stores needed by AnalyzePanel into a single object
 */
export function useAnalyzeComposition(opts: {
  analyzeDetailDirection: string;
  analyzeDetailThesis: string;
  analyzeData: any;
  analyzeEvidenceItems: EvidenceItem[];
  scanCandidates: any[];
  pastCaptures: PastCapture[];
  scanSelected: string;
  workspaceStudyMap: Record<string, any>;
  currentPrice: number;
  liveOrderbook: MicroOrderbook | null;
  liveTrades: MarketTradePrint[];
  microstructurePayload: MicrostructurePayload | null;
  chartPayload: any;
  symbol: string;
  timeframe: string;
  microstructureView: string;
  openCompareWorkspace: () => void;
}): AnalyzeCompositionData {
  // phaseTimeline derived
  const phaseTimeline = (() => {
    const labels = ['FAKE DUMP', 'ARCH ZONE', 'REAL DUMP', 'ACCUMULATION', 'BREAKOUT'];
    // Simplified phase detection (real logic in TradeMode uses ensemble + deep verdict)
    const haystack = [
      opts.analyzeDetailThesis,
      opts.analyzeData?.deep?.verdict,
    ].filter(Boolean).join(' ').toLowerCase();

    let activeIndex = 0;
    if (haystack.includes('breakout')) activeIndex = 4;
    else if (haystack.includes('accum')) activeIndex = 3;
    else if (haystack.includes('dump')) activeIndex = 2;
    else if (haystack.includes('arch')) activeIndex = 1;

    return labels.map((label, index) => ({
      label,
      state: (index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending') as 'done' | 'active' | 'pending',
    }));
  })();

  // evidenceTableRows derived
  const evidenceTableRows = (() => {
    const rows = opts.analyzeEvidenceItems.map((item) => ({
      feature: item.k,
      value: item.v,
      threshold: item.pos ? 'pass zone' : 'watch',
      status: item.pos ? 'PASS' : 'FAIL',
      why: item.note || 'engine evidence',
      pos: item.pos,
    }));

    if (rows.length > 0) return rows.slice(0, 8);

    return [
      { feature: 'OI', value: '—', threshold: 'context', status: 'WAIT', why: 'open interest pane', pos: true },
      { feature: 'Funding', value: '—', threshold: 'flip/overheat', status: 'WAIT', why: 'funding pane', pos: true },
      { feature: 'CVD', value: '—', threshold: 'divergence', status: 'WAIT', why: 'flow pane', pos: true },
    ];
  })();

  // compareCards derived
  const compareCards = (() => [
    {
      label: 'Current vs TRADOOR',
      value: `${opts.scanCandidates.length} live`,
      note: 'world-model candidates',
      action: opts.openCompareWorkspace,
    },
    {
      label: 'Current vs Saved',
      value: `${opts.pastCaptures.length} saved`,
      note: 'recent capture memory',
      action: opts.openCompareWorkspace,
    },
    {
      label: 'Near Miss',
      value: opts.scanSelected ? opts.scanSelected.replace('USDT', '') : 'select',
      note: 'failure-case compare',
      action: opts.openCompareWorkspace,
    },
  ])();

  // ledgerStats derived
  const ledgerStats = (() => {
    const outcomeReady = opts.pastCaptures.filter((capture) => capture.status === 'outcome_ready').length;
    const verdictReady = opts.pastCaptures.filter((capture) => capture.status === 'verdict_ready').length;
    return [
      { label: 'Saved', value: String(opts.pastCaptures.length), note: 'captures' },
      { label: 'Outcome', value: String(outcomeReady), note: 'ready' },
      { label: 'Verdict', value: String(verdictReady), note: 'ready' },
    ];
  })();

  // judgmentOptions (static)
  const judgmentOptions: JudgmentOption[] = [
    { label: 'Valid', tone: 'pos' },
    { label: 'Invalid', tone: 'neg' },
    { label: 'Too Early', tone: 'warn' },
    { label: 'Too Late', tone: 'warn' },
    { label: 'Near Miss', tone: 'warn' },
  ];

  // executionProposal derived
  const executionProposal = (() => {
    const study = opts.workspaceStudyMap.execution;
    if (!study) {
      return [
        { label: 'ENTRY', val: '—', hint: '', tone: '' as '' | 'neg' | 'pos' },
        { label: 'STOP', val: '—', hint: '', tone: 'neg' as '' | 'neg' | 'pos' },
        { label: 'TARGET', val: '—', hint: '', tone: 'pos' as '' | 'neg' | 'pos' },
        { label: 'R:R', val: '—', hint: '', tone: '' as '' | 'neg' | 'pos' },
      ];
    }

    if (study.summary.length === 0) return [];

    return study.summary.map((row: any) => ({
      label: row.label.toUpperCase(),
      val: row.value == null || row.value === '' ? '—' : String(row.value),
      hint: row.note ?? '',
      tone: (row.tone === 'bull' ? 'pos' : row.tone === 'bear' ? 'neg' : '') as '' | 'neg' | 'pos',
    }));
  })();

  // Microstructure derived (stub for now)
  const domLadderRows: DomRow[] = [];
  const timeSalesRows: TapeRow[] = [];
  const footprintRows: FootprintRow[] = [];
  const heatmapRows: HeatmapRow[] = [];

  return {
    direction: opts.analyzeDetailDirection,
    thesis: opts.analyzeDetailThesis,
    phaseTimeline,
    microstructureView: opts.microstructureView,
    domLadderRows,
    timeSalesRows,
    footprintRows,
    heatmapRows,
    evidenceTableRows,
    compareCards,
    ledgerStats,
    judgmentOptions,
    executionProposal,
  };
}
