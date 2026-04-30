# W-0348 — Pattern Object Store (Phase 2)

> Wave: 5 | Priority: P1 | Effort: M (~2d)
> Charter: In-Scope L3 (Pattern Research OS core)
> Status: 🟡 Design Draft
> Issue: #747
> Created: 2026-04-30
> Parent: W-0340 (Phase 1 = PR #720 머지 완료)

## Goal
Jin이 52개 PatternObject를 Supabase에서 직접 조회/검색하고, verdict·outcome이 같은 row에 누적되어 "패턴이 진짜 1급 객체"로 동작한다.

## Facts (실측)
- `PATTERN_LIBRARY` 크기: **52개** (확인: `from patterns.library import PATTERN_LIBRARY; len(...)`)
- 기존 `PatternObject` dataclass: `engine/patterns/types.py` (slug, name, description, phases, entry_phase, target_phase, tags, version 등)
- 기존 `thesis` 생성 로직: `engine/patterns/definitions.py::PatternDefinitionIndex._collect_thesis()`
- `PATTERN_LIBRARY`는 dict[str, PatternObject] — slug key
- PR #744 W-0314: `pattern_objects` 테이블 미사용 확인 (marketplace score 계산만)

## Scope
- **포함**:
  - migration `033_pattern_objects.sql` (Supabase)
  - `engine/patterns/store.py` — upsert / get / list
  - `engine/patterns/seed.py` — PATTERN_LIBRARY → DB 1회성 스크립트
  - `engine/api/routers/patterns.py` — 2개 GET 엔드포인트
  - `engine/tests/patterns/test_store.py` — 5개 테스트
  - `engine/api/main.py` — router include
- **파일 (실측 기반)**:
  - 신규: `app/supabase/migrations/033_pattern_objects.sql`
  - 신규: `engine/patterns/store.py`
  - 신규: `engine/patterns/seed.py`
  - 신규: `engine/api/routers/patterns.py`
  - 신규: `engine/tests/patterns/__init__.py`
  - 신규: `engine/tests/patterns/test_store.py`
  - 수정: `engine/api/main.py` (1줄 — router include)
  - 참고(수정 안 함): `engine/patterns/types.py`, `engine/patterns/library.py`
- **API**:
  - `GET /api/patterns` — list (phase 필터, limit, 인증 불필요)
  - `GET /api/patterns/{slug}` — single (인증 불필요)
- **Migration**: `033_pattern_objects.sql`

## Non-Goals
- Verdict UI 통합 (W-0346)
- Outcome backfill 잡 (W-0344)
- Marketplace 노출 (W-0314 #744)
- Feature snapshot 캡처 파이프라인 (Phase 3)
- Pattern editor UI (미정 Wave)
- Admin write 엔드포인트 (seed.py로 충분)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Migration 033 번호 충돌 (031/032 미배포) | 낮음 | 낮음 | 033은 PR merge 시 배포, 031/032는 Supabase 복구 후 별도 |
| slug UNIQUE 제약 위반 | 낮음 | 중간 | seed.py에 ON CONFLICT DO UPDATE (upsert) |
| PATTERN_LIBRARY import 시 side effect | 낮음 | 낮음 | seed.py는 CLI 전용, startup 미포함 |
| PatternObject dataclass → JSON 직렬화 | 중간 | 낮음 | dataclasses.asdict + 커스텀 jsonb serializer |
| RLS 누락으로 row 노출 | 낮음 | 높음 | migration에 RLS enable + select policy public |

### Canonical Files
- DB Truth: `app/supabase/migrations/033_pattern_objects.sql`
- Domain: `engine/patterns/store.py`
- API: `engine/api/routers/patterns.py`

### Dependencies
- PR #720 (Phase 1 z-score calibration) ✅ 머지됨
- PR #745 (CTO hardening) ✅ 머지됨
- 선행 불필요: PR #744 독립 영역

### Rollback
- `drop table pattern_objects cascade;` → 기존 .py 패턴은 영향 없음
- `engine/patterns/store.py`, `seed.py`, `routers/patterns.py` 삭제
- `engine/api/main.py` 1줄 revert

## AI Researcher 관점

### Data Impact
- 52개 PatternObject DB 진입 → verdict join, outcome aggregate, BH-FDR pattern-level 분석 가능
- `phase_sequence` GIN index → "oi_spike → funding_extreme 포함 패턴" < 1ms
- `labels` jsonb → 5-cat verdict 누적 시 row UPDATE (append log는 W-0346)
- `outcome` nullable — Phase 3까지 null, backfill은 W-0344

### Statistical Validation
- 본 W는 infra-only, statistical claim 없음
- Lookahead-free: `outcome` null로 시작, snapshot timestamp immutable

### Failure Modes
- FM-1: thesis 필드 생성 실패 → `""` 기본값 + warn (backfill 별도 issue)
- FM-2: `phases` list → jsonb 직렬화 시 PhaseCondition 중첩 → `dataclasses.asdict` 재귀 처리
- FM-3: Supabase 연결 실패 → seed.py exit 1 (retry 수동)

## Decisions
- **[D-0348-1]** Storage: Supabase Postgres ✅ (SQLite 거절 — verdict/outcome multi-client 필수)
- **[D-0348-2]** Schema: jsonb columns ✅ (normalized 거절 — 블록 파라미터 패턴마다 다름)
- **[D-0348-3]** Seed: 1회성 CLI 스크립트 ✅ (startup import 거절 — cold-start 지연)
- **[D-0348-4]** Snapshot/Outcome: null로 시작 ✅ (Phase 3/W-0344에서 채움)
- **[D-0348-5]** Migration 033: 독립 번호 ✅ (031/032 합산 거절 — PR 충돌 위험)

## Open Questions
- [ ] [Q-0348-1] `/api/patterns` 인증 여부 — 현재 public 가정, Stripe tier_gate 적용 시 수정 필요
- [ ] [Q-0348-2] thesis 한국어 허용 여부 — 현재 .py에 영어 description 존재, thesis는 definitions.py가 생성

## Implementation Plan
1. **migration 033** — `pattern_objects` 테이블, RLS, GIN index on slug
2. **`engine/patterns/store.py`** — pydantic `PatternRow`, `upsert(p)`, `get(slug)`, `list(phase, limit)`
3. **`engine/patterns/seed.py`** — PATTERN_LIBRARY 순회 → PatternObject → upsert, `--dry-run` 플래그, duplicate slug skip+warn
4. **`engine/api/routers/patterns.py`** — 2 GET endpoints, 의존성 없는 직접 store 호출
5. **`engine/api/main.py`** — `from api.routers.patterns import router as patterns_router` + include
6. **tests** (`tests/patterns/test_store.py`) — mock Supabase client:
   - `test_upsert_idempotent`
   - `test_get_by_slug`
   - `test_list_filter_by_phase`
   - `test_seed_skips_duplicate_slug`
   - `test_schema_round_trip`
7. **seed 실행** + `SELECT count(*) FROM pattern_objects` 검증
8. **smoke** — `curl /api/patterns | jq 'length'` ≥ 50

## Exit Criteria
- [ ] AC1: `pattern_objects` 테이블에 **≥50개** row upsert 성공 (52개 중 ≤2 허용 실패)
- [ ] AC2: `GET /api/patterns/{slug}` 200 + pydantic validate pass
- [ ] AC3: `GET /api/patterns?phase=oi_spike` 결과 — oi_spike phase 포함 패턴만
- [ ] AC4: pytest 5개 테스트 green, 전체 suite 회귀 0 (기준: 1955개)
- [ ] AC5: `seed.py` 2회 실행 → row count 변화 0 (idempotent upsert)
- [ ] AC6: CI green (typecheck, lint, contract, engine tests)
- [ ] AC7: PR merged to main + CURRENT.md SHA 갱신
