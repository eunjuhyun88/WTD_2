/**
 * Cogochi 전용 타입 정의
 * Python battle_engine.py, skill_registry.py, context_builder.py,
 * autoresearch_service.py, finetune.py 에서 추출.
 */

// ─── SignalSnapshot (prepare.py build_signal_snapshot 출력) ───

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

// ─── Doctrine (finetune.py DOCTRINE dict) ───

export interface Doctrine {
	signal_weights: {
		cvd_divergence: number;
		funding_rate: number;
		oi_change: number;
		htf_structure: number;
		composite_score: number;
		[key: string]: number;
	};
	thresholds: {
		min_composite_score: number;
		max_atr_pct: number;
		min_confidence: number;
		funding_overheat_val: number;
		[key: string]: number;
	};
	logic_priority: string[];
	model: {
		base: string;
		lora_rank: number;
		lora_layers: number;
		learning_rate: number;
		batch_size: number;
		max_iters: number;
		warmup_steps: number;
	};
}

export const DEFAULT_DOCTRINE: Doctrine = {
	signal_weights: {
		cvd_divergence: 0.8,
		funding_rate: 0.6,
		oi_change: 0.45,
		htf_structure: 0.7,
		composite_score: 0.5,
	},
	thresholds: {
		min_composite_score: 0.4,
		max_atr_pct: 6.0,
		min_confidence: 0.55,
		funding_overheat_val: 0.0008,
	},
	logic_priority: ['cvd_divergence_first', 'htf_alignment_required', 'avoid_volatile_regime'],
	model: {
		base: 'qwen2.5:1.5b',
		lora_rank: 8,
		lora_layers: 8,
		learning_rate: 1e-4,
		batch_size: 4,
		max_iters: 150,
		warmup_steps: 20,
	},
};

// ─── Agent (001_initial_schema agents table) ───

export type CogArchetype = 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN';

export interface CogAgent {
	id: string;
	ownerAddress: string;
	name: string;
	archetypeId: CogArchetype;
	stage: 0 | 1 | 2 | 3;
	level: number;
	xp: number;
	bond: number;
	doctrine: Doctrine;
	skillLoadout: SkillLoadout;
	modelVersion: string | null;
	nftTokenId: string | null;
	status: 'READY' | 'TRAINING' | 'IN_MATCH' | 'RECOVERING';
	createdAt: string;
	updatedAt: string;
}

// ─── Skills (skill_registry.py SKILL_REGISTRY) ───

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

// ─── Battle FSM (battle_engine.py BattleState enum) ───

export type CogBattleState = 'OBSERVE' | 'RETRIEVE' | 'REASON' | 'DECIDE' | 'RESOLVE' | 'REFLECT';

export const COG_BATTLE_STATE_ORDER: CogBattleState[] = [
	'OBSERVE',
	'RETRIEVE',
	'REASON',
	'DECIDE',
	'RESOLVE',
	'REFLECT',
];

export const COG_BATTLE_STATE_LABELS: Record<CogBattleState, string> = {
	OBSERVE: '관찰',
	RETRIEVE: '메모리',
	REASON: '추론',
	DECIDE: '결정',
	RESOLVE: '결과',
	REFLECT: '회고',
};

// ─── Battle Context (battle_engine.py BattleContext dataclass) ───

export interface CogBattleContext {
	battleId: string;
	agentId: string;
	scenarioId: string;
	snapshot: SignalSnapshot;
	memories: MemoryCard[];
	skillResults: Record<string, Record<string, unknown> | null>;
	llmOutput: CogDecision | null;
	trainerAction: TrainerAction | null;
	outcome: 'WIN' | 'LOSS' | 'DRAW' | null;
	pnl: number | null;
	reflection: string | null;
	chainHash: string | null;
	xpGained: number;
	bondGained: number;
	startedAt: number;
}

// ─── Decision (battle_engine.py _parse_llm_output) ───

export interface CogDecision {
	action: 'LONG' | 'SHORT' | 'FLAT';
	confidence: number;
	thesis: string;
	sl: number | null;
	tp: number | null;
	veto?: boolean;
	veto_reason?: string;
	overridden?: boolean;
}

