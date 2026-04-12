/**
 * Doctrine-based decision logic.
 * 1:1 port of cogochi/finetune.py make_decision().
 */

import type { SignalSnapshot, Doctrine, CogDecision } from './cogochiTypes';
import { DEFAULT_DOCTRINE } from './cogochiTypes';

export function makeDecision(
	signal: SignalSnapshot,
	doctrine: Doctrine = DEFAULT_DOCTRINE,
): CogDecision {
	const w = doctrine.signal_weights;
	const t = doctrine.thresholds;
	const priority = doctrine.logic_priority;
	const reasons: string[] = [];

	// Filter 1: avoid volatile regime
	if (priority.includes('avoid_volatile_regime')) {
		if (signal.regime === 'VOLATILE' && signal.atrPct > t.max_atr_pct) {
			return {
				action: 'FLAT',
				confidence: 0.9,
				thesis: 'VOLATILE regime + high ATR. Avoid.',
				sl: null,
				tp: null,
			};
		}
	}

	// Filter 2: minimum composite strength
	if (signal.compositeScore < t.min_composite_score) {
		return {
			action: 'FLAT',
			confidence: 0.7,
			thesis: `Composite score ${signal.compositeScore.toFixed(2)} < ${t.min_composite_score}`,
			sl: null,
			tp: null,
		};
	}

	// Signal scoring
	let longScore = 0;
	let shortScore = 0;

	// CVD divergence (highest priority)
	if (priority.includes('cvd_divergence_first')) {
		if (signal.cvdState === 'BULLISH_DIVERGENCE') {
			longScore += w.cvd_divergence * 1.2;
			reasons.push('CVD Bullish Div');
		} else if (signal.cvdState === 'BEARISH_DIVERGENCE') {
			shortScore += w.cvd_divergence * 1.2;
			reasons.push('CVD Bearish Div');
		} else if (signal.cvdState === 'BULLISH') {
			longScore += w.cvd_divergence * 0.6;
		} else if (signal.cvdState === 'BEARISH') {
			shortScore += w.cvd_divergence * 0.6;
		}
	}

	// Funding rate
	if (signal.fundingLabel === 'OVERHEAT_SHORT') {
		longScore += w.funding_rate;
		reasons.push('Funding Short Overheat→LONG');
	} else if (signal.fundingLabel === 'OVERHEAT_LONG') {
		shortScore += w.funding_rate;
		reasons.push('Funding Long Overheat→SHORT');
	}

	// OI change
	if (signal.oiChange1h > 0.05) {
		if (longScore >= shortScore) {
			longScore += w.oi_change;
		} else {
			shortScore += w.oi_change;
		}
	}

	// HTF structure
	if (priority.includes('htf_alignment_required')) {
		if (signal.htfStructure === 'BULLISH') {
			longScore += w.htf_structure;
			reasons.push('HTF Bullish');
		} else if (signal.htfStructure === 'BEARISH') {
			shortScore += w.htf_structure;
			reasons.push('HTF Bearish');
		} else {
			longScore *= 0.7;
			shortScore *= 0.7;
		}
	}

	// Final decision
	const total = longScore + shortScore;
	if (total < 0.1) {
		return {
			action: 'FLAT',
			confidence: 0.6,
			thesis: 'No clear signal',
			sl: null,
			tp: null,
		};
	}

	let action: 'LONG' | 'SHORT' | 'FLAT' = 'FLAT';
	let confidence: number;

	if (longScore > shortScore) {
		confidence = Math.min(longScore / Math.max(total, 0.01), 0.95);
		action = confidence >= t.min_confidence ? 'LONG' : 'FLAT';
	} else {
		confidence = Math.min(shortScore / Math.max(total, 0.01), 0.95);
		action = confidence >= t.min_confidence ? 'SHORT' : 'FLAT';
	}

	return {
		action,
		confidence: Math.round(confidence * 1000) / 1000,
		thesis: reasons.length > 0 ? reasons.join(' | ') : 'rule-based',
		sl: null,
		tp: null,
	};
}

// loadBestDoctrine() moved to $lib/server/cogochiLearningService.ts (server-only)
