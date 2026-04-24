import { z } from 'zod';

export const TerminalPersistenceSchemaVersion = 1 as const;

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)])
);

export const WatchlistPreviewSchema = z.object({
  price: z.number().nullable().optional(),
  change24h: z.number().nullable().optional(),
  bias: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  action: z.string().optional(),
  invalidation: z.string().optional(),
});
export type WatchlistPreview = z.infer<typeof WatchlistPreviewSchema>;

export const TerminalWatchlistItemSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean().default(false),
  preview: WatchlistPreviewSchema.optional(),
});
export type TerminalWatchlistItem = z.infer<typeof TerminalWatchlistItemSchema>;

export const TerminalWatchlistRequestSchema = z.object({
  items: z.array(TerminalWatchlistItemSchema).max(24),
  activeSymbol: z.string().min(1).optional(),
});
export type TerminalWatchlistRequest = z.infer<typeof TerminalWatchlistRequestSchema>;

export const TerminalWatchlistResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  items: z.array(TerminalWatchlistItemSchema),
  activeSymbol: z.string().min(1).optional(),
  updatedAt: z.string().datetime({ offset: true }),
});
export type TerminalWatchlistResponse = z.infer<typeof TerminalWatchlistResponseSchema>;

export const TerminalPinTypeSchema = z.enum(['symbol', 'analysis', 'compare']);
export type TerminalPinType = z.infer<typeof TerminalPinTypeSchema>;

export const TerminalPinSchema = z.object({
  id: z.string().min(1),
  pinType: TerminalPinTypeSchema,
  symbol: z.string().min(1).optional(),
  timeframe: z.string().min(1),
  label: z.string().min(1).max(120).optional(),
  payload: z.record(z.string(), JsonValueSchema),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type TerminalPin = z.infer<typeof TerminalPinSchema>;

export const TerminalPinsRequestSchema = z.object({
  pins: z.array(TerminalPinSchema).max(50),
});
export type TerminalPinsRequest = z.infer<typeof TerminalPinsRequestSchema>;

export const TerminalPinsResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  pins: z.array(TerminalPinSchema),
  updatedAt: z.string().datetime({ offset: true }),
});
export type TerminalPinsResponse = z.infer<typeof TerminalPinsResponseSchema>;

export const TerminalAlertRuleSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  kind: z.string().min(1).max(40),
  params: z.record(z.string(), JsonValueSchema),
  enabled: z.boolean(),
  sourceContext: z.record(z.string(), JsonValueSchema),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type TerminalAlertRule = z.infer<typeof TerminalAlertRuleSchema>;

export const TerminalAlertCreateRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  kind: z.string().min(1).max(40),
  params: z.record(z.string(), JsonValueSchema),
  enabled: z.boolean().default(true),
  sourceContext: z.record(z.string(), JsonValueSchema).default({}),
});
export type TerminalAlertCreateRequest = z.infer<typeof TerminalAlertCreateRequestSchema>;

export const TerminalAlertsResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  alerts: z.array(TerminalAlertRuleSchema),
  updatedAt: z.string().datetime({ offset: true }),
});
export type TerminalAlertsResponse = z.infer<typeof TerminalAlertsResponseSchema>;

export const TerminalExportStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type TerminalExportStatus = z.infer<typeof TerminalExportStatusSchema>;

export const TerminalExportTypeSchema = z.enum(['terminal_report']);
export type TerminalExportType = z.infer<typeof TerminalExportTypeSchema>;

export const TerminalExportRequestSchema = z.object({
  exportType: TerminalExportTypeSchema,
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  title: z.string().min(1).max(160).optional(),
  payload: z.record(z.string(), JsonValueSchema).default({}),
});
export type TerminalExportRequest = z.infer<typeof TerminalExportRequestSchema>;

