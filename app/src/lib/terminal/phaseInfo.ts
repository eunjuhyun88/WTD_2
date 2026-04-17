/**
 * phaseInfo.ts — canonical Phase metadata for the five-phase state model.
 *
 * Source of truth: docs/product/core-loop.md § Five-Phase State Model
 * Korean copy is intentional product language — do not translate to English.
 */

export type Phase =
  | 'FAKE_DUMP'
  | 'ARCH_ZONE'
  | 'REAL_DUMP'
  | 'ACCUMULATION'
  | 'BREAKOUT';

export interface PhaseMeta {
  /** Short English phase name (matches engine enum). */
  name: Phase;
  /** Korean display label shown on chip. */
  koLabel: string;
  /**
   * Chip background tint color (rgba with low alpha).
   * Applied as CSS background on the PhaseBadge chip.
   */
  color: string;
  /**
   * One-sentence Korean meaning explaining what is happening in this phase.
   */
  meaning: string;
  /**
   * One-sentence Korean trading rule for this phase.
   */
  tradingRule: string;
}

export const PHASE_META: Record<Phase, PhaseMeta> = {
  FAKE_DUMP: {
    name: 'FAKE_DUMP',
    koLabel: '가짜 급락',
    color: '#FF4D6D33',
    meaning: 'OI 소폭 증가, 거래량 확신 부족 — 세력 포지셔닝 아님',
    tradingRule: '진입 금지 (거래량 확신 부족)',
  },
  ARCH_ZONE: {
    name: 'ARCH_ZONE',
    koLabel: '아치 존',
    color: '#FFD23F33',
    meaning: '아치형 반등 또는 횡보 압축, 번지대 형성 중',
    tradingRule: '저점 대기 (압축 구조 형성)',
  },
  REAL_DUMP: {
    name: 'REAL_DUMP',
    koLabel: '진짜 급락',
    color: '#FF4D6D66',
    meaning: 'OI 대폭 증가, 거래량 확신 강화 — 진짜 포지셔닝 이벤트',
    tradingRule: '세력 포지셔닝 확인 (OI 대폭 증가)',
  },
  ACCUMULATION: {
    name: 'ACCUMULATION',
    koLabel: '축적',
    color: '#00D4FF66',
    meaning: '저점 상승, OI 유지, 펀딩 전환, 구조 개선 — 핵심 구간',
    tradingRule: '핵심 진입 구간 (저점 상승)',
  },
  BREAKOUT: {
    name: 'BREAKOUT',
    koLabel: '돌파',
    color: '#FFD23F66',
    meaning: 'OI 동반 확장, 빠른 가격 상승 — 결과 확인',
    tradingRule: '결과 확인 (종종 늦음)',
  },
};

/** Ordered phase sequence as it progresses through the pattern. */
export const PHASE_ORDER: Phase[] = [
  'FAKE_DUMP',
  'ARCH_ZONE',
  'REAL_DUMP',
  'ACCUMULATION',
  'BREAKOUT',
];
