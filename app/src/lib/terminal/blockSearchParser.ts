/**
 * Block Search Parser — Zoom #1
 *
 * Converts a natural-language search query typed in `/terminal`'s bottom
 * input into a `ParsedQuery` mapped onto WTD `building_blocks.*` functions.
 *
 * Design discipline:
 *   - Pure function. No I/O, no LLM, no async. Safe to import anywhere.
 *   - Keyword-first. LLM fallback is Phase 2 per COGOCHI § 8.1.
 *   - Unknown tokens are silently ignored (surfaced via the sibling
 *     `unmatched` field returned by `parseBlockSearchWithHints`, not the
 *     canonical `ParsedQuery`).
 *   - Deterministic. Same input → same output, no randomness, no clock.
 *
 * Spec: docs/COGOCHI.md § 8.1 (Day-1 parser section)
 */

import {
	ParsedBlockSchema,
	ParsedQuerySchema,
	type BlockRole,
	type ChallengeTimeframe,
	type Direction,
	type ParsedBlock,
	type ParsedQuery
} from '../contracts/challenge.ts';

// ---------------------------------------------------------------------------
// NL → block dictionary
// ---------------------------------------------------------------------------

type BlockParamBuilder = (context: ParseContext) => Record<string, string | number | boolean>;

interface BlockDictEntry {
	/** Case-insensitive phrases that trigger this block. Order matters for priority. */
	phrases: string[];
	role: BlockRole;
	module: string;
	function: string;
	/** Builds default params; may read numeric context (pct, lookback bars, etc.). */
	buildParams: BlockParamBuilder;
}

interface ParseContext {
	/** Percentage (0..1) extracted nearest this phrase, if any. */
	pct: number | null;
	/** Lookback bars — explicit `N bars`, or `N days/일` converted with timeframe. */
	lookbackBars: number | null;
	/** Multiplier — `Nx` or `N배` form. */
	multiplier: number | null;
	/** Resolved timeframe (falls back to '1h' when unresolved). */
	timeframe: ChallengeTimeframe;
}

/**
 * Day-1 dictionary. Each entry gets matched at most once per parse. If the
 * user types multiple phrasings of the same block we prefer the first hit
 * and ignore the rest.
 */
const BLOCK_DICTIONARY: BlockDictEntry[] = [
	// --------------------- triggers ---------------------
	{
		phrases: ['recent rally', 'recent_rally', '상승', '랠리'],
		role: 'trigger',
		module: 'building_blocks.triggers',
		function: 'recent_rally',
		buildParams: (ctx) => ({
			pct: ctx.pct ?? 0.1,
			lookback_bars: ctx.lookbackBars ?? 72
		})
	},
	{
		phrases: ['recent drop', 'recent_drop', '하락', '폭락'],
		role: 'trigger',
		module: 'building_blocks.triggers',
		function: 'recent_drop',
		buildParams: (ctx) => ({
			pct: ctx.pct ?? 0.1,
			lookback_bars: ctx.lookbackBars ?? 72
		})
	},
	// --------------------- confirmations ---------------------
	{
		phrases: ['bollinger expansion', 'bb expansion', 'bollinger_expansion', '볼밴 확장', '볼린저 확장'],
		role: 'confirm',
		module: 'building_blocks.confirmations',
		function: 'bollinger_expansion',
		buildParams: (ctx) => ({
			expansion_factor: ctx.multiplier ?? 1.5,
			ago: 5
		})
	},
	{
		phrases: ['bollinger squeeze', 'bb squeeze', 'bollinger_squeeze', '볼밴 수축', '볼린저 수축'],
		role: 'confirm',
		module: 'building_blocks.confirmations',
		function: 'bollinger_squeeze',
		buildParams: () => ({
			threshold: 0.02
		})
	},
	// --------------------- entries ---------------------
	{
		phrases: ['long lower wick', 'lower wick', 'long_lower_wick', '긴 아래꼬리', '아래꼬리'],
		role: 'entry',
		module: 'building_blocks.entries',
		function: 'long_lower_wick',
		buildParams: (ctx) => ({
			body_ratio: ctx.multiplier ?? 1.5
		})
	},
	{
		phrases: ['long upper wick', 'upper wick', 'long_upper_wick', '긴 윗꼬리', '윗꼬리'],
		role: 'entry',
		module: 'building_blocks.entries',
		function: 'long_upper_wick',
		buildParams: (ctx) => ({
			body_ratio: ctx.multiplier ?? 1.5
		})
	},
	// --------------------- disqualifiers ---------------------
	{
		phrases: ['extreme volatility', 'extreme_volatility', '변동성 과열', 'atr 과열', '과열'],
		role: 'disq',
		module: 'building_blocks.disqualifiers',
		function: 'extreme_volatility',
		buildParams: () => ({
			atr_pct_threshold: 0.1
		})
	},
	{
		phrases: ['volume below avg', 'volume below average', 'volume_below_average', '거래량 저조', '거래량 부족'],
		role: 'disq',
		module: 'building_blocks.disqualifiers',
		function: 'volume_below_average',
		buildParams: () => ({
			ratio: 0.5
		})
	},
	{
		phrases: ['extended from ma', 'extended_from_ma', 'ma 괴리', '이평 괴리'],
		role: 'disq',
		module: 'building_blocks.disqualifiers',
		function: 'extended_from_ma',
		buildParams: () => ({
			ma: 20,
			threshold: 0.08
		})
	}
];

