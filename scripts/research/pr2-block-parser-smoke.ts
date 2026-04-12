/**
 * PR2 — blockSearchParser smoke harness (Zoom #1 follow-up)
 *
 * Locks the keyword-first parser behavior so future edits to the NL→block
 * dictionary, numeric extractors, or confidence rule can't silently break
 * `/terminal` + `/api/wizard` composition.
 *
 * Spec alignment:
 *   docs/COGOCHI.md § 8.1 — "search query IS the wizard"
 *   docs/COGOCHI.md § 11.4 — answers.yaml v1 composition rule
 *
 * Scope discipline (same as every other scripts/research smoke):
 *   - Pure TS. No vitest, no jest, no runner dependency.
 *   - Invoked via `npm run research:pr2-block-parser-smoke` →
 *     `node --experimental-strip-types`.
 *   - All assertions reduce to boolean + string detail; no matchers lib.
 *
 * What this locks down:
 *   1. Empty / whitespace-only input → empty ParsedQuery, confidence='low'
 *   2. Every one of the 9 dictionary entries is reachable from its primary
 *      English phrase AND at least one Korean alias.
 *   3. EN phrase and KO alias produce the same canonical (module,function)
 *      pair (dedup check via alreadyHas).
 *   4. pct extractor: `10%`, `10 퍼센트`, `10퍼` → 0.10; `200%` rejected.
 *   5. multiplier extractor: `5x`, `5배` → 5; `0x` rejected.
 *   6. lookback extractor: bars/봉/lookback raw, days/일 → ×24@1h / ×6@4h / ×1@1d;
 *      bars>1000 rejected; days>365 rejected.
 *   7. Symbol extraction: `BTCUSDT` kept, bare `ETH` → `ETHUSDT`, noise
 *      tokens like `RSI` / `BB` / `ATR` rejected.
 *   8. Timeframe: `1h` / `4시간` / `daily` → '1h' / '4h' / '1d'.
 *   9. Direction: `short` wins over `long` when both present (false-positive
 *      defense for "long short ratio").
 *  10. Confidence: ≥1 trigger → 'high'; all other shapes → 'low'.
 *  11. Dedup: `"recent rally 랠리"` produces exactly one trigger block.
 *  12. summarizeParsedQuery returns empty string for empty block set and the
 *      exact "N trigger · N conf · N entry · N disq" layout otherwise.
 *  13. Every returned ParsedQuery re-parses through ParsedQuerySchema without
 *      mutation (round-trip parity).
 *
 * Run:
 *   npm run research:pr2-block-parser-smoke
 */

import {
	parseBlockSearch,
	parseBlockSearchWithHints,
	summarizeParsedQuery
} from '../../src/lib/terminal/blockSearchParser.ts';
import { ParsedQuerySchema } from '../../src/lib/contracts/challenge.ts';

const lines: string[] = [];
function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// 1. Empty / whitespace-only
// ---------------------------------------------------------------------------
function checkEmpty(): void {
	for (const input of ['', '   ', '\t\n']) {
		const q = parseBlockSearch(input);
		const ok =
			q.blocks.length === 0 &&
			q.symbol === null &&
			q.timeframe === null &&
			q.direction === null &&
			q.confidence === 'low';
		record(ok, `empty input → empty query  (input=${JSON.stringify(input)})`);
	}
}

// ---------------------------------------------------------------------------
// 2. Dictionary coverage — all 9 entries reachable from EN + KO
// ---------------------------------------------------------------------------
interface Expectation {
	readonly label: string;
	readonly en: string;
	readonly ko: string;
	readonly role: 'trigger' | 'confirm' | 'entry' | 'disq';
	readonly module: string;
	readonly function: string;
}

