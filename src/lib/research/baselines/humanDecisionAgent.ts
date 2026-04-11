/**
 * HumanDecisionAgent — replays human decisions recorded in the trajectory
 * store. Not a "learned" policy in any sense; it is a trajectory-indexed
 * lookup that lets us compare any candidate policy against what real users
 * actually did on the exact same verdict blocks.
 *
 * Why it's the hardest baseline to beat:
 *   Humans see information outside the VerdictBlock — screen context, prior
 *   decisions in adjacent tabs, intuitions the engine never encoded. A
 *   learned agent beating this baseline with statistically significant
 *   margin is the strongest possible result in this project. A learned
 *   agent tying or losing to it is still publishable — just honest about
 *   where the ceiling is.
 *
 * Policy sketch (to be implemented when trajectory store reader lands):
 *   1. Look up `DecisionTrajectory` rows indexed by `verdict.trace_id`
 *   2. Filter to rows where `decision.actor.kind === 'user'`
 *   3. Return the recorded (action, size_pct, leverage, stop, tp, note) as
 *      an `AgentDecisionProposal`
 *   4. In strict mode, throw when no matching human decision exists; the
 *      harness must filter the slice down to human-covered trajectories
 *      before running this agent so coverage gaps do not silently
 *      disqualify folds
 *
 * Deterministic: the same `trace_id` always maps to the same recorded
 * decision. Replaying the same slice twice produces identical metrics.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §R1, RQ-D
 */

import type { AgentObservation, AgentDecisionProposal } from '../evaluation/types';
import type { BaselineAgent } from './types';
import { BaselineId } from './types';

export type HumanDecisionAgentConfig = Readonly<{
	/**
	 * Strict mode (default `true`): throw when a verdict has no recorded
	 * human decision. Strict is safer for research runs because it fails
	 * loudly on coverage gaps. Permissive mode may be added later for
	 * exploratory workflows but is intentionally not a stub knob.
	 */
	strict?: boolean;
}>;

export class HumanDecisionAgent implements BaselineAgent {
	readonly id = BaselineId.HUMAN;
	readonly label = 'Human decision (replay from trajectory store)';
	readonly version = 'v1-stub';
	readonly deterministic = true;
	readonly baselineId = BaselineId.HUMAN;

	readonly config: HumanDecisionAgentConfig;

	constructor(config: HumanDecisionAgentConfig = {}) {
		this.config = config;
	}

	decide(_observation: AgentObservation): AgentDecisionProposal {
		throw new Error(
			'[baseline.human] decide() is not yet implemented. ' +
				'Blocked on trajectory store reader + actor=user filter. ' +
				'When unblocked, will look up the DecisionTrajectory by ' +
				'verdict.trace_id, filter to decision.actor.kind === "user", ' +
				'and return the recorded proposal verbatim. ' +
				'See docs/exec-plans/active/research-spine-2026-04-11.md §R1, RQ-D.'
		);
	}
}

export function createHumanDecisionAgent(
	config: HumanDecisionAgentConfig = {}
): HumanDecisionAgent {
	return new HumanDecisionAgent(config);
}
