---
name: CTO 전체 데이터 아키텍처 재설계 (2026-04-25 C)
description: 설계 문서 vs 실제 코드베이스 비교 후 10개 CTO 결정 + docs/design/ 11개 파일 커밋. 다음 P0: Ledger→Supabase, DB migration system.
type: project
---

## 완료 사항 (commit c0623193, branch claude/romantic-merkle)

13개 파일, 7470줄 추가:
- `docs/design/00_MASTER_ARCHITECTURE.md` — 마스터 아키텍처 v3.0
- `docs/design/01_PATTERN_OBJECT_MODEL.md` ~ `06_DATA_CONTRACTS.md` — 도메인별 설계 문서
- `docs/design/09_RERANKER_TRAINING_SPEC.md` — LambdaRank 17-feature spec
- `docs/design/10_COMPLETE_DATA_ARCHITECTURE.md` — 전체 데이터 아키텍처 v1.2 (§1-18)
- `docs/design/11_CTO_DATA_ARCHITECTURE_REALITY.md` — 설계 vs 실제 비교 + 10개 CTO 결정
- `docs/design/DESIGN_V3.2_KNOWLEDGE_ARCHITECTURE.md` — 4-layer knowledge architecture
- `docs/design/indicator-viz-system-plan-2026-04-22.md` — 지표 viz 계획
- `engine/wiki/COGOCHI.md` — LLM Agent schema (17 sections)

**Why:** 설계 문서와 실제 codebase가 불일치하여 에이전트 간 혼선 발생 위험. CTO 수준 재정의로 단일 진실 소스 확립.

## 10개 CTO 핵심 결정

| 결정 | 내용 |
|---|---|
| 검색 파이프라인 | 3-layer blend (A/B/C) 유지 — 설계의 4-stage sequential보다 우월 |
| LightGBM 분리 | Binary P(win) classifier (기존) + LambdaRank reranker (신규, verdict 50+ 이후) |
| Ledger → Supabase | P0 — JSON files = Cloud Run 재시작 시 소실 위험 |
| engine/rag/ 이름 | 유지 (실제로는 256-dim deterministic embedding, NOT semantic RAG) |
| Semantic RAG | Phase 3 트리거 (뉴스 ingestion 결정 시점). 현재 불필요. |
| Migration system | P0 즉시 — embedded DDL로는 schema 변경 불가 |
| Stats Engine | `engine/stats/engine.py` 신규 — pattern_stats_cache 없으면 Wiki 불가 |
| Context Assembly | `engine/agents/context.py` 신규 — LLM call마다 context 주입 규칙 없음이 현재 최대 갭 |
| Pattern library | 현재 hardcoded Python dict → definition versioning (P2) |
| Read/Display 분리 | WorkspacePayload BFF endpoint (P3) |

## 실제 코드 현황 (설계와 다른 것들)

- `engine/patterns/library.py` = hardcoded Python dict (NOT registry)
- `engine/ledger/store.py` = JSON files on disk `/ledger_data/{slug}/`
- `engine/search/similar.py` = 3-layer blend with dynamic weights (설계의 4-stage와 다름 → 실제가 더 좋음)
- `engine/scoring/lightgbm_engine.py` = `objective="binary"`, `metric="auc"` (NOT lambdarank)
- `engine/rag/embedding.py` = deterministic 256-dim (4 endpoints, NO pgvector, NO LLM)
- No `engine/wiki/`, no migration system 존재

## §18 LLM Wiki 구조 (Karpathy 패턴 적용)

```
engine/wiki/ingest.py    ← WikiIngestAgent (LLM prose only, frontmatter은 stats_engine만)
engine/wiki/query.py     ← WikiQueryAgent
engine/wiki/lint.py      ← WikiLintAgent (read-only, corruption check)
cogochi/wiki/patterns/   ← markdown export output
```

트리거: on_capture_created, on_verdict_submitted, on_pattern_stats_refreshed, on_weekly_trigger
Storm prevention: debounce 60s, max 10 pages/call

## §17 Indicator Viz 데이터 연결 (추가됨)

- `user_indicator_preferences` 신규 테이블 필요 (shell.store.visibleIndicators DB 영속)
- wiki_pages.page_type에 'indicator' 추가
- G(iv_term_structure)→raw_options_metrics, H(exchange_netflow)→raw_onchain_metrics, I(strike OI)→raw_options_oi, J(event)→signal_events

## 다음 P0 구현 순서 (코드)

1. **P0-1**: `engine/ledger/supabase_store.py` 완성 (JSON → Supabase)
2. **P0-2**: `engine/db/migrations/*.sql` migration system
3. **P1-1**: W-0156 feature_windows → search corpus 연결
4. **P1-2**: `engine/stats/engine.py` Stats Engine
5. **P2-1**: `engine/agents/context.py` Context Assembly rules
6. **P2-2**: `engine/wiki/ingest.py` WikiIngestAgent

**How to apply:** P0 작업 시작 전 이 문서 확인. Ledger Supabase 이전이 가장 긴급 (데이터 소실 위험).
