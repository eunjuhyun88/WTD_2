# W-0341 — Hypothesis Registry Supabase Deployment & Integration Tests

> Wave: 5 | Priority: P1 | Effort: S
> Charter: In-Scope (Research OS infrastructure)
> Status: 🟡 Design Draft
> Issue: #728
> Created: 2026-04-30

## Goal
W-0317에서 작성된 hypothesis_registry migration을 실제 Supabase에 배포하고,
격리/만료/lookahead 가드를 통합 테스트로 보장한다.

## Scope
- 포함: migration 027 배포, integration tests 4개
- 파일:
  - `app/supabase/migrations/027_hypothesis_registry.sql` (이미 존재)
  - `engine/tests/test_hypothesis_registry_integration.py` (신규)
- API: 없음 (DB-layer only)

## Non-Goals
- `/research/discover` LLM 실호출 (→ W-0342)
- hypothesis store UI (→ 별도)
- RLS 정책 강화 (현재 service_role key로 충분)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| migration 이미 배포됨 | 낮음 | 없음 | idempotent SQL (IF NOT EXISTS) |
| integration test CI 실행 | 중간 | 중간 | pytest mark e2e, CI skip |
| Supabase service_role key 노출 | 낮음 | 높음 | env only, .env.local 사용 |

### Dependencies
- Supabase project: hbcgipcqpuintokoooyg
- migration 027: `app/supabase/migrations/027_hypothesis_registry.sql`

### Canonical Files
- `app/supabase/migrations/027_hypothesis_registry.sql`
- `engine/tests/test_hypothesis_registry_integration.py`

## AI Researcher 관점

### Data Impact
- hypothesis_registry는 lookahead bias 방지의 핵심 (as_of 컬럼)
- family 격리로 overfitting 탐지 가능

### Statistical Validation
- AC3: 366일 archive purge → 1년 이상 된 가설 자동 만료

### Failure Modes
- as_of=None → ValueError로 잘못된 미래 데이터 오염 방지

## Decisions
- [D-0341-1] migration 배포: supabase MCP 또는 `supabase db push` CLI 사용

## Open Questions
- [ ] [Q-0341-1] migration 027 이미 Supabase prod에 배포됐는지 확인 필요

## Implementation Plan
1. `supabase db diff` 또는 MCP `list_migrations`로 현재 배포 상태 확인
2. 미배포 시 `apply_migration` 실행
3. `test_hypothesis_registry_integration.py` 작성:
   - AC1: slug 중복 등록 count=2
   - AC2: family 격리 SELECT
   - AC3: 366일 purge
   - AC4: as_of=None → ValueError
4. `pytest -m e2e engine/tests/test_hypothesis_registry_integration.py`

## Exit Criteria
- [x] AC1: slug 2회 등록 → count=2
- [x] AC2: family 격리 SELECT (family_a 결과에 family_b slug 미포함)
- [x] AC3: 366일 archive purge (as_of 기준)
- [x] AC4: as_of=None → ValueError
- [x] AC5: prod Supabase hypothesis_registry 테이블 deployed (migration 031)
- [x] AC6: 4 integration tests GREEN (실 DB 연결)
- [ ] AC7: W-0317 AC11 공식 취소 처리

## Owner
engine

## Facts
- `app/supabase/migrations/027_hypothesis_registry.sql` 존재 확인됨
- migration 027 prod 배포 여부 미확인 (Q-0341-1)
- `engine/tests/` 디렉터리에 integration test 없음

## Assumptions
- Supabase service_role key는 `.env.local`에 존재
- migration이 idempotent (IF NOT EXISTS) 작성됨

## Next Steps
1. Supabase MCP `list_migrations` 실행 → 027 배포 여부 확인
2. 미배포 시 `apply_migration` 호출
3. integration test 파일 작성 후 pytest -m e2e 실행

## Canonical Files
- `app/supabase/migrations/027_hypothesis_registry.sql`
- `engine/tests/test_hypothesis_registry_integration.py`

## Handoff Checklist
- [ ] Q-0341-1 해소: prod migration 상태 확인
- [ ] integration test 4개 작성 + CI pass
