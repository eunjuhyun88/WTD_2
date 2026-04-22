export type DataProvider =
  | 'engine'
  | 'binance'
  | 'bybit'
  | 'okx'
  | 'coinbase'
  | 'coinalyze'
  | 'deribit'
  | 'arkham'
  | 'derived';

export type StudyFamily =
  | 'price'
  | 'flow'
  | 'oi'
  | 'funding'
  | 'cvd'
  | 'liquidity'
  | 'options'
  | 'venue'
  | 'execution';

export type StudySurface =
  | 'chart-overlay'
  | 'chart-subpane'
  | 'right-hud'
  | 'bottom-workspace';

export type StudyCompareMode =
  | 'timeseries'
  | 'price-level'
  | 'summary'
  | 'execution';

export interface ProviderRef {
  provider: DataProvider;
  route?: string;
  stream?: string;
  auth: 'public' | 'api_key' | 'internal' | 'deferred';
  freshnessMs: number | null;
  status?: 'live' | 'poll' | 'derived' | 'deferred';
}

export interface StudyMetric {
  label: string;
  value: string | number | null;
  tone?: 'bull' | 'bear' | 'neutral' | 'warn';
  note?: string;
}

export interface StudySeriesRef {
  chartKey?: 'klines' | 'oiBars' | 'fundingBars' | 'cvdBars' | 'liqBars';
  indicatorKey?: string;
  registryId?: string;
}

export interface StudySnapshot {
  id: string;
  title: string;
  family: StudyFamily;
  defaultSurface: StudySurface;
  compareMode: StudyCompareMode;
  sourceRefs: ProviderRef[];
  summary: StudyMetric[];
  seriesRef?: StudySeriesRef;
  payload?: Record<string, unknown>;
}

export interface WorkspaceSection {
  id: string;
  title: string;
  kind: 'summary' | 'detail' | 'evidence' | 'execution' | 'compare';
  studyIds: string[];
  collapsible?: boolean;
}

export interface AIContextPack {
  symbol: string;
  timeframe: string;
  selectedStudyIds: string[];
  compareStudyIds: string[];
  thesis?: string;
  warnings?: string[];
}

export interface CogochiWorkspaceEnvelope {
  symbol: string;
  timeframe: string;
  generatedAt: number;
  studies: StudySnapshot[];
  sections: WorkspaceSection[];
  aiContext: AIContextPack;
}
