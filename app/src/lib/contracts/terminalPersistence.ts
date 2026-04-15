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
