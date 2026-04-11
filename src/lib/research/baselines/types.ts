/**
 * Baseline agent interfaces.
 *
 * Every baseline implements `AgentPolicy` from `../evaluation/types.ts`.
 * This file re-exports that interface plus baseline-specific marker
 * interfaces so the eval harness can distinguish "this is the random
 * baseline" from "this is the learned ORPO agent" without string matching.
 *
 * Baseline identities are STABLE across the project's lifetime. Changing
 * them silently invalidates every historical comparison report, so the
 * `id` strings here are treated as a public API.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §R1
 */

import type { AgentPolicy } from '../evaluation/types';

export type { AgentPolicy };

/** Canonical baseline identifiers. Do not rename without a migration note. */
export const BaselineId = {
	RANDOM: 'baseline.random',
	ENGINE_ONLY: 'baseline.engine_only',
	ZERO_SHOT_LLM: 'baseline.zero_shot_llm',
	RULE_BASED: 'baseline.rule_based',
	HUMAN: 'baseline.human'
} as const;
export type BaselineId = (typeof BaselineId)[keyof typeof BaselineId];

/**
 * Marker interface so the harness can recognize baselines at runtime
 * without string matching on `AgentPolicy.id`. Concrete baselines
 * implement both `AgentPolicy` and `BaselineAgent`.
 */
export interface BaselineAgent extends AgentPolicy {
	readonly baselineId: BaselineId;
}
