# 07 — Implementation Roadmap & Kill Criteria

**Owner:** CTO / Tech Lead
**Depends on:** 00-06

## 0. 원칙

1. **루프를 닫는 것이 먼저**. Capture → Pattern → Scan → Candidate → Verdict → Refinement까지 한 바퀴가 살아있어야 다음 기능을 쌓는다.
2. **한 번에 하나의 slice**. 병렬 slice는 control plane에서 강제된 방식으로만.
3. **Kill criteria 먼저 정의**. 중단 조건 없이는 sunk cost fallacy에 빠진다.
4. **Every ship is measurable**. Metric 없이 배포하지 않는다.

---

## 1. 현재 상태 (2026-04-25 기준)

구현 완료:
- Feature calc (28~92 cols)
- 31 building blocks
- Rule-first Pattern Object types
- Sequential state machine (in-memory)
- Pattern scanner (latest-bar)
- JSON ledger
- Dynamic universe
- Terminal chart board + pattern status bar
- Challenge CRUD

누락 또는 부분:
- **Durable pattern state plane** (가장 큰 구멍)
- AI parser endpoint
- 4-stage search pipeline (sequence matcher, reranker)
- Split ledger records
- User verdict / refinement loop
- Visualization intent router
- Personal variants
- Multi-timeframe search

---

## 2. Slice Priority

현재 리포의 `refinement-methodology.md` slice ordering과 정합 유지.

### Slice 1 — Contract Cleanup (1 week)

**Problem**: App routes가 engine 출력을 reshape하고 UI envelope을 fabricate.

**Deliverables**:
- `app/src/lib/contracts/*.ts` typed adapter
- Remove synthetic `since` 필드 등 UI-only reshape
- All routes declare ownership type

**Kill**: 2주 초과 시 middleware 추가로 blast radius 줄이기

### Slice 2 — Durable State Plane (2 weeks)

**Problem**: `state_machine.py` in-memory. 재시작 시 phase path 소실.

**Deliverables**:
- `pattern_runtime_state` + `phase_transition_events` tables
- DB-backed state machine with optimistic lock
- Backfill job (replay history)
- Scanner idempotent on restart

**Gate**: Shadow mode 7일, zero divergence vs in-memory baseline

**Kill**: State conflict rate > 10% after 7 days → 단일 worker sharding

### Slice 3 — AI Parser (1.5 weeks)

**Problem**: 자연어 → PatternDraft 경로 없음.

**Deliverables**:
- `POST /api/patterns/parse` endpoint
- Claude Sonnet integration with function calling
- Vocabulary injection from DB
- Draft validator + retry loop
- Pattern candidate table + review UI (basic)

**Gate**:
- 50 real telegram memos parsed
- Schema compliance ≥ 95%
- Phase ordering correctness ≥ 90% (human review)

**Kill**: Compliance < 80% after 100 samples → schema 간소화

### Slice 4 — Save Setup Capture Plane (1 week)

**Problem**: Save Setup이 canonical ledger capture가 아님.

**Deliverables**:
- `POST /api/captures` with chart + feature snapshot
- Link captures to pattern candidates
- Link captures to future outcomes (via pattern_runtime_state)
- Duplicate detection

**Gate**:
- Capture conversion rate (view → save) ≥ 20%
- Avg 2+ captures per active user per week

**Kill**: Save conversion < 10% at M1 → onboarding 재설계

### Slice 5 — Split Ledger Records (1 week)

**Problem**: 단일 JSON record가 entry/score/outcome/verdict 섞임.

**Deliverables**:
- 4 tables: `ledger_entries`, `ledger_scores`, `ledger_outcomes`, `ledger_verdicts`
- `ledger_training_view` materialized view
- Migration from legacy JSON → new schema (shadow 2주)
- Outcome job (72h window)

**Kill**: Migration 5% 이상 row drop → migration 재설계

### Slice 6 — Search Engine Stage 1+2 (2 weeks)

**Problem**: 유사 패턴 검색이 현재 단순 feature similarity만.

**Deliverables**:
- SQL candidate generator
- Sequence matcher (edit distance + duration-aware)
- `POST /api/search/patterns` endpoint
- Benchmark pack infrastructure

**Gate**:
- Manual eval: 10 queries, ≥60% top-5 include "obviously relevant" cases
- Latency < 2s at stage 2

**Kill**: Eval < 40% → feature set 점검 (L2 plane 문제)

### Slice 7 — Visualization Intent Router (1.5 weeks)

**Problem**: 모든 데이터가 한 화면에 soup.

**Deliverables**:
- `POST /api/visualization/config` returning ChartViewConfig
- 6 template components (Svelte)
- HighlightPlanner
- Resizable SplitPane + Mode switcher (Observe/Analyze/Execute)

**Gate**:
- Usability test with 5 power users
- Time-to-decision improvement vs current screen: ≥30%

**Kill**: Time-to-decision 악화 → roll back to single template + HUD

### Slice 8 — Verdict Loop & Refinement (2 weeks)

