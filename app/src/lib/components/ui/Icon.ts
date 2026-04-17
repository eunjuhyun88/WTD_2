/**
 * Icon.ts — path-d strings for the unified icon library.
 *
 * All icons use a 24×24 viewBox, fill="none", stroke="currentColor".
 * Geometric monoline, no filled shapes, round caps/joins.
 */

export type IconName =
  | 'chart'
  | 'detail'
  | 'scan'
  | 'judge'
  | 'save'
  | 'pattern'
  | 'bell'
  | 'check'
  | 'x'
  | 'arrow-right'
  | 'info'
  | 'sparkles';

/** SVG inner markup (paths/polylines/etc.) for each icon. */
export const ICONS: Record<IconName, string> = {
  // Candlestick-style line chart
  chart: `<polyline points="3 17 9 11 13 15 21 7" stroke-linecap="round" stroke-linejoin="round"/><line x1="3" y1="21" x2="21" y2="21" stroke-linecap="round"/>`,

  // Panel/detail grid (rect + inner lines)
  detail: `<rect x="3" y="3" width="18" height="18" rx="1" stroke-linecap="round" stroke-linejoin="round"/><line x1="3" y1="9" x2="21" y2="9" stroke-linecap="round"/><line x1="9" y1="21" x2="9" y2="9" stroke-linecap="round"/>`,

  // Magnifying glass
  scan: `<circle cx="11" cy="11" r="8" stroke-linecap="round" stroke-linejoin="round"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-linecap="round"/>`,

  // Star / verdict
  judge: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Floppy disk / save
  save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke-linecap="round" stroke-linejoin="round"/><polyline points="17 21 17 13 7 13 7 21" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 3 7 8 15 8" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Layers / pattern stack
  pattern: `<polygon points="12 2 2 7 12 12 22 7 12 2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2 17 12 22 22 17" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2 12 12 17 22 12" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Bell
  bell: `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Check mark
  check: `<polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round"/>`,

  // X / close
  x: `<line x1="18" y1="6" x2="6" y2="18" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke-linecap="round"/>`,

  // Arrow right
  'arrow-right': `<line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/><polyline points="12 5 19 12 12 19" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Info circle
  info: `<circle cx="12" cy="12" r="10" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="8" x2="12" y2="8" stroke-linecap="round"/><line x1="12" y1="12" x2="12" y2="16" stroke-linecap="round"/>`,

  // Sparkles (three stars)
  sparkles: `<path d="M12 3v2m0 14v2M5.636 5.636l1.414 1.414m9.9 9.9 1.414 1.414M3 12h2m14 0h2M5.636 18.364l1.414-1.414m9.9-9.9 1.414-1.414" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round"/>`,
};
