/**
 * `$lib/contracts` — Phase 0 barrel
 *
 * This is the single import surface for cross-boundary types and zod schemas
 * in CHATBATTLE. Every consumer — server handlers, client stores, DB write
 * paths, LLM tool handlers — must import from `$lib/contracts`, never from
 * the individual files.
 *
 * Rationale:
 *   docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md
 *   §Non-Negotiable Invariants #6 ("Zod is the single runtime validator")
 */

// Layer prefix + branded IDs + enums
export {
	ContractLayer,
	KnownRawId,
	StructureStateId,
	VerdictBias,
	VerdictUrgency,
	EventDirection,
	EventSeverity,
	hasLayerPrefix,
	layerOf,
	isRawId
} from './ids';
export type { RawId, TrajectoryId, PairId, TraceId } from './ids';

// Verdict block — A's output, B's input, C's storage unit
export {
	VerdictBlockSchemaVersion,
	VerdictBlockSchema,
	VerdictBlockForPairSchema,
	VerdictReasonSchema,
	VerdictInvalidationSchema,
	VerdictExecutionSchema,
	VerdictDataFreshnessSchema,
	VerdictBiasSchema,
	VerdictUrgencySchema,
	StructureStateIdSchema,
	EventDirectionSchema,
	EventSeveritySchema,
	IsoTimestampSchema,
	SymbolSchema,
	TimeframeSchema,
	parseVerdictBlock,
	safeParseVerdictBlock
} from './verdict';
export type {
	VerdictBlock,
	VerdictBlockForPair,
	VerdictReason,
	VerdictInvalidation,
	VerdictExecution,
	VerdictDataFreshness,
	Timeframe
} from './verdict';

// Trajectory + ORPO pair — C's row and B's training signal
export {
	DecisionTrajectorySchemaVersion,
	DecisionTrajectorySchema,
	DecisionActorSchema,
	DecisionActionSchema,
	DecisionSchema,
	TrajectoryOutcomeSchema,
	ORPOPromptSchemaVersion,
	ORPOResponseSchemaVersion,
	ORPOPromptSchema,
	ORPOResponseSchema,
	MLPreferencePairSchemaVersion,
	MLPreferencePairSchema,
	PairQualitySchema,
	parseDecisionTrajectory,
	safeParseDecisionTrajectory,
	parseMLPreferencePair,
	safeParseMLPreferencePair,
	classifyPairQuality
} from './trajectory';
export type {
	DecisionTrajectory,
	Decision,
	DecisionActor,
	DecisionAction,
	TrajectoryOutcome,
	ORPOPrompt,
	ORPOResponse,
	MLPreferencePair,
	PairQuality
} from './trajectory';

// Event registry — E1 of harness engine integration plan
export {
	EventId,
	EventPayloadSchema,
	ALL_EVENT_IDS,
	isEventId,
	parseEventPayload,
	safeParseEventPayload
} from './events';
export type { EventPayload } from './events';

// Feature registry — E1 of harness engine integration plan
export {
	FeatureId,
	FeatureValueSchema,
	FrRegimeSchema,
	LongShortRegimeSchema,
	TakerRegimeSchema,
	ALL_FEATURE_IDS,
	isFeatureId,
	parseFeatureValue,
	safeParseFeatureValue
} from './features';
export type {
	FeatureValue,
	FrRegime,
	LongShortRegime,
	TakerRegime
} from './features';

// Terminal research view blocks — verdict-derived UI contract
export {
	ResearchBlockSchemaVersion,
	CompareWindowKeySchema,
	MetricUnitSchema,
	TimePointSchema,
	CandlePointSchema,
	CompareWindowSchema,
	EventMarkerSchema,
	MetricCompareSchema,
	MetricStripBlockSchema,
	InlinePriceChartBlockSchema,
	FlowSeriesSchema,
	HeatmapCellSideSchema,
	HeatmapCellSchema,
	HeatmapLegendItemSchema,
	DualPaneFlowChartBlockSchema,
	HeatmapFlowChartBlockSchema,
	ResearchBlockSchema,
	ResearchBlockEnvelopeSchema,
	parseResearchBlockEnvelope,
	safeParseResearchBlockEnvelope
} from './researchView';
export type {
	CompareWindowKey,
	MetricUnit,
	TimePoint,
	CandlePoint,
	CompareWindow,
	EventMarker,
	MetricCompare,
	MetricStripBlock,
	InlinePriceChartBlock,
	FlowSeries,
	HeatmapCellSide,
	HeatmapCell,
	HeatmapLegendItem,
	DualPaneFlowChartBlock,
	HeatmapFlowChartBlock,
	ResearchBlock,
	ResearchBlockEnvelope
} from './researchView';

