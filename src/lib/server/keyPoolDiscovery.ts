// ═══════════════════════════════════════════════════════════════
// keyPoolDiscovery — pure rotation-pool discovery helpers
// ═══════════════════════════════════════════════════════════════
//
// Leaf module — no SvelteKit imports, no environment binding,
// no side effects. Lives next to `llmConfig.ts` so the LLM
// factory can wrap it with the SvelteKit env, while research
// smokes drive it with hand-built env objects.
//
// The discovery contract expands a provider's rotation pool
// beyond the legacy `XXX_API_KEY + XXX_API_KEYS` pair to also
// include:
//   1. variant slots `XXX_API_KEY__SUFFIX` (project-specific
//      copies of the same credential type, e.g. one team's
//      separate Cerebras account)
//   2. variant pools `XXX_API_KEYS__SUFFIX`
//   3. alias slots `OTHER_NAME` (alternate env var names for
//      the same credential, e.g. `HF_TOKEN` ↔
//      `HUGGINGFACE_API_KEY` ↔ `HUGGING_FACE_HUB_TOKEN` —
//      different SDKs ship different env-var conventions)
//   4. alias variants `OTHER_NAME__SUFFIX`
//
// All discovered values are deduped (string equality), and the
// canonical primary keeps its position-0 status when present.

/**
 * Read-only env source: a plain object in tests, the SvelteKit
 * `$env/dynamic/private` proxy at runtime. Both shapes support
 * `Object.keys` enumeration.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Walk `envSource` and return every distinct credential value
 * for a provider, ordered by discovery priority.
 *
 * Priority order (deterministic):
 *   1. canonical primary (`primaryName`)
 *   2. canonical pool (`poolName`, comma-split)
 *   3. variants of canonical primary (`primaryName__SUFFIX`)
 *   4. variants of canonical pool (`poolName__SUFFIX`, comma-split)
 *   5. each alias in order (and their `__SUFFIX` variants)
 *
 * Within each step we honor first-seen-wins, so the canonical
 * primary always sits at position 0 when set.
 */
export function discoverKeysFromEnv(
	envSource: EnvSource,
	primaryName: string,
	poolName: string,
	aliasNames: readonly string[] = [],
): string[] {
	const seen = new Set<string>();
	const keys: string[] = [];

	const addToken = (raw: string | undefined): void => {
		if (!raw) return;
		const trimmed = raw.trim();
		if (trimmed && !seen.has(trimmed)) {
			seen.add(trimmed);
			keys.push(trimmed);
		}
	};

	const addPool = (raw: string | undefined): void => {
		if (!raw) return;
		for (const member of raw.split(',')) {
			addToken(member);
		}
	};

	// 1 + 2: canonical primary + canonical pool
	addToken(envSource[primaryName]);
	addPool(envSource[poolName]);

	// Snapshot the env key list once. SvelteKit's
	// `$env/dynamic/private` is a Proxy with `ownKeys` so
	// `Object.keys` enumerates the loaded env. Plain test
	// objects also support it.
	let envKeys: string[];
	try {
		envKeys = Object.keys(envSource);
	} catch {
		envKeys = []; // Proxy that refuses ownKeys → variants/aliases skipped
	}

	// 3: variant slots of canonical primary
	const primaryVariantPrefix = `${primaryName}__`;
	for (const k of envKeys) {
		if (k.startsWith(primaryVariantPrefix)) {
			addToken(envSource[k]);
		}
	}

	// 4: variant pools
	const poolVariantPrefix = `${poolName}__`;
	for (const k of envKeys) {
		if (k.startsWith(poolVariantPrefix)) {
			addPool(envSource[k]);
		}
	}

	// 5: aliases + their variants
	for (const alias of aliasNames) {
		addToken(envSource[alias]);
		const aliasVariantPrefix = `${alias}__`;
		for (const k of envKeys) {
			if (k.startsWith(aliasVariantPrefix)) {
				addToken(envSource[k]);
			}
		}
	}

	return keys;
}

/**
 * Stateful KeyPool wrapper around the result of
 * `discoverKeysFromEnv`. The pool index is process-local.
 */
export interface KeyPool {
	get: () => string;
	rotate: () => void;
	count: () => number;
	primary: string;
	keys: readonly string[];
}

export function buildPool(keys: readonly string[]): KeyPool {
	let idx = 0;
	return {
		get: () => (keys.length === 0 ? '' : keys[idx % keys.length]!),
		rotate: () => {
			if (keys.length > 1) idx = (idx + 1) % keys.length;
		},
		count: () => keys.length,
		primary: keys[0] ?? '',
		keys,
	};
}
