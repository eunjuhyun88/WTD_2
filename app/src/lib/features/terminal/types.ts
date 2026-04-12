// ═══════════════════════════════════════════════════════════════
// Stockclaw — Terminal feature public types
// ═══════════════════════════════════════════════════════════════
//
// This is the first file of the `src/lib/features/terminal/` layer,
// the canonical surface boundary for the terminal domain per the
// repo-wide refactor design (W4) and the three-pipeline integration
// design (Phase 4).
//
// Scope of this file
// ------------------
// Pure TypeScript types shared by ANY terminal-like surface:
//   - `/terminal`            (currently 1660 LOC, canonical target)
//   - `/terminal-legacy`     (currently 3453 LOC, migration-only)
//   - `/cogochi/scanner`     (currently 1634 LOC, will become a
//                             branded wrapper over the same
//                             controller stack)
//
// The three route shells currently duplicate these type definitions
// inline. They will be migrated to import from here in subsequent
// slices of the terminal convergence workstream.
//
// What this file does NOT contain
// -------------------------------
// - Controller functions (see `./controllers/`)
// - Runtime SSE plumbing (separate slice)
// - Widget renderers (they remain owned by `src/components/terminal/`)
// - Route-local state (each shell keeps its own `$state()`)
//
// Rule
// ----
// Adding a new terminal surface means reusing these types, not
// inventing new ones. New fields land in this file and flow into
// all consumers by barrel import.

// ---------------------------------------------------------------------------
// Message-level types (conversational feed)
// ---------------------------------------------------------------------------

/** A single chat turn in the terminal feed. */
export type TerminalMessage =
	| { role: 'user'; text: string }
	| { role: 'douni'; text: string; widgets?: TerminalWidget[] }
	| { role: 'douni'; thinking: true };

/**
 * Widget variants the terminal may render inline beneath a message.
 * Each variant is a discriminated union so a consumer can switch on
 * `type` safely and exhaustively.
 */
export type TerminalWidget =
	| { type: 'chart'; symbol: string; timeframe: string; chartData?: unknown[] }
	| { type: 'metrics'; items: TerminalMetricItem[] }
	| {
			type: 'layers';
			items: TerminalLayerItem[];
			alphaScore: number;
			alphaLabel: string;
	  }
	| {
			type: 'actions';
			patternName: string;
			direction: 'LONG' | 'SHORT';
			conditions: string[];
	  }
	| { type: 'scan_list'; items: unknown[]; sort: string; sector: string };

export interface TerminalMetricItem {
	title: string;
	value: string;
	subtext: string;
	trend: 'bull' | 'bear' | 'neutral' | 'danger';
	chartData: number[];
}

export interface TerminalLayerItem {
	id: string;
	name: string;
	value: string;
	score: number;
}

// ---------------------------------------------------------------------------
// Feed entry types (controller-emitted stream of events)
// ---------------------------------------------------------------------------

/**
 * A single entry in the chronological feed rendered by the terminal
 * UI. The controller layer emits these as SSE events are parsed so
 * the view component can push them to its local state without any
 * orchestration logic of its own.
 */
export type TerminalFeedEntry =
	| { kind: 'query'; text: string }
	| { kind: 'text'; text: string }
	| { kind: 'thinking' }
	| { kind: 'metrics'; items: TerminalMetricItem[] }
	| {
			kind: 'layers';
			items: TerminalLayerItem[];
			alphaScore: number;
			alphaLabel: string;
	  }
	| { kind: 'scan'; items: unknown[]; sort: string; sector: string }
	| {
			kind: 'actions';
			patternName: string;
			direction: 'LONG' | 'SHORT';
			conditions: string[];
	  }
	| { kind: 'chart_ref'; symbol: string; timeframe: string };

// ---------------------------------------------------------------------------
// SSE transport types
// ---------------------------------------------------------------------------
//
// These mirror the server-emitted event shapes on
// `/api/cogochi/terminal/message`. They are duplicated across three
// route shells today; consolidating them here is the first
// precondition for the controller extraction slice.

export type TerminalSSEEvent =
	| { type: 'text_delta'; text: string }
	| { type: 'tool_call'; name: string; args: Record<string, unknown> }
	| { type: 'tool_result'; name: string; data: unknown }
	| {
			type: 'layer_result';
			layer: string;
			score: number;
			signal: string;
			detail?: string;
	  }
	| { type: 'chart_action'; action: string; payload: Record<string, unknown> }
	| {
			type: 'pattern_draft';
			name: string;
			conditions: unknown[];
			requiresConfirmation: boolean;
	  }
	| { type: 'done'; provider: string; totalTokens?: number }
	| { type: 'error'; message: string };
