# 06 — Data Contracts (API · DB · Events)

**Owner:** Engine + Contract agent
**Depends on:** `01`, `02`, `03`

## 0. 원칙

1. **Engine is source of truth**. App-web은 재해석 금지.
2. **Every route declares ownership** (proxy / orchestrated / app-domain).
3. **Schema versioning mandatory** on all persisted types.
4. **Wire format is append-only compatible** (new fields optional).

---

## 1. DB Schema Summary

모든 테이블 이미 §01, §02에 정의됨. 여기서는 cross-table constraints와 인덱스만 정리.

### 1.1 핵심 FK

```sql
alter table pattern_runtime_state
  add foreign key (pattern_id, pattern_version)
  references pattern_objects (pattern_id, version);

alter table phase_transitions  -- ★ 실제 테이블명 (phase_transition_events 아님)
  add foreign key (pattern_id, pattern_version)
  references pattern_objects (pattern_id, version);

alter table ledger_scores add foreign key (entry_id) references ledger_entries(entry_id);
alter table ledger_outcomes add foreign key (entry_id) references ledger_entries(entry_id);
alter table ledger_verdicts add foreign key (entry_id) references ledger_entries(entry_id);
```

### 1.2 핵심 인덱스

```sql
create index on pattern_runtime_state (current_phase_index) where current_phase_index > 0;
create index on phase_transitions (symbol, occurred_at desc);
create index on ledger_entries (pattern_id, entry_at desc);
create index on ledger_verdicts (user_id, judged_at desc);
create index on feature_windows (symbol, timeframe, window_end_ts desc);
create index on pattern_candidates (review_status) where review_status = 'pending';
```

### 1.3 Partitioning (scale 이후)

- `phase_transitions` → monthly partitions
- `ledger_entries` → quarterly partitions
- `feature_windows` → by timeframe + monthly

Phase 2+. 현재는 단일 테이블.

---

## 2. Core Object Schemas

### 2.1 PatternDraft (AI output)

```typescript
interface PatternDraft {
  schema_version: 1;
  pattern_family: string;           // snake_case
  pattern_label: string;
  source_type: "manual_note" | "telegram_post" | "chart_annotation" | "voice_memo";
  source_text: string;
  symbol_candidates: string[];
  timeframe: string;                // e.g. "15m", "1h", "4h"
  direction: "long" | "short" | "both";
  thesis: string[];                 // 1-4 items
  phases: PhaseDraft[];
  trade_plan: TradePlanDraft;
  search_hints: SearchHintsDraft;
  confidence: number;               // 0-1, parser self-assessed
  ambiguities: string[];
}
```

### 2.2 PatternObject (runtime immutable)

```typescript
interface PatternObject {
  schema_version: 1;
  pattern_id: string;               // stable slug
  pattern_family: string;
  version: number;
  timeframe: string;
  direction: "long" | "short" | "both";
  phases: PhaseDef[];
  trade_plan: TradePlan;
  thesis: string[];
  author: string;
  lineage: string[];
  created_at: string;               // ISO8601
  deprecated_at: string | null;
}
```

### 2.3 SearchQuerySpec

```typescript
interface SearchQuerySpec {
  schema_version: 1;
  pattern_family: string | null;
  timeframe: string;
  phase_path: string[];
  phase_queries: PhaseQuery[];
  must_have_signals: string[];
  preferred_timeframes: string[];
  exclude_patterns: string[];
  similarity_focus: ("sequence" | "oi_behavior" | "funding_transition" | "volume" | "structure")[];
  symbol_scope: string[];
  lookback_days: number;
}
```

### 2.4 SearchResult

```typescript
interface SearchResult {
  schema_version: 1;
  query_spec_ref: string;           // hash
  stage_stats: {
    stage1_count: number;
    stage2_count: number;
    stage3_count: number;
    stage4_count: number;
    duration_ms: Record<string, number>;
  };
  candidates: SearchCandidate[];
}

interface SearchCandidate {
  candidate_id: string;             // hash of (symbol, pattern_id, window_end_ts)
  symbol: string;
  timeframe: string;
  window_start_ts: string;
  window_end_ts: string;
  phase_path: string[];
  current_phase: string | null;
  final_score: number;              // 0-1
  sequence_score: number;
  rerank_prob: number | null;
  feature_vec_sim: number;
  ledger_outcome: {
    verdict: "HIT" | "MISS" | "EXPIRED" | null;
    peak_return_pct: number | null;
    exit_return_pct: number | null;
  } | null;
  chart_url: string | null;
  explanation: string | null;       // LLM judge, optional
}
```

### 2.5 ChartViewConfig