const DICT_EXPECTATIONS: Expectation[] = [
	{
		label: 'recent_rally',
		en: 'recent rally',
		ko: '랠리',
		role: 'trigger',
		module: 'building_blocks.triggers',
		function: 'recent_rally'
	},
	{
		label: 'recent_drop',
		en: 'recent drop',
		ko: '폭락',
		role: 'trigger',
		module: 'building_blocks.triggers',
		function: 'recent_drop'
	},
	{
		label: 'bollinger_expansion',
		en: 'bollinger expansion',
		ko: '볼린저 확장',
		role: 'confirm',
		module: 'building_blocks.confirmations',
		function: 'bollinger_expansion'
	},
	{
		label: 'bollinger_squeeze',
		en: 'bollinger squeeze',
		ko: '볼린저 수축',
		role: 'confirm',
		module: 'building_blocks.confirmations',
		function: 'bollinger_squeeze'
	},
	{
		label: 'long_lower_wick',
		en: 'long lower wick',
		ko: '긴 아래꼬리',
		role: 'entry',
		module: 'building_blocks.entries',
		function: 'long_lower_wick'
	},
	{
		label: 'long_upper_wick',
		en: 'long upper wick',
		ko: '긴 윗꼬리',
		role: 'entry',
		module: 'building_blocks.entries',
		function: 'long_upper_wick'
	},
	{
		label: 'extreme_volatility',
		en: 'extreme volatility',
		ko: '변동성 과열',
		role: 'disq',
		module: 'building_blocks.disqualifiers',
		function: 'extreme_volatility'
	},
	{
		label: 'volume_below_average',
		en: 'volume below average',
		ko: '거래량 저조',
		role: 'disq',
		module: 'building_blocks.disqualifiers',
		function: 'volume_below_average'
	},
	{
		label: 'extended_from_ma',
		en: 'extended from ma',
		ko: 'ma 괴리',
		role: 'disq',
		module: 'building_blocks.disqualifiers',
		function: 'extended_from_ma'
	}
];

function checkDictionaryCoverage(): void {
	for (const exp of DICT_EXPECTATIONS) {
		for (const form of ['en', 'ko'] as const) {
			const phrase = form === 'en' ? exp.en : exp.ko;
			const q = parseBlockSearch(phrase);
			const match = q.blocks.find(
				(b) => b.module === exp.module && b.function === exp.function
			);
			const ok = !!match && match.role === exp.role;
			record(
				ok,
				`dict ${exp.label} (${form}) → ${exp.role}`,
				`phrase="${phrase}" got=${match ? match.role : 'none'}`
			);
		}
	}
}

// ---------------------------------------------------------------------------
// 3. pct extractor
// ---------------------------------------------------------------------------
function checkPctExtractor(): void {
	const cases: Array<[string, number | null]> = [
		['recent rally 10%', 0.1],
		['recent rally 10 퍼센트', 0.1],
		['recent rally 10퍼', 0.1],
		['recent rally 2.5%', 0.025],
		['recent rally 200%', 0.1], // rejected → default 0.1
		['recent rally 0%', 0.1], // rejected → default 0.1
		['recent rally', 0.1] // no pct → default 0.1
	];
	for (const [input, expectedPct] of cases) {
		const q = parseBlockSearch(input);
		const trigger = q.blocks.find((b) => b.role === 'trigger');
		const ok = trigger !== undefined && trigger.params.pct === expectedPct;
		record(
			ok,
			`pct extractor: "${input}" → pct=${expectedPct}`,
			`got=${trigger ? String(trigger.params.pct) : 'no-trigger'}`
		);
	}
}

// ---------------------------------------------------------------------------
// 4. multiplier extractor
// ---------------------------------------------------------------------------
function checkMultiplierExtractor(): void {
	const cases: Array<[string, number]> = [
		['long lower wick 2x', 2],
		['long lower wick 2배', 2],
		['long lower wick 3.5x', 3.5],
		['long lower wick', 1.5], // default body_ratio
		['bollinger expansion 2x', 2],
		['bollinger expansion', 1.5] // default expansion_factor
	];
	for (const [input, expected] of cases) {
		const q = parseBlockSearch(input);
		const block = q.blocks[0];
		const got =
			block?.function === 'long_lower_wick'
				? block.params.body_ratio
				: block?.function === 'bollinger_expansion'
					? block.params.expansion_factor
					: undefined;
		const ok = got === expected;
		record(
			ok,
			`multiplier extractor: "${input}" → ${expected}`,
			`got=${String(got)}`
		);
	}
}