export const TerminalExportJobSchema = z.object({
  id: z.string().min(1),
  exportType: TerminalExportTypeSchema,
  status: TerminalExportStatusSchema,
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  title: z.string().min(1).max(160).optional(),
  requestPayload: z.record(z.string(), JsonValueSchema),
  resultPayload: z.record(z.string(), JsonValueSchema).optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).optional(),
});
export type TerminalExportJob = z.infer<typeof TerminalExportJobSchema>;

export const TerminalExportJobResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  job: TerminalExportJobSchema,
});
export type TerminalExportJobResponse = z.infer<typeof TerminalExportJobResponseSchema>;

export const MacroCalendarItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  scheduledAt: z.string().datetime({ offset: true }),
  countdownSeconds: z.number().int(),
  impact: z.enum(['low', 'medium', 'high']),
  affectedAssets: z.array(z.string()),
  summary: z.string().min(1),
});
export type MacroCalendarItem = z.infer<typeof MacroCalendarItemSchema>;

export const MacroCalendarResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  items: z.array(MacroCalendarItemSchema),
  updatedAt: z.string().datetime({ offset: true }),
});
export type MacroCalendarResponse = z.infer<typeof MacroCalendarResponseSchema>;

export const TerminalSessionResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  watchlist: z.array(TerminalWatchlistItemSchema),
  activeSymbol: z.string().min(1).optional(),
  pins: z.array(TerminalPinSchema),
  alerts: z.array(TerminalAlertRuleSchema),
  macro: z.array(MacroCalendarItemSchema),
  latestExportJob: TerminalExportJobSchema.nullish(),
  updatedAt: z.string().datetime({ offset: true }),
});
export type TerminalSessionResponse = z.infer<typeof TerminalSessionResponseSchema>;

export const PatternCaptureOriginSchema = z.enum(['manual', 'alert', 'anomaly', 'pattern_transition']);
export type PatternCaptureOrigin = z.infer<typeof PatternCaptureOriginSchema>;

export const PatternCaptureContextKindSchema = z.enum(['symbol', 'alert', 'anomaly', 'preset', 'compare']);
export type PatternCaptureContextKind = z.infer<typeof PatternCaptureContextKindSchema>;

