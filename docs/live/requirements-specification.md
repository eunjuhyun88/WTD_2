# 요구사항 명세서 (Requirements Specification)

Version: v2.0 (code-verified, atomic)
Agent: A023
Updated: 2026-04-26

---

## 읽는 법

- **Status**: BUILT = 코드 존재 / NOT BUILT = 없음 / PARTIAL = 코드 있지만 미완성
- **Issue**: GitHub 이슈 등록 단위 (NOT BUILT / PARTIAL만)
- **AC**: 이 요구사항이 충족됐다고 판단하는 기준

---

## R-01: Verdict 5-cat 확장

**Status**: PARTIAL (3-cat만 구현됨)
**Issue**: YES — 단독 이슈 가능

### 현재 상태
- `engine/ledger/types.py:54` — `user_verdict: Literal["valid", "invalid", "missed"]`
- `engine/api/routes/captures.py:66` — `VerdictLabel = Literal["valid", "invalid", "missed"]`
- `app/src/routes/dashboard/+page.svelte` — `submitVerdict()` 3개 버튼

### 요구사항
- verdict 타입을 5개로 확장: `valid | invalid | near_miss | too_early | too_late`
- "missed"는 폐기하지 않고 "too_late"로 의미 정렬 또는 매핑 정책 확정 필요 (검토 항목)
- 기존 "missed" 데이터는 마이그레이션 없이 그대로 유지

### 변경 파일
1. `engine/ledger/types.py` — `PatternOutcome.user_verdict` Literal 교체
2. `engine/api/routes/captures.py` — `VerdictLabel` Literal 교체
3. `engine/api/routes/verdict.py` — 동일
4. `app/src/routes/api/captures/[id]/verdict/+server.ts` — 타입 주석
5. `app/src/routes/dashboard/+page.svelte` — 5개 버튼 UI

### AC
- `POST /captures/{id}/verdict { "verdict": "near_miss" }` → 200
- `POST /captures/{id}/verdict { "verdict": "too_early" }` → 200
- `POST /captures/{id}/verdict { "verdict": "too_late" }` → 200
- 기존 `valid / invalid / missed` 여전히 200
- 대시보드 Verdict Inbox에 5개 버튼 렌더링
- 기존 DB 데이터 변경 없음 (AddOnly)

---

## R-02: F-0b AI Parser 라우트

**Status**: NOT BUILT
**Issue**: YES — 단독 이슈

### 현재 상태
- `engine/api/schemas_pattern_draft.py` — `PatternDraftBody` 스키마 정의됨
- `engine/agents/context.py` — ContextAssembler 존재, LLM 미연결
- 라우트: 없음

### 요구사항
- 자유 텍스트 입력 → Claude Haiku/Sonnet → `PatternDraftBody` JSON 반환
- 입력 형식: `{ "text": "...", "symbol_hint": "BTCUSDT", "timeframe_hint": "1h" }`
- 출력: `PatternDraftBody` (phases, thesis, building_blocks 포함)
- Claude API 키 없으면 422 (500 아님)
- 토큰 예산 초과 시 부분 결과 반환 (partial flag 포함)

### 변경 파일
1. `engine/api/routes/patterns.py` — `POST /patterns/parse` 라우트 추가
2. `engine/agents/context.py` — Claude 호출 연결
3. `app/src/routes/api/patterns/parse/+server.ts` — 프록시 라우트

### AC
- `POST /engine/patterns/parse { "text": "BTC 1h 매집 → 분배 패턴" }` → 200, `PatternDraftBody` 반환
- Claude API 키 없음 → 422 `{ "error": "llm_not_configured" }`
- 빈 텍스트 → 422
- 응답에 `pattern_family`, 최소 1개 `phase` 포함

---

## R-03: F-0a Chart Drag PatternDraft

**Status**: NOT BUILT
**Issue**: YES — 단독 이슈 (engine + app 2개로 분리 가능)

