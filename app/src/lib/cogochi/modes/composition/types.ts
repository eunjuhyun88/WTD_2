// Composition layer types — portable data contracts for panels

export interface PhaseNode {
  state: 'done' | 'active' | 'pending';
  label: string;
}

export interface DomRow {
  isMid: boolean;
  delta: number;
  bidWidth: string;
  bid: string;
  price: string;
  askWidth: string;
  ask: string;
}

export interface TapeRow {
  side: 'BUY' | 'SELL';
  time: string;
  price: string;
  size: string;
  intensity: string;
}

export interface FootprintRow {
  delta: number;
  bid: string;
  price: string;
  ask: string;
  deltaLabel: string;
  width: string;
}

export interface HeatmapCell {
  side: 'buy' | 'sell';
  intensity: number;
  label: string;
}

export interface HeatmapRow {
  price: string;
  cells: HeatmapCell[];
}

export interface EvidenceRow {
  pos: boolean;
  feature: string;
  value: string;
  threshold: string;
  status: string;
  why: string;
}

export interface CompareCard {
  label: string;
  value: string;
  note: string;
  action: () => void;
}

export interface LedgerStat {
  label: string;
  value: string;
  note: string;
}

export interface JudgmentOption {
  label: string;
  tone: 'pos' | 'neg' | 'warn';
}

export interface ExecProposal {
  label: string;
  val: string;
  tone: '' | 'pos' | 'neg';
}

// Bundled composition data — one object per panel
export interface AnalyzeCompositionData {
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

export interface ScanCompositionData {
  confluence: any;
  scanState: 'idle' | 'scanning' | 'done';
  scanProgress: number;
  scanCandidates: any[];
  scanSelected: string;
  pastCaptures: any[];
}

export interface JudgeCompositionData {
  confluence: any;
  confluenceHistory: any;
  symbol: string;
  timeframe: string;
  confidenceAlpha: string | number;
  judgePlan: any[];
  rrLossPct: string;
  rrGainPct: string;
  judgeVerdict: 'agree' | 'disagree' | null;
  judgeOutcome: 'win' | 'loss' | 'flat' | null;
  judgeRejudged: 'right' | 'wrong' | null;
  judgeSubmitting: boolean;
  judgeSubmitResult: any;
}
