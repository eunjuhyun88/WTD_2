export interface DecisionRow {
  id: string;
  cmd: string;
  llm_verdict: string | null;
  latency_ms: number | null;
  created_at: string;
  features_json: Record<string, unknown> | null;
}
