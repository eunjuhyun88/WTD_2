/**
 * Signal & Skill types — extracted from engine/cogochiTypes.ts (Batch 2).
 *
 * These types are consumed by active server modules (skillsRegistry,
 * qdrantClient, scanner) and must outlive the legacy cogochi game engine.
 *
 * Original source: engine/cogochiTypes.ts (which re-exports these for
 * backward compatibility with legacy code until it's archived).
 */

// ---------------------------------------------------------------------------
// SignalSnapshot (prepare.py build_signal_snapshot output)
// ---------------------------------------------------------------------------

export interface SignalSnapshot {
	primaryZone: string;
	modifiers: string[];
	cvdState: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
	cvdValue: number;
	oiChange1h: number;
	fundingRate: number;
	fundingLabel: 'OVERHEAT_LONG' | 'OVERHEAT_SHORT' | 'NEUTRAL';
	htfStructure: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
	atrPct: number;
	vwapDistance: number;
	compositeScore: number;
	regime: 'TRENDING' | 'VOLATILE' | 'RANGING';
	currentPrice: number;
	timestamp: number;
}

// ---------------------------------------------------------------------------
// Skills (skill_registry.py SKILL_REGISTRY)
// ---------------------------------------------------------------------------

export interface SkillLoadout {
	dataSkills: {
		coingecko?: boolean;
		binanceMarket?: boolean;
		coinglassLiquidation?: boolean;
		nansenSmartMoney?: boolean;
	};
	maxSkillCallsPerTick: number;
	totalBudgetMs: number;
}

export const DEFAULT_SKILL_LOADOUT: SkillLoadout = {
	dataSkills: {
		coingecko: true,
		binanceMarket: true,
		coinglassLiquidation: true,
		nansenSmartMoney: false,
	},
	maxSkillCallsPerTick: 3,
	totalBudgetMs: 6000,
};

export interface SkillResult {
	skillId: string;
	data: Record<string, unknown> | null;
	latencyMs: number;
}

export interface SkillCatalogItem {
	id: string;
	name: string;
	description: string;
	layer: 'DATA' | 'ANALYSIS' | 'EXECUTION';
	phase: number;
	timeout_ms: number;
	auth_type: string;
	cost_per_call: number | null;
}

// ---------------------------------------------------------------------------
// MemoryCard (autoresearch_service.py build_orpo_pair)
// ---------------------------------------------------------------------------

export type MemoryKind = 'SUCCESS_CASE' | 'FAILURE_CASE' | 'PLAYBOOK' | 'MATCH_SUMMARY' | 'USER_NOTE';

export interface MemoryCard {
	id: string;
	agentId: string;
	kind: MemoryKind;
	content: string;
	importance: number;
	embedding?: number[];
	createdAt: number;
}

// --- Extracted from stores/arenaV2State.ts (Batch 4) ---

import type { Direction } from './game';

/** A single research finding from an arena-v2 RAG analysis session. */
export interface Finding {
	agentId: string;
	title: string;
	detail: string;
	direction: Direction;
	confidence: number;
	icon: string;
	timestamp: number;
}
