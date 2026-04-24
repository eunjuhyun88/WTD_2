import type {
	VisualizationHighlightPlan,
	VisualizationHighlightTarget,
	VisualizationIntent,
	VisualizationPatternContext,
	VisualizationSignal,
	VisualizationSignalKey,
} from '../contracts/intentDrivenChart';

const SIGNAL_TARGETS: Record<VisualizationSignalKey, VisualizationHighlightTarget> = {
	price_event: 'price_event',
	oi_spike: 'open_interest',
	oi_hold: 'open_interest',
	funding_flip: 'funding_extreme',
	funding_extreme: 'funding_extreme',
	volume_spike: 'volume_spike',
	higher_lows: 'higher_lows',
	breakout_line: 'breakout_line',
	liquidation_cluster: 'liquidation_density',
	cvd_divergence: 'cvd_divergence',
	similarity_match: 'similarity_score',
	phase_transition: 'current_phase',
	entry_signal: 'entry_stop_target',
	risk_warning: 'risk_reward',
};

const DEFAULT_HIGHLIGHTS: Record<
	VisualizationIntent,
	{ primary: VisualizationHighlightTarget; secondary: VisualizationHighlightTarget[] }
> = {
	why: {
		primary: 'price_event',
		secondary: ['open_interest', 'funding_extreme', 'volume_spike'],
	},
	state: {
		primary: 'phase_zone',
		secondary: ['higher_lows', 'open_interest', 'breakout_line'],
	},
	compare: {
		primary: 'phase_path_diff',
		secondary: ['feature_diff', 'similarity_score', 'breakout_line'],
	},
	search: {
		primary: 'scan_candidates',
		secondary: ['similarity_score', 'current_phase', 'candidate_count'],
	},
	flow: {
		primary: 'open_interest',
		secondary: ['funding_extreme', 'liquidation_density', 'cvd_divergence'],
	},
	execution: {
		primary: 'entry_stop_target',
		secondary: ['breakout_line', 'risk_reward', 'open_interest'],
	},
};

function targetFromSignal(signal: VisualizationSignal): VisualizationHighlightTarget {
	return signal.target ?? SIGNAL_TARGETS[signal.key];
}

function hasSignalTarget(context: VisualizationPatternContext, target: VisualizationHighlightTarget): boolean {
	return (context.signals ?? []).some((signal) => {
		if (signal.available === false) {
			return false;
		}
		return targetFromSignal(signal) === target;
	});
}

function resolveTargetAvailability(
	context: VisualizationPatternContext,
	target: VisualizationHighlightTarget
): boolean {
	switch (target) {
		case 'phase_zone':
		case 'current_phase':
			return Boolean(context.currentPhase);
		case 'phase_path_diff':
			return Boolean(context.referenceSymbol || context.referenceLabel || context.similarityScore != null);
		case 'feature_diff':
			return Boolean(context.referenceSymbol || context.featureSnapshot);
		case 'scan_candidates':
		case 'candidate_count':
			return (context.candidateCount ?? 0) > 0;
		case 'similarity_score':
			return context.similarityScore != null;
		case 'entry_stop_target':
			return Boolean(context.tradePlan?.entry != null || context.tradePlan?.targets?.length);
		case 'risk_reward':
			return context.tradePlan?.riskReward != null || hasSignalTarget(context, target);
		default:
			return hasSignalTarget(context, target);
	}
}

function fallbackSecondaryTargets(
	intent: VisualizationIntent,
	context: VisualizationPatternContext,
	excluded: Set<VisualizationHighlightTarget>
): VisualizationHighlightTarget[] {
	const order: VisualizationHighlightTarget[] = [
		...DEFAULT_HIGHLIGHTS[intent].secondary,
		'current_phase',
		'similarity_score',
		'feature_diff',
		'candidate_count',
	];
	const result: VisualizationHighlightTarget[] = [];
	for (const target of order) {
		if (excluded.has(target)) {
			continue;
		}
		if (!resolveTargetAvailability(context, target)) {
			continue;
		}
		result.push(target);
		excluded.add(target);
		if (result.length === 2) {
			break;
		}
	}
	return result;
}

export function planVisualizationHighlights(
	intent: VisualizationIntent,
	context: VisualizationPatternContext = {}
): VisualizationHighlightPlan {
	const defaults = DEFAULT_HIGHLIGHTS[intent];
	const secondary: VisualizationHighlightTarget[] = [];
	const seen = new Set<VisualizationHighlightTarget>([defaults.primary]);

	for (const target of defaults.secondary) {
		if (!resolveTargetAvailability(context, target) || seen.has(target)) {
			continue;
		}
		secondary.push(target);
		seen.add(target);
		if (secondary.length === 2) {
			break;
		}
	}

	if (secondary.length < 2) {
		for (const target of fallbackSecondaryTargets(intent, context, seen)) {
			secondary.push(target);
			if (secondary.length === 2) {
				break;
			}
		}
	}

	return {
		primary: defaults.primary,
		secondary,
		rationale: [
			`intent:${intent}`,
			`primary:${defaults.primary}`,
			...secondary.map((target) => `secondary:${target}`),
		],
	};
}
