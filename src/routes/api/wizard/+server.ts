/**
 * POST /api/wizard — Zoom #1 PR1 scope
 *
 * Receives a parsed query from the `/terminal` block search composer and
 * returns a canonical `answers.yaml` v1 document (as JSON). PR1 is a pure
 * contract-validation endpoint: no filesystem write, no subprocess spawn,
 * no WTD calls. The returned `answers` object is the exact shape PR2 will
 * yaml-dump into `WTD/challenges/pattern-hunting/<slug>/answers.yaml`.
 *
 * PR2 plan (deferred, out of scope here):
 *   - Spawn `python -m wizard.new_pattern --answers <tmp>` via subprocess
 *   - Resolve WTD_ROOT from env
 *   - Sanitize slug for filesystem safety (currently regex-enforced via zod)
 *   - Return the created filesystem paths in the response
 *   - Add auth / quota gate so anonymous users can't spam challenge creation
 *
 * Spec: docs/COGOCHI.md § 8.1 (save-as-challenge button), § 11.4 (answers.yaml v1)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { checkDistributedRateLimit } from '$lib/server/distributedRateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { wizardLimiter } from '$lib/server/rateLimit';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';
import {
	BlockParamsSchema,
	BlockRoleSchema,
	CHALLENGE_OUTCOME_DEFAULTS,
	CHALLENGE_UNIVERSE_DEFAULT,
	ChallengeAnswersSchema,
	ChallengeAnswersSchemaVersion,
	ChallengeSlugSchema,
	ChallengeTimeframeSchema,
	DirectionSchema,
	type ChallengeAnswers,
	type ChallengeBlockEntry,
	type ChallengeBlocks,
	type ChallengeOutcome
} from '$lib/contracts';

// ---------------------------------------------------------------------------
// Request shape
// ---------------------------------------------------------------------------

/**
 * Block payload the client sends — same as `ParsedBlock` but we re-inline
 * the zod object here so the endpoint is self-contained and a malformed
 * client block hits the 400 path with a precise issue path.
 */
const WizardRequestBlockSchema = z.object({
	role: BlockRoleSchema,
	module: z.string().min(1).max(128),
	function: z.string().min(1).max(128),
	params: BlockParamsSchema,
	source_token: z.string().max(256).optional().default('')
});

const WizardOutcomeOverrideSchema = z
	.object({
		target_pct: z.number().positive().max(1).optional(),
		stop_pct: z.number().positive().max(1).optional(),
		horizon_bars: z.number().int().positive().max(1000).optional()
	})
	.optional();

const WizardRequestSchema = z.object({
	slug: ChallengeSlugSchema,
	description: z.string().min(1).max(280),
	direction: DirectionSchema,
	timeframe: ChallengeTimeframeSchema,
	blocks: z.array(WizardRequestBlockSchema).min(1).max(8),
	universe: z.string().min(1).max(64).optional(),
	outcome: WizardOutcomeOverrideSchema
});

type WizardRequest = z.infer<typeof WizardRequestSchema>;
type WizardRequestBlock = z.infer<typeof WizardRequestBlockSchema>;

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

class InvalidCompositionError extends Error {
	constructor(public readonly reason: string) {
		super(reason);
		this.name = 'InvalidCompositionError';
	}
}

/**
 * Strips runtime-only fields (`role`, `source_token`) and returns the clean
 * block entry shape that lives inside `answers.yaml`.
 */
function toChallengeEntry(block: WizardRequestBlock): ChallengeBlockEntry {
	return {
		module: block.module,
		function: block.function,
		params: block.params
	};
}

/**
 * Enforces the § 11.4 composition rule:
 *   trigger = 1   (required)
 *   confirm = 0..3
 *   entry   = 0..1
 *   disq    = 0..3
 *
 * Throws `InvalidCompositionError` on violation.
 */
