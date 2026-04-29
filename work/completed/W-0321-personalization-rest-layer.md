# W-0321 — personalization REST layer + code quality fixes

> Wave: 4 | Priority: P1 | Effort: M
> Charter: In-Scope L7 (Personalization)
> Status: 🟡 Design Draft → 구현 중
> Created: 2026-04-30
> Issue: #681
> Depends-on: W-0312 (engine/personalization core ✅)

## Goal

사용자별 verdict가 들어오면 affinity 점수 + 임계값 델타(stop_mul/entry_strict/target_mul)가 즉시 REST로
응답되어, 앱이 per-user variant를 선택할 수 있도록 한다 (W-0312 코어를 외부 노출).

## Scope

### 버그 수정
- `engine/personalization/threshold_adapter.py` — Bug 1: initial_state() informed prior (pseudo_count=0.0 default, backwards-compat)
- `engine/personalization/user_variant_registry.py` — Bug 2: _cache dead code 제거
- `engine/personalization/affinity_registry.py` — Bug 3: audit_log_path 생성자 주입, 하드코딩 제거

### 신규 파일
- `engine/personalization/exceptions.py` — PersonalizationError 계층
- `engine/personalization/pattern_state_store.py` — UserPatternState JSON 영속화 (scheduler/api 공유)
- `engine/personalization/scheduler.py` — daily decay + rescue trigger
- `engine/personalization/api.py` — 4 REST endpoints
- `engine/api/main.py` — router 등록

### 신규 테스트 (≥8개)
- `engine/tests/test_personalization_api.py` (3)
- `engine/tests/test_personalization_scheduler.py` (2)
- `engine/tests/test_personalization_state_store.py` (2)
- `engine/tests/test_personalization_exceptions.py` (1)

## Non-Goals
- UI 통합 (W-0308 F-14)
- Tier gate (paid-only) — 후속 PR
- WVPL endpoint 재구현 (metrics_user.py에 이미 존재)
- Supabase row 영속화 (JSON 파일로 충분)

## Exit Criteria
- [ ] AC1: POST /personalization/verdict 200 응답 (curl + pytest httpx)
- [ ] AC2: cold/warm 분기 정확 (n<10 → mode="global_fallback")
- [ ] AC3: 기존 19 tests 전부 통과 (backwards-compat)
- [ ] AC4: 신규 tests ≥ 8개
- [ ] AC5: uv run pytest engine/tests/ -q 전체 green
- [ ] AC6: audit_log_path tmp_path 격리 (test isolation)
- [ ] AC7: CI green
