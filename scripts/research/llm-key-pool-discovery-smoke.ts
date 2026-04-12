/**
 * llm-key-pool-discovery — pure-function smoke for the new
 * `discoverKeysFromEnv` helper inside `src/lib/server/llmConfig.ts`.
 *
 * The helper expands a provider's rotation pool by scanning:
 *   1. canonical primary slot (e.g. `HF_TOKEN`)
 *   2. canonical pool slot   (e.g. `HF_TOKENS`, comma-separated)
 *   3. variant slots         (e.g. `HF_TOKEN__COGOCHI_2`)
 *   4. variant pools         (e.g. `HF_TOKENS__VC_GRANTS`)
 *   5. alias slots           (e.g. `HUGGINGFACE_API_KEY`)
 *   6. alias variants        (e.g. `HUGGING_FACE_HUB_TOKEN__OLD`)
 *
 * The smoke drives the helper with hand-built env objects so it
 * needs no SvelteKit context, no real keys, and runs in pure
 * Node strip-types mode like every other research smoke.
 *
 * Run:
 *   npm run research:llm-key-pool-discovery-smoke
 */

import { discoverKeysFromEnv } from '../../src/lib/server/keyPoolDiscovery.ts';

const lines: string[] = [];
function record(ok: boolean, name: string, detail = ''): void {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  →  ' + detail : ''}`);
}

// 1. empty env returns empty list
function checkEmpty(): void {
	const r = discoverKeysFromEnv({}, 'HF_TOKEN', 'HF_TOKENS');
	record(r.length === 0, 'empty env returns 0 keys', `len=${r.length}`);
}

// 2. canonical only (primary, no pool)
function checkCanonicalOnly(): void {
	const r = discoverKeysFromEnv({ HF_TOKEN: 'tok-A' }, 'HF_TOKEN', 'HF_TOKENS');
	record(r.length === 1 && r[0] === 'tok-A', 'canonical-only returns 1 key', `len=${r.length} first=${r[0]}`);
}

// 3. canonical + pool (no variants)
function checkPool(): void {
	const r = discoverKeysFromEnv(
		{ HF_TOKEN: 'tok-A', HF_TOKENS: 'tok-B,tok-C,tok-D' },
		'HF_TOKEN',
		'HF_TOKENS',
	);
	record(r.length === 4, 'canonical + 3 pool members → 4', `len=${r.length}`);
}

// 4. dedupe across primary + pool (same value should not appear twice)
function checkDedupe(): void {
	const r = discoverKeysFromEnv(
		{ HF_TOKEN: 'tok-A', HF_TOKENS: 'tok-A,tok-B,tok-A' },
		'HF_TOKEN',
		'HF_TOKENS',
	);
	record(r.length === 2, 'duplicate values deduped to 2', `len=${r.length} keys=${r.join(',')}`);
}

// 5. variants (KEY__SUFFIX)
function checkVariants(): void {
	const r = discoverKeysFromEnv(
		{
			HF_TOKEN: 'tok-A',
			HF_TOKEN__COGOCHI_2: 'tok-B',
			HF_TOKEN__VC_GRANTS: 'tok-C',
			HF_TOKEN__MARKETING_AGENT: 'tok-D',
		},
		'HF_TOKEN',
		'HF_TOKENS',
	);
	record(r.length === 4, 'canonical + 3 variant slots → 4', `len=${r.length}`);
}

// 6. variant pools (KEYS__SUFFIX)
function checkVariantPools(): void {
	const r = discoverKeysFromEnv(
		{
			HF_TOKEN: 'tok-A',
			HF_TOKENS: 'tok-B,tok-C',
			HF_TOKENS__VC_GRANTS: 'tok-D,tok-E,tok-F',
		},
		'HF_TOKEN',
		'HF_TOKENS',
	);
	record(r.length === 6, 'canonical + 2 main pool + 3 variant pool → 6', `len=${r.length}`);
}