// ---------------------------------------------------------------------------
// Numeric extraction
// ---------------------------------------------------------------------------

/**
 * Extracts percentage (`10%`, `10 퍼센트`) → 0.10. Returns null if not found.
 * Only the first match wins. Percent values above 100 are rejected (likely a
 * typo, not an intended 500% rally).
 */
function extractPct(input: string): number | null {
	const match = input.match(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트|퍼)/);
	if (!match) return null;
	const value = Number.parseFloat(match[1]);
	if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
	return value / 100;
}

/**
 * Extracts multiplier (`5x`, `5배`) → 5.0. Returns null if not found.
 *
 * Uses a Unicode-aware negative lookahead instead of `\b` so the Korean
 * suffix `배` ends at space / end-of-string correctly — `\b` is
 * ASCII-word-only and never fires after a Hangul syllable (PR2 smoke).
 */
function extractMultiplier(input: string): number | null {
	const match = input.match(/(\d+(?:\.\d+)?)\s*(?:x|배)(?![\p{L}\p{N}_])/iu);
	if (!match) return null;
	const value = Number.parseFloat(match[1]);
	if (!Number.isFinite(value) || value <= 0) return null;
	return value;
}

/**
 * Extracts a days-or-bars quantity and converts to bars given the timeframe.
 *
 *   "3 days" / "3일"      → 72 bars (1h) / 18 (4h) / 3 (1d)
 *   "5 bars" / "5봉"      → 5 (raw)
 *   "72 lookback"         → 72 (raw)
 *
 * Returns null if not found. Bars > 1000 are rejected as implausible.
 */
function extractLookbackBars(input: string, timeframe: ChallengeTimeframe): number | null {
	// Prefer explicit bars first.
	const barsMatch = input.match(/(\d+)\s*(?:bars?|봉|lookback)/i);
	if (barsMatch) {
		const value = Number.parseInt(barsMatch[1], 10);
		if (Number.isFinite(value) && value > 0 && value <= 1000) return value;
	}

	// Then days. Unicode lookahead instead of `\b` so `일` ends at whitespace
	// or end-of-string — `\b` is ASCII-only (PR2 smoke).
	const daysMatch = input.match(/(\d+)\s*(?:days?|일)(?![\p{L}\p{N}_])/iu);
	if (daysMatch) {
		const days = Number.parseInt(daysMatch[1], 10);
		if (!Number.isFinite(days) || days <= 0 || days > 365) return null;
		const barsPerDay = timeframe === '1h' ? 24 : timeframe === '4h' ? 6 : 1;
		const bars = days * barsPerDay;
		return bars > 1000 ? 1000 : bars;
	}

	return null;
}

