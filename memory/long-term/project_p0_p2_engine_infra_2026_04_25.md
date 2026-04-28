---
name: P0-P2 엔진 인프라 구현 완료 (2026-04-25 D)
description: PR #281 머지(61e7ce11): 5개 신규 모듈 — migration runner, corpus bridge, stats engine, context assembler, wiki agent. 다음: GCP 재배포 + wiki 첫 페이지 populate.
type: project
---

## 완료 사항 (PR #281, merge commit 61e7ce11)

| 모듈 | 파일 | 핵심 |
|---|---|---|
| P0-2 | `engine/db/migrate.py` | Supabase migration runner — `_engine_migrations` 테이블 추적, 멱등성. CLI: `python -m engine.db.migrate` |
| P1-1 | `engine/features/corpus_bridge.py` | `feature_windows` → `SearchCorpusStore` — 6필드→40+필드 enriched signature |
| P1-2 | `engine/stats/engine.py` | `PatternStatsEngine` — `batch_list_all()` 단일 쿼리, 5분 TTL 캐시 |
| P2-1 | `engine/agents/context.py` | `ContextAssembler` — Parser(10K)/Judge(12K)/Refinement(12K) 토큰 예산 |
| P2-2 | `engine/wiki/ingest.py` | `WikiIngestAgent` — debounce 60s, max 10pages/batch, Haiku default |
| Dirs | `cogochi/wiki/patterns/`, `cogochi/wiki/weekly/` | wiki output 디렉토리 |

**Why:** P0: 데이터 소실 위험(JSON→Supabase). P1: Layer A 40+차원 검색. P2: LLM context 규칙 없음이 최대 갭.

## 비용 최적화 결정

- Stats: N+1 쿼리 → `batch_list_all()` 단일 Supabase roundtrip
- Wiki LLM: `claude-haiku-4-5` 기본값, 페이지당 800 토큰 상한
- Context 토큰 예산 강제 적용 (초과 시 자동 truncate)
- ContextAssembler lazy loading

## 현재 main SHA

`61e7ce11` (PR #281 merge commit)

## 다음 단계

1. GCP Cloud Run 재배포 — 신규 모듈 반영
2. `python -m engine.db.migrate --status` — migration 상태 확인
3. `python -m engine.features.corpus_bridge --all` — 첫 corpus populate
4. Wiki 첫 페이지: `WikiIngestAgent().on_weekly_trigger()` 호출
5. `cogotchi-worker` Cloud Build trigger 설정 (인프라 미완)

## 인프라 미완 (사람 직접)

- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 프로덕션 환경변수
- [ ] Cloud Scheduler HTTP jobs 등록

**How to apply:** 다음 세션 시작 시 GCP 재배포 먼저. corpus_bridge 실행은 feature_materialization.sqlite 데이터가 있어야 함.