// 7. aliases (alternate env var names for same credential type)
function checkAliases(): void {
	const r = discoverKeysFromEnv(
		{
			HF_TOKEN: 'tok-A',
			HUGGINGFACE_API_KEY: 'tok-B',
			HUGGING_FACE_HUB_TOKEN: 'tok-C',
		},
		'HF_TOKEN',
		'HF_TOKENS',
		['HUGGINGFACE_API_KEY', 'HUGGING_FACE_HUB_TOKEN'],
	);
	record(r.length === 3, 'canonical + 2 aliases → 3', `len=${r.length}`);
}

// 8. alias variants
function checkAliasVariants(): void {
	const r = discoverKeysFromEnv(
		{
			HF_TOKEN: 'tok-A',
			HUGGINGFACE_API_KEY: 'tok-B',
			HUGGINGFACE_API_KEY__OLD: 'tok-C',
		},
		'HF_TOKEN',
		'HF_TOKENS',
		['HUGGINGFACE_API_KEY'],
	);
	record(r.length === 3, 'canonical + alias + alias-variant → 3', `len=${r.length}`);
}

// 9. canonical primary keeps position-0
function checkCanonicalFirst(): void {
	const r = discoverKeysFromEnv(
		{
			HF_TOKEN: 'tok-CANON',
			HF_TOKENS: 'tok-Z,tok-Y',
			HF_TOKEN__VARIANT: 'tok-X',
		},
		'HF_TOKEN',
		'HF_TOKENS',
	);
	record(r[0] === 'tok-CANON', 'canonical primary occupies position 0', `first=${r[0]}`);
}

// 10. mixed-case real-world simulation: HF with variants + aliases + pools
function checkRealWorldHF(): void {
	const r = discoverKeysFromEnv(
		{
			HF_TOKEN: 'hf-canon',
			HF_TOKENS: 'hf-pool-1,hf-pool-2',
			HF_TOKEN__COGOCHI_2: 'hf-cogo',
			HF_TOKEN__VC_GRANTS: 'hf-vc',
			HF_TOKEN__MARKETING_AGENT: 'hf-mkt',
			HUGGINGFACE_API_KEY: 'hf-mkt', // dup of HF_TOKEN__MARKETING_AGENT — should dedupe
			HUGGING_FACE_HUB_TOKEN: 'hf-mkt', // also dup
		},
		'HF_TOKEN',
		'HF_TOKENS',
		['HUGGINGFACE_API_KEY', 'HUGGING_FACE_HUB_TOKEN'],
	);
	// Expected distinct: hf-canon, hf-pool-1, hf-pool-2, hf-cogo, hf-vc, hf-mkt = 6
	record(r.length === 6, 'real-world HF mix returns 6 distinct (3 alias dups collapsed)', `len=${r.length}`);
}

// 11. unrelated env keys are ignored
function checkUnrelatedIgnored(): void {
	const r = discoverKeysFromEnv(
		{
			HF_TOKEN: 'hf-A',
			GROQ_API_KEY: 'gq-A',
			OPENAI_API_KEY: 'oai-A',
			DATABASE_URL: 'postgres://x',
		},
		'HF_TOKEN',
		'HF_TOKENS',
	);
	record(r.length === 1 && r[0] === 'hf-A', 'unrelated env keys ignored', `len=${r.length}`);
}

// 12. empty string values are skipped
function checkEmptyStrings(): void {
	const r = discoverKeysFromEnv(
		{
			HF_TOKEN: '',
			HF_TOKENS: 'tok-A,,tok-B,   ,tok-C',
			HF_TOKEN__VAR: '   ',
		},
		'HF_TOKEN',
		'HF_TOKENS',
	);
	record(r.length === 3, 'empty/whitespace tokens filtered', `len=${r.length} keys=${r.join(',')}`);
}

function main(): number {
	console.log('llm-key-pool-discovery smoke gate');
	console.log('=================================');

	checkEmpty();
	checkCanonicalOnly();
	checkPool();
	checkDedupe();
	checkVariants();
	checkVariantPools();
	checkAliases();
	checkAliasVariants();
	checkCanonicalFirst();
	checkRealWorldHF();
	checkUnrelatedIgnored();
	checkEmptyStrings();

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('---------------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} discovery assertions passed.`
			: `${failed} of ${lines.length} discovery assertions FAILED.`,
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