### 현재 상태
- 관련 코드 없음

### 요구사항
- 사용자가 차트에서 시간 범위 선택 → 해당 구간 12개 feature 자동 추출 → PatternDraft 생성
- 입력: `{ "symbol": "BTCUSDT", "timeframe": "1h", "start_ts": 1714000000000, "end_ts": 1714086400000 }`
- 추출 feature 12개: `oi_change, funding_rate, cvd, liquidation_volume, price_change, volume, btc_correlation, higher_lows, lower_highs, compression_ratio, smart_money_flow, venue_divergence`
- 출력: `PatternDraftBody` (feature_snapshot 포함)

### 변경 파일
1. `engine/features/range_extractor.py` (신규) — range → 12 feature 추출
2. `engine/api/routes/patterns.py` — `POST /patterns/draft-from-range` 라우트
3. `app/src/routes/api/patterns/draft-from-range/+server.ts` — 프록시
4. `app/src/lib/components/terminal/` — chart range select UI (별도 이슈 가능)

### AC
- `POST /patterns/draft-from-range { symbol, timeframe, start_ts, end_ts }` → 200, `PatternDraftBody` 반환
- 응답에 `feature_snapshot` 12개 키 포함
- 데이터 없는 range → 422
- 범위가 4시간 미만 → 422 `{ "error": "range_too_short" }`

---

## R-04: 1-click Watch (Capture → Monitoring)

**Status**: NOT BUILT
**Issue**: YES — 단독 이슈

### 현재 상태
- `engine/api/routes/alpha.py:244` — `POST /alpha/watch` 존재 (alpha 심볼 전용, capture 연결 없음)
- capture ID와 monitoring을 잇는 연결 없음

### 요구사항
- 캡처된 패턴+심볼 조합을 live monitoring에 등록
- 입력: capture_id만으로 충분 (pattern_slug, symbol은 capture에서 읽음)
- scanner가 live watch 목록 poll → 해당 조합 스캔에 포함
- 중복 등록 → idempotent (409 아님, 200 + 기존 watch 반환)
- watch 상태: `live | paused`

### 변경 파일
1. `engine/api/routes/captures.py` — `POST /captures/{id}/watch` 라우트
2. `engine/scanner/scheduler.py` — live watch 목록 조회 연결
3. `app/src/routes/dashboard/` — Watch 버튼 (verdict inbox 카드에)

### AC
- `POST /captures/{id}/watch` → 200 `{ "watch_id": "...", "status": "live", "activated_at": "..." }`
- 동일 capture_id 재요청 → 200 (기존 watch 반환)
- pattern_scan 다음 사이클에서 해당 symbol+pattern 포함 확인
- `POST /captures/{id}/watch { "action": "pause" }` → watch_status = "paused"

---

## R-05: F-60 Gate

**Status**: NOT BUILT
**Issue**: YES — 단독 이슈

### 현재 상태
- `engine/stats/engine.py` — PatternPerf 집계 있음, per-user verdict accuracy 없음

### 요구사항
- 유저별 `verdict_count` 및 `accuracy` 집계
- accuracy = `(valid + near_miss) / (verdict_count - pending)` (단, missed/too_late/too_early는 분모에만 포함)
- gate_passed = `verdict_count >= 200 AND accuracy >= THRESHOLD`
- THRESHOLD는 config에서 읽음 (기본 0.55, 하드코딩 금지)

### 변경 파일
1. `engine/stats/engine.py` — `per_user_verdict_accuracy()` 메서드
2. `engine/api/routes/` — `GET /users/{user_id}/f60-status` 라우트 (신규 파일 또는 기존 라우트)
3. `app/src/routes/dashboard/` — F-60 progress bar UI

### AC
- `GET /users/{user_id}/f60-status` → `{ "verdict_count": N, "accuracy": 0.xx, "gate_passed": bool, "threshold": 0.55 }`
- verdict_count < 200 → gate_passed = false (accuracy 무관)
- config에서 threshold 변경 시 즉시 반영
- UI에서 progress bar + "X건 / 200건" 표시

