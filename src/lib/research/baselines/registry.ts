/**
 * `BaselineRegistry` — locked lookup for research agents.
 *
 * Every entry is tagged with a `kind`:
 *
 *   - `'baseline'`          : a stable comparison anchor whose identity
 *                             must not change silently across releases.
 *                             Historical reports referencing the same
 *                             `id` must remain interpretable.
 *   - `'comparison_target'` : a moving target included in ablation
 *                             tables (R7) but NOT treated as a baseline.
 *                             Production replays (e.g. a `scanEngine`
 *                             snapshot) live here so baseline identity
 *                             doesn't drift when production code changes.
 *
 * This split is the `D4 §9.3` resolution from the research-spine design
 * doc: `RuleBasedAgent(RuleSetV1_…)` is a baseline, `ScanEngineReplay`
 * is a comparison target. Keeping them in the same registry with
 * different `kind`s lets R7 ablation tables pull both through a single
 * lookup surface without accidentally promoting a comparison target
 * into a citation anchor.
 *
 * R4.3 scope: provide `register` / `get` / `listByKind` and expose a
 * module-level `defaultBaselineRegistry` that `$lib/research/index.ts`
 * pre-populates with the config-free R1 baselines. Baselines with
 * required constructor arguments (e.g. `ZeroShotLLMAgent` needs a
 * `model` + `promptVersion`) are intentionally NOT default-registered;
 * experiment files are expected to construct those per-run and call
 * `register()` themselves.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §D4 row 9.3, §R4.3
 */

import type { BaselineAgent } from './types.ts';

export type BaselineKind = 'baseline' | 'comparison_target';

export interface BaselineRegistryEntry {
	readonly kind: BaselineKind;
	readonly agent: BaselineAgent;
}

export type BaselineRegistryErrorCode =
	| 'duplicate_id'
	| 'unknown_id'
	| 'invalid_agent'
	| 'invalid_kind';

/**
 * Typed error surface for registry violations. Named codes so tests can
 * assert "this call triggered exactly this invariant" without string
 * matching on the message.
 */
export class BaselineRegistryError extends Error {
	readonly code: BaselineRegistryErrorCode;
	readonly detail: string;
	constructor(code: BaselineRegistryErrorCode, detail: string) {
		super(`BaselineRegistryError[${code}]: ${detail}`);
		this.name = 'BaselineRegistryError';
		this.code = code;
		this.detail = detail;
	}
}

export class BaselineRegistry {
	private readonly entries = new Map<string, BaselineRegistryEntry>();

	/**
	 * Register an agent under its own `id`. Throws on duplicate ids,
	 * invalid agents, or unknown kinds. Returns the agent back so the
	 * caller can chain construction and registration in one expression.
	 */
	register(agent: BaselineAgent, kind: BaselineKind = 'baseline'): BaselineAgent {
		if (!agent || typeof agent.id !== 'string' || agent.id.length === 0) {
			throw new BaselineRegistryError(
				'invalid_agent',
				'register() requires a BaselineAgent with a non-empty id'
			);
		}
		if (typeof agent.decide !== 'function') {
			throw new BaselineRegistryError(
				'invalid_agent',
				`register() requires a 'decide' method on agent '${agent.id}'`
			);
		}
		if (typeof agent.baselineId !== 'string' || agent.baselineId.length === 0) {
			throw new BaselineRegistryError(
				'invalid_agent',
				`register() requires a 'baselineId' marker on agent '${agent.id}'`
			);
		}
		if (kind !== 'baseline' && kind !== 'comparison_target') {
			throw new BaselineRegistryError(
				'invalid_kind',
				`register() got unknown kind '${String(kind)}' for agent '${agent.id}'`
			);
		}
		if (this.entries.has(agent.id)) {
			throw new BaselineRegistryError(
				'duplicate_id',
				`agent id '${agent.id}' is already registered`
			);
		}
		this.entries.set(agent.id, { kind, agent });
		return agent;
	}

	/** Returns `true` when an agent is registered under `id`. */
	has(id: string): boolean {
		return this.entries.has(id);
	}

	/** Fetch the registered agent by id. Throws `unknown_id` on miss. */
	get(id: string): BaselineAgent {
		const entry = this.entries.get(id);
		if (!entry) {
			throw new BaselineRegistryError(
				'unknown_id',
				`no baseline registered under id '${id}'`
			);
		}
		return entry.agent;
	}

	/** Fetch the full entry (agent + kind). Throws `unknown_id` on miss. */
	getEntry(id: string): BaselineRegistryEntry {
		const entry = this.entries.get(id);
		if (!entry) {
			throw new BaselineRegistryError(
				'unknown_id',
				`no baseline registered under id '${id}'`
			);
		}
		return entry;
	}

	/** Stable-ordered list of registered ids. Insertion order. */
	listIds(): ReadonlyArray<string> {
		return Array.from(this.entries.keys());
	}

	/** All agents tagged with a given `kind`. Insertion order. */
	listByKind(kind: BaselineKind): ReadonlyArray<BaselineAgent> {
		const matches: BaselineAgent[] = [];
		for (const entry of this.entries.values()) {
			if (entry.kind === kind) matches.push(entry.agent);
		}
		return matches;
	}

	/** Current entry count. Handy for tests and smoke assertions. */
	size(): number {
		return this.entries.size;
	}

	/** Drop every entry. Intended for tests; production code rarely needs this. */
	clear(): void {
		this.entries.clear();
	}
}

/**
 * The module-level default registry. `$lib/research/index.ts` pre-populates
 * it with the config-free R1 baselines; experiment files import it via
 * `$lib/research` and may `register()` additional agents (typically
 * `comparison_target` entries for ablation runs or per-run LLM baselines).
 *
 * Direct mutation is the intended API — swapping the binding at runtime
 * is not supported because the registry is part of the locked boundary.
 */
export const defaultBaselineRegistry = new BaselineRegistry();
