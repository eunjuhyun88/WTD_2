/**
 * EngineOnlyAgent — deterministic policy that consumes only the VerdictBlock
 * produced by the Phase 3 verdict engine. No LLM, no rules beyond bias→action
 * mapping, no memory. This is the "pure engine" baseline against which every
 * LLM-flavored agent must justify its added cost.
 *
 * Policy sketch (to be implemented when Phase 3 verdict engine lands):
 *   verdict.bias === 'strong_bull' | 'bull'   → open_long
 *   verdict.bias === 'strong_bear' | 'bear'   → open_short
 *   verdict.bias === 'neutral'                → wait
 *
 * Sizing and leverage will be derived from `verdict.execution` once that
 * field is wired to real execution hints. Until then, `decide()` throws to
 * prevent a silent "always wait" policy from contaminating comparison runs
 * with fake zero-PnL rows.
 *
 * Reference:
 *   `research/thesis/current-thesis.md`
 */

import type { AgentObservation, AgentDecisionProposal } from '../evaluation/types.ts';
import type { BaselineAgent } from './types.ts';
import { BaselineId } from './types.ts';

/**
 * Config placeholder. The concrete implementation will wire execution hints
 * (sizing scale, leverage cap) through here so the eval harness can A/B the
 * same engine mapping under different risk envelopes.
 */
export type EngineOnlyAgentConfig = Readonly<{
	/** Reserved for Phase 3: sizing multiplier applied to `verdict.execution` hints. */
	sizingScale?: number;
	/** Reserved for Phase 3: hard leverage cap regardless of execution hint. */
	maxLeverage?: number;
}>;

export class EngineOnlyAgent implements BaselineAgent {
	readonly id = BaselineId.ENGINE_ONLY;
	readonly label = 'Engine-only (verdict bias → action)';
	readonly version = 'v1-stub';
	readonly deterministic = true;
	readonly baselineId = BaselineId.ENGINE_ONLY;

	readonly config: EngineOnlyAgentConfig;

	constructor(config: EngineOnlyAgentConfig = {}) {
		this.config = config;
	}

	decide(_observation: AgentObservation): AgentDecisionProposal {
		throw new Error(
			'[baseline.engine_only] decide() is not yet implemented. ' +
				'Blocked on Phase 3 verdict engine producing real VerdictBlock output. ' +
				'When unblocked, will map verdict.bias → ' +
				'{strong_bull|bull: open_long, strong_bear|bear: open_short, neutral: wait} ' +
				'and derive sizing from verdict.execution. ' +
				'See research/thesis/current-thesis.md.'
		);
	}
}

/**
 * Convenience factory. The harness usually only needs one instance per fold
 * because the mapping is pure.
 */
export function createEngineOnlyAgent(
	config: EngineOnlyAgentConfig = {}
): EngineOnlyAgent {
	return new EngineOnlyAgent(config);
}
