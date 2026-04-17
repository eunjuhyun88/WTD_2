/**
 * Personalization feature flag and placeholder data.
 *
 * ADAPTER_MODE controls whether components render live data or placeholder dummy data.
 * Switch to 'live' only after H1 verification passes (+5%p gate).
 */

export type AdapterMode = 'placeholder' | 'live';

export const ADAPTER_MODE: AdapterMode = 'placeholder';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface AdapterVersion {
  version: string;
  hitRate: number;
  deltaPct: number;
  trainedAt: string;
  feedbackCount: number;
  cost: number;
}

export interface AdapterCaseDiff {
  id: string;
  scenario: string;
  beforePrediction: string;
  beforeOutcome: string;
  afterPrediction: string;
  afterOutcome: string;
  note: string;
}

export interface AdapterWeightChange {
  feature: string;
  delta: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Placeholder data — dummy values for pre-H1 preview mode
// ---------------------------------------------------------------------------

export const PLACEHOLDER_ADAPTER_VERSIONS: AdapterVersion[] = [
  {
    version: 'v1',
    hitRate: 52,
    deltaPct: 0,
    trainedAt: '2026-03-01T10:00:00Z',
    feedbackCount: 0,
    cost: 0,
  },
  {
    version: 'v2',
    hitRate: 58,
    deltaPct: 6,
    trainedAt: '2026-03-15T14:22:00Z',
    feedbackCount: 20,
    cost: 0.07,
  },
  {
    version: 'v3',
    hitRate: 63,
    deltaPct: 5,
    trainedAt: '2026-04-01T23:47:00Z',
    feedbackCount: 60,
    cost: 0.063,
  },
];

export const PLACEHOLDER_CASE_DIFFS: AdapterCaseDiff[] = [
  {
    id: 'case-001',
    scenario: 'BTC 4h recent_rally + bb_expansion',
    beforePrediction: '진입 (v1)',
    beforeOutcome: '틀림 (-1.2%)',
    afterPrediction: '대기 (v2)',
    afterOutcome: '맞음',
    note: 'v2는 bb_expansion 과열을 위험 신호로 학습',
  },
  {
    id: 'case-002',
    scenario: 'ETH 1h OI 누적 + funding 과열',
    beforePrediction: '진입 (v1)',
    beforeOutcome: '틀림 (-0.8%)',
    afterPrediction: '대기 (v2)',
    afterOutcome: '맞음',
    note: 'v2는 펀딩비 과열 구간에서 진입 보류를 학습',
  },
  {
    id: 'case-003',
    scenario: 'SOL 4h CVD divergence + volume spike',
    beforePrediction: '대기 (v1)',
    beforeOutcome: '틀림 (놓침 +2.1%)',
    afterPrediction: '진입 (v2)',
    afterOutcome: '맞음',
    note: 'v2는 CVD divergence + volume 조합을 진입 신호로 학습',
  },
];

export const PLACEHOLDER_WEIGHT_CHANGES: AdapterWeightChange[] = [
  {
    feature: 'bb_expansion',
    delta: 0.23,
    note: '네가 자주 사용',
  },
  {
    feature: 'OI 누적',
    delta: 0.18,
  },
  {
    feature: '펀딩비 과열 경고',
    delta: 0.15,
  },
  {
    feature: 'volume_24h × wick',
    delta: 0.11,
    note: '너만의 조합',
  },
  {
    feature: 'CVD divergence',
    delta: 0.08,
  },
];
