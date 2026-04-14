/**
 * ZeroShotLLMAgent — LLM called with a fixed prompt template and the
 * VerdictBlock as context. No preference learning, no fine-tuning, no
 * in-context examples. This is the baseline any learned ORPO agent must
 * beat in order for training to be worth the plumbing it requires.
 *
 * Policy sketch (to be implemented when LLM runtime + prompt registry land):
 *   1. Render the pinned prompt template with the verdict as context
 *   2. Call the configured model/provider
 *   3. Parse structured output → AgentDecisionProposal
 *   4. Record seed + model + prompt version in the rationale for replay
 *
 * Why `deterministic = false`: most LLM providers do not guarantee
 * bit-identical output across calls even at temperature 0, so the harness
 * must treat the policy as stochastic and seed it via `context.seed` for
 * reproducibility reports.
 *
 * Reference:
 *   `research/thesis/current-thesis.md`
 */

import type { AgentObservation, AgentDecisionProposal } from '../evaluation/types.ts';
import type { BaselineAgent } from './types.ts';
import { BaselineId } from './types.ts';

export type ZeroShotLLMAgentConfig = Readonly<{
	/** Model identifier, e.g. `"anthropic/claude-sonnet-4-6"` or `"openai/gpt-4o"`. */
	model: string;
	/**
	 * Prompt template version. Must be stable across a single evaluation run —
	 * the research spine rejects comparisons that mix prompt versions because
	 * they are not apples-to-apples.
	 */
	promptVersion: string;
	/** Sampling temperature. Typically 0 for eval runs. */
	temperature?: number;
	/** Max output tokens for the structured decision response. */
	maxTokens?: number;
}>;

export class ZeroShotLLMAgent implements BaselineAgent {
	readonly id = BaselineId.ZERO_SHOT_LLM;
	readonly label = 'Zero-shot LLM (fixed prompt + VerdictBlock)';
	readonly version = 'v1-stub';
	readonly deterministic = false;
	readonly baselineId = BaselineId.ZERO_SHOT_LLM;

	readonly config: ZeroShotLLMAgentConfig;

	constructor(config: ZeroShotLLMAgentConfig) {
		this.config = config;
	}

	decide(_observation: AgentObservation): AgentDecisionProposal {
		throw new Error(
			'[baseline.zero_shot_llm] decide() is not yet implemented. ' +
				'Blocked on LLM runtime + prompt template registry. ' +
				`When unblocked, will call model="${this.config.model}" with ` +
				`prompt="${this.config.promptVersion}", render the VerdictBlock as ` +
				'context, parse structured output, and return the proposal. ' +
				'See research/thesis/current-thesis.md.'
		);
	}
}

export function createZeroShotLLMAgent(
	config: ZeroShotLLMAgentConfig
): ZeroShotLLMAgent {
	return new ZeroShotLLMAgent(config);
}
