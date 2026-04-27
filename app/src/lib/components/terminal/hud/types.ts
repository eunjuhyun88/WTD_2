/**
 * Shared type definitions for the Decision HUD (W-0237).
 * These mirror the server-side types in /api/terminal/hud/+server.ts.
 */

export interface HudPatternStatus {
  phase: string;
  state: string;
  pattern_name: string;
  last_updated: string;
}

export interface HudSimilarCapture {
  capture_id: string;
  similarity: number;
  outcome: string;
}

export interface HudEvidence {
  similar_captures: HudSimilarCapture[];
  count: number;
}

export interface HudRisk {
  entry_p_win: number | null;
  threshold: number;
  btc_trend: 'UP' | 'DOWN' | 'NEUTRAL' | null;
}

export interface HudTransition {
  next_phase: string | null;
  conditions: string[];
}

export interface HudActions {
  can_capture: boolean;
  can_watch: boolean;
  can_verdict: boolean;
  capture_id: string;
}

export interface HudPayload {
  pattern_status: HudPatternStatus;
  evidence: HudEvidence;
  risk: HudRisk;
  transition: HudTransition;
  actions: HudActions;
}