---

## R-06: Copy Signal Marketplace MVP

**Status**: NOT BUILT
**Issue**: YES — 단독 이슈 (F-05 선행 필수)
**선행조건**: R-05 (F-60 Gate) 완료 후

### 현재 상태
- `engine/copy_trading/` 디렉토리 존재, 내부 schema 있음
- marketplace listing/subscription 로직 없음

### 요구사항
- F-60 통과 유저 → 자신의 신호를 마켓플레이스에 공개 가능 (ON/OFF)
- 구독자 → 공개된 신호 목록 열람 + 구독 (copy_trading 테이블에 row)
- F-60 미통과 유저 → 구독은 가능, 자신 공개는 불가
- 신호 = 가장 최근 verdict_ready 캡처 기준

### 변경 파일
1. `engine/copy_trading/marketplace.py` (신규) — listing + subscription 로직
2. `engine/api/routes/copy_trading.py` (신규) — `GET /marketplace/signals`, `POST /marketplace/signals/{id}/subscribe`
3. `app/src/routes/marketplace/` (신규) — 신호 목록 + 구독 UI

### AC
- F-60 통과 유저가 `POST /marketplace/signals/publish` → 자신의 최신 캡처 공개
- `GET /marketplace/signals` → 공개된 신호 목록 반환 (F-60 통과 유저 것만)
- F-60 미통과 유저가 publish 시도 → 403 `{ "error": "f60_gate_required" }`
- 구독 → `copy_trading` 테이블에 row 생성 확인

---

## R-07: 동시 100명 이상 지원

**Status**: PARTIAL
**Issue**: 개별 이슈 아님 — 인프라 설정 이슈

### 현재 상태
- SQLite WAL: 단일 write lock → 동시 write 병목 가능
- Supabase: connection pool 설정 확인 필요
- GCP: min-instances 설정 있음 (worker_control 참고)

### 요구사항
- read-heavy path는 모두 Supabase 또는 캐시로 라우팅
- SQLite write는 capture/outcome/verdict/ledger만 (scan result는 Supabase direct)
- FastAPI worker count = min 2 (현재 단일 worker 가능성)
- Supabase pool: pgbouncer transaction mode 권장

### AC
- 동시 100 GET /search/similar → P95 500ms 이하
- 동시 100 POST /captures/{id}/verdict → 오류율 0%
- SQLite lock wait → 타임아웃 3초 이내 해소

---

## R-08: 보안 요구사항

**Status**: BUILT (W-0162 완료)

### 현재 상태
- RS256 JWT 검증: BUILT (`engine/security_runtime.py`)
- 토큰 블랙리스트: BUILT
- JWKS 캐싱 (1000x 성능): BUILT
- 에러 노출 제거: BUILT (W-0162)

### 유지 요구사항
- 모든 신규 라우트는 `require_auth` 데코레이터 적용 필수
- 신규 라우트 코드 리뷰 시 인증 누락 체크
- F-60 gate 우회 불가 (서버사이드 검증 필수, 클라이언트 신뢰 금지)

---

## 검토 필요 항목 (개발 전 확정 요청)

| # | 질문 | 선택지 |
|---|------|--------|
| Q1 | verdict "missed" → "too_late"로 통합? | A) 통합 B) 별도 유지 (missed = no-show, too_late = entered late) |
| Q2 | F-60 accuracy threshold | A) 0.55 B) 0.60 C) 다른 값 |
| Q3 | F-0a Chart Drag UI | A) 차트 range 드래그 B) form input (start/end 직접 입력) |
| Q4 | F-0b AI Parser 입력 | A) 자유 텍스트 B) 구조화 템플릿 (단계별 입력) |
| Q5 | F-0b 사용 Claude 모델 | A) Haiku (빠름, 저렴) B) Sonnet (정확) |
