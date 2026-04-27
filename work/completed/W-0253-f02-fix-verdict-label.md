# W-0253 — F-02-fix: Verdict 레이블 정합성 (BLOCKER)

> Wave 4 P0 | Owner: engine + app | Branch: `fix/f02-verdict-label`
> **⚠️ 즉시 착수 — 이 작업 없이 LightGBM 학습 데이터 오염.**
> **모든 Wave 4 Stream (F-3/F-4/H-07/H-08) 시작 전 완료 필수.**

---

## Goal

`missed/unclear` 레이블을 PRD 확정 `near_miss/too_early`로 이관해 LightGBM Layer C 훈련 신호 오염을 제거한다.

## Owner

engine + app

## Primary Change Type

bugfix (migration + type change + UI label)

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/migrations/022_verdict_label_rename.sql` | 신규 — `missed→near_miss`, `unclear→too_early` 이관 스크립트 |
| `engine/ledger/types.py:54` | 변경 — `VerdictLabel` Literal 업데이트 |
| `engine/stats/engine.py:40-41` | 변경 — `F60_WIN_LABELS` / `DENOM_LABELS` 동시 업데이트 |
| `app/src/lib/components/terminal/peek/VerdictInboxPanel.svelte` | 변경 — 버튼 텍스트/value `missed→near_miss`, `unclear→too_early` |

## Non-Goals

- 신규 레이블 추가 (5-cat 유지: valid/invalid/near_miss/too_early/too_late)
- LightGBM 재훈련 (레이블 정합 후 별도 work item)
- Verdict API 스펙 변경 (엔드포인트 유지, 레이블 값만 변경)

## Exit Criteria

- [ ] `engine/ledger/types.py:54` Literal이 `near_miss`, `too_early` 포함
- [ ] `engine/stats/engine.py:40-41` 레이블 상수 일치
- [ ] migration 022 up: `UPDATE outcomes SET user_verdict = 'near_miss' WHERE user_verdict = 'missed'` + `too_early` 동일
- [ ] migration 022 down 스크립트 존재 (non-destructive 롤백 가능)
- [ ] `VerdictInboxPanel` 버튼 렌더 시 `near_miss` / `too_early` 표시 확인
- [ ] Engine Tests ✅, App CI ✅

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