// ---------------------------------------------------------------------------
// Symbol / timeframe / direction extraction
// ---------------------------------------------------------------------------

// Unicode-aware token boundaries so Korean aliases (`1시간`, `4시간`, `일봉`)
// terminate correctly. `\b` is ASCII-word-only and silently fails after any
// Hangul syllable (PR2 smoke).
const TF_BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
const TF_BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';
const TIMEFRAME_PATTERNS: Array<[RegExp, ChallengeTimeframe]> = [
	[new RegExp(`${TF_BOUNDARY_BEFORE}(1h|1시간)${TF_BOUNDARY_AFTER}`, 'iu'), '1h'],
	[new RegExp(`${TF_BOUNDARY_BEFORE}(4h|4시간)${TF_BOUNDARY_AFTER}`, 'iu'), '4h'],
	[new RegExp(`${TF_BOUNDARY_BEFORE}(1d|일봉|daily)${TF_BOUNDARY_AFTER}`, 'iu'), '1d']
];

function extractTimeframe(input: string): ChallengeTimeframe | null {
	for (const [pattern, tf] of TIMEFRAME_PATTERNS) {
		if (pattern.test(input)) return tf;
	}
	return null;
}

function extractDirection(input: string): Direction | null {
	const lower = input.toLowerCase();
	// Short wins over long if both are present because "long short ratio" is
	// a false positive for long; we prefer the user's explicit 'short' token.
	//
	// Unicode-aware boundaries so `롱` / `숏` / `상승` / `하락` end at whitespace
	// or end-of-string — `\b` is ASCII-only and silently fails for Hangul
	// (PR2 smoke).
	if (/(?<![\p{L}\p{N}_])(short|숏|하락)(?![\p{L}\p{N}_])/u.test(lower)) return 'short';
	if (/(?<![\p{L}\p{N}_])(long|롱|상승)(?![\p{L}\p{N}_])/u.test(lower)) return 'long';
	return null;
}

/**
 * Matches `BTCUSDT`, `BTC`, `ETH` etc. If a bare 3-6 letter symbol without
 * USDT suffix is found (e.g. `BTC`), we append `USDT` to match Binance's
 * convention used by WTD's `binance_30` universe.
 */
