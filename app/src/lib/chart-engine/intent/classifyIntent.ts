import type { VisualizationIntent, VisualizationPatternContext } from '../contracts/intentDrivenChart';

const EXECUTION_PATTERNS = [
	/어디서.*진입/u,
	/손절/u,
	/익절/u,
	/실행/u,
	/\bentry\b/i,
	/\bstop\b/i,
	/\btarget\b/i,
	/\brisk\s*reward\b/i,
];

const COMPARE_PATTERNS = [/비교/u, /비슷/u, /닮/u, /\bcompare\b/i, /\bversus\b/i, /\bvs\b/i];

const SEARCH_PATTERNS = [/찾아/u, /탐색/u, /스캔/u, /몇\s*개/u, /\bfind\b/i, /\bsearch\b/i, /\bscan\b/i];

const FLOW_PATTERNS = [
	/세력/u,
	/흐름/u,
	/자금/u,
	/청산/u,
	/펀딩/u,
	/오아이/u,
	/\boi\b/i,
	/\bfunding\b/i,
	/\bliq(uidation)?\b/i,
	/\bcvd\b/i,
];

const WHY_PATTERNS = [/왜/u, /이유/u, /원인/u, /반응/u, /\bwhy\b/i, /\bwhat caused\b/i];

const STATE_PATTERNS = [
	/지금/u,
	/상태/u,
	/매집/u,
	/자리/u,
	/브레이크아웃/u,
	/\bstate\b/i,
	/\bsetup\b/i,
	/\bphase\b/i,
	/\baccumulation\b/i,
	/\bbreakout\b/i,
];

export function classifyVisualizationIntent(
	query: string,
	context: VisualizationPatternContext = {}
): VisualizationIntent {
	const text = query.trim();

	if (EXECUTION_PATTERNS.some((pattern) => pattern.test(text))) {
		return 'execution';
	}

	if (COMPARE_PATTERNS.some((pattern) => pattern.test(text))) {
		return context.referenceSymbol ? 'compare' : SEARCH_PATTERNS.some((pattern) => pattern.test(text)) ? 'search' : 'compare';
	}

	if (SEARCH_PATTERNS.some((pattern) => pattern.test(text))) {
		return context.referenceSymbol ? 'compare' : 'search';
	}

	if (FLOW_PATTERNS.some((pattern) => pattern.test(text))) {
		return 'flow';
	}

	if (WHY_PATTERNS.some((pattern) => pattern.test(text))) {
		return 'why';
	}

	if (STATE_PATTERNS.some((pattern) => pattern.test(text))) {
		return 'state';
	}

	if (context.referenceSymbol) {
		return 'compare';
	}

	if (context.currentPhase || (context.phasePath?.length ?? 0) > 0) {
		return 'state';
	}

	return 'why';
}