```typescript
interface ChartViewConfig {
  schema_version: 1;
  template: "event_focus" | "state_view" | "compare_view" | "scan_grid" | "flow_view" | "execution_view";
  title: string;
  symbol: string;
  timeframe: string;
  layout: "single" | "split" | "grid";
  panels: ChartPanelConfig[];
  annotations: Annotation[];
  hud_summary: HUDSummary;
  workspace_sections: string[];
}
```

---

## 3. API Routes (canonical)

### 3.1 Route Ownership

| Route | Ownership | Runtime |
|---|---|---|
| `POST /api/patterns/parse` | orchestrated | engine-api |
| `GET /api/patterns` | app-domain | app-web |
| `POST /api/patterns/candidates` | orchestrated | engine-api |
| `POST /api/patterns/{id}/approve` | engine-owned | engine-api |
| `GET /api/patterns/{id}/state` | proxy | app-web → engine-api |
| `POST /api/search/patterns` | orchestrated | engine-api |
| `POST /api/search/similar-to-capture` | orchestrated | engine-api |
| `POST /api/captures` | app-domain | app-web |
| `GET /api/ledger/entries` | proxy | engine-api |
| `POST /api/ledger/verdicts` | app-domain | app-web |
| `GET /api/visualization/config` | app-domain | app-web |
| `POST /api/agents/orchestrate` | orchestrated | engine-api |

### 3.2 Parse Endpoint

```
POST /api/patterns/parse

Request:
{
  "schema_version": 1,
  "source_type": "manual_note",
  "source_text": "OI 급등 후 한 번 더 저갱하고 15분봉 우상향 횡보 후 급등",
  "symbol_hint": "TRADOORUSDT",
  "timeframe_hint": "15m"
}

Response 200:
{
  "draft": PatternDraft,
  "validation_warnings": [],
  "parser_latency_ms": 2341,
  "parser_model": "claude-sonnet-4"
}

Response 422:
{
  "error": "parser_failed",
  "attempts": 3,
  "last_error": "signal 'random_name' not in vocabulary"
}
```

### 3.3 Search Endpoint

```
POST /api/search/patterns

Request: SearchQuerySpec

Response 200: SearchResult

Response 503:
{"error": "search_degraded", "available_stages": ["stage1", "stage2"]}
```

### 3.4 Capture Endpoint

```
POST /api/captures

Request:
{
  "schema_version": 1,
  "symbol": "TRADOORUSDT",
  "timeframe": "1h",
  "range_start": "2026-04-01T00:00:00Z",
  "range_end": "2026-04-02T12:00:00Z",
  "selected_features_snapshot": {...},
  "note": "2차 dump + OI 스파이크 확인",
  "tags": ["oi_spike_with_dump"],
  "chart_snapshot_url": "...",
  "candidate_alert_id": "..." | null
}

Response 201:
{
  "capture_id": "uuid",
  "linked_candidates": [...],      // similar captures found
  "next_actions": ["open_in_lab", "compare"]
}
```

### 3.5 Verdict Endpoint

```
POST /api/ledger/verdicts

Request:
{
  "entry_id": "uuid",
  "verdict": "VALID" | "INVALID" | "NEAR_MISS" | "TOO_EARLY" | "TOO_LATE",
  "comment": "funding flip 없이 잡힌 건 너무 이름",
  "source": "terminal" | "dashboard_inbox" | "batch_review"
}

Response 200:
{
  "verdict_id": "uuid",
  "ledger_updated_stats": {
    "hit_rate": 0.68,
    "sample_size": 23
  }
}
```

### 3.6 Visualization Config Endpoint

```
POST /api/visualization/config

Request:
{
  "intent_override": "STATE" | null,
  "symbol": "TRADOORUSDT",
  "timeframe": "1h",
  "natural_query": "지금 매집이냐" | null,
  "capture_id": null,
  "reference_capture_id": null
}

Response 200:
{
  "intent": "STATE",
  "chart_config": ChartViewConfig
}
```

---

## 4. Event Schemas

Append-only event bus (선택적). 현재는 DB polling 가능.

### 4.1 Phase Transition Event

```json
{
  "event_type": "phase.transitioned",
  "event_id": "uuid",
  "occurred_at": "2026-04-25T12:34:56Z",
  "symbol": "PTBUSDT",
  "pattern_id": "oi_reversal_v1",
  "pattern_version": 1,
  "from_phase": "real_dump",
  "to_phase": "accumulation",
  "transition_type": "advance",
  "bar_timestamp": "2026-04-25T12:30:00Z",
  "triggering_signals": ["higher_lows_sequence", "oi_hold_after_spike"],
  "features_snapshot_ref": "uuid"
}
```

### 4.2 Entry Created

```json
{
  "event_type": "entry.created",
  "event_id": "uuid",
  "entry_id": "uuid",
  "symbol": "PTBUSDT",
  "pattern_id": "oi_reversal_v1",
  "entry_phase_id": "accumulation",
  "entry_price": 1.234,
  "occurred_at": "2026-04-25T12:34:56Z"
}
```