// Challenge — PR1 Zoom #1 (/terminal block search parser + /api/wizard)
export {
	ChallengeAnswersSchemaVersion,
	ChallengeTimeframeSchema,
	DirectionSchema,
	BlockRoleSchema,
	BlockParamValueSchema,
	BlockParamsSchema,
	ChallengeSlugSchema,
	ParsedBlockSchema,
	ParsedQuerySchema,
	ChallengeBlockEntrySchema,
	ChallengeBlocksSchema,
	ChallengeSetupSchema,
	ChallengeIdentitySchema,
	ChallengeOutcomeSchema,
	ChallengeAnswersSchema,
	CHALLENGE_OUTCOME_DEFAULTS,
	CHALLENGE_UNIVERSE_DEFAULT,
	CHALLENGE_TIMEFRAME_DEFAULT,
	parseParsedQuery,
	safeParseParsedQuery,
	parseChallengeAnswers,
	safeParseChallengeAnswers
} from './challenge';
export type {
	ChallengeTimeframe,
	Direction,
	BlockRole,
	BlockParamValue,
	BlockParams,
	ChallengeSlug,
	ParsedBlock,
	ParsedQuery,
	ChallengeBlockEntry,
	ChallengeBlocks,
	ChallengeSetup,
	ChallengeIdentity,
	ChallengeOutcome,
	ChallengeAnswers
} from './challenge';

// Raw source registry — user-configurable data acquisition layer
export {
	RawSourceCadenceSchema,
	RawSourceCategorySchema,
	RawSourceCostHintSchema,
	RawSourceNullPolicySchema,
	RawSourceSchema,
	RawSourceCatalogSchema,
	RawSourceSubscriptionSchemaVersion,
	RawSourceSubscriptionSchema,
	RawProviderKeyOverrideSchema,
	resolveEffectiveRawSet,
	resolveEffectiveCadence,
	parseRawSource,
	parseRawSourceCatalog,
	parseRawSourceSubscription,
	safeParseRawSourceSubscription
} from './registry';
export type {
	RawSourceCadence,
	RawSourceCategory,
	RawSourceCostHint,
	RawSourceNullPolicy,
	RawSource,
	RawSourceCatalog,
	RawSourceSubscription,
	RawProviderKeyOverride
} from './registry';

// Game/progression app contracts
export { BATTLE_XP_REWARDS } from './agentBattle';
export type { AgentBattleReport, V2BattleResult } from './agentBattle';
export type {
	AlphaLabel,
	BuildDouniPromptOptions,
	ChartAnnotation,
	CvdState,
	DouniArchetype,
	DouniProfile,
	DouniStage,
	ExtendedMarketData as CogochiExtendedMarketData,
	IndicatorSeries as CogochiIndicatorSeries,
	Regime as CogochiRegime,
	ServerMarketContext as CogochiServerMarketContext,
	SignalSnapshot as CogochiSignalSnapshot,
	TradePlan,
	WyckoffPhase
} from './cogochi';
export type {
	AgentVote,
	BattlePriceTick,
	BattleTickState as ArenaBattleTickState,
	CtxAgentId,
	CtxBelief,
	CtxFlag,
	CommanderVerdict,
	FBScore,
	GameDirection,
	GuardianCheck,
	GuardianViolation,
	OrpoOutput,
	UserInteractionType,
	WarRoomConfidenceShift,
	WarRoomDialogue,
	WarRoomRound,
	WarRoomRoundResult,
	WarRoomUserInteraction
} from './gameArena';
export type {
	BacktestOptions,
	BacktestResult,
	ConditionBlock,
	CycleResult,
	ExitConfig,
	RiskConfig,
	Strategy,
	TradeRecord
} from './backtest';
export type {
	ChartPatternDetection,
	ChartPatternDirection,
	ChartPatternKind,
	ChartPatternLine,
	ChartPatternOptions,
	ChartPatternStatus
} from './chartPatterns';
export { SCAN_AGENT_META } from './agents';
export type { ScanAgentKey, ScanAgentMetadata } from './agents';
export {
	SPEC_UNLOCK_A,
	SPEC_UNLOCK_B,
	SPEC_UNLOCK_C,
	CLUTCH_FBS_THRESHOLD,
	LP_REWARDS,
	LOSS_STREAK_MERCY_THRESHOLD,
	LOSS_STREAK_MERCY_LP,
	TIER_TABLE,
	getTierForLP
} from './progression';
export type { Tier, TierInfo, LPReason } from './progression';
export type {
	MarketRegime,
	RAGEntry,
	RAGRecall,
	AgentSignal,
	ChainMatureResult,
	QuickTradeRAGInput,
	SignalActionRAGInput
} from './rag';
export type { PairQuality as RAGPairQuality } from './rag';
export { V4_CONFIG } from './researchV4';
export type {
	MarketState,
	SetupType,
	V4MarketRegime,
	ArchetypeId,
	SquadRole,
	BattleAction,
	BattleOutcome,
	MatchResult,
	TrainerLabel,
	SignalWeights,
	OwnedAgent,
	OIRecord,
	FundingRecord,
	LSRecord,
	BattleScenario,
	SignalSnapshot as V4SignalSnapshot,
	MarketFrame,
	StageFrame,
	L0Context,
	MemoryKind as V4MemoryKind,
	MemoryRecord as V4MemoryRecord,
	RetrievalQuery,
	AgentDecisionTrace,
	OrpoPairSource,
	OrpoV2Pair,
	BattleTickState
} from './researchV4';

