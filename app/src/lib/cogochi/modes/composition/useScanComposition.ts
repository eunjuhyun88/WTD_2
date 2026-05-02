import type { ScanCompositionData } from './types';

interface ScanCandidate {
  id: string;
  symbol: string;
  tf: string;
  pattern: string;
  phase: number;
  alpha: number;
  age: string;
  sim: number;
}

interface PastCapture {
  capture_id: string;
  symbol: string;
  timeframe: string;
  pattern_slug?: string | null;
  captured_at_ms: number;
  status: string;
}

/**
 * Composition function for ScanPanel data
 * Bundles scan-related state into a portable, testable contract
 */
export function useScanComposition(opts: {
  confluence: any;
  scanState: 'idle' | 'scanning' | 'done';
  scanProgress: number;
  scanCandidates: ScanCandidate[];
  scanSelected: string;
  pastCaptures: PastCapture[];
}): ScanCompositionData {
  return {
    confluence: opts.confluence,
    scanState: opts.scanState,
    scanProgress: opts.scanProgress,
    scanCandidates: opts.scanCandidates,
    scanSelected: opts.scanSelected,
    pastCaptures: opts.pastCaptures,
  };
}
