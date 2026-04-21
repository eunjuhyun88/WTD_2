/**
 * Indicator Registry — type surface
 *
 * Design contract: docs/domains/indicator-registry.md
 * Work item:       work/active/W-0122-free-indicator-stack.md
 *
 * Everything the UI renders about a market signal flows through this surface.
 * An IndicatorDef is the *metadata* (what is this thing, how to render it),
 * and an IndicatorValue is the *data* (current reading from engine).
 */

// ── Family ───────────────────────────────────────────────────────────────────

export type IndicatorFamily =
  | 'PriceAction'
  | 'OI'
  | 'Funding'
  | 'CVD'
  | 'Volume'
  | 'Orderbook'
  | 'Liquidations'
  | 'Premium'
  | 'SmartMoney'
  | 'COT'
  | 'Volatility'
  | 'MovingAverage'
  | 'Structure'
  | 'RelativeStrength'
  | 'Options'
  | 'Netflow'
  | 'Social';

// ── Archetype (UI rendering strategy) ────────────────────────────────────────

/**
 * A  — Percentile Gauge + Sparkline (1D value + trajectory)  [unipolar/bipolar]
 * B  — Actor-Stratified Multi-Line (value × actor)
 * C  — Price × Time Heatmap (intensity on 2D grid)
 * D  — Divergence Indicator (correlation between two series)
 * E  — Regime Badge + Flip Clock (state + timing)
 * F  — Venue Divergence Strip (mini multi-line per venue)
 * G  — Term-Structure Curve (value vs tenor/strike)
 * H  — Flow Sankey / Net-Arrow (source→sink with magnitude)
 * I  — Distribution Histogram (bucket distribution with marker)
 * J  — Event Timeline (discrete timestamped events)
 */
export type IndicatorArchetype = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

// ── Natural dimensions a given indicator can be sliced on ────────────────────

export type Dimension =
  | 'horizon'      // 1h / 4h / 24h / 7d
  | 'venue'        // binance / bybit / okx / coinbase / deribit
  | 'actor'        // retail / mid / whale / commercial / spec
  | 'percentile'   // rolling window percentile
  | 'price_level'  // for heatmaps
  | 'strike'       // options
  | 'expiry'       // options
  | 'side'         // long/short/buy/sell
  | 'regime';

// ── Data provider ────────────────────────────────────────────────────────────

export type Provider =
  | 'binance'
  | 'bybit'
  | 'okx'
  | 'deribit'
  | 'coinbase'
  | 'coinalyze'
  | 'arkham'
  | 'glassnode'
  | 'lunarcrush'
  | 'cftc'
  | 'onchain'
  | 'derived'; // computed client-side or engine-side from other indicators

// ── IndicatorDef — declarative metadata ──────────────────────────────────────

export interface IndicatorDef {
  /** Unique, snake_case */
  id: string;

  family: IndicatorFamily;

  archetype: IndicatorArchetype;

  dimensions: Dimension[];

  source: {
    provider: Provider;
    endpoint?: string;
    stream?: string;
    auth?: 'public' | 'api_key' | 'paid';
  };

  /** Color/alert thresholds on percentile scale (0-100). */
  thresholds?: {
    warn: number;        // e.g. 75 → amber mild
    extreme: number;     // e.g. 95 → amber strong
    historical?: number; // e.g. 99 → solid + pulse
  };

  /** Render priority (lower first). */
  priority: 0 | 1 | 2 | 3;

  /** Default visibility in UI (user can toggle). */
  defaultVisible: boolean;

  /** Related building-block ids — consumed by Confluence Engine. */
  relatedBlocks?: string[];

  /** Short human description — rendered in tooltip. */
  description?: string;

  /** Display label — short, UPPER or lowercase for mono style. */
  label?: string;

  /** Unit suffix for the displayed value. */
  unit?: '%' | 'x' | 'USD' | 'σ' | '' | string;

  // ── AI search / discovery ─────────────────────────────────────────────────

  /**
   * Synonyms for fuzzy search. Include common abbreviations, Korean terms,
   * and alternative names users might say (e.g. "펀딩", "funding rate", "fr").
   */
  aiSynonyms?: string[];

  /**
   * Example natural-language queries that should surface this indicator.
   * Used by AIPanel.convertPromptToSetup() for intent matching.
   */
  aiExampleQueries?: string[];

  /**
   * Primary visual archetype (replaces bare `archetype` — backward-compat alias kept).
   * Determines the default rendering component.
   */
  primaryArchetype?: IndicatorArchetype;

  /**
   * Alternative archetypes the user can switch to via IndicatorSettingsSheet.
   */
  alternateArchetypes?: IndicatorArchetype[];
}

// ── IndicatorValue — live data from engine ───────────────────────────────────

/** Heatmap cell (Archetype C) */
export interface HeatmapCell {
  priceBucket: number;
  timeBucket: number;
  intensity: number; // USD or count
  side?: 'long' | 'short' | 'bid' | 'ask';
  venue?: string;
}

/** Venue row (Archetype F) */
export interface VenueSeriesRow {
  venue: string;
  label?: string;
  current: number;
  sparkline?: number[];
  highlight?: boolean; // amber if this venue is the most extreme
}

/** Stratified actor row (Archetype B) */
export interface ActorSeriesRow {
  actor: string;
  label?: string;
  series: number[]; // normalized 0-1 over lookback window
}

/** Regime state (Archetype E) */
export interface RegimeState {
  label: string;      // 'FLIP' / 'EXTREME' / 'NORMAL' / 'SQUEEZE'
  direction: 'bull' | 'bear' | 'neutral';
  flippedAt?: string; // ISO timestamp
  persistedBars?: number;
}

/** Divergence state (Archetype D) */
export interface DivergenceState {
  type: 'bullish' | 'bearish' | 'aligned' | 'unknown';
  barsSince: number;
  strength: number;    // 0-1
  rankPercentile?: number;
}

export interface IndicatorValue {
  /** Archetype-specific current value */
  current:
    | number                              // A, E (value part)
    | VenueSeriesRow[]                    // F
    | ActorSeriesRow[]                    // B
    | HeatmapCell[]                       // C
    | DivergenceState                     // D
    | RegimeState                         // E (state part)
    | Record<string, number>;             // general

  /** Archetype A, D — percentile band position */
  percentile?: { value: number; window: '30d' | '90d' | '1y' };

  /** Archetype A — 24h / rolling trajectory for sparkline */
  sparkline?: number[];

  /** Archetype E — supplemental regime state */
  state?: RegimeState;

  /** Unix ms — when this reading was computed */
  at: number;
}

// ── Threshold helpers ────────────────────────────────────────────────────────

export type ThresholdTier = 'neutral' | 'warn' | 'extreme' | 'historical';

export function classifyPercentile(
  pct: number,
  thresholds: IndicatorDef['thresholds']
): ThresholdTier {
  if (!thresholds) return 'neutral';
  const abs = Math.abs(pct - 50) * 2; // fold around 50 (both tails are extreme)
  if (thresholds.historical != null && abs >= thresholds.historical) return 'historical';
  if (abs >= thresholds.extreme) return 'extreme';
  if (abs >= thresholds.warn) return 'warn';
  return 'neutral';
}