**Problem**: User judgment이 refinement으로 연결 안 됨.

**Deliverables**:
- Judgment UI in HUD + dashboard inbox
- `POST /api/ledger/verdicts`
- Refinement proposal generator (threshold suggestion from HIT/MISS clusters)
- Pattern candidate → variant migration

**Gate**:
- 30% of alerts receive verdict within 72h
- ≥10 verdicts per pattern_family within first month → trigger refinement proposal

**Kill**: Verdict rate < 15% for 2 weeks → UX fundamentally wrong

### Slice 9 — Reranker (LightGBM, 2 weeks)

**Problem**: Stage 3이 없음. Top 5 품질이 sequence-only.

**Precondition**: Slice 8 완료 + 50+ verdicts

**Deliverables**:
- Training pipeline `engine/search/reranker_train.py`
- Feature extraction from candidate+context
- LightGBM ranker with NDCG@5
- Isotonic calibration
- Shadow scoring (log only) 2주
- Promotion gate

**Gate**:
- Shadow NDCG@5 improvement ≥ +0.05 over baseline
- No false-positive spike in verdict-tagged candidates

**Kill**: NDCG improvement < 0.02 → feature set 재검토

### Slice 10 — Personal Variants (1.5 weeks)

**Precondition**: Slice 8 + 10+ verdicts per user

**Deliverables**:
- `personal_variants` table
- Override UI in pattern detail
- Per-user ranker calibration (optional)
- Personal stats dashboard

**Gate**:
- Pro users: ≥30% create ≥1 variant in first month
- Variant retention rate ≥ 60%

### Slice 11 — Multi-Timeframe Search (2 weeks)

**Precondition**: Slice 6 complete

**Deliverables**:
- Benchmark pack with multi-TF
- Pattern family normalization (15m vs 1h vs 4h same structure)
- Variant registry
- Promotion gate with holdout

### Slice 12 — LLM Judge (optional, 1 week)

**Precondition**: Slice 9 complete + reranker plateau

**Deliverables**:
- Stage 4 LLM judge with Claude
- Explanation field in SearchResult
- Caching layer

**Kill**: Latency budget 초과 + no quality gain → disable

---

## 3. Total Timeline

```
Slice 1    [1w]   Week 1
Slice 2    [2w]   Week 2-3    (parallel with Slice 3)
Slice 3    [1.5w] Week 2-3.5
Slice 4    [1w]   Week 4
Slice 5    [1w]   Week 5
Slice 6    [2w]   Week 6-7
Slice 7    [1.5w] Week 8-9    (parallel with Slice 8)
Slice 8    [2w]   Week 8-9
Slice 9    [2w]   Week 10-11
Slice 10   [1.5w] Week 12-13
Slice 11   [2w]   Week 14-15
Slice 12   [1w]   Week 16 (optional)
```

Total: ~16 weeks to core loop complete + advanced features.

Day-1 product (Slices 1-5) = 6 weeks.
Defensible product (through Slice 8) = 9 weeks.
Advanced (through Slice 11) = 15 weeks.

---

## 4. Parallel Work Rules

Slices with `[parallel]` tag can run concurrently **if** owned by different agents via `agent_session` claims.

Never parallel:
- Slices that share migration (2 + 5)
- Slices that share endpoint contracts (3 + 4)

Always parallel:
- Slice 7 (frontend) + Slice 6 (engine search)
- Slice 8 (UX) + Slice 9 (reranker training)

---

## 5. Metrics & Kill Criteria (Global)

### 5.1 Product Health

| Metric | Green | Yellow | Red (kill trigger) |
|---|---|---|---|
| Weekly Active Analysts | ≥ 200 (M3) | 100-199 | < 100 |
| Sessions per WAA | ≥ 2.5 | 1.5-2.4 | < 1.5 |
| Save conversion | ≥ 20% | 10-19% | < 10% |
| Verdict rate (alert → judgment) | ≥ 30% | 15-29% | < 15% |
| Hit rate delta (post-refinement) | ≥ +5%p | +2-4%p | < +2%p |
| D7 retention | ≥ 30% | 15-29% | < 15% |

Red 상태 2주 지속 → 해당 slice 재설계.

### 5.2 Engine Health

| Metric | Target | Alert |
|---|---|---|
| Scan latency p99 | < 5s | > 30s |
| State conflict rate | < 1% | > 5% |
| Parser schema compliance | ≥ 95% | < 80% |
| Sequence matcher hit@5 | ≥ 60% | < 40% |
| Reranker NDCG@5 vs baseline | ≥ +0.05 | < +0.02 |
| Outcome job SLA | ≤ 1h past window | > 6h past |

### 5.3 Cost

| Component | Budget (per active user / month) |
|---|---|
| LLM parser | $1.50 |
| LLM judge (optional) | $1.20 |
| Storage (DB + feature history) | $0.50 |
| Compute (scan cycles) | $1.00 |
| **Total** | **~$5/user** |

Pro $29 → 83% gross margin. 이하로 떨어지면 tier 재설계.

