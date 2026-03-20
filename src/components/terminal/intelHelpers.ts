// ═══════════════════════════════════════════════════════════════
//  STOCKCLAW — Intel Panel Pure Helper Functions
//  Extracted from IntelPanel.svelte for maintainability
// ═══════════════════════════════════════════════════════════════

// ─── Score & Direction Display ────────────────────────────────

/** Map numeric score to indicator color */
export function scoreColor(score: number): string {
  if (score >= 65) return '#00e676';
  if (score >= 50) return '#ffeb3b';
  if (score >= 35) return '#ff9800';
  return '#ff1744';
}

/** Return directional icon character */
export function dirIcon(dir: string): string {
  if (dir === 'long') return '▲';
  if (dir === 'short') return '▼';
  return '●';
}

/** Return directional color */
export function dirColor(dir: string): string {
  if (dir === 'long') return '#00e676';
  if (dir === 'short') return '#ff1744';
  return '#ffeb3b';
}

// ─── Policy Display ───────────────────────────────────────────

type BiasValue = 'long' | 'short' | 'wait';

/** Convert bias value to display label */
export function policyBiasLabel(bias: BiasValue): string {
  if (bias === 'long') return 'LONG';
  if (bias === 'short') return 'SHORT';
  return 'WAIT';
}

/** Convert bias value to CSS class name */
export function policyBiasClass(bias: BiasValue): string {
  if (bias === 'long') return 'long';
  if (bias === 'short') return 'short';
  return 'wait';
}

// ─── Shadow Decision Display ──────────────────────────────────

interface ShadowDecisionLike {
  source: 'llm' | 'fallback';
  provider: string | null;
  model: string | null;
  fallbackReason: 'provider_unavailable' | 'llm_call_failed' | null;
  enforced: { shouldExecute: boolean };
}

/** Format shadow decision source label */
export function shadowSourceLabel(decision: ShadowDecisionLike): string {
  if (decision.source === 'llm') {
    const provider = decision.provider ? decision.provider.toUpperCase() : 'LLM';
    return decision.model ? `${provider} · ${decision.model}` : provider;
  }
  if (decision.fallbackReason === 'provider_unavailable') return 'FALLBACK · NO API KEY';
  if (decision.fallbackReason === 'llm_call_failed') return 'FALLBACK · LLM ERROR';
  return 'FALLBACK';
}

/** Format shadow decision execution label */
export function shadowExecuteLabel(decision: ShadowDecisionLike): string {
  return decision.enforced.shouldExecute ? 'EXECUTE READY' : 'EXECUTION BLOCKED';
}

// ─── Score Breakdown ──────────────────────────────────────────

interface PolicyScoresLike {
  actionability: number;
  timeliness: number;
  reliability: number;
  relevance: number;
  helpfulness: number;
}

/** Format policy scores as compact text */
export function scoreBreakdownText(scores: PolicyScoresLike): string {
  return `A ${Math.round(scores.actionability)} · T ${Math.round(scores.timeliness)} · R ${Math.round(scores.reliability)} · Re ${Math.round(scores.relevance)} · H ${Math.round(scores.helpfulness)}`;
}

// ─── Number Formatting ────────────────────────────────────────

/** Format trending coin price with appropriate decimals */
export function fmtTrendPrice(p: number): string {
  if (!Number.isFinite(p)) return '$0';
  if (p >= 1000) return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.001) return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
}

/** Format volume with B/M/K notation */
export function fmtTrendVol(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

// ─── Time Formatting ──────────────────────────────────────────

export { formatRelativeTime } from '$lib/utils/time';

// ─── Token Aliases ────────────────────────────────────────────

/** Get search aliases for common crypto tokens */
export function getTokenAliases(token: string): string[] {
  const map: Record<string, string[]> = {
    BTC: ['btc', 'bitcoin', 'microstrategy'],
    ETH: ['eth', 'ethereum', 'vitalik'],
    SOL: ['sol', 'solana'],
    DOGE: ['doge', 'dogecoin'],
    XRP: ['xrp', 'ripple'],
  };
  return map[token] || [token.toLowerCase()];
}

// ─── API Error Handling ───────────────────────────────────────

/** Extract error message from API response payload */
export function apiErrorMessage(payload: any, fallback: string): string {
  return typeof payload?.error === 'string' && payload.error.trim().length > 0 ? payload.error.trim() : fallback;
}
