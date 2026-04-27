# W-0223 — F-02 Verdict 5-cat 확장

> **Source**: `docs/live/W-0220-product-prd-master.md` §8 P0 F-1 + `spec/PRIORITIES.md` P0
> **Owner candidate**: A-next (engine + app, S size, ~3일)
> **Base SHA**: ee2060f9 (origin/main)
> **Branch**: `feat/F02-verdict-5cat` (PRIORITIES.md 명시)

---

## Goal

Verdict ledger 라벨 노이즈를 줄여 reranker 학습 자산(moat)을 강화한다 — 3-cat (`valid/invalid/missed`) → 5-cat (`valid/invalid/near_miss/too_early/too_late`).

## Owner

`engine + app` (cross-layer schema change)

## Scope

### Engine (`engine/`)
- `engine/ledger/types.py` — `PatternOutcome.user_verdict` Literal 교체 (3 → 5)
- `engine/api/routes/captures.py` — `VerdictLabel` Literal 교체
- `engine/api/routes/verdict.py` — 동일
- `engine/scoring/label_maker.py` — 5-cat → 학습 라벨 매핑 (near_miss/too_early/too_late 가중치 정책)
- `engine/tests/test_verdict_5cat.py` (신규) — 5개 값 각각 200 + 잘못된 값 422 + 기존 3값 BC

### App (`app/`)
- `app/src/routes/api/captures/[id]/verdict/+server.ts` — JSDoc 타입 주석 업데이트
- `app/src/routes/dashboard/+page.svelte` — Verdict Inbox UI: 5개 버튼 + 각 색상 코드 + 단축키 (1~5)
- `app/src/lib/cogochi/VerdictPanel.svelte` (있으면) 동기

### Migration
- `app/supabase/migrations/022_verdict_5cat.sql` — `pattern_ledger_records` JSON `record_type=verdict` 의 `user_verdict` enum check 갱신 (또는 free-form text 유지하면 migration 불필요 — 코드 검증 후 결정)

## Non-Goals

- 기존 `missed` 데이터 마이그레이션/재라벨링 (사용자 confirm 없이 변경 X)
- LightGBM 재훈련 자동 트리거 (별도 작업, refinement_trigger_job이 자연스럽게 처리)
- F-60 Gate (별도 W-0226-h07-f60-gate)
- Verdict 작성 UX 개선 (단축키 외 layout 변경 X)
- 모바일 UX 별도 검증 (Phase 2+)

## Exit Criteria

- [ ] `POST /captures/{id}/verdict {"verdict": "near_miss"}` → 200
- [ ] `POST /captures/{id}/verdict {"verdict": "too_early"}` → 200
- [ ] `POST /captures/{id}/verdict {"verdict": "too_late"}` → 200
- [ ] 기존 `valid / invalid / missed` 호출 여전히 200 (BC 유지)
- [ ] 잘못된 값 (`"foo"`) → 422 + 명확한 error
- [ ] Dashboard Verdict Inbox에 5개 버튼 렌더링 + 단축키 1~5 동작
- [ ] `engine/tests/test_verdict_5cat.py` pass
- [ ] App `npm run check` 0 errors
- [ ] Engine CI + App CI + Contract CI 모두 green
- [ ] 기존 `missed` 데이터 row 변경 없음 (DB 검증)

## Facts

1. **현재 코드 위치 (grep 검증)**:
   - `engine/ledger/types.py:54` — `user_verdict: Literal["valid", "invalid", "missed"]`
   - `engine/api/routes/captures.py:66` — `VerdictLabel = Literal["valid", "invalid", "missed"]`
   - `app/src/routes/dashboard/+page.svelte:309` — `submitVerdict()` 3개 버튼
2. **Q1 결정**: 사용자 lock-in 대기. PRD §0.2 권고안 = "분리 (5개 모두 별도)" — too_late는 진입 타이밍, missed는 패턴 자체 무효, 학습 라벨 노이즈가 다름.
3. Supabase `pattern_ledger_records.record` JSON 컬럼은 free-form → enum check 없음 → migration 022 선택적.
4. `engine/scoring/label_maker.py` 5-cat → 학습 가중치 매핑이 reranker 라벨 생성기 핵심.

## Assumptions

1. **Q1 결정 lock-in 후 시작** (분리 vs missed→too_late 통합). PRD §0.2 권고 = 분리.
2. 기존 `missed` 데이터는 보존 (마이그레이션 X) — Q1 = 분리이면 `missed`도 5-cat 안에서 별도 의미 부여 가능.
3. `dashboard/+page.svelte`에서 verdict UI는 기존 reactive store 유지.

## Canonical Files

- `engine/ledger/types.py` (line 54 교체)
- `engine/api/routes/captures.py` (line 66 교체)
- `engine/api/routes/verdict.py` (전체 검토)
- `engine/scoring/label_maker.py` (5-cat 매핑 추가)
- `engine/tests/test_verdict_5cat.py` (신규)
- `app/src/routes/api/captures/[id]/verdict/+server.ts`
- `app/src/routes/dashboard/+page.svelte` (line 309 근처 + UI)
- `app/supabase/migrations/022_verdict_5cat.sql` (선택적)
- `docs/live/feature-implementation-map.md` (F-02 BUILT 표시 갱신)
- `spec/PRIORITIES.md` (F-02 done 표시)

## CTO 설계 원칙 적용

### 성능
- DB: `pattern_ledger_records`는 JSON 컬럼 → 인덱스 필요 시 `record_type='verdict'` partial index 검토 (P2)
- Verdict 작성은 low-frequency (사람 제출) → bulk upsert 불필요
- App API route는 단건 처리, blocking I/O 없음

### 안정성
- 멱등성: 같은 capture에 verdict 재제출 → upsert (last-write-wins) + `updated_at` 갱신, conflict key=(user_id, capture_id)
- 폴백: Supabase 장애 시 file fallback 이미 있음 (`engine/ledger/`) — 변경 없음
- 422 응답: 잘못된 enum 값은 pydantic이 자동 422

### 보안
- App route `requireAuth()` 적용 (기존 verdict route에 이미 있음, 검증)
- 입력 검증: pydantic `Literal[...]` enum 강제 → injection 차단
- 다른 user의 capture에 verdict 제출 차단 — RLS policy 검토 (`pattern_ledger_records`에 RLS 있음, 검증 필수)

### 유지보수성
- 계층: engine(label_maker.py)이 비즈니스 로직, app은 단순 proxy
- 계약: pydantic schema가 OpenAPI 자동 생성 → app TS 타입과 contract:check
- 테스트: `test_verdict_5cat.py` 1 통합 + 5 unit
- 롤백: Literal 교체는 코드 단방향 변경, migration 022 추가 시 down 불필요 (enum check 추가만)

### Charter 정합성
- ✅ In-Scope: L6 Ledger / L7 Refinement (verdict는 L7 핵심)
- ✅ Non-Goal 미저촉: copy_trading X, chart_polish X, multi_agent X

## 다음 단계 (다음 에이전트 첫 30분)

1. `feat/F02-verdict-5cat` 브랜치 from origin/main (ee2060f9)
2. Q1 결정 lock-in 확인 (사용자에게)
3. `engine/ledger/types.py` Literal 교체 + `engine/tests/test_verdict_5cat.py` 작성
4. captures/verdict route Literal 갱신
5. label_maker 5-cat 매핑 추가
6. App UI 5개 버튼 + 단축키
7. CI 통과 확인
8. PR 생성 base=main

## Status

PENDING — Q1 결정 후 시작. PRD §0.2 권고안 채택 시 즉시 시작 가능.
