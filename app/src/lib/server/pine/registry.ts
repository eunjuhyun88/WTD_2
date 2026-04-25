// ═══════════════════════════════════════════════════════════════
// Pine Template Registry
// ═══════════════════════════════════════════════════════════════
//
// Catalog of WTD-curated Pine Script v6 templates. Each template:
//  • is hand-validated to compile in TradingView
//  • exposes named {{slot}} variables for WTD analysis output
//  • declares its required slots (engine fails fast if missing)
//
// Adding a new template: drop a .pine file in ./templates/ and
// register its metadata here.

export type PineSlotType = 'string' | 'number' | 'csv';

export interface PineSlotSpec {
  name: string;
  type: PineSlotType;
  required: boolean;
  default?: string | number;
  description: string;
}

export interface PineTemplateSpec {
  id: string;
  title: string;
  category: 'analysis' | 'flow' | 'compare' | 'news';
  description: string;
  /** Filename in ./templates/ (without path) */
  filename: string;
  /** Keywords for the regex-first intent classifier */
  keywords: string[];
  slots: PineSlotSpec[];
}

const COMMON_SLOTS: PineSlotSpec[] = [
  { name: 'symbol', type: 'string', required: true, description: 'Trading pair, e.g. BTCUSDT' },
  { name: 'generatedAt', type: 'string', required: false, default: '', description: 'ISO timestamp' },
];

export const TEMPLATES: PineTemplateSpec[] = [
  {
    id: 'wyckoff_overlay',
    title: 'Wyckoff Phase Overlay',
    category: 'analysis',
    description: 'Phase box (Accumulation / Markup / Reaccumulation / Distribution) with confidence label.',
    filename: 'wyckoff_overlay.pine',
    keywords: ['wyckoff', 'phase', 'accumulation', 'distribution', 'markup'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'phase', type: 'string', required: true, description: 'AC | MK | RE | DI' },
      { name: 'confidence', type: 'number', required: true, default: 0, description: 'Confidence 0..100' },
      { name: 'phaseHigh', type: 'number', required: true, default: 0, description: 'Box top price' },
      { name: 'phaseLow', type: 'number', required: true, default: 0, description: 'Box bottom price' },
      { name: 'phaseStartTs', type: 'number', required: true, default: 0, description: 'Bar index of phase start' },
    ],
  },
  {
    id: 'regime_gauge',
    title: 'Regime Background',
    category: 'analysis',
    description: 'Background-tinted regime state + trend strength gauge.',
    filename: 'regime_gauge.pine',
    keywords: ['regime', 'trend', 'range', 'breakout', 'background'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'regime', type: 'string', required: true, description: 'trend_up | trend_down | range | breakout' },
      { name: 'trendStrength', type: 'number', required: true, default: 0, description: '0..1' },
      { name: 'regimeHigh', type: 'number', required: false, default: 0, description: 'Range top (range regime only)' },
      { name: 'regimeLow', type: 'number', required: false, default: 0, description: 'Range bottom (range regime only)' },
    ],
  },
  {
    id: 'whale_liquidation_lines',
    title: 'Whale Liquidation Lines',
    category: 'flow',
    description: 'Top trader liquidation prices as horizontal lines (Hyperliquid).',
    filename: 'whale_liquidation_lines.pine',
    keywords: ['whale', 'liquidation', 'liq', 'hyperliquid', 'leaderboard'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'liquidations', type: 'csv', required: true, description: 'CSV "side|price|size|leverage"' },
    ],
  },
  {
    id: 'alpha_signal_markers',
    title: 'Alpha Signal Markers',
    category: 'analysis',
    description: 'WTD alpha signal events as arrow labels with score.',
    filename: 'alpha_signal_markers.pine',
    keywords: ['signal', 'alpha', 'entry', 'marker', 'arrow'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'signals', type: 'csv', required: true, description: 'CSV "ts|side|score|note"' },
    ],
  },
  {
    id: 'cvd_divergence',
    title: 'CVD Divergence',
    category: 'flow',
    description: 'Cumulative Volume Delta vs price divergence detector.',
    filename: 'cvd_divergence.pine',
    keywords: ['cvd', 'divergence', 'volume delta', 'flow'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'lookback', type: 'number', required: false, default: 50, description: 'Pivot lookback bars' },
    ],
  },
  {
    id: 'vpvr_zones',
    title: 'Volume Profile Zones',
    category: 'analysis',
    description: 'High/Low Volume Nodes and Point of Control.',
    filename: 'vpvr_zones.pine',
    keywords: ['vpvr', 'volume profile', 'hvn', 'lvn', 'poc'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'zones', type: 'csv', required: true, description: 'CSV "price|volume|kind"' },
    ],
  },
  {
    id: 'smart_money_zones',
    title: 'Smart Money Zones',
    category: 'flow',
    description: 'Accumulation / distribution zone boxes from on-chain + flow.',
    filename: 'smart_money_zones.pine',
    keywords: ['smart money', 'smc', 'accumulation', 'distribution zone'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'smcZones', type: 'csv', required: true, description: 'CSV "startTs|endTs|low|high|kind|conf"' },
    ],
  },
  {
    id: 'multi_asset_correlation',
    title: 'Multi-Asset Correlation Overlay',
    category: 'compare',
    description: 'Normalized comparison + rolling correlation against another symbol.',
    filename: 'multi_asset_correlation.pine',
    keywords: ['compare', 'correlation', 'btc', 'overlay', 'normalized'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'compareSymbol', type: 'string', required: true, description: 'Symbol to compare against' },
      { name: 'lookback', type: 'number', required: false, default: 100, description: 'Window length' },
    ],
  },
  {
    id: 'liquidation_heatmap',
    title: 'Liquidation Heatmap',
    category: 'flow',
    description: 'Color-graded horizontal lines at liquidation cluster prices.',
    filename: 'liquidation_heatmap.pine',
    keywords: ['heatmap', 'liquidation', 'cluster', 'density'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'heatmap', type: 'csv', required: true, description: 'CSV "price|intensity"' },
    ],
  },
  {
    id: 'news_event_markers',
    title: 'Macro & News Event Markers',
    category: 'news',
    description: 'Vertical lines + category-coded labels at major event times.',
    filename: 'news_event_markers.pine',
    keywords: ['news', 'macro', 'event', 'fed', 'cpi', 'fomc'],
    slots: [
      ...COMMON_SLOTS,
      { name: 'events', type: 'csv', required: true, description: 'CSV "ts|category|impact|title"' },
    ],
  },
];

export function getTemplate(id: string): PineTemplateSpec | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function listTemplates(): Pick<PineTemplateSpec, 'id' | 'title' | 'category' | 'description'>[] {
  return TEMPLATES.map(({ id, title, category, description }) => ({ id, title, category, description }));
}
