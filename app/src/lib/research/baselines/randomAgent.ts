/**
 * RandomAgent — the mandatory floor baseline.
 *
 * Samples uniformly over `[open_long, open_short, wait]`. Ignores the
 * VerdictBlock entirely. Any learned agent MUST beat this baseline with
 * statistically significant margin; if it doesn't, nothing else in the
 * research spine is worth running.
 *
 * Reproducibility:
 *   - Requires a seed via `AgentObservation.context.seed`.
 *   - Uses mulberry32 from `../stats.ts` so seeds produce identical
 *     sequences across machines and Node versions.
 *
 * Reference:
 *   `research/thesis/current-thesis.md`
 */

import type {
	AgentObservation,
	AgentDecisionProposal
} from '../evaluation/types.ts';
import type { BaselineAgent } from './types.ts';
import { BaselineId } from './types.ts';
import { mulberry32 } from '../stats.ts';

const ACTIONS = ['open_long', 'open_short', 'wait'] as const;

/**
 * Configurable action probabilities. Defaults to uniform. A project may
 * override this to test "random but biased" baselines (e.g. a "never
 * trade" floor with `{ open_long: 0, open_short: 0, wait: 1 }`).
 */
export interface RandomAgentConfig {
	readonly probabilities?: {
		readonly open_long: number;
		readonly open_short: number;
		readonly wait: number;
	};
	/**
	 * Default RNG seed used when the observation does not carry one.
	 * Harness callers should always pass a seed via `context.seed` for
	 * reproducibility; this is only a fallback for smoke tests.
	 */
	readonly defaultSeed?: number;
}

const DEFAULT_PROBABILITIES = {
	open_long: 1 / 3,
	open_short: 1 / 3,
	wait: 1 / 3
} as const;

export class RandomAgent implements BaselineAgent {
	readonly id = BaselineId.RANDOM;
	readonly label = 'Random (uniform 3-way)';
	readonly version = 'v1';
	readonly deterministic = false;
	readonly baselineId = BaselineId.RANDOM;

	private readonly probabilities: {
		readonly open_long: number;
		readonly open_short: number;
		readonly wait: number;
	};
	private readonly defaultSeed: number;

	constructor(config: RandomAgentConfig = {}) {
		const probs = config.probabilities ?? DEFAULT_PROBABILITIES;
		const total = probs.open_long + probs.open_short + probs.wait;
		if (Math.abs(total - 1) > 1e-9) {
			throw new Error(
				`RandomAgent: probabilities must sum to 1, got ${total.toFixed(6)}`
			);
		}
		for (const [key, p] of Object.entries(probs)) {
			if (p < 0 || p > 1) {
				throw new Error(`RandomAgent: probability for ${key} out of [0,1]: ${p}`);
			}
		}
		this.probabilities = probs;
		this.defaultSeed = config.defaultSeed ?? 0x9e3779b9;
	}

	decide(observation: AgentObservation): AgentDecisionProposal {
		const seed = observation.context.seed ?? this.defaultSeed;
		const rng = mulberry32(seed);
		const r = rng();

		let action: (typeof ACTIONS)[number];
		if (r < this.probabilities.open_long) {
			action = 'open_long';
		} else if (r < this.probabilities.open_long + this.probabilities.open_short) {
			action = 'open_short';
		} else {
			action = 'wait';
		}

		return {
			action,
			size_pct: action === 'wait' ? null : 1,
			leverage: action === 'wait' ? null : 1,
			stop_price: null,
			tp_prices: [],
			note: null,
			rationale: `RandomAgent uniform draw (seed=${seed}, u=${r.toFixed(6)})`
		};
	}
}

/**
 * Convenience factory — the harness usually only needs one instance.
 * Seeding and action sampling happen per-observation, so sharing the
 * same instance across the whole fold is safe.
 */
export function createRandomAgent(config: RandomAgentConfig = {}): RandomAgent {
	return new RandomAgent(config);
}
