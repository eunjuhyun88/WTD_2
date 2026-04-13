// ═══════════════════════════════════════════════════════════════
// DOUNI Function Calling — Shared Types
// ═══════════════════════════════════════════════════════════════

import type { LLMProvider } from '../llmConfig';
import type { SignalSnapshot } from '$lib/engine/cogochi/types';
import type { SignalSnapshotRaw } from '$lib/server/engineClient';
import type { ResearchBlockEnvelope } from '$lib/contracts';

// ─── OpenAI-compatible Tool Definition ───────────────────────

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}

// ─── Tool Call (from LLM response) ──────────────────────────

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

// ─── Tool Execution Result ──────────────────────────────────

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

// ─── LLM Message with tool support ──────────────────────────

export interface LLMMessageWithTools {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

// ─── Streaming Chunk Types ──────────────────────────────────

export type LLMStreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolCall: ToolCall }
  | { type: 'tool_call_delta'; index: number; arguments: string }
  | { type: 'tool_call_done'; index: number }
  | { type: 'done' };

// ─── SSE Event Types (sent to client) ───────────────────────

export type DouniSSEEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; data: unknown }
  | { type: 'research_block'; payload: ResearchBlockEnvelope }
  | { type: 'layer_result'; layer: string; score: number; signal: string; detail?: string }
  | { type: 'chart_action'; action: string; payload: Record<string, unknown> }
  | { type: 'pattern_draft'; name: string; conditions: unknown[]; requiresConfirmation: boolean }
  | { type: 'social_data'; topic: string; sentiment: number; trending: boolean }
  | { type: 'scan_result'; sort: string; count: number }
  | { type: 'done'; provider: LLMProvider; totalTokens?: number }
  | { type: 'error'; message: string };

// ─── Tool Call Options ──────────────────────────────────────

export interface LLMStreamWithToolsOptions {
  messages: LLMMessageWithTools[];
  tools: ToolDefinition[];
  provider?: LLMProvider;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

// ─── Tool Executor Context ──────────────────────────────────

export interface ToolExecutorContext {
  /** Current symbol being discussed */
  symbol?: string;
  /** Current timeframe */
  timeframe?: string;
  /** Cached snapshot (avoid re-fetching if recent) */
  cachedSnapshot?: DouniSnapshot;
  /** User ID for pattern/feedback storage */
  userId?: string;
}
export type DouniSnapshot = SignalSnapshot | Partial<SignalSnapshotRaw>;
