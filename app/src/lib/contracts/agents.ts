export type ScanAgentKey =
  | 'structure'
  | 'flow'
  | 'deriv'
  | 'senti'
  | 'macro'
  | 'vpa'
  | 'ict'
  | 'valuation';

export interface ScanAgentMetadata {
  icon: string;
  name: string;
  color: string;
}

export const SCAN_AGENT_META: Record<ScanAgentKey, ScanAgentMetadata> = {
  structure: { icon: 'STR', name: 'STRUCTURE', color: '#3b9eff' },
  flow: { icon: 'FLOW', name: 'FLOW', color: '#00e68a' },
  deriv: { icon: 'DER', name: 'DERIV', color: '#ff8c3b' },
  senti: { icon: 'SENT', name: 'SENTI', color: '#8b5cf6' },
  macro: { icon: 'MACRO', name: 'MACRO', color: '#f43f5e' },
  vpa: { icon: 'VPA', name: 'VPA', color: '#22d3ee' },
  ict: { icon: 'ICT', name: 'ICT', color: '#f59e0b' },
  valuation: { icon: 'VAL', name: 'VALUATION', color: '#a78bfa' },
} as const;
