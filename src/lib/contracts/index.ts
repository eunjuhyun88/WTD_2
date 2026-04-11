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