// Signal & skill types — extracted from engine/cogochiTypes.ts (Batch 2)
export {
	DEFAULT_SKILL_LOADOUT
} from './signals';
export type {
	SignalSnapshot,
	SkillLoadout,
	SkillResult,
	SkillCatalogItem,
	MemoryKind,
	MemoryCard,
	Finding
} from './signals';

// Terminal memory contracts — Phase 0 MemKraft-aligned interfaces
export {
	TerminalMemorySchemaVersion,
	MemoryConfidenceSchema,
	MemoryKindSchema,
	MemoryContextSchema,
	MemoryQueryRequestSchema,
	MemoryRecordSchema,
	MemoryQueryResponseSchema,
	MemoryFeedbackEventSchema,
	MemoryFeedbackRequestSchema,
	MemoryFeedbackResponseSchema,
	DebugHypothesisStatusSchema,
	DebugHypothesisSchema,
	MemoryDebugSessionRequestSchema,
	MemoryDebugSessionResponseSchema,
	MemorySnapshotSchema,
	MemorySnapshotCreateRequestSchema,
	MemorySnapshotDiffRequestSchema,
	MemorySnapshotDiffResponseSchema,
	parseMemoryQueryRequest,
	parseMemoryQueryResponse,
	parseMemoryFeedbackRequest,
	parseMemoryDebugSessionRequest,
	parseMemorySnapshotDiffRequest,
	safeParseMemoryQueryRequest,
	safeParseMemoryQueryResponse,
	safeParseMemoryFeedbackRequest,
	safeParseMemoryDebugSessionRequest,
	safeParseMemorySnapshotDiffRequest
} from './terminalMemory';
export type {
	MemoryConfidence,
	MemoryKind as TerminalMemoryKind,
	MemoryContext,
	MemoryQueryRequest,
	MemoryRecord,
	MemoryQueryResponse,
	MemoryFeedbackEvent,
	MemoryFeedbackRequest,
	MemoryFeedbackResponse,
	DebugHypothesisStatus,
	DebugHypothesis,
	MemoryDebugSessionRequest,
	MemoryDebugSessionResponse,
	MemorySnapshot,
	MemorySnapshotCreateRequest,
	MemorySnapshotDiffRequest,
	MemorySnapshotDiffResponse
} from './terminalMemory';

// Terminal data-engine plane contracts — Phase 0 skeleton
export type {
	FactPlaneState,
	FactSourceState,
	CompactConfluenceSummary,
	ReferenceHealthSummary,
	FactSnapshot
} from './facts/factSnapshot';
export type { ReferenceStackSnapshot, ReferenceStackSource } from './facts/referenceStack';
export type { ChainIntelSnapshot } from './facts/chainIntel';
export type { MarketCapSnapshot } from './facts/marketCap';
export type { ConfluenceContribution, ConfluenceResult } from './facts/confluence';
export type {
	IndicatorCatalogStatus,
	IndicatorCatalogEntry,
	IndicatorCatalogResponse
} from './facts/indicatorCatalog';
export type { SearchPlaneState, SearchCandidate, ScanRequest, ScanResult } from './search/scan';
export type {
	SeedSearchRequest,
	SeedSearchCandidate,
	SeedSearchResult
} from './search/seedSearch';
export type {
	SearchCorpusWindowSummary,
	SearchCorpusCatalogResponse,
	PatternCatalogEntry,
	PatternCatalogResponse
} from './search/catalog';
export type {
	AgentContextEvidence,
	AgentContextCompareItem,
	AgentContextRuntimeCaptureSummary,
	AgentContextRuntimeSummary,
	AgentContextPack
} from './agent/agentContext';
export type {
	RuntimePlaneState,
	CaptureRecord,
	RuntimeCaptureResponse,
	RuntimeCaptureListResponse
} from './runtime/captures';
export type {
	WorkspacePin,
	WorkspaceStateRecord,
	RuntimeWorkspaceStateResponse
} from './runtime/workspaceState';
export type {
	ResearchContextRecord,
	RuntimeResearchContextResponse
} from './runtime/researchContext';
export type { LedgerRecord, RuntimeLedgerResponse } from './runtime/ledger';
export type {
	WorkspaceBundleSection,
	WorkspaceCompareSlot,
	WorkspaceBundle
} from './surface/workspaceBundle';