export const PatternCaptureDecisionSchema = z.object({
  verdict: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  action: z.string().optional(),
  risk: z.string().optional(),
  invalidation: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type PatternCaptureDecision = z.infer<typeof PatternCaptureDecisionSchema>;

/** Chart window + OHLCV + indicator series (same contract as klines API indicators). */
export const ChartViewportSnapshotSchema = z.object({
  timeFrom: z.number(),
  timeTo: z.number(),
  tf: z.string(),
  barCount: z.number(),
  anchorTime: z.number().optional(),
  klines: z.array(
    z.object({
      time: z.number(),
      open: z.number(),
      high: z.number(),
      low: z.number(),
      close: z.number(),
      volume: z.number(),
    }),
  ),
  indicators: z.record(z.unknown()),
});
export type ChartViewportSnapshot = z.infer<typeof ChartViewportSnapshotSchema>;
export const PatternCaptureReviewSummarySchema = z.object({
  headline: z.string().min(1),
  marketState: z.string().optional(),
  verdict: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  action: z.string().optional(),
  invalidation: z.string().optional(),
  bullets: z.array(z.string()).max(8).default([]),
  riskFlags: z.array(z.string()).max(8).default([]),
  evidenceCount: z.number().int().min(1),
});
export type PatternCaptureReviewSummary = z.infer<typeof PatternCaptureReviewSummarySchema>;

export const PatternResearchSourceSchema = z.object({
  kind: z.enum(['telegram_post', 'chart_image', 'manual_note', 'terminal_capture']),
  author: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  imageRefs: z.array(z.string().min(1)).max(12).default([]),
});
export type PatternResearchSource = z.infer<typeof PatternResearchSourceSchema>;

export const PatternResearchPhaseAnnotationSchema = z.object({
  phaseId: z.string().min(1),
  label: z.string().min(1),
  timeframe: z.string().min(1),
  startTs: z.number().int().optional(),
  endTs: z.number().int().optional(),
  signalsRequired: z.array(z.string().min(1)).max(24).default([]),
  signalsPreferred: z.array(z.string().min(1)).max(24).default([]),
  signalsForbidden: z.array(z.string().min(1)).max(24).default([]),
  note: z.string().optional(),
});
export type PatternResearchPhaseAnnotation = z.infer<typeof PatternResearchPhaseAnnotationSchema>;

export const PatternResearchEntrySpecSchema = z.object({
  entryPhaseId: z.string().min(1),
  entryTrigger: z.string().min(1).optional(),
  stopRule: z.string().min(1).optional(),
  targetRule: z.string().min(1).optional(),
});
export type PatternResearchEntrySpec = z.infer<typeof PatternResearchEntrySpecSchema>;

export const PatternResearchOutcomeSpecSchema = z.object({
  confirmBreakoutWithinBars: z.number().int().positive().optional(),
  minForwardReturnPct: z.number().nonnegative().optional(),
  stretchReturnPct: z.number().nonnegative().optional(),
});
export type PatternResearchOutcomeSpec = z.infer<typeof PatternResearchOutcomeSpecSchema>;

export const PatternDraftPhaseSchema = z.object({
  phaseId: z.string().min(1),
  label: z.string().min(1),
  sequenceOrder: z.number().int().min(0),
  description: z.string().default(''),
  timeframe: z.string().min(1).optional(),
  signalsRequired: z.array(z.string().min(1)).max(24).default([]),
  signalsPreferred: z.array(z.string().min(1)).max(24).default([]),
  signalsForbidden: z.array(z.string().min(1)).max(24).default([]),
  directionalBelief: z.string().min(1).optional(),
  evidenceText: z.string().min(1).optional(),
  timeHint: z.string().min(1).optional(),
  importance: z.number().min(0).max(1).optional(),
});
export type PatternDraftPhase = z.infer<typeof PatternDraftPhaseSchema>;

export const PatternDraftSearchHintsSchema = z.object({
  mustHaveSignals: z.array(z.string().min(1)).max(24).default([]),
  preferredTimeframes: z.array(z.string().min(1)).max(8).default([]),
  excludePatterns: z.array(z.string().min(1)).max(24).default([]),
  similarityFocus: z.array(z.string().min(1)).max(12).default([]),
  symbolScope: z.array(z.string().min(1)).max(32).default([]),
});
export type PatternDraftSearchHints = z.infer<typeof PatternDraftSearchHintsSchema>;

export const PatternDraftSchema = z.object({
  schemaVersion: z.number().int().positive(),
  patternFamily: z.string().min(1),
  patternLabel: z.string().min(1).optional(),
  sourceType: z.string().min(1),
  sourceText: z.string().min(1),
  symbolCandidates: z.array(z.string().min(1)).max(16).default([]),
  timeframe: z.string().min(1).optional(),
  thesis: z.array(z.string().min(1)).max(12).default([]),
  phases: z.array(PatternDraftPhaseSchema).max(12).default([]),
  tradePlan: z.record(z.string(), z.unknown()).default({}),
  searchHints: PatternDraftSearchHintsSchema.default({}),
  confidence: z.number().min(0).max(1).nullable().optional(),
  ambiguities: z.array(z.string().min(1)).max(16).default([]),
});
export type PatternDraft = z.infer<typeof PatternDraftSchema>;

export const PatternDraftParserMetaSchema = z.object({
  parserRole: z.string().min(1),
  parserModel: z.string().min(1),
  parserPromptVersion: z.string().min(1),
  patternDraftSchemaVersion: z.number().int().positive(),
  signalVocabVersion: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable().optional(),
  ambiguityCount: z.number().int().nonnegative(),
});
export type PatternDraftParserMeta = z.infer<typeof PatternDraftParserMetaSchema>;

export const PatternCaptureResearchContextSchema = z.object({
  source: PatternResearchSourceSchema.optional(),
  patternFamily: z.string().min(1).optional(),
  thesis: z.array(z.string().min(1)).max(12).default([]),
  phaseAnnotations: z.array(PatternResearchPhaseAnnotationSchema).max(12).default([]),
  entrySpec: PatternResearchEntrySpecSchema.optional(),
  outcomeSpec: PatternResearchOutcomeSpecSchema.optional(),
  researchTags: z.array(z.string().min(1)).max(24).default([]),
  patternDraft: PatternDraftSchema.optional(),
  parserMeta: PatternDraftParserMetaSchema.optional(),
}).superRefine((value, ctx) => {
  const topLevelFamily = value.patternFamily;
  const draftFamily = value.patternDraft?.patternFamily;
  if (!topLevelFamily && !draftFamily) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'researchContext requires patternFamily or patternDraft.patternFamily',
      path: ['patternFamily'],
    });
  }
  if (topLevelFamily && draftFamily && topLevelFamily !== draftFamily) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'researchContext patternFamily must match patternDraft.patternFamily',
      path: ['patternDraft', 'patternFamily'],
    });
  }
});
export type PatternCaptureResearchContext = z.infer<typeof PatternCaptureResearchContextSchema>;
export const PatternCaptureSnapshotSchema = z.object({
  price: z.number().nullable().optional(),
  change24h: z.number().nullable().optional(),
  funding: z.number().nullable().optional(),
  oiDelta: z.number().nullable().optional(),
  freshness: z.string().optional(),
  /** Visible chart range at save time — candles + sliced indicator series */
  viewport: ChartViewportSnapshotSchema.optional(),
});
export type PatternCaptureSnapshot = z.infer<typeof PatternCaptureSnapshotSchema>;

