export type WalletIntelTab = 'flow' | 'bubble' | 'cluster';
export type WalletTone = 'bull' | 'bear' | 'neutral' | 'warn' | 'cyan';
export type WalletNodeType = 'wallet' | 'token' | 'contract' | 'cex' | 'bridge' | 'cluster';
export type WalletActionKind = 'watch' | 'follow' | 'fade' | 'ignore';

export type WalletChartBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type WalletIdentity = {
  chain: string;
  address: string;
  displayAddress: string;
  entityType: string;
  label: string;
  confidence: number;
  firstSeen: string;
  lastActive: string;
  tags: string[];
  aliases: string[];
  narrative: string;
};

export type WalletSummaryClaim = {
  id: string;
  title: string;
  detail: string;
  tone: WalletTone;
};

export type WalletSummary = {
  headline: string;
  confidence: number;
  claims: WalletSummaryClaim[];
  followUps: string[];
};

export type WalletBehavior = {
  accumulation: number;
  distribution: number;
  cexDeposit: number;
  holdingHorizon: string;
  bridgeScore: number;
  marketRelevance: number;
};

export type WalletFlowLayer = {
  id: string;
  label: string;
  stamp: string;
  headline: string;
  detail: string;
  amountLabel: string;
  addresses: string[];
  tone: WalletTone;
};

export type WalletGraphNode = {
  id: string;
  type: WalletNodeType;
  label: string;
  shortLabel: string;
  address?: string;
  tokenSymbol?: string;
  size: number;
  valueLabel: string;
  tone: WalletTone;
  note: string;
  tags: string[];
};

export type WalletGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  txCount: number;
  valueLabel: string;
};

export type WalletCluster = {
  id: string;
  label: string;
  role: string;
  members: number;
  valueLabel: string;
  tone: WalletTone;
  note: string;
  tags: string[];
};

export type WalletEvidenceRow = {
  id: string;
  at: string;
  action: string;
  token: string;
  amountLabel: string;
  usdLabel: string;
  counterparty: string;
  txHash: string;
  note: string;
  tone: WalletTone;
};

export type WalletMarketEvent = {
  id: string;
  atLabel: string;
  type: string;
  label: string;
  usdLabel: string;
  tone: WalletTone;
};

export type WalletMarketToken = {
  symbol: string;
  pair: string;
  role: string;
  price: number;
  changePct: number;
  thesis: string;
  chart: WalletChartBar[];
  annotations: Array<{ type: 'support' | 'resistance'; price: number; strength: number }>;
  indicators: {
    ema20: number[];
    bbUpper: number[];
    bbMiddle: number[];
    bbLower: number[];
  };
  derivatives: {
    funding: number;
    oi: number;
    lsRatio: number;
  };
  snapshot: {
    alphaScore: number;
    regime: string;
    l11: { score: number; cvd_state: string };
    l14: { bb_squeeze: boolean; bb_width: string };
    l15: { atr_pct: string };
  };
  eventMarkers: WalletMarketEvent[];
};

export type WalletActionPlan = {
  primary: WalletActionKind;
  rationale: string;
  checklist: string[];
  alerts: string[];
};

export type WalletIntelDataset = {
  identity: WalletIdentity;
  summary: WalletSummary;
  behavior: WalletBehavior;
  flowLayers: WalletFlowLayer[];
  graph: {
    nodes: WalletGraphNode[];
    edges: WalletGraphEdge[];
  };
  clusters: WalletCluster[];
  market: {
    timeframe: string;
    tokens: WalletMarketToken[];
  };
  evidence: WalletEvidenceRow[];
  actionPlan: WalletActionPlan;
};

export type WalletModeInput = {
  chain: string;
  identifier: string;
  address: string;
};

export type WalletCommandResult = {
  note: string;
  tab?: WalletIntelTab;
  tokenSymbol?: string;
  nextInput?: WalletModeInput;
  exit?: boolean;
};
