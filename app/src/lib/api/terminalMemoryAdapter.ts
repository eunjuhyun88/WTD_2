import {
  parseMemoryDebugSessionRequest,
  parseMemoryFeedbackRequest,
  parseMemoryQueryRequest,
  parseMemoryQueryResponse,
  type DebugHypothesis,
  type MemoryContext,
  type MemoryDebugSessionRequest,
  type MemoryFeedbackRequest,
  type MemoryQueryRequest,
  type MemoryQueryResponse,
} from '$lib/contracts/terminalMemory';

type EngineMemoryContextWire = {
  symbol?: string;
  timeframe?: string;
  mode?: string;
  intent?: string;
  challenge_slug?: string;
  challenge_instance?: string;
  as_of?: string;
};

type EngineMemoryCandidateWire = {
  id: string;
  kind: string;
  text: string;
  base_score: number;
  confidence: string;
  access_count: number;
  tags: string[];
  conditions: Record<string, unknown>;
};

type EngineMemoryQueryWire = {
  query: string;
  context: EngineMemoryContextWire;
  top_k: number;
  candidates: EngineMemoryCandidateWire[];
};

type EngineMemoryFeedbackWire = {
  query_id: string;
  memory_id: string;
  event: string;
  context: EngineMemoryContextWire;
  occurred_at: string;
  note?: string;
};

type EngineMemoryDebugSessionWire = {
  session_id: string;
  context: EngineMemoryContextWire;
  hypotheses: Array<{
    id: string;
    text: string;
    status: DebugHypothesis['status'];
    evidence: string[];
    rejection_reason?: string;
  }>;
  started_at: string;
  ended_at?: string;
};

type EngineMemoryQueryResponseWire = {
  ok?: boolean;
  schema_version?: number;
  query_id?: string;
  records?: Array<{
    id?: string;
    kind?: string;
    text?: string;
    score?: number;
    base_score?: number;
    confidence?: string;
    access_count?: number;
    tags?: string[];
    reasons?: string[];
  }>;
  debug?: {
    rerank_applied?: boolean;
    base_result_count?: number;
    elapsed_ms?: number;
  };
};

function toWireContext(context: MemoryContext): EngineMemoryContextWire {
  return {
    symbol: context.symbol,
    timeframe: context.timeframe,
    mode: context.mode,
    intent: context.intent,
    challenge_slug: context.challengeSlug,
    challenge_instance: context.challengeInstance,
    as_of: context.asOf,
  };
}

export function toEngineMemoryQueryWire(input: MemoryQueryRequest): EngineMemoryQueryWire {
  const parsed = parseMemoryQueryRequest(input);
  return {
    query: parsed.query,
    context: toWireContext(parsed.context),
    top_k: parsed.topK,
    candidates: parsed.candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      text: candidate.text,
      base_score: candidate.baseScore,
      confidence: candidate.confidence,
      access_count: candidate.accessCount,
      tags: candidate.tags,
      conditions: candidate.conditions,
    })),
  };
}

export function fromEngineMemoryQueryWire(input: unknown): MemoryQueryResponse {
  const wire = input as EngineMemoryQueryResponseWire;
  return parseMemoryQueryResponse({
    ok: wire.ok ?? true,
    schemaVersion: wire.schema_version ?? 1,
    queryId: wire.query_id ?? '',
    records: (wire.records ?? []).map((record) => ({
      id: record.id ?? '',
      kind: record.kind ?? 'fact',
      text: record.text ?? '',
      score: Number(record.score ?? 0),
      baseScore: Number(record.base_score ?? 0),
      confidence: record.confidence ?? 'observed',
      accessCount: Number(record.access_count ?? 0),
      tags: record.tags ?? [],
      reasons: record.reasons ?? [],
    })),
    debug: {
      rerankApplied: Boolean(wire.debug?.rerank_applied),
      baseResultCount: Number(wire.debug?.base_result_count ?? 0),
      elapsedMs: Number(wire.debug?.elapsed_ms ?? 0),
    },
  });
}

export function toEngineMemoryFeedbackWire(input: MemoryFeedbackRequest): EngineMemoryFeedbackWire {
  const parsed = parseMemoryFeedbackRequest(input);
  return {
    query_id: parsed.queryId,
    memory_id: parsed.memoryId,
    event: parsed.event,
    context: toWireContext(parsed.context),
    occurred_at: parsed.occurredAt,
    note: parsed.note,
  };
}

export function toEngineMemoryDebugSessionWire(input: MemoryDebugSessionRequest): EngineMemoryDebugSessionWire {
  const parsed = parseMemoryDebugSessionRequest(input);
  return {
    session_id: parsed.sessionId,
    context: toWireContext(parsed.context),
    hypotheses: parsed.hypotheses.map((hypothesis) => ({
      id: hypothesis.id,
      text: hypothesis.text,
      status: hypothesis.status,
      evidence: hypothesis.evidence,
      rejection_reason: hypothesis.rejectionReason,
    })),
    started_at: parsed.startedAt,
    ended_at: parsed.endedAt,
  };
}