export const PatternCaptureRecordSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  contextKind: PatternCaptureContextKindSchema,
  triggerOrigin: PatternCaptureOriginSchema,
  patternSlug: z.string().optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
  snapshot: PatternCaptureSnapshotSchema,
  decision: PatternCaptureDecisionSchema,
  researchContext: PatternCaptureResearchContextSchema.optional(),
  evidenceHash: z.string().optional(),
  sourceFreshness: z.record(z.string(), z.string()).default({}),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type PatternCaptureRecord = z.infer<typeof PatternCaptureRecordSchema>;

export const PatternCaptureCreateRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  contextKind: PatternCaptureContextKindSchema.default('symbol'),
  triggerOrigin: PatternCaptureOriginSchema,
  patternSlug: z.string().optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
  snapshot: PatternCaptureSnapshotSchema.default({}),
  decision: PatternCaptureDecisionSchema.default({}),
  researchContext: PatternCaptureResearchContextSchema.optional(),
  evidenceHash: z.string().optional(),
  sourceFreshness: z.record(z.string(), z.string()).default({}),
});
export type PatternCaptureCreateRequest = z.infer<typeof PatternCaptureCreateRequestSchema>;

export const PatternCaptureQuerySchema = z.object({
  id: z.string().optional(),
  symbol: z.string().optional(),
  timeframe: z.string().optional(),
  verdict: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  triggerOrigin: PatternCaptureOriginSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type PatternCaptureQuery = z.infer<typeof PatternCaptureQuerySchema>;

export const PatternCaptureSimilarityDraftSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  triggerOrigin: PatternCaptureOriginSchema.optional(),
  patternSlug: z.string().optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
  snapshot: PatternCaptureSnapshotSchema.default({}),
  excludeId: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export type PatternCaptureSimilarityDraft = z.infer<typeof PatternCaptureSimilarityDraftSchema>;

export const PatternCaptureSimilarityBreakdownSchema = z.object({
  chart: z.number().min(0).max(1),
  text: z.number().min(0).max(1),
  phase: z.number().min(0).max(1),
  timeframe: z.number().min(0).max(1),
  pattern: z.number().min(0).max(1),
  trigger: z.number().min(0).max(1),
});
export type PatternCaptureSimilarityBreakdown = z.infer<typeof PatternCaptureSimilarityBreakdownSchema>;

export const PatternCaptureSimilarityMatchSchema = z.object({
  record: PatternCaptureRecordSchema,
  score: z.number().min(0).max(1),
  breakdown: PatternCaptureSimilarityBreakdownSchema,
});
export type PatternCaptureSimilarityMatch = z.infer<typeof PatternCaptureSimilarityMatchSchema>;

export const PatternCaptureSimilarResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  matches: z.array(PatternCaptureSimilarityMatchSchema),
  updatedAt: z.string().datetime({ offset: true }),
});
export type PatternCaptureSimilarResponse = z.infer<typeof PatternCaptureSimilarResponseSchema>;

