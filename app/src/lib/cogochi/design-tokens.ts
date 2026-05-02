// Design tokens for Cogochi terminal (W-0374 Bloomberg UX)
// Centralized color, spacing, sizing, and animation constants

export const COLORS = {
  // Neutral grays
  g0: '#060504',
  g1: '#0c0a09',
  g2: '#131110',
  g3: '#1c1918',
  g4: '#272320',
  g5: '#3d3830',
  g6: '#706a62',
  g7: '#a8a09a',
  g8: '#cec9c4',
  g9: '#eceae8',

  // Brand colors
  brand: '#ff7f85',
  brandDark: '#3a1618',
  brandDarker: '#120507',

  // Semantic
  pos: '#34c470',     // bullish
  posDark: '#0d3e22',
  posLight: '#04110a',

  neg: '#e85555',     // bearish
  negDark: '#4a1818',
  negLight: '#130606',

  amb: '#d4a442',     // amber (alert)
  ambDark: '#3a2d10',
  ambLight: '#110c04',
};

export const SPACING = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  '3xl': '32px',
};

export const RADIUS = {
  none: '0px',
  sm: '2px',
  md: '4px',
  lg: '8px',
};

export const SIZES = {
  // Z-index layers
  zDropdown: 100,
  zModal: 200,
  zToast: 300,

  // Chrome sizes (heights)
  topBar: 48,
  newsFlash: 28,
  statusBar: 32,
  tabBar: 28,
  chartToolbar: 36,
  paneInfoBar: 24,

  // Panel sizes (widths)
  sidebarFolded: 56,
  sidebarExpanded: 200,
  aiPanelDefault: 320,
  aiPanelExpanded: 480,
  drawingToolbar: 40,
};

export const TRANSITIONS = {
  fast: '0.08s',
  normal: '0.12s',
  slow: '0.2s',
};

export const Z_INDEX = {
  appShell: 1,
  sidebar: 10,
  canvas: 20,
  aiPane: 30,
  splitter: 40,
  dropdown: SIZES.zDropdown,
  modal: SIZES.zModal,
  toast: SIZES.zToast,
};
