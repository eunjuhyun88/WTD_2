// ═══════════════════════════════════════════════════════════════
// Chart Coordinate Utilities
// ═══════════════════════════════════════════════════════════════
// Shared formatting + time normalization for chart modules.
// Coordinate conversion (toChartPrice, toChartX, etc.) lives in
// ChartPanel.svelte as closures over series/chart/canvas refs.

// ── Time normalization ──────────────────────────────────────

export function normalizeChartTime(rawTime: unknown): number | null {
  if (typeof rawTime === 'number' && Number.isFinite(rawTime)) return rawTime;
  if (rawTime && typeof rawTime === 'object') {
    const maybeTimestamp = (rawTime as { timestamp?: unknown }).timestamp;
    if (typeof maybeTimestamp === 'number' && Number.isFinite(maybeTimestamp))
      return maybeTimestamp;
    const maybeDay = rawTime as { year?: unknown; month?: unknown; day?: unknown };
    if (
      typeof maybeDay.year === 'number' &&
      typeof maybeDay.month === 'number' &&
      typeof maybeDay.day === 'number'
    ) {
      return Math.floor(
        Date.UTC(maybeDay.year, maybeDay.month - 1, maybeDay.day) / 1000,
      );
    }
  }
  return null;
}

// ── Price formatting ─────────────────────────────────────────

export function clampRoundPrice(v: number): number {
  if (!Number.isFinite(v)) return v;
  const abs = Math.abs(v);
  if (abs >= 1000) return Math.round(v);
  if (abs >= 100) return Number(v.toFixed(2));
  return Number(v.toFixed(4));
}

export function formatPrice(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', {
    maximumFractionDigits: v >= 100 ? 2 : 4,
  });
}

export function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toFixed(2);
}
