# W-0253 — F-02-fix: Verdict 레이블 정합성 (✅ COMPLETE)

> Wave 4 P0 | Owner: engine + app | Branch: `fix/f02-verdict-label-022`
> **✅ BLOCKER 해제 (2026-04-27) — 코드 분석 결과 핵심 변경 모두 머지 완료.**
> **잔여 작업: work item ID/path 정정 + 주석 업데이트.**

## Status (2026-04-27 audit)

| Exit Criterion | 상태 | 증거 |
|---|---|---|
| `engine/ledger/types.py:54` 새 Literal | ✅ DONE | `Literal["valid", "invalid", "near_miss", "too_early", "too_late"]` |
| `engine/stats/engine.py:40-41` 상수 | ✅ DONE | `F60_DENOM_LABELS = {"valid", "invalid", "near_miss", "too_early", "too_late"}` |
| migration up 스크립트 | ✅ DONE | `app/supabase/migrations/023_verdict_label_rename.sql` (실제 ID는 023, table은 `capture_records`) |
| `VerdictInboxPanel` UI | ✅ DONE | L62/L195/L201 새 레이블 사용 |
| down 스크립트 | ⛔ **N/A — 반가역** (analysis below) |

### Down script가 부적절한 이유 (분석)

단순 reverse UPDATE는 데이터 손실:
```sql
-- 위험: up 이후 입력된 정당한 near_miss/too_early까지 missed/unclear로 덮어씀
UPDATE capture_records SET user_verdict = 'missed' WHERE user_verdict = 'near_miss';
UPDATE capture_records SET user_verdict = 'unclear' WHERE user_verdict = 'too_early';
```

올바르게 하려면 audit table + timestamp 필터 필요 — 단순 label rename 치고 과잉.
**결정**: 이 마이그레이션은 forward-only. 운영 사고 시 데이터 백업에서 복구.

---

## Goal

`missed/unclear` 레이블을 PRD 확정 `near_miss/too_early`로 이관해 LightGBM Layer C 훈련 신호 오염을 제거한다.

## Owner

engine + app

## Primary Change Type

bugfix (migration + type change + UI label)

---

## Scope (실제 머지된 파일 기준 정정)

| 파일 | 변경 이유 | 상태 |
|------|-----------|------|
| `app/supabase/migrations/023_verdict_label_rename.sql` | `missed→near_miss`, `unclear→too_early` 이관 (table: `capture_records`) | ✅ |
| `engine/ledger/types.py:54` | `VerdictLabel` Literal 업데이트 | ✅ |
| `engine/stats/engine.py:40-41` | `F60_WIN_LABELS` / `F60_DENOM_LABELS` 동시 업데이트 | ✅ |
| `app/src/components/terminal/peek/VerdictInboxPanel.svelte` | 버튼 텍스트/value `near_miss`/`too_early` + 주석 5-cat 갱신 | ✅ |

**Path 정정**: work item 초안의 `engine/migrations/`는 실제 `app/supabase/migrations/`. ID `022`는 `023` (022는 copy_trading_phase1이 차지). table `outcomes`는 실제 `capture_records`.

## Non-Goals

- 신규 레이블 추가 (5-cat 유지: valid/invalid/near_miss/too_early/too_late)
- LightGBM 재훈련 (레이블 정합 후 별도 work item)
- Verdict API 스펙 변경 (엔드포인트 유지, 레이블 값만 변경)

## Exit Criteria

- [x] `engine/ledger/types.py:54` Literal이 `near_miss`, `too_early` 포함
- [x] `engine/stats/engine.py:40-41` 레이블 상수 일치
- [x] migration 023 (실제 ID) up: `UPDATE capture_records SET user_verdict = 'near_miss' WHERE user_verdict = 'missed'` + `too_early` 동일
- [x] ~~migration down 스크립트~~ → **N/A: forward-only 결정** (반가역 분석 위 §Status 참조)
- [x] `VerdictInboxPanel` 버튼 렌더 시 `near_miss` / `too_early` 표시 (L62/L195/L201)
- [ ] 운영 DB에 023 적용 여부 검증 (Supabase migration history)

## Facts

1. **현재 코드**: `engine/ledger/types.py:54` — `user_verdict: Literal["valid", "invalid", "missed", "too_late", "unclear"]`
2. **PRD 확정값**: `valid / invalid / near_miss / too_early / too_late` (W-0214 v1.3 D6)
3. **stats 영향**: `engine/stats/engine.py:40-41` — `F60_WIN_LABELS`/`DENOM_LABELS`가 레이블 문자열을 직접 참조 → 동시 변경 필수
4. **기존 DB 데이터**: 운영 DB에 `missed`/`unclear` 값이 존재할 수 있음 → migration up 스크립트로 이관 필수
5. **Wave 4 의존**: H-07 / F-3 deep link / F-4 Decision HUD Actions card 전부 정확한 레이블에 의존

## Assumptions

1. Supabase migration runner (`tools/migrate.sh` 또는 Supabase CLI) 운영 환경에 설정됨.
2. 운영 DB에 `missed`/`unclear` 값을 가진 기존 verdict row가 존재할 수 있음.
3. `engine/ledger/verdict.py`에 레이블 유효성 검사 로직이 있다면 동시 업데이트 필요.

## Open Questions

- **Q1**: 기존 `missed` 데이터가 의미상 `near_miss`로 동일한가, 일부 `invalid`로 재분류 필요한가? (기본값: 전부 `near_miss`로 이관)
- **Q2**: `engine/ledger/verdict.py` 외 레이블을 참조하는 파일이 있는가? (`grep -r "missed\|unclear" engine/` 선행 필수)

## Canonical Files

- `engine/migrations/022_verdict_label_rename.sql` (신규)
- `engine/ledger/types.py`
- `engine/stats/engine.py`
- `app/src/lib/components/terminal/peek/VerdictInboxPanel.svelte`

## Decisions

- **이관 방식**: non-destructive UPDATE (rollback 가능) — DELETE/INSERT 금지
- **down 스크립트**: `near_miss→missed`, `too_early→unclear` 역이관
- **레이블 동시성**: `types.py` + `stats/engine.py` + UI 3개 파일 단일 PR로 묶음 (분리 금지)

## Next Steps

1. `grep -r "missed\|unclear" engine/ --include="*.py"` — 레이블 참조 전수 파악
2. `engine/migrations/022_verdict_label_rename.sql` 작성 (up + down)
3. `engine/ledger/types.py:54` Literal 변경
4. `engine/stats/engine.py:40-41` 상수 변경
5. `VerdictInboxPanel.svelte` 버튼 업데이트
6. Engine Tests + App CI 검증 후 PR 오픈

## Handoff Checklist

- [ ] `grep -r "missed\|unclear" engine/ --include="*.py"` 결과 확인 (전수 파악)
- [ ] `engine/ledger/verdict.py` 레이블 유효성 검사 위치 확인
- [ ] `engine/stats/engine.py:40-41` 현재 상수 값 확인
- [ ] Supabase migration 실행 방법 확인 (`tools/migrate.sh` or `supabase db push`)