### 4.3 Verdict Submitted

```json
{
  "event_type": "verdict.submitted",
  "event_id": "uuid",
  "verdict_id": "uuid",
  "entry_id": "uuid",
  "user_id": "u_123",
  "verdict": "VALID",
  "submitted_at": "2026-04-26T15:00:00Z"
}
```

---

## 5. Failure-Mode Contract

### 5.1 Analyze / Search

| Condition | Response |
|---|---|
| `deep=ok`, `score=ok` | full payload |
| `deep=ok`, `score=fail` | deep-authoritative, score fields null |
| `deep=fail`, `score=ok` | degraded, `degraded=true` |
| `deep=fail`, `score=fail` | 503 with error |

Silent fallback 금지. 항상 `degraded` 플래그와 이유 명시.

### 5.2 Parser Failure

- 3 retry 후에도 실패 → 422 `parser_failed`
- Ambiguity가 많으면 → 200 with `confidence<0.5`, UI는 "please clarify" 표시

### 5.3 Search Stage Failure

- Stage 1 실패 → 503 (근본 data 문제)
- Stage 2 실패 → degrade to feature-only ranking
- Stage 3 실패 → degrade to sequence-only ranking
- Stage 4 실패 (LLM) → silent, log only

---

## 6. Contract Versioning

### 6.1 Schema Version Field

모든 persisted + wire 객체에 `schema_version: int` 필수.

### 6.2 Backward Compat Rule

- New field: optional (default 제공)
- Removed field: deprecation 3 release 동안 유지
- Changed semantic: new `schema_version`

### 6.3 Version Negotiation

```
Client → Server: Accept-Schema-Version: 1,2
Server → Client: Content-Schema-Version: 2
```

(Optional, 2026 Q3 이후)

---

## 7. Auth / Rate Limits

### 7.1 Auth

- User session cookie (existing)
- API key for programmatic access (Phase 2)
- Engine-to-engine: internal mTLS (Phase 3)

### 7.2 Rate Limits

| Tier | Parser | Search | Capture | Verdict |
|---|---|---|---|---|
| Free | 10/mo | 20/day | 5/day | unlimited |
| Pro $29 | unlimited | 200/day | unlimited | unlimited |
| Team | unlimited | 1000/day | unlimited | unlimited |

초과 시 429.

---

## 8. Adapter Layer (app-web typed contracts)

```
app/src/lib/contracts/
  schemas.ts              # zod or valibot validators
  patterns.ts             # PatternDraft, PatternObject types
  search.ts               # SearchQuerySpec, SearchResult types
  ledger.ts               # Entry/Score/Outcome/Verdict types
  viz.ts                  # ChartViewConfig types
  adapters/
    patternDraftToUIModel.ts
    searchResultToGridModel.ts
    entryToTimelineModel.ts
```

**Rule**: app-web은 타입 assertion만. Semantic reshape 금지.

---

## 9. Audit / Replay

### 9.1 Replay 조건

- 같은 `cycle_id` → 같은 transition decisions
- 같은 `search_query_hash` → 같은 ranking (modulo LLM nondeterminism)
- 같은 `entry_id` → 같은 outcome computation

### 9.2 Replay Log

```
engine/replay/
  search_runs/{query_hash}/
    input.json
    stage1_candidates.jsonl
    stage2_ranked.jsonl
    stage3_reranked.jsonl
    stage4_judged.jsonl
    final.json
    metadata.json  # model versions, timestamps
```

Phase 2에서 필수. Day-1은 optional.

---

## 10. 예시 호출 흐름

### 10.1 New Pattern Registration

```
1. User pastes telegram memo into /terminal
   POST /api/patterns/parse → PatternDraft
2. User reviews, edits
   POST /api/patterns/candidates → PatternCandidate (pending)
3. Human reviewer approves
   POST /api/patterns/{id}/approve → PatternObject (version=1)
4. Backfill job enqueued
   worker-control runs backfill → pattern_runtime_state populated
5. Scanner begins tracking
```

### 10.2 Live Pattern Monitoring

```
1. Scanner (tier-1 1min cycle) reads feature_windows
2. evaluate_phase_transition() per symbol × pattern
3. If advance: INSERT phase_transitions ★실제 테이블명
4. If entry_phase reached: INSERT ledger_entries
5. If entry_phase == actionable: emit entry.created event
6. Alert fanout → user dashboard
7. User opens /terminal with context → GET /api/visualization/config
8. User judges → POST /api/ledger/verdicts
9. After 72h: outcome_job computes ledger_outcomes
10. verdict disagreement → refinement_job trigger
```

---

## 11. Non-Goals

- GraphQL surface (REST + JSON 충분)
- gRPC between app and engine (Phase 3+)
- Full audit log of every field change
- Real-time subscriptions via websocket (배치로 충분)