// ---------------------------------------------------------------------------
// 5. lookback bars / days extractor
// ---------------------------------------------------------------------------
function checkLookbackExtractor(): void {
	const cases: Array<[string, number]> = [
		['recent rally 5 bars', 5],
		['recent rally 5 봉', 5],
		['recent rally 72 lookback', 72],
		['recent rally 3 days', 72], // 3×24 @ 1h default
		['recent rally 3일 1h', 72], // explicit 1h
		['recent rally 3일 4h', 18], // 3×6 @ 4h
		['recent rally 3일 daily', 3], // 3×1 @ 1d
		['recent rally 10000 bars', 72], // >1000 rejected → default 72
		['recent rally', 72] // default
	];
	for (const [input, expected] of cases) {
		const q = parseBlockSearch(input);
		const trigger = q.blocks.find((b) => b.role === 'trigger');
		const ok = trigger !== undefined && trigger.params.lookback_bars === expected;
		record(
			ok,
			`lookback extractor: "${input}" → ${expected}`,
			`got=${trigger ? String(trigger.params.lookback_bars) : 'no-trigger'}`
		);
	}
}

// ---------------------------------------------------------------------------
// 6. Symbol extraction
// ---------------------------------------------------------------------------
function checkSymbolExtractor(): void {
	const cases: Array<[string, string | null]> = [
		['recent rally BTCUSDT', 'BTCUSDT'],
		['recent rally ETH', 'ETHUSDT'],
		['recent rally SOL 10%', 'SOLUSDT'],
		['recent rally RSI over 70', null], // RSI is noise
		['recent rally BB squeeze', null], // BB is noise
		['recent rally', null]
	];
	for (const [input, expected] of cases) {
		const q = parseBlockSearch(input);
		const ok = q.symbol === expected;
		record(ok, `symbol: "${input}" → ${expected}`, `got=${String(q.symbol)}`);
	}
}

// ---------------------------------------------------------------------------
// 7. Timeframe extraction
// ---------------------------------------------------------------------------
function checkTimeframeExtractor(): void {
	const cases: Array<[string, '1h' | '4h' | '1d' | null]> = [
		['recent rally 1h', '1h'],
		['recent rally 1시간', '1h'],
		['recent rally 4h', '4h'],
		['recent rally 4시간', '4h'],
		['recent rally 1d', '1d'],
		['recent rally daily', '1d'],
		['recent rally 일봉', '1d'],
		['recent rally', null]
	];
	for (const [input, expected] of cases) {
		const q = parseBlockSearch(input);
		const ok = q.timeframe === expected;
		record(ok, `timeframe: "${input}" → ${expected}`, `got=${String(q.timeframe)}`);
	}
}

// ---------------------------------------------------------------------------
// 8. Direction extraction (short wins over long)
// ---------------------------------------------------------------------------
function checkDirectionExtractor(): void {
	const cases: Array<[string, 'long' | 'short' | null]> = [
		['recent rally long', 'long'],
		['recent rally short', 'short'],
		['recent rally 롱', 'long'],
		['recent rally 숏', 'short'],
		['long short ratio recent rally', 'short'], // short wins
		['recent rally'/* no direction */, null]
	];
	for (const [input, expected] of cases) {
		const q = parseBlockSearch(input);
		const ok = q.direction === expected;
		record(ok, `direction: "${input}" → ${expected}`, `got=${String(q.direction)}`);
	}
}

// ---------------------------------------------------------------------------
// 9. Confidence rule
// ---------------------------------------------------------------------------
function checkConfidenceRule(): void {
	const highCases = [
		'recent rally',
		'recent drop 5%',
		'recent rally bollinger squeeze long lower wick'
	];
	const lowCases = [
		'bollinger squeeze', // no trigger
		'long lower wick', // no trigger
		'extreme volatility' // no trigger
	];
	for (const input of highCases) {
		const q = parseBlockSearch(input);
		record(q.confidence === 'high', `confidence=high: "${input}"`, `got=${q.confidence}`);
	}
	for (const input of lowCases) {
		const q = parseBlockSearch(input);
		record(q.confidence === 'low', `confidence=low: "${input}"`, `got=${q.confidence}`);
	}
}

