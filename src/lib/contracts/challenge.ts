/**
 * Challenge — Shared Contract (PR1 scope)
 *
 * A "challenge" is the Day-1 replacement for the old `Pattern` concept. It is
 * the on-disk output of the WTD `wizard.new_pattern` composer, specifically
 * the `answers.yaml` v1 document described in `docs/COGOCHI.md § 11.4`.
 *
 * This module owns three related shapes:
 *
 *   1. ParsedBlock      — one entry in a parsed search query (role-tagged)
 *   2. ParsedQuery      — the full output of `blockSearchParser`
 *   3. ChallengeAnswers — the canonical `answers.yaml` v1 document the
 *                         `/api/wizard` endpoint composes and returns
 *
 * Scope discipline (PR1, Zoom #1):
 *   - No subprocess wiring, no filesystem writes, no WTD runtime calls
 *   - Pure Zod, zero imports from engine / server-only modules
 *   - Safe to import from both client and server code paths
 *
 * Spec source of truth:
 *   docs/COGOCHI.md § 8.1 `/terminal` — Observe + Compose (search query is the wizard)
 *   docs/COGOCHI.md § 11.4 Challenge (user-saved pattern, replaces old `Pattern`)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive sub-schemas
// ---------------------------------------------------------------------------

/**
 * Timeframe subset accepted by the WTD pattern-hunting schema.
 *
 * Intentionally narrower than `TimeframeSchema` from `./verdict.ts` because
 * PR1 only exercises 1h/4h/1d — the spot-only building_blocks are validated
 * on these cadences. 1m/5m/15m are parseable by the engine but not meaningful
 * for a challenge composer yet.
 */
export const ChallengeTimeframeSchema = z.enum(['1h', '4h', '1d']);
export type ChallengeTimeframe = z.infer<typeof ChallengeTimeframeSchema>;

/**
 * Trading direction. `long` / `short` only; neutral is meaningless for a
 * pattern evaluation.
 */
export const DirectionSchema = z.enum(['long', 'short']);
export type Direction = z.infer<typeof DirectionSchema>;

/**
 * Role of a block inside the composed pattern.
 *
 *   trigger — required, exactly 1
 *   confirm — 0..3 AND filters layered on top of the trigger
 *   entry   — 0..1 bar-shape filter
 *   disq    — 0..3 disqualifier AND-NOTs
 *
 * Composition rule: `pattern = trigger ∧ conf₁..n ∧ entry ∧ ¬disq₁..m`
 */
export const BlockRoleSchema = z.enum(['trigger', 'confirm', 'entry', 'disq']);
export type BlockRole = z.infer<typeof BlockRoleSchema>;

/**
 * Parameter values a WTD building_block accepts. The composer only emits
 * primitives; no nested objects or arrays in Day-1.
 */
export const BlockParamValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type BlockParamValue = z.infer<typeof BlockParamValueSchema>;

export const BlockParamsSchema = z.record(BlockParamValueSchema);
export type BlockParams = z.infer<typeof BlockParamsSchema>;

/**
 * Slug — challenge identifier inside `WTD/challenges/pattern-hunting/<slug>/`.
 * Constrained to the filesystem-safe ASCII set so that PR2 can pass it
 * directly to `python -m wizard.new_pattern` without escaping.
 */
export const ChallengeSlugSchema = z
	.string()
	.regex(/^[a-z0-9-]{3,64}$/, 'slug must be 3-64 chars of a-z, 0-9, and -');
export type ChallengeSlug = z.infer<typeof ChallengeSlugSchema>;

// ---------------------------------------------------------------------------
// Parser output schemas
// ---------------------------------------------------------------------------

/**
 * One parsed block inside a `ParsedQuery`.
 *
 * `source_token` is retained for debugging / UI hint rendering so the user
 * can see which slice of their query produced which block. It is NOT part of
 * the canonical `answers.yaml` payload — it is dropped during composition.
 */
export const ParsedBlockSchema = z.object({
	role: BlockRoleSchema,
	module: z.string().min(1),
	function: z.string().min(1),
	params: BlockParamsSchema,
	source_token: z.string()
});
export type ParsedBlock = z.infer<typeof ParsedBlockSchema>;

/**
 * The full result of `parseBlockSearch(input)`.
 *
 * `confidence` is `high` iff at least one trigger was matched. Consumers
 * should treat `low` as "don't auto-open modal" — fall through to the LLM
 * SSE path instead (handled in `/terminal/+page.svelte`, not here).
 */
export const ParsedQuerySchema = z.object({
	raw: z.string(),
	symbol: z.string().nullable(),
	timeframe: ChallengeTimeframeSchema.nullable(),
	direction: DirectionSchema.nullable(),
	blocks: z.array(ParsedBlockSchema),
	confidence: z.enum(['high', 'low'])
});
export type ParsedQuery = z.infer<typeof ParsedQuerySchema>;

// ---------------------------------------------------------------------------
// Canonical `answers.yaml` v1 shape
// ---------------------------------------------------------------------------

