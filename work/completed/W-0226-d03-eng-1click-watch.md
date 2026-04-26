# W-0226 — D-03-eng 1-click Watch (capture → monitoring) engine

> **Source**: `docs/live/W-0220-product-prd-master.md` §3 Core Loop "1-click Watch" + `spec/PRIORITIES.md` P0
> **Owner candidate**: A-next (engine, M size, ~3일)
> **Base SHA**: ee2060f9 (origin/main)
> **Branch**: `feat/D03-watch-engine` (PRIORITIES.md 명시)

---

## Goal

검색 결과의 capture를 사용자가 1-click으로 monitoring activation에 등록 → `pattern_scan_job` (15분마다)이 자동으로 phase 추적 + ACCUMULATION 진입 시 alert. 현재 `/alpha/watch`가 alpha 전용이라 capture/pattern 연결 갭.

## Owner

`engine` (capture → monitoring activation row + scanner pickup)

## Scope

### Engine
- `engine/api/routes/captures.py` — `POST /captures/{id}/watch` 신규
- `engine/patterns/active_variant_registry.py` 또는 `engine/patterns/monitoring_activation.py` (신규/확장) — capture_id + pattern_slug → monitoring row
- `engine/scanner/jobs/pattern_scan.py` — live monitoring activation 목록 poll → 해당 pattern+symbol 스캔 포함
- Supabase migration: `monitoring_activations` 테이블 (없으면)
  ```sql
  CREATE TABLE monitoring_activations (
    id uuid PRIMARY KEY,
    capture_id uuid REFERENCES capture_records,
    pattern_slug text NOT NULL,
    symbol text NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'live',  -- live/paused/expired
    activated_at timestamptz DEFAULT now(),
    expires_at timestamptz,  -- TTL 자동 expiry
    UNIQUE(capture_id, user_id)  -- 멱등성
  );
  ```
- `engine/tests/test_captures_watch.py` (신규)

### App
- (별도 W-XXXX D-03-app, P1) — Watch 버튼 Verdict Inbox 카드

## Non-Goals

- App UI 버튼 (별도 W-XXXX D-03-app, P1)
- Alert 발송 채널 변경 (기존 telegram + dashboard 그대로)
- Watch 자동 만료 정책 정밀화 (기본 7일 TTL, P2에서 sophisticate)
- 멀티 user shared watch (Phase 2+ team workspace)
- Watch 변경/삭제 endpoint (DELETE은 P1)

## Exit Criteria

- [ ] `POST /captures/{id}/watch` → 200 + `{ watch_status: "live", activated_at, expires_at }`
- [ ] 중복 watch (같은 capture_id) → 200 idempotent (existing row 반환, conflict 409 X)
- [ ] 존재하지 않는 capture_id → 404
- [ ] 다른 user의 capture → 403 (RLS)
- [ ] `pattern_scan_job` 다음 실행 시 live activation 목록에 포함
- [ ] Engine CI + Contract CI green
- [ ] Migration up/down 모두 dry-run 검증

## Facts

1. **현재 코드 위치 (grep 검증)**:
   - `engine/api/routes/captures.py` — `POST /captures` + `GET /captures/{id}` 존재
   - `engine/api/routes/alpha.py` — `POST /alpha/watch` (alpha 심볼 전용, capture 연결 X)
   - `engine/scanner/jobs/pattern_scan.py` — APScheduler 15분 등록됨
   - `engine/patterns/active_variant_registry.py` — per-user threshold override (변경 X)
2. Supabase `pattern_ledger_records`에 `record_type='capture'` row 있음 (W-0215 단일 테이블).
3. Scanner는 53 PatternObject 전체를 매 cycle 스캔 — monitoring activation은 user-scoped 별도 layer.

## Assumptions

1. capture 생성 시 (W-0220 §3) PatternDraft + symbol 정보 보유 → watch는 그 메타데이터 재사용
2. user_id는 JWT auth payload에서 추출 (`requireAuth()` middleware)
3. expires_at 기본 = now() + 7 days (P0 단순, P2에서 user-configurable)
4. scanner는 cycle 시작 시 `SELECT * FROM monitoring_activations WHERE status='live' AND expires_at > now()` (SELECT 컬럼 명시)

## Canonical Files

- `engine/api/routes/captures.py` (route 추가)
- `engine/patterns/monitoring_activation.py` (신규, business logic)
- `engine/scanner/jobs/pattern_scan.py` (live activation pickup 추가)
- `app/supabase/migrations/023_monitoring_activations.sql` (신규)
- `engine/tests/test_captures_watch.py` (신규)
- `engine/tests/test_pattern_scan_with_activation.py` (신규)
- `docs/live/feature-implementation-map.md` (D-03 BUILT)
- `spec/PRIORITIES.md` (D-03-eng done)

## CTO 설계 원칙 적용

### 성능
- DB: `monitoring_activations` UNIQUE(capture_id, user_id) 인덱스 + `(status, expires_at)` partial index
- Scanner cycle (15min): 1 SELECT per cycle, < 100 active activations (early stage) — 부하 낮음
- 100명 동시 사용자 기준: 100 × 5 active = 500 rows max → SQLite/Postgres 모두 OK
- bulk: 활성화 자체는 단건, scanner select는 partial index로 fast
- async: SQLite hydrate는 `asyncio.to_thread` 래핑

### 안정성
- 멱등성: UNIQUE(capture_id, user_id) → 중복 POST 시 existing row 반환 (200 not 409)
- 폴백: Supabase 장애 시 file fallback (`engine/ledger/file_store.py`) 패턴 활용 (W-0215와 동일)
- TTL: expires_at 자동 처리 (DB query 시점 필터링) — cron 정리 불필요 P0
- 재시도: scanner job pickup 실패 시 다음 cycle에서 재시도 (idempotent)
- 헬스체크: `/health` `monitoring_activations_count: int` 추가

### 보안
- App route `requireAuth()` 필수 — capture는 user 소유
- RLS: `monitoring_activations` 테이블에 RLS policy (user_id = auth.uid())
- Input validation: capture_id pydantic UUID 강제
- 권한 체크: capture.user_id == requesting user_id 확인 (RLS로 자동, 코드에서도 explicit)
- secret: 별도 secret 없음 (Supabase service_role_key는 기존)

### 유지보수성
- 계층: route(API) → monitoring_activation.py(business) → Supabase
- 계약: OpenAPI 자동, app contract:check
- 테스트: 통합 1개 (capture 생성 → watch → scanner pickup) + unit 5개
- 롤백: migration 023 down script 작성 (DROP TABLE monitoring_activations)
- 모니터링: structured log "watch_activated capture_id=X user_id=Y" → ELK/Grafana 추적

### Charter 정합성
- ✅ In-Scope: L4 State Machine + L7 Refinement (verdict 데이터 펌프 직결)
- ✅ Non-Goal 미저촉: copy_trading X, 자동매매 X (alert만), broadcasting signals X (user 본인)

## 다음 단계 (다음 에이전트 첫 30분)

1. `feat/D03-watch-engine` 브랜치 from origin/main
2. Supabase migration 023 작성 + 로컬 dry-run
3. `engine/patterns/monitoring_activation.py` business logic
4. `engine/api/routes/captures.py` POST /watch
5. `engine/scanner/jobs/pattern_scan.py` activation pickup 추가
6. tests + CI
7. PR 생성 base=main

## Status

PENDING — capture endpoint 이미 BUILT, monitoring_activation만 추가. F-02/A-03/A-04와 병렬 가능 (independent).