function groupBlocks(blocks: WizardRequestBlock[]): ChallengeBlocks {
	const triggers = blocks.filter((b) => b.role === 'trigger');
	const confirms = blocks.filter((b) => b.role === 'confirm');
	const entries = blocks.filter((b) => b.role === 'entry');
	const disqs = blocks.filter((b) => b.role === 'disq');

	if (triggers.length === 0) {
		throw new InvalidCompositionError('trigger is required');
	}
	if (triggers.length > 1) {
		throw new InvalidCompositionError('exactly one trigger is allowed');
	}
	if (confirms.length > 3) {
		throw new InvalidCompositionError('at most 3 confirmations are allowed');
	}
	if (entries.length > 1) {
		throw new InvalidCompositionError('at most 1 entry block is allowed');
	}
	if (disqs.length > 3) {
		throw new InvalidCompositionError('at most 3 disqualifiers are allowed');
	}

	return {
		trigger: toChallengeEntry(triggers[0]),
		confirmations: confirms.map(toChallengeEntry),
		entry: entries.length === 1 ? toChallengeEntry(entries[0]) : null,
		disqualifiers: disqs.map(toChallengeEntry)
	};
}

/**
 * Builds the canonical `answers.yaml` v1 document from a validated request.
 *
 * Deterministic except for `created_at` — caller may inject a clock for
 * testability. Not exported: SvelteKit `+server.ts` files only allow a
 * fixed set of HTTP verb exports + underscore-prefixed helpers.
 */
function buildAnswers(
	req: WizardRequest,
	nowIso: string = new Date().toISOString()
): ChallengeAnswers {
	const outcome: ChallengeOutcome = {
		target_pct: req.outcome?.target_pct ?? CHALLENGE_OUTCOME_DEFAULTS.target_pct,
		stop_pct: req.outcome?.stop_pct ?? CHALLENGE_OUTCOME_DEFAULTS.stop_pct,
		horizon_bars: req.outcome?.horizon_bars ?? CHALLENGE_OUTCOME_DEFAULTS.horizon_bars
	};

	const answers: ChallengeAnswers = {
		version: ChallengeAnswersSchemaVersion,
		schema: 'pattern_hunting',
		created_at: nowIso,
		identity: {
			name: req.slug,
			description: req.description
		},
		setup: {
			direction: req.direction,
			universe: req.universe ?? CHALLENGE_UNIVERSE_DEFAULT,
			timeframe: req.timeframe
		},
		blocks: groupBlocks(req.blocks),
		outcome
	};

	// Re-parse as the final authoritative gate so any mismatch between
	// `buildAnswers` output and the published schema fails here and not
	// later in the caller.
	return ChallengeAnswersSchema.parse(answers);
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const guard = await runIpRateLimitGuard({
		request,
		fallbackIp: getClientAddress(),
		limiter: wizardLimiter,
		scope: 'wizard:compose:ip',
		max: 10,
		tooManyMessage: 'Too many challenge composition requests. Please wait.'
	});
	if (!guard.ok) return guard.response;

	const user = await getAuthUserFromCookies(cookies);
	if (!user) {
		return json(
			{ ok: false, error: 'authentication_required', reason: 'login required to create challenges' },
			{ status: 401 }
		);
	}

	const userAllowed = await checkDistributedRateLimit({
		scope: 'wizard:compose:user',
		key: user.id,
		windowMs: 60 * 60 * 1000,
		max: 20
	});
	if (!userAllowed) {
		return json(
			{ ok: false, error: 'quota_exceeded', reason: 'hourly challenge composition quota exceeded' },
			{ status: 429 }
		);
	}

	let raw: unknown;
	try {
		raw = await readJsonBody(request, 16 * 1024);
	} catch (error) {
		if (isRequestBodyTooLargeError(error)) {
			return json(
				{ ok: false, error: 'request_too_large', reason: 'request body exceeds 16KB limit' },
				{ status: 413 }
			);
		}
		return json(
			{ ok: false, error: 'invalid_json', reason: 'request body is not valid JSON' },
			{ status: 400 }
		);
	}

	const parsed = WizardRequestSchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{
				ok: false,
				error: 'invalid_request',
				issues: parsed.error.flatten()
			},
			{ status: 400 }
		);
	}

	try {
		const answers = buildAnswers(parsed.data);
		return json({ ok: true, answers }, { status: 200 });
	} catch (err) {
		if (err instanceof InvalidCompositionError) {
			return json(
				{ ok: false, error: 'invalid_composition', reason: err.message },
				{ status: 422 }
			);
		}
		// Zod parse failure in the final gate — schema drift bug, not a
		// user error.
		// eslint-disable-next-line no-console
		console.error('[api/wizard] unexpected failure composing answers.yaml:', err);
		return json({ ok: false, error: 'internal' }, { status: 500 });
	}
};
