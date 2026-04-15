import { z } from 'zod';

/**
 * Terminal Memory contract (Phase 0).
 *
 * Scope:
 * - Shared request/response shapes for app <-> backend memory interactions.
 * - Contract-first only; no storage/runtime assumptions in this module.
 */

export const TerminalMemorySchemaVersion = 1 as const;

export const MemoryConfidenceSchema = z.enum(['verified', 'observed', 'hypothesis']);
export type MemoryConfidence = z.infer<typeof MemoryConfidenceSchema>;

export const MemoryKindSchema = z.enum([
  'identity',
  'belief',
  'experience',
  'preference',
  'fact',
  'procedure',
  'debug_hypothesis',
  'debug_rejected'
]);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const MemoryContextSchema = z.object({
  symbol: z.string().min(1).optional(),
  timeframe: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  intent: z.string().min(1).optional(),
  challengeSlug: z.string().min(1).optional(),
  challengeInstance: z.string().min(1).optional(),
  asOf: z.string().datetime({ offset: true }).optional()
});
export type MemoryContext = z.infer<typeof MemoryContextSchema>;

export const MemoryQueryRequestSchema = z.object({
  query: z.string().min(1),
  context: MemoryContextSchema.default({}),
  topK: z.number().int().positive().max(50).default(8),
  includeRejected: z.boolean().default(false),
  includeSnapshots: z.boolean().default(false)
});
export type MemoryQueryRequest = z.infer<typeof MemoryQueryRequestSchema>;

export const MemoryRecordSchema = z.object({
  id: z.string().min(1),
  kind: MemoryKindSchema,
  text: z.string().min(1),
  confidence: MemoryConfidenceSchema,
  score: z.number(),
  source: z.string().min(1).optional(),
  conditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  tags: z.array(z.string()).default([]),
  conflictIds: z.array(z.string()).default([]),
  accessCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  lastUsedAt: z.string().datetime({ offset: true }).optional()
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const MemoryQueryResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalMemorySchemaVersion),
  queryId: z.string().min(1),
  records: z.array(MemoryRecordSchema),
  debug: z.object({
    rerankApplied: z.boolean(),
    baseResultCount: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative()
  })
});
export type MemoryQueryResponse = z.infer<typeof MemoryQueryResponseSchema>;

export const MemoryFeedbackEventSchema = z.enum([
  'retrieved',
  'used',
  'dismissed',
  'contradicted',
  'confirmed'
]);
export type MemoryFeedbackEvent = z.infer<typeof MemoryFeedbackEventSchema>;

export const MemoryFeedbackRequestSchema = z.object({
  queryId: z.string().min(1),
  memoryId: z.string().min(1),
  event: MemoryFeedbackEventSchema,
  context: MemoryContextSchema.default({}),
  occurredAt: z.string().datetime({ offset: true }),
  note: z.string().max(500).optional()
});
export type MemoryFeedbackRequest = z.infer<typeof MemoryFeedbackRequestSchema>;

export const MemoryFeedbackResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalMemorySchemaVersion),
  memoryId: z.string().min(1),
  accessCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime({ offset: true })
});
export type MemoryFeedbackResponse = z.infer<typeof MemoryFeedbackResponseSchema>;

export const DebugHypothesisStatusSchema = z.enum(['open', 'confirmed', 'rejected']);
export type DebugHypothesisStatus = z.infer<typeof DebugHypothesisStatusSchema>;

export const DebugHypothesisSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  status: DebugHypothesisStatusSchema,
  evidence: z.array(z.string()).default([]),
  rejectionReason: z.string().optional()
});
export type DebugHypothesis = z.infer<typeof DebugHypothesisSchema>;

export const MemoryDebugSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
  context: MemoryContextSchema.default({}),
  hypotheses: z.array(DebugHypothesisSchema).min(1),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).optional()
});
export type MemoryDebugSessionRequest = z.infer<typeof MemoryDebugSessionRequestSchema>;

export const MemoryDebugSessionResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalMemorySchemaVersion),
  sessionId: z.string().min(1),
  rejectedIndexed: z.number().int().nonnegative(),
  updatedAt: z.string().datetime({ offset: true })
});
export type MemoryDebugSessionResponse = z.infer<typeof MemoryDebugSessionResponseSchema>;

export const MemorySnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  label: z.string().min(1).max(120).optional(),
  recordCount: z.number().int().nonnegative()
});
export type MemorySnapshot = z.infer<typeof MemorySnapshotSchema>;

export const MemorySnapshotCreateRequestSchema = z.object({
  context: MemoryContextSchema.default({}),
  label: z.string().min(1).max(120).optional(),
  requestedAt: z.string().datetime({ offset: true })
});
export type MemorySnapshotCreateRequest = z.infer<typeof MemorySnapshotCreateRequestSchema>;

export const MemorySnapshotDiffRequestSchema = z.object({
  fromSnapshotId: z.string().min(1),
  toSnapshotId: z.string().min(1),
  includeUnchanged: z.boolean().default(false)
});
export type MemorySnapshotDiffRequest = z.infer<typeof MemorySnapshotDiffRequestSchema>;

export const MemorySnapshotDiffResponseSchema = z.object({
  ok: z.boolean(),
  schemaVersion: z.literal(TerminalMemorySchemaVersion),
  fromSnapshotId: z.string().min(1),
  toSnapshotId: z.string().min(1),
  added: z.array(MemoryRecordSchema),
  removed: z.array(MemoryRecordSchema),
  changed: z.array(
    z.object({
      id: z.string().min(1),
      before: MemoryRecordSchema,
      after: MemoryRecordSchema
    })
  )
});
export type MemorySnapshotDiffResponse = z.infer<typeof MemorySnapshotDiffResponseSchema>;

export function parseMemoryQueryRequest(input: unknown): MemoryQueryRequest {
  return MemoryQueryRequestSchema.parse(input);
}

export function safeParseMemoryQueryRequest(input: unknown) {
  return MemoryQueryRequestSchema.safeParse(input);
}

export function parseMemoryQueryResponse(input: unknown): MemoryQueryResponse {
  return MemoryQueryResponseSchema.parse(input);
}

export function safeParseMemoryQueryResponse(input: unknown) {
  return MemoryQueryResponseSchema.safeParse(input);
}

export function parseMemoryFeedbackRequest(input: unknown): MemoryFeedbackRequest {
  return MemoryFeedbackRequestSchema.parse(input);
}

export function safeParseMemoryFeedbackRequest(input: unknown) {
  return MemoryFeedbackRequestSchema.safeParse(input);
}

export function parseMemoryDebugSessionRequest(input: unknown): MemoryDebugSessionRequest {
  return MemoryDebugSessionRequestSchema.parse(input);
}

export function safeParseMemoryDebugSessionRequest(input: unknown) {
  return MemoryDebugSessionRequestSchema.safeParse(input);
}

export function parseMemorySnapshotDiffRequest(input: unknown): MemorySnapshotDiffRequest {
  return MemorySnapshotDiffRequestSchema.parse(input);
}

export function safeParseMemorySnapshotDiffRequest(input: unknown) {
  return MemorySnapshotDiffRequestSchema.safeParse(input);
}
