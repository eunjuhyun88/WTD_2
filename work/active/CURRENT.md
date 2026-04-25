# CURRENT — 단일 진실 (2026-04-25 CLEAN)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`f98f7648` — origin/main (2026-04-25) — W-0203 terminal UI/UX overhaul

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

---

## 🔴 실제 미완성 (지금 해야 함)

### W-0201 — Core Loop Contract Hardening
- **브랜치**: `codex/w-0201-core-loop-contract-hardening`
- **상태**: 17파일 변경, 테스트 33/34 통과
- **남은 것**: 테스트 1개 실패 fix
  - `test_search_query_spec_transform_route_returns_deterministic_spec`
  - `query_transformer.py`: `higher_lows_sequence` → `higher_lows_sequence_flag` 잘못된 키 매핑
  - **fix**: `_flag` suffix 제거 → `higher_lows_sequence: True`
- **앱 체크**: `npm run check` 미확인

### W-0202 — FeatureWindowStore Search Cutover
- **브랜치**: 없음 (설계만 존재)
- **상태**: 미구현
- **해야 할 것**:
  1. `engine/research/corpus_builder.py` 신규 — `_materialize_feature_signals_into_corpus()`
  2. `engine/research/pattern_search.py` — baked-in signals 우선 사용 cutover
  3. Corpus rebuild 스크립트

---

## 다음 실행 순서

1. **W-0201 fix**: `query_transformer.py` 1줄 수정 → 테스트 통과 → 브랜치 PR 머지
2. **W-0202 구현**: `corpus_builder.py` 신규 작성 → `pattern_search.py` cutover → 테스트

---

## 인프라 미완 (사람이 직접 실행)

- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
- [ ] Cloud Scheduler HTTP jobs (`docs/runbooks/cloud-scheduler-setup.md`)