export const PatternCaptureProjectionRequestSchema = z.object({
  scan: z.boolean().default(true),
  limit: z.number().int().min(1).max(20).default(8),
});
export type PatternCaptureProjectionRequest = z.infer<typeof PatternCaptureProjectionRequestSchema>;

export const PatternCaptureProjectionSnapSchema = z.object({
  symbol: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  label: z.string().default(''),
});
export type PatternCaptureProjectionSnap = z.infer<typeof PatternCaptureProjectionSnapSchema>;

export const PatternCaptureProjectionMatchSchema = z.object({
  symbol: z.string().min(1),
  timestamp: z.string(),
  similarity: z.number(),
  pWin: z.number().nullable(),
  price: z.number(),
});
export type PatternCaptureProjectionMatch = z.infer<typeof PatternCaptureProjectionMatchSchema>;

export const PatternCaptureProjectionResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  captureId: z.string().min(1),
  challengeSlug: z.string().nullable(),
  snap: PatternCaptureProjectionSnapSchema,
  matches: z.array(PatternCaptureProjectionMatchSchema),
  updatedAt: z.string().datetime({ offset: true }),
});
export type PatternCaptureProjectionResponse = z.infer<typeof PatternCaptureProjectionResponseSchema>;

export const PatternCaptureResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalPersistenceSchemaVersion),
  records: z.array(PatternCaptureRecordSchema),
  updatedAt: z.string().datetime({ offset: true }),
});
export type PatternCaptureResponse = z.infer<typeof PatternCaptureResponseSchema>;

export function parseTerminalWatchlistResponse(input: unknown): TerminalWatchlistResponse {
  return TerminalWatchlistResponseSchema.parse(input);
}

export function parseTerminalPinsResponse(input: unknown): TerminalPinsResponse {
  return TerminalPinsResponseSchema.parse(input);
}

export function parseTerminalAlertsResponse(input: unknown): TerminalAlertsResponse {
  return TerminalAlertsResponseSchema.parse(input);
}

export function parseTerminalExportJobResponse(input: unknown): TerminalExportJobResponse {
  return TerminalExportJobResponseSchema.parse(input);
}

export function parseMacroCalendarResponse(input: unknown): MacroCalendarResponse {
  return MacroCalendarResponseSchema.parse(input);
}

export function parseTerminalSessionResponse(input: unknown): TerminalSessionResponse {
  return TerminalSessionResponseSchema.parse(input);
}

export function parsePatternCaptureResponse(input: unknown): PatternCaptureResponse {
  return PatternCaptureResponseSchema.parse(input);
}

export function parsePatternCaptureSimilarResponse(input: unknown): PatternCaptureSimilarResponse {
  return PatternCaptureSimilarResponseSchema.parse(input);
}

export function parsePatternCaptureProjectionResponse(input: unknown): PatternCaptureProjectionResponse {
  return PatternCaptureProjectionResponseSchema.parse(input);
}