// ---------------------------------------------------------------------------
// 10. Dedup — EN + KO synonym for the same block = 1 entry
// ---------------------------------------------------------------------------
function checkDedup(): void {
	const q = parseBlockSearch('recent rally 랠리 bollinger squeeze 볼린저 수축');
	const triggers = q.blocks.filter((b) => b.role === 'trigger');
	const confirms = q.blocks.filter((b) => b.role === 'confirm');
	record(
		triggers.length === 1 && confirms.length === 1,
		'dedup: EN + KO synonym collapsed to 1 block each',
		`triggers=${triggers.length} confirms=${confirms.length}`
	);
}

// ---------------------------------------------------------------------------
// 11. summarizeParsedQuery
// ---------------------------------------------------------------------------
function checkSummary(): void {
	const empty = parseBlockSearch('');
	record(summarizeParsedQuery(empty) === '', 'summary: empty query → empty string');

	const full = parseBlockSearch(
		'recent rally bollinger squeeze long lower wick extreme volatility'
	);
	const summary = summarizeParsedQuery(full);
	const expected = '1 trigger · 1 conf · 1 entry · 1 disq';
	record(summary === expected, `summary: full query → "${expected}"`, `got="${summary}"`);

	const triggerOnly = parseBlockSearch('recent drop');
	record(
		summarizeParsedQuery(triggerOnly) === '1 trigger · 0 conf · 0 entry · 0 disq',
		'summary: trigger-only layout'
	);
}

// ---------------------------------------------------------------------------
// 12. Schema round-trip parity
// ---------------------------------------------------------------------------
function checkSchemaRoundTrip(): void {
	const inputs = [
		'',
		'recent rally BTCUSDT 10% 1h',
		'recent drop SOL 5% 4h bollinger squeeze long lower wick extreme volatility',
		'폭락 5% ETH 일봉 볼린저 수축 긴 아래꼬리 거래량 저조'
	];
	for (const input of inputs) {
		const q = parseBlockSearch(input);
		// Re-parse through the schema — must be a fixed point.
		const reparsed = ParsedQuerySchema.parse(JSON.parse(JSON.stringify(q)));
		const ok =
			JSON.stringify(reparsed) === JSON.stringify(q) &&
			reparsed.blocks.length === q.blocks.length;
		record(ok, `round-trip: "${input.slice(0, 40)}${input.length > 40 ? '…' : ''}"`);
	}
}

// ---------------------------------------------------------------------------
// 13. parseBlockSearchWithHints surfaces unmatched tokens
// ---------------------------------------------------------------------------
function checkUnmatchedHints(): void {
	const { query, unmatched } = parseBlockSearchWithHints(
		'recent rally xyzzy frobnicate'
	);
	const triggers = query.blocks.filter((b) => b.role === 'trigger');
	const sawUnmatched = unmatched.some(
		(t) => t === 'xyzzy' || t === 'frobnicate'
	);
	record(
		triggers.length === 1 && sawUnmatched,
		'hints: unknown tokens surfaced in unmatched[]',
		`unmatched=${JSON.stringify(unmatched)}`
	);
}

// ---------------------------------------------------------------------------
function main(): number {
	console.log('PR2 blockSearchParser smoke gate');
	console.log('=================================');

	checkEmpty();
	checkDictionaryCoverage();
	checkPctExtractor();
	checkMultiplierExtractor();
	checkLookbackExtractor();
	checkSymbolExtractor();
	checkTimeframeExtractor();
	checkDirectionExtractor();
	checkConfidenceRule();
	checkDedup();
	checkSummary();
	checkSchemaRoundTrip();
	checkUnmatchedHints();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('---------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} PR2 parser assertions passed.`
			: `${failed} of ${lines.length} PR2 parser assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
