---
name: W-0163 main CI 회복 + feature_windows dual-backend (2026-04-25)
description: PR #256에서 Supabase dual-backend 구현 + 3-트랙 충돌로 깨진 main CI 회복 (8개 실패 수리). 에이전트 공유 체크포인트 위치 포함.
type: project
---

# W-0163 체크포인트 (2026-04-25)

**브랜치**: `feat/pattern-similarity-search-ui` (PR #256, open, mergeable)
**체크포인트 문서**: `work/active/W-0163-main-ci-recovery-checkpoint.md`

## 핵심 사실

1. **3 트랙 병렬 작업이 main을 망가뜨림**:
   - Track A — 이 브랜치 (feature_windows dual-backend) — PR #256 open
   - Track B — JWT P0 hardening (다른 agent) — PR #253 머지됨 (red CI)
   - Track C — W-0157/W-0200 core loop (또 다른 agent) — PR #252 머지 / PR #254 open conflicting
   - **결과**: main CI 빨간불 (Engine/Contract/App 3개 모두 실패)

2. **이 세션에서 수리한 것 (8개)**:
   - `test_library_count` (52 vs 16 — W-0147 패턴 36개 추가됨)
   - `test_capture_benchmark` 2개 (W-0160 ResearchRun.definition_ref 추가)
   - `test_expand_variants` + `test_search_variants_include_15m` (W-0149 관련 모순)
   - `test_patterns_state_machine` (W-0147 BREAKOUT 블록 rename)
   - JWT auth 테스트 11개 (W-0162 JWT 롤아웃 후유증) — `tests/conftest.py`에 `attach_fake_auth` 헬퍼 추가
   - Contract 테스트 2개 (monkeypatch `api.main.extract_user_id_from_jwt`)
   - App svelte-check 에러 2개 (RulesSection 태그 mismatch, WorkspacePresetPicker 중복 attr)
   - Contract CI: engine-openapi.d.ts 재생성

3. **feature_windows dual-backend 구현 상태**:
   - Supabase migration 021 cogochi 프로젝트에 적용 완료 (hbcgipcqpuintokoooyg)
   - 로컬 빌더 동작 확인 (BTCUSDT 1h 197행 → SQLite + Supabase 둘 다)
   - **GCP은 아직 구버전 코드** — PR #256 머지 후 auto redeploy 필요

## 후속 에이전트에게 남기는 규칙

- **세션 시작 시 `gh run list --branch main --limit 5` 먼저** — main 상태 확인
- **auth 필요 라우트 테스트**: `from tests.conftest import attach_fake_auth; attach_fake_auth(app)` 사용
- **엔진 라우트/스키마 변경 후**: `cd app && npm run contract:sync:engine-types` 필수
- **패턴 추가 시**: `test_library_count`도 +1 + 코멘트 breakdown 업데이트
- **TRADOOR BREAKOUT 블록**: `post_accumulation_range_breakout` (구: `breakout_from_pullback_range`)

## 사용자가 해야 할 것 (PR #256 머지 후)

1. PR #256 머지 → GCP auto redeploy
2. `/readyz` 확인
3. `/search/similar` 스모크 테스트 (BTCUSDT 나와야 함)
4. 전체 universe 빌드 (로컬, 30-60분): `python -m research.feature_windows_builder --all --tf 15m,1h,4h --since-days 90`
5. Cloud Scheduler 등록 (feature_materialization + raw_ingest) — GCP console
6. Vercel `EXCHANGE_ENCRYPTION_KEY` 환경변수 세팅

## 비용 아키텍처 (연기됨)

- 현재 $30/mo (Supabase Pro + Cloud Run)
- 250GB egress 포함 → 현 규모에서 1년+ 여유
- 대안 순위: DuckDB+R2 ($0.5) > Hetzner TimescaleDB ($4.5) > 역색인 (성능) > 사전계산 (10ms)
- **임계점 $100/mo 도달하거나 p99 latency 이슈 생기면 이동** — 그전엔 그대로
- P0: `lru_cache` on `search_similar_patterns` (30분 작업, 1년 이사 연기 효과)

## 핵심 파일 위치

- PR #256: https://github.com/eunjuhyun88/WTD_2/pull/256
- 체크포인트: `work/active/W-0163-main-ci-recovery-checkpoint.md`
- 설정 도우미: `engine/tests/conftest.py` (`attach_fake_auth`)
- 팩토리: `engine/research/feature_windows.py` (`get_feature_window_store`, `get_all_feature_window_stores`)
- Supabase 스토어: `engine/research/feature_windows_supabase.py`
- Migration: `app/supabase/migrations/021_feature_windows.sql`