---

## 6. Tech Debt Ledger

이미 있는 부채 (slice보다 먼저 처리):

| Debt | Severity | Slice |
|---|---|---|
| In-memory state machine | **P0** | Slice 2 |
| Hardcoded pattern library | P1 | Slice 5 (registry) |
| App route reshape engine output | P1 | Slice 1 |
| No parser endpoint | P0 | Slice 3 |
| JSON ledger single-table | P2 | Slice 5 |
| No benchmark pack infra | P2 | Slice 11 |

P0 = 2주 내 해결. P1 = 1달. P2 = roadmap 내.

---

## 7. Risk Register

### 7.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sequence matcher 정확도 부족 | Medium | High | Benchmark pack 투자, manual eval |
| LLM parser cost 폭증 | Low | Medium | Cache aggressive, fine-tune later |
| State DB contention | Medium | High | Optimistic lock + symbol sharding |
| Migration data loss | Low | High | Shadow 2주 + diff audit |
| Multi-timeframe 복잡도 폭발 | High | Medium | 3 TF로 scope 고정 (15m/1h/4h) |

### 7.2 Product Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Save conversion 낮음 | Medium | High | Onboarding + 캡처 friction 제거 |
| 판정 rate 낮음 | Medium | High | Inbox push + 1-click verdict |
| 유저가 "신기함"만 체험 후 이탈 | High | High | Team/워크스페이스 기능 조기 배치 |
| 경쟁사 sequence matcher 도입 | Low | High | Moat = data + verdict, speed 중요 |

### 7.3 Business Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 대중형 포지셔닝 실수 | High | High | "Pattern Research OS" 고정 |
| Team plan demand 부족 | Medium | High | Individual Pro 먼저 validate |
| Regulatory (투자 자문) | Low | High | Non-advisory disclaimer, not signal service |

---

## 8. Decision Log (Key Choices)

### 8.1 LLM = Parser, not Engine

Chosen because: 재현성 + 감사 가능성 + 비용

Alternative rejected: "LLM이 다 판단" → 블랙박스, 학습 데이터 레버리지 불가

### 8.2 Rule-first, ML-later

Chosen because: 초기 데이터 부족, 해석 가능성

Alternative rejected: Deep learning first → 데이터 1만 샘플 필요, 없음

### 8.3 Postgres, not specialized vector DB

Chosen because: 이미 있음, pgvector 충분

Alternative rejected: Pinecone/Weaviate → 오버엔지니어링

### 8.4 Svelte, not React

Chosen because: 현재 리포

Alternative rejected: React 재작성 → scope creep

### 8.5 Single worker first

Chosen because: State 일관성 > scale

Alternative rejected: Distributed scan → 현재 scale에서 불필요

---

## 9. Ownership Map

| Area | Primary Owner | Backup |
|---|---|---|
| Engine core (L3-L5) | Engine Agent | Research Agent |
| AI Parser + Judge | Research Agent | Engine Agent |
| Visualization | App Agent | — |
| Contracts + routes | Contract Agent | App Agent |
| Ledger + Refinement | Research Agent | Engine Agent |
| State Plane | Engine Agent | — |
| Search Pipeline | Research Agent | Engine Agent |

Each agent operates under `multi-agent-execution-control-plane.md` rules: registered session, explicit claim, heartbeat, handoff event.

---

## 10. Non-Goals (Roadmap)

- TradingView feature parity
- Mobile app v1 beyond responsive web
- On-chain execution (Phase 3+ separate track)
- Multi-exchange aggregation beyond Binance perp (Phase 2)
- Voice agent interface
- Customer-facing LLM chat (beyond parser)
- Real-time collaborative editing
- Billing / subscription management (use Stripe, not custom)
- Own fine-tuning infrastructure (use Anthropic/OpenAI fine-tune APIs until scale justifies)

---

## 11. Success Criteria (M3 = 3 months)

- ✅ Core loop closed: capture → scan → candidate → verdict → refinement
- ✅ Durable state plane
- ✅ Parser in production with 95%+ schema compliance
- ✅ 4-stage search pipeline (at least stage 1-3)
- ✅ 6-template visualization router
- ✅ 200+ weekly active analysts
- ✅ 500+ verdicts in ledger
- ✅ Reranker deployed (shadow → primary)
- ✅ Hit rate delta ≥ +5%p post-refinement

Miss any 2 → re-evaluate category positioning or kill.

---

## 12. Post-M3 Candidate Tracks

이후 가능 tracks (exclusive, pick one):

### Track A — Team / Workspace

- Shared pattern library
- Public/private ledger
- Team annotations
- Pricing: $199-$999/team/month

### Track B — API / Engine Marketplace

- Public pattern API
- Strategy export → on-chain vault (Cogochi L1 연계)
- Signal subscription

### Track C — Fine-tune Tier

- Personal LoRA adapters
- Chart interpretation model
- Pricing: $99/user/month

M3 데이터 기반으로 결정. 둘 이상 시도하면 집중력 분산.
