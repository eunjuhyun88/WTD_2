// ═══════════════════════════════════════════════════════════════
//  STOCKCLAW — Shared Time Formatting Utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Format a timestamp as a relative "time since" string.
 * @param ts  Unix timestamp in milliseconds
 * @param ago Whether to append " ago" suffix (default: true)
 */
export function timeSince(ts: number, ago = true): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  const suffix = ago ? ' ago' : '';
  if (sec < 60) return `${sec}s${suffix}`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${suffix}`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h${suffix}`;
  return `${Math.floor(sec / 86400)}d${suffix}`;
}

/**
 * Format a timestamp as a compact relative string (minutes-based).
 * Returns "now" for < 1 minute.
 */
export function formatRelativeTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

/**
 * Format a timestamp as a relative "ago" string with null safety.
 * Returns "-" for null/undefined/invalid inputs.
 */
export function formatAgo(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '-';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
