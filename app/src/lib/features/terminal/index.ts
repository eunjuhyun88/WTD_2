// ═══════════════════════════════════════════════════════════════
// Terminal feature barrel
// ═══════════════════════════════════════════════════════════════
//
// Public entry point for the terminal feature. Consumers (route
// shells, other features) import from `$lib/features/terminal`, not
// from internal sub-paths. This keeps the feature boundary stable
// while internal files are refactored.

export type {
	TerminalMessage,
	TerminalWidget,
	TerminalMetricItem,
	TerminalLayerItem,
	TerminalFeedEntry,
	TerminalSSEEvent
} from './types';

// Controllers barrel is intentionally not re-exported yet — it is
// empty and would widen the public surface before any controller
// exists. It will be added in the controller extraction slice.
