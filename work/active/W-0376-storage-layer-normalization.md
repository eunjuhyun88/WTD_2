# W-0376 — 데이터 스토리지 레이어 정규화 (핵심 보존 + 낭비 제거)

> Wave: 5 | Priority: P0 | Effort: M
> Charter: In-Scope (코어 인프라 안정화)
> Status: 🟢 Implemented
> Created: 2026-05-01
> Issue: #838

## Goal

`phase_attempt` 로그 폭주(390+ MB) 한 가지를 차단하고 VACUUM FULL로 회수하면
Supabase 총 크기가 ~750 MB → ~320 MB로 떨어지고 522 timeout이 사라진다.
다른 어떤 것도 건드리지 않는다.

## 핵심 발견 (실측)

- 문제의 90% = `pattern_ledger_records.record_type='phase_attempt'` 한 종류
  - 108,002행 / 428 MB / TOAST 396 MB
  - 매 스캔 50심볼 × 52패턴 × 4사이클/h = 10,400행/h 누적
  - Supabase에서 read하는 코드: 0건 (grep 확인)
  - 연구 파이프라인은 로컬 JSON 파일에서 읽음 (LedgerRecordStore)
- `engine_alerts` 7일 cleanup 코드는 이미 작성됨 (`engine/api/routes/jobs.py`)
  — 스케줄러 OFF라 실행 안 됐을 뿐
- 차트/실시간/OHLCV는 Redis+CSV 경로 → Supabase 부하 0%

## 데이터 카테고리별 최종 판정

| 데이터 | Before | After | 판정 |
|---|---|---|---|
| pattern_ledger_records (phase_attempt) | 428 MB | **3.5 MB** | 🚫 차단 + 삭제 |
| phase_transitions + feature_snapshot | 178 MB | 164 MB | ✅ 보존 (ML 데이터) |
| feature_windows | 56 MB | 56 MB | ✅ 보존 (검색 코어) |
| engine_alerts | 80 MB | 76 MB | ⏳ 스케줄러 ON 시 자동 정리 |
| ledger (entry/score/outcome/verdict) | 2.2 MB | 2.2 MB | ✅ 보존 |
| **DB 전체** | **742 MB** | **320 MB** | **-57%** |

## 구현 내용

### Fix 1: SupabaseLedgerRecordStore.append_phase_attempt_record() → no-op
- 파일: `engine/ledger/supabase_record_store.py`
- 변경: Supabase write → `pass`
- 이유: 연구 파이프라인은 로컬 LedgerRecordStore에서 읽음 (Supabase 불필요)
- 테스트: 5 passed (scanner + state_machine + pattern_search = 99 passed)

### Fix 2: DB 직접 정리
```sql
DELETE FROM pattern_ledger_records WHERE record_type = 'phase_attempt';
-- 103,127행 삭제
VACUUM FULL ANALYZE pattern_ledger_records;
VACUUM FULL ANALYZE engine_alerts;
VACUUM FULL ANALYZE phase_transitions;
```

### Fix 3: 스케줄러 재가동 (진행 중)
- engine_alerts 7일 cleanup 자동 실행 → ~10 MB로 추가 감소 예상

## 건드리지 않은 것

- `phase_transitions` — ML 훈련 features (178 MB = 자산)
- `feature_windows` — corpus-first 검색 코어
- 기타 ledger record_types (entry/score/outcome/verdict)
- 로컬 LedgerRecordStore.append_phase_attempt_record() — 연구용 그대로 유지

## Exit Criteria

- [x] AC1: pattern_ledger_records < 20 MB → **3.5 MB** ✅
- [x] AC2: DB 총 크기 대폭 감소 → **742 MB → 320 MB** ✅
- [ ] AC3: 스케줄러 ON 후 24h 증가 < 30 MB (검증 중)
- [x] AC4: phase_attempt 외 record_type 보존 → outcome/entry/score 전부 확인 ✅
- [x] AC5: feature_windows / phase_transitions 행 수 변동 없음 ✅
- [ ] AC6: 522 timeout 5일 연속 0회 (모니터링 중)
- [x] CI green (99 tests passed) ✅

## Canonical Files

- `engine/ledger/supabase_record_store.py` — Fix 1 구현
