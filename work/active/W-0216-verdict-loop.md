# W-0216 — Verdict Loop: L7 완성

## Goal

사용자가 pending outcome에 verdict(valid/invalid/missed)를 제출하고,
그 데이터가 `pattern_ledger_records`에 저장되어 LambdaRank 훈련 선행조건을 충족한다.

## Owner

app + engine

## Scope

### 1. UI 노출 — VerdictInboxPanel 마운트
- `app/src/components/terminal/workspace/PatternSeedScoutPanel.svelte`에 `VerdictInboxPanel` import + 조건부 렌더링
- pending 건수 badge: `/api/captures/outcomes?limit=50` 응답에서 `user_verdict === null` 필터
- 뱃지 0건이면 숨김, 1건 이상이면 숫자 표시

### 2. API — pending outcomes 필터
- `app/src/routes/api/captures/outcomes/+server.ts`
  - `?pending=true` 쿼리 파라미터 추가 → engine에서 `user_verdict IS NULL` 필터
  - **보안**: `requireAuth()` 적용 여부 확인 (미적용 시 추가)
  - **성능**: `limit=50` default, max 200 cap, SELECT * 금지 → 명시 컬럼

### 3. Engine — ledger 4-split 검증
- `pattern_ledger_records.record_type` 4종 확인: `entry` / `score` / `outcome` / `verdict`
- `append_verdict_record()` → `record_type="verdict"` + `user_verdict` 필드 저장 확인
- `outcome_id` FK로 outcome ↔ verdict 연결 검증

### 4. Engine — auto-verdict 스케줄링
- `auto_evaluate_pending()` (store.py:460): 72h 경과 미결 outcome 자동 처리
- `engine/scanner/scheduler.py`에 `auto_evaluate_pending` 주기 등록 확인 (없으면 추가, 6h 권장)
- **안정성**: 실패 시 skip + log (스캐너 중단 금지)

### 5. 통합 테스트
- `engine/tests/test_verdict_loop_end_to_end.py` (신규)
  - verdict POST → `pattern_ledger_records` row 저장 확인
  - `compute_family_stats()` `verdict_count` 반영 확인

## Non-Goals

- LambdaRank Reranker 구현 (verdict ≥ 50건 후 별도 W-0217)
- 실시간 verdict push notification
- Copy trading / 소셜 피드
- VerdictBanner (스캔 판정 배너, 별개 컴포넌트)

## Exit Criteria

1. TerminalShell에서 pending outcome 목록 보이고 verdict 제출 가능
2. 제출 후 `pattern_ledger_records`에 `record_type="verdict"` row 확인
3. `compute_family_stats()` `verdict_count` 증가 확인
4. App CI + Engine CI pass

## 성능 / 안정성 / 보안 결정

| 항목 | 결정 |
|---|---|
| **성능** | outcomes API SELECT 명시 컬럼, limit 50 default / 200 max. N+1 금지 — 단일 쿼리로 pending 조회 |
| **안정성** | `auto_evaluate_pending()` 실패 시 catch + warn, 스캐너 루프 중단 금지 |
| **보안** | `/api/captures/outcomes` + `/api/captures/[id]/verdict` 모두 `requireAuth()` 필수. RLS: `user_id = auth.uid()` |
| **유지보수** | `VerdictInboxPanel`이 이미 `submitVerdict()` 구현 — UI 마운트만 하면 됨. 중복 구현 금지 |
| **계층 준수** | app은 verdict POST만, ledger split 로직은 engine에만 존재 |

## Facts

- `VerdictInboxPanel.svelte` 구현 완료: `submitVerdict()` → POST `/api/captures/${captureId}/verdict`
- `append_verdict_record()` engine 양쪽 구현됨 (file + supabase)
- `VerdictInboxPanel` 현재 어디에도 import 안 됨 (미노출)
- `auto_evaluate_pending()` 존재 (store.py:460), scheduler 등록 여부 미확인
- verdict ≥ 50건 → W-0217(LambdaRank Reranker) 시작 가능

## Assumptions

- Supabase migration 018 실행 완료 (`pattern_ledger_records` 테이블 존재)
- W-0215 완료 후 진행 (Supabase write path 활성화 선행 필요)
- `requireAuth()` helper가 app API route에 이미 존재

## Canonical Files

- `app/src/components/terminal/peek/VerdictInboxPanel.svelte`
- `app/src/components/terminal/workspace/PatternSeedScoutPanel.svelte`
- `app/src/routes/api/captures/outcomes/+server.ts`
- `app/src/routes/api/captures/[id]/verdict/+server.ts`
- `engine/ledger/store.py` (auto_evaluate_pending)
- `engine/ledger/supabase_record_store.py`
- `engine/scanner/scheduler.py`
- `engine/tests/test_verdict_loop_end_to_end.py` (신규)
