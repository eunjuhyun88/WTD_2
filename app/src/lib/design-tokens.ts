/**
 * Centralized design tokens for W-0374 (Bloomberg UX redesign)
 *
 * Single source of truth for the cogochi shell's chrome dimensions, color
 * palette, spacing, typography, z-index, and motion. Values mirror the CSS
 * custom properties defined in `app/src/routes/cogochi/+page.svelte` so the
 * runtime CSS and TypeScript constants stay in sync.
 *
 * Phase D-0 — see `work/active/PHASE-D0-LAYOUT-GRID.md`.
 */

// ── Layout dimensions (px unless noted) ──
export const LAYOUT = {
  topBar: 48,           // Top navigation bar
  newsFlash: 28,        // News ticker / alerts strip
  statusBar: 32,        // Bottom status bar
  tabBar: 28,
  chartToolbar: 36,
  paneInfoBar: 24,
  drawingToolbar: 40,

  // Side panes
  sidebarFolded: 56,
  sidebarExpanded: 200,
  aiPanelDefault: 320,
  aiPanelExpanded: 480,

  // Available chart height = 100dvh − topBar − newsFlash − statusBar
  chart: `calc(100dvh - ${48 + 28 + 32}px)`,
} as const;

// ── Color palette (matches CSS vars in cogochi/+page.svelte) ──
export const COLORS = {
  // Neutral scale (warm dark → light)
  g0: '#060504',  // Deepest background
  g1: '#0c0a09',  // Panels
  g2: '#131110',  // Hover surfaces
  g3: '#1c1918',  // Subtle borders
  g4: '#272320',  // Borders
  g5: '#3d3830',  // Mid-light borders
  g6: '#706a62',  // Tertiary text
  g7: '#a8a09a',  // Secondary text
  g8: '#cec9c4',  // Primary text
  g9: '#eceae8',  // Headings / strong

  // Brand (warm pink, Cogochi accent)
  brand:   '#ff7f85',
  brandD:  '#3a1618',
  brandDD: '#120507',

  // Semantic — bullish
  pos:   '#34c470',
  posD:  '#0d3e22',
  posDD: '#04110a',

  // Semantic — bearish
  neg:   '#e85555',
  negD:  '#4a1818',
  negDD: '#130606',

  // Semantic — warning / amber
  amb:   '#d4a442',
  ambD:  '#3a2d10',
  ambDD: '#110c04',
} as const;

// ── Spacing scale (4px base) ──
export const SPACING = {
  xs:   '2px',
  sm:   '4px',
  md:   '8px',
  lg:   '12px',
  xl:   '16px',
  xxl:  '24px',
  xxxl: '32px',
} as const;

// ── Border radius ──
export const RADIUS = {
  none: '0px',
  sm:   '2px',
  md:   '4px',
  lg:   '8px',
  pill: '999px',
} as const;

// ── Typography ──
export const FONTS = {
  mono:    "'JetBrains Mono', monospace",
  body:    "'Space Grotesk', sans-serif",
  display: "'Bebas Neue', sans-serif",
} as const;

// ── Z-index layers ──
export const Z_INDEX = {
  hidden:        -1,
  base:           0,
  panel:         10,
  sticky:        50,
  header:       100,
  dropdown:     150,
  modalBackdrop:200,
  modal:        210,
  notification: 300,
  toast:        310,
  tooltip:      400,
} as const;

// ── Motion ──
export const TRANSITIONS = {
  fast:   '0.08s ease-out',
  normal: '0.12s ease-out',
  slow:   '0.20s ease-out',
} as const;

// Convenience: typed chrome heights for layout math.
export const CHROME_HEIGHT_PX = LAYOUT.topBar + LAYOUT.newsFlash + LAYOUT.statusBar;