/**
 * A single block entry as it appears in `answers.yaml`. Identical to
 * `ParsedBlock` minus `role` (role is encoded structurally via where the
 * entry lives inside the `blocks` object) and minus `source_token`.
 */
export const ChallengeBlockEntrySchema = z.object({
	module: z.string().min(1),
	function: z.string().min(1),
	params: BlockParamsSchema
});
export type ChallengeBlockEntry = z.infer<typeof ChallengeBlockEntrySchema>;

/**
 * `blocks:` section of `answers.yaml`. Structural role encoding:
 *
 *   trigger        — exactly 1 (required)
 *   confirmations  — 0..3
 *   entry          — 0..1 (nullable)
 *   disqualifiers  — 0..3
 */
export const ChallengeBlocksSchema = z.object({
	trigger: ChallengeBlockEntrySchema,
	confirmations: z.array(ChallengeBlockEntrySchema).max(3),
	entry: ChallengeBlockEntrySchema.nullable(),
	disqualifiers: z.array(ChallengeBlockEntrySchema).max(3)
});
export type ChallengeBlocks = z.infer<typeof ChallengeBlocksSchema>;

/**
 * `setup:` section — the universe + direction + timeframe context.
 *
 * `universe` is a string key understood by WTD's symbol universe loader
 * (e.g. `binance_30` for top-30 Binance spot pairs). Day-1 default is
 * `binance_30`; other values are opaque to PR1 but validated here for
 * forward compatibility.
 */
export const ChallengeSetupSchema = z.object({
	direction: DirectionSchema,
	universe: z.string().min(1),
	timeframe: ChallengeTimeframeSchema
});
export type ChallengeSetup = z.infer<typeof ChallengeSetupSchema>;

/**
 * `identity:` section — slug + human description.
 */
export const ChallengeIdentitySchema = z.object({
	name: ChallengeSlugSchema,
	description: z.string().min(1).max(280)
});
export type ChallengeIdentity = z.infer<typeof ChallengeIdentitySchema>;

/**
 * `outcome:` section — evaluation target for `prepare.py evaluate`.
 *
 * Defaults (per COGOCHI § 11.4 yaml example):
 *   target_pct   = 0.06   (6% upside target)
 *   stop_pct     = 0.02   (2% downside stop)
 *   horizon_bars = 24     (24 bars forward, timeframe-relative)
 */
export const ChallengeOutcomeSchema = z.object({
	target_pct: z.number().positive().max(1),
	stop_pct: z.number().positive().max(1),
	horizon_bars: z.number().int().positive().max(1000)
});
export type ChallengeOutcome = z.infer<typeof ChallengeOutcomeSchema>;

/**
 * Top-level `answers.yaml` v1 document.
 *
 * PR1 stability guarantee: once this schema lands, the `/api/wizard` endpoint
 * returns values that serialize into a valid `answers.yaml` on the WTD side
 * without further transformation. PR2 (filesystem write) only needs to
 * yaml-dump this object; no shape changes.
 */
export const ChallengeAnswersSchemaVersion = 1 as const;

export const ChallengeAnswersSchema = z.object({
	version: z.literal(ChallengeAnswersSchemaVersion),
	schema: z.literal('pattern_hunting'),
	created_at: z.string().datetime({ offset: true }),
	identity: ChallengeIdentitySchema,
	setup: ChallengeSetupSchema,
	blocks: ChallengeBlocksSchema,
	outcome: ChallengeOutcomeSchema
});
export type ChallengeAnswers = z.infer<typeof ChallengeAnswersSchema>;

// ---------------------------------------------------------------------------
// Composition defaults (single source of truth)
// ---------------------------------------------------------------------------

/**
 * Default outcome values used by `/api/wizard` when the request body does
 * not override them. Matches the yaml example in COGOCHI § 11.4 verbatim.
 */
export const CHALLENGE_OUTCOME_DEFAULTS: ChallengeOutcome = Object.freeze({
	target_pct: 0.06,
	stop_pct: 0.02,
	horizon_bars: 24
});

/**
 * Default universe key. Day-1 only ships binance_30; PR2 can widen.
 */
export const CHALLENGE_UNIVERSE_DEFAULT = 'binance_30' as const;

/**
 * Default timeframe when the parser could not extract one from the query.
 */
export const CHALLENGE_TIMEFRAME_DEFAULT: ChallengeTimeframe = '1h';

// ---------------------------------------------------------------------------
// parse / safeParse helpers (mirrors verdict.ts convention)
// ---------------------------------------------------------------------------

export function parseParsedQuery(input: unknown): ParsedQuery {
	return ParsedQuerySchema.parse(input);
}

export function safeParseParsedQuery(input: unknown) {
	return ParsedQuerySchema.safeParse(input);
}

export function parseChallengeAnswers(input: unknown): ChallengeAnswers {
	return ChallengeAnswersSchema.parse(input);
}

export function safeParseChallengeAnswers(input: unknown) {
	return ChallengeAnswersSchema.safeParse(input);
}
