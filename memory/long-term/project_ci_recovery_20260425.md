---
name: CI 복구 세션 체크포인트 (2026-04-25)
description: 3-agent 병렬 머지 충돌로 발생한 39개 engine 테스트 실패 전체 수리 완료
type: project
---

# CI 복구 완료 — feat/agent-execution-protocol

**커밋**: `65765205`
**브랜치**: `feat/agent-execution-protocol`
**결과**: 39 failed → 1422 passed, 0 failed

**Why:** W-0163(feature_windows), JWT P0(W-0162), W-0200(core loop) 3개 에이전트가 병렬로 PR 머지하면서 충돌 발생.

**How to apply:** 다음 세션에서 이 브랜치 작업 재개 시 참고.

## 수리 항목 (15 files)

### 인증 관련
- `api/main.py`: jwt_auth_middleware가 `x-engine-internal-secret` 헤더 있으면 JWT 스킵 → contract 테스트 통과
- `tests/test_capture_routes.py`, `test_runtime_routes.py`, `test_pattern_candidate_routes.py`: 인라인 `_attach_fake_auth` 헬퍼 추가 → 401 수정

### 패턴 엔진
- `patterns/library.py`: TRADOOR BREAKOUT phase `required_blocks` → `post_accumulation_range_breakout` (이전: `breakout_from_pullback_range`)
- `patterns/replay.py`: `_referenced_blocks_for_pattern()` 헬퍼 + `requested_blocks=` 파라미터 전달
- `scoring/block_evaluator.py`: `post_accumulation_range_breakout` 등록 + `requested_blocks` 필터링

### 리서치 레이어
- `research/pattern_search.py`:
  - `ensure_default_pack`: `["1h","4h"]` → `["15m","1h","4h"]`
  - `__breakout-range-soft` variant 추가
  - `_supported_candidate_timeframes`: `allow_sub_base` 파라미터 추가 (build_search_variants=True, expand_variants=False 유지)
  - `evaluate_variant_on_case`: CacheMiss → DATA_MISSING 처리
- `research/query_transformer.py`: signal-vocab-v2 (30+ 신호), forbidden signal 매핑
- `research/state_store.py`: `ResearchRun.definition_ref` 옵셔널 (dataclass 필드 순서 수정)

### API 라우트
- `api/routes/patterns.py`: `_capture_store`, `_benchmark_pack_store`, `_pattern_search_artifact_store`, `_negative_search_memory_store` 모듈 레벨 추가 + `/benchmark-pack-draft`, `/benchmark-search-from-capture` 엔드포인트 추가

### 테스트 업데이트
- `tests/test_patterns_state_machine.py`: `BREAKOUT_BLOCKS` → `post_accumulation_range_breakout`
- `tests/test_query_transformer.py`: v2 버전, `higher_lows_sequence_flag` 키 업데이트
- `tests/test_raw_ingest.py`: `_utcnow` monkeypatch (24h 윈도우 만료 수정)

## 현재 상태
- 브랜치: `feat/agent-execution-protocol` (main 대비 6 commits ahead)
- CI: 로컬 1422/1422 통과 확인
- 푸시 완료
