import type { ConfluenceContribution, ConfluenceResult } from '$lib/confluence/types';
import { regimeFromScore } from '$lib/confluence/types';

const ENGINE_FACT_CONFLUENCE_MAX_SCORE = 6;

export interface EngineFactConfluencePayload {
	ok?: boolean;
	generated_at?: string;
	symbol?: string;
	timeframe?: string;
	summary?: {
		bias?: string;
		score?: number;
		evidenceCount?: number;
		confidencePct?: number;
	};
	evidence?: Array<{
		metric?: string;
		bias?: string;
		value?: unknown;
	}>;
}

function labelFromMetric(metric: string | undefined): string {
	const raw = metric?.trim() || 'fact';
	return raw
		.split('_')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function adaptEngineContribution(
	row: NonNullable<EngineFactConfluencePayload['evidence']>[number],
	weight: number,
): ConfluenceContribution {
	const direction = row.bias === 'bullish' ? 1 : row.bias === 'bearish' ? -1 : 0;
	const metric = row.metric?.trim() || 'fact';
	const value = row.value == null ? '' : ` = ${String(row.value)}`;
	return {
		source: metric,
		label: labelFromMetric(metric),
		score: direction,
		weight,
		weighted: direction * weight,
		magnitude: Math.abs(direction),
		reason: `${row.bias ?? 'neutral'}${value}`,
	};
}

export function adaptEngineFactConfluence(payload: EngineFactConfluencePayload): ConfluenceResult {
	const rawScore = Number(payload.summary?.score ?? 0);
	const confidence = Math.max(0, Math.min(1, Number(payload.summary?.confidencePct ?? 0) / 100));
	const score = Math.max(
		-100,
		Math.min(100, Math.round((rawScore / ENGINE_FACT_CONFLUENCE_MAX_SCORE) * 100)),
	);
	const evidence = payload.evidence ?? [];
	const weight = evidence.length > 0 ? 1 / evidence.length : 0;
	const contributions = evidence.map((row) => adaptEngineContribution(row, weight));
	const top = contributions.slice(0, 3);
	const hasBull = contributions.some((row) => row.score > 0);
	const hasBear = contributions.some((row) => row.score < 0);
	const at = Date.parse(payload.generated_at ?? '');

	return {
		at: Number.isFinite(at) ? at : Date.now(),
		symbol: payload.symbol ?? 'BTCUSDT',
		score,
		confidence,
		regime: regimeFromScore(score, confidence),
		contributions,
		top,
		divergence: hasBull && hasBear,
	};
}