export type TrainerAction = 'APPROVE' | 'OVERRIDE_LONG' | 'OVERRIDE_SHORT' | 'OVERRIDE_FLAT';

// ─── Battle Result (001_initial_schema battle_results table) ───

export interface CogBattleResult {
	id: string;
	agentId: string;
	scenarioId: string;
	outcome: 'WIN' | 'LOSS' | 'DRAW';
	agentAction: 'LONG' | 'SHORT' | 'FLAT';
	trainerAction: TrainerAction | null;
	confidence: number;
	thesis: string;
	reflection: string;
	skillsUsed: string[];
	pnl: number;
	chainCommitHash: string | null;
	xpGained: number;
	bondGained: number;
	snapshot: SignalSnapshot | null;
	skillResults: Record<string, unknown> | null;
	createdAt: string;
}

// ─── SSE Events (battle_engine.py _sse function) ───

export interface CogBattleSSEEvent {
	state: CogBattleState;
	payload: Record<string, unknown>;
}

// ─── Memory (autoresearch_service.py build_orpo_pair) ───

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

// ─── Scenario (001_initial_schema scenarios table) ───

export interface CogScenario {
	id: string;
	symbol: string;
	interval: string;
	startTs: number;
	endTs: number;
	candles: Record<string, unknown>[];
	futureCandles: Record<string, unknown>[];
	snapshot: SignalSnapshot;
	difficulty: 'EASY' | 'NORMAL' | 'HARD' | null;
}

// ─── AutoResearch (autoresearch_service.py AutoRunState + SSE events) ───

export interface AutoRunJob {
	id: string;
	agentId: string;
	status: 'RUNNING' | 'DONE' | 'STOPPED';
	totalRounds: number;
	currentRound: number;
	bestMetric: number | null;
	bestDoctrine: Doctrine | null;
	resultVersion: string | null;
	startedAt: string;
	finishedAt: string | null;
}

export type AutoRunSSEEventType =
	| 'baseline'
	| 'iteration'
	| 'val_result'
	| 'finetune_triggered'
	| 'finetune_done'
	| 'stopped'
	| 'done';

export interface AutoRunIterationEvent {
	round: number;
	total: number;
	metric: number;
	best_so_far: number;
	change: 'KEEP' | 'ROLLBACK';
	win_rate: number;
}

export interface AutoRunFinetuneDoneEvent {
	success: boolean;
	promoted: boolean;
	version?: string;
	delta?: number;
	elapsed_s?: number;
	error?: string;
}

export interface AutoRunValResult {
	val_composite_metric: number;
	val_win_rate: number;
	overfit_risk: boolean;
}

// ─── ORPO Pair (autoresearch_service.py build_orpo_pair) ───

export interface OrpoPair {
	prompt: string;
	chosen: string;
	rejected: string;
	quality: number;
	source: {
		battle_id: string;
		scenario_id: string;
		outcome: string;
		is_override: boolean;
	};
}

// ─── XP/Bond table (battle_engine.py _XP_TABLE, _BOND_TABLE) ───

export const XP_TABLE: Record<string, number> = { WIN: 100, LOSS: 30, DRAW: 10 };
export const BOND_TABLE: Record<string, number> = { WIN: 3, LOSS: 1, DRAW: 0 };

// ─── Stage 진화 조건 ───

export const STAGE_REQUIREMENTS = {
	1: { minBattles: 20, minBond: 25 },
	2: { minBattles: 60, minBond: 50, minWinRate: 0.45, cogochiBurn: 500 },
	3: { minBattles: 150, minBond: 80, minWinRate: 0.5, cogochiBurn: 2000, autoResearchRequired: true },
} as const;

// ─── Market Listing (001_initial_schema market_listings) ───

export interface MarketListing {
	id: string;
	agentId: string;
	ownerAddress: string;
	priceUsdc: number;
	priceCogochi: number | null;
	active: boolean;
	escrowTxHash: string | null;
	createdAt: string;
}

// ─── Guardian Veto reasons (battle_engine.py guardian_veto) ───

export type GuardianVetoReason =
	| 'funding_overheat_long'
	| 'atr_extreme'
	| 'liq_cluster_near'
	| 'three_consecutive_loss';