function extractSymbol(input: string): string | null {
	// Longest match first: try <SYMBOL>USDT before bare <SYMBOL>
	const usdtMatch = input.match(/\b([A-Z]{2,6})USDT\b/);
	if (usdtMatch) return `${usdtMatch[1]}USDT`;

	// Bare symbol — must be all-caps to avoid matching random English words.
	// Exclude common noise: RSI, BB, MA, ATR, CVD, etc.
	const NOISE = new Set([
		'RSI',
		'BB',
		'MA',
		'ATR',
		'CVD',
		'EMA',
		'SMA',
		'OBV',
		'OI',
		'MACD',
		'HTF',
		'LTF'
	]);
	const bareMatch = input.match(/\b([A-Z]{3,6})\b/);
	if (bareMatch && !NOISE.has(bareMatch[1])) {
		return `${bareMatch[1]}USDT`;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Phrase matching
// ---------------------------------------------------------------------------

/**
 * Returns the index of the first phrase that matches inside `input`, or -1.
 * Case-insensitive for ASCII; Korean phrases are matched as literal
 * substrings (Korean has no case).
 */
function indexOfPhrase(input: string, phrase: string): number {
	const lowerInput = input.toLowerCase();
	const lowerPhrase = phrase.toLowerCase();
	return lowerInput.indexOf(lowerPhrase);
}

/**
 * Drop-in deduper so the same block can't be added twice from two different
 * phrasings of the same thing (e.g. `"recent rally"` and `"랠리"`).
 */
function alreadyHas(blocks: ParsedBlock[], module: string, fn: string): boolean {
	return blocks.some((b) => b.module === module && b.function === fn);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse a natural-language query into a `ParsedQuery`.
 *
 * Callers that want the unmatched-tokens hint for the UI should use
 * `parseBlockSearchWithHints` instead.
 */
export function parseBlockSearch(input: string): ParsedQuery {
	return parseBlockSearchWithHints(input).query;
}

export interface ParseWithHints {
	query: ParsedQuery;
	/** Raw phrases we could not map; surfaced only for UI hinting. */
	unmatched: string[];
}

export function parseBlockSearchWithHints(input: string): ParseWithHints {
	const raw = input ?? '';
	const trimmed = raw.trim();

	// Fast path for empty / whitespace-only input.
	if (trimmed.length === 0) {
		const emptyQuery: ParsedQuery = {
			raw,
			symbol: null,
			timeframe: null,
			direction: null,
			blocks: [],
			confidence: 'low'
		};
		return { query: ParsedQuerySchema.parse(emptyQuery), unmatched: [] };
	}

	// Extract structural context first — these affect param defaults inside
	// the dictionary lookup.
	const timeframe = extractTimeframe(trimmed);
	const direction = extractDirection(trimmed);
	const symbol = extractSymbol(trimmed);
	const pct = extractPct(trimmed);
	const multiplier = extractMultiplier(trimmed);
	const effectiveTimeframe: ChallengeTimeframe = timeframe ?? '1h';
	const lookbackBars = extractLookbackBars(trimmed, effectiveTimeframe);

	const ctx: ParseContext = {
		pct,
		lookbackBars,
		multiplier,
		timeframe: effectiveTimeframe
	};

	// Walk the dictionary; for each entry, take the first matching phrase.
	const blocks: ParsedBlock[] = [];
	const matchedPhrases = new Set<string>();

	for (const entry of BLOCK_DICTIONARY) {
		for (const phrase of entry.phrases) {
			if (indexOfPhrase(trimmed, phrase) >= 0) {
				if (!alreadyHas(blocks, entry.module, entry.function)) {
					const block: ParsedBlock = {
						role: entry.role,
						module: entry.module,
						function: entry.function,
						params: entry.buildParams(ctx),
						source_token: phrase
					};
					// Validate eagerly so a broken dictionary entry fails loud.
					blocks.push(ParsedBlockSchema.parse(block));
					matchedPhrases.add(phrase.toLowerCase());
				}
				break;
			}
		}
	}

	// Confidence: at least one trigger must be present.
	const triggerCount = blocks.filter((b) => b.role === 'trigger').length;
	const confidence: 'high' | 'low' = triggerCount >= 1 ? 'high' : 'low';

	// Unmatched: list of whitespace-separated tokens (length ≥ 2) that did not
	// feed any matched phrase. Best-effort only; purely for UI debugging.
	const tokens = trimmed
		.split(/\s+/)
		.filter((t) => t.length >= 2)
		.map((t) => t.toLowerCase());
	const unmatched = tokens.filter(
		(token) =>
			!Array.from(matchedPhrases).some((p) => p.includes(token) || token.includes(p))
	);

	const query: ParsedQuery = {
		raw,
		symbol,
		timeframe,
		direction,
		blocks,
		confidence
	};

	return {
		query: ParsedQuerySchema.parse(query),
		unmatched
	};
}

// ---------------------------------------------------------------------------
// UI summary helper
// ---------------------------------------------------------------------------

/**
 * Builds a short one-line summary string from a ParsedQuery for the UI hint
 * under the query input. Example: `1 trigger · 2 conf · 1 entry · 0 disq`.
 *
 * Returns an empty string for an empty query so the hint span can be hidden
 * without a conditional in the template.
 */
export function summarizeParsedQuery(query: ParsedQuery): string {
	if (query.blocks.length === 0) return '';
	const by = (role: BlockRole) => query.blocks.filter((b) => b.role === role).length;
	const parts = [
		`${by('trigger')} trigger`,
		`${by('confirm')} conf`,
		`${by('entry')} entry`,
		`${by('disq')} disq`
	];
	return parts.join(' · ');
}
