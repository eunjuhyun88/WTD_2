# CURRENT — 단일 진실 (2026-04-25 CLEAN)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`4c02cd0f` — origin/main (2026-04-25) — PR #291 머지 (W-0201/W-0202 포함)

---

## ✅ 실제로 완료된 것 (코드 검증됨)

| 항목 | 근거 |
|---|---|
| **Ledger → Supabase** | `get_ledger_store()` 자동 선택 (`supabase_store.py` 존재, env 기반 fallback) |
| **DB migration system** | `engine/db/migrate.py` + startup 자동 실행 (`main.py:89-90`) |
| **W-0210** 4-layer viz | PR #38ce46a8 main 머지 완료 |
| **W-0203** terminal UX | PR #290 main 머지 완료 |
| **W-0162** JWT security | PR #253 main 머지 완료 |
| **W-0156** FeatureWindowStore | PR #259 main 머지 완료 |
| **W-0200** Core loop proof | PR #256 main 머지 완료 |
| **W-0159/158/153/160** | 각 PR #265-#270 main 머지 완료 |
| **엔진 P0-P2 infra** | PR #281 main 머지 완료 |
| **W-0201** query transformer fix | `fix/loader-primary-cache-dir` 브랜치 커밋 `3d6d2e86` |
| **W-0202** canonical features + active registry sync | `fix/loader-primary-cache-dir` 브랜치 커밋 `a135955f` |

---

## ✅ 이번 세션 완료

| 항목 | 결과 |
|---|---|
| W-0201 `query_transformer.py` `higher_lows_sequence` 키 fix | ✅ 1448 passed |
| W-0201 `PatternSeedScoutPanel.svelte` state vars 추가 | ✅ |
| W-0202 `PromotionReport` canonical feature 5필드 + `_mean`/`_rate` 요약 | ✅ |
| W-0202 `active_variant_store` W-0151 sync (derive_watch_phases_from_pattern) | ✅ |
| W-0202 `build_seed_variants` `intraday-dump-cluster` 추가 | ✅ |
| 전체 엔진 테스트 | ✅ 1448 passed, 0 failed |

---

## 다음 실행 순서

- 인프라 미완 항목 (사람이 직접): GCP Cloud Build trigger, Vercel EXCHANGE_ENCRYPTION_KEY, Cloud Scheduler

---

## 인프라 미완 (사람이 직접 실행)

- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
- [ ] Cloud Scheduler HTTP jobs (`docs/runbooks/cloud-scheduler-setup.md`)
