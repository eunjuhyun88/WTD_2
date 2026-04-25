# CURRENT — 단일 진실 (2026-04-25)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0132-copy-trading-phase1` | engine + app | 다음 — DB 스키마 설계 필요 |
| `W-0145-operational-seed-search-corpus` | engine | 다음 — 40+차원 corpus 완성 |

---

## main SHA

`2092ac01` — origin/main (2026-04-26) — App CI 초록 + CI governance + W-0201/W-0202/W-0210/W-0211 포함

## 진행 중 브랜치

`claude/zealous-keller-80c554` — W-0203/W-0204/W-0205 PR #292

---

## ✅ 실제로 완료된 것 (코드 검증됨)

| 항목 | 근거 |
|---|---|
| **Engine CI** 1448 passed | PR #291 머지 (fix/loader-primary-cache-dir) |
| **Contract CI** PASS | PR #291 포함 |
| **App CI** 250 tests pass, 0 TS errors | PR #293 main 머지 완료 (c1a8072e) |
| **W-0163** CI governance | PR #293에 포함 — required checks + memory sync |
| **W-0201** query_transformer fix | PR #291 main 머지 완료 |
| **W-0202** canonical features + active registry | PR #291 main 머지 완료 |
| **W-0210** 4-layer viz | main 머지 완료 |
| **W-0211** multi-pane chart + Pine Script engine | PR #298 main 머지 완료 (74afaba3) |
| **W-0203** terminal UX | PR #290 main 머지 완료 |
| **W-0162** JWT security P0 | PR #253 main 머지 완료 |
| **엔진 P0-P2 infra** | PR #281 main 머지 완료 |
| **W-0162 P1/P2** JWT RS256 + 블랙리스트 | PR #277 main 머지 완료 (2026-04-25) |
| **GCP cogotchi** 1024MiB + Cloud Scheduler 5 jobs | cogotchi-00013-c7n 서빙 중 (2026-04-26) |
| **W-0204** captures.py active_variant_store 연결 | PR #292 (b755025b) |
| **W-0203** +server.ts runPatternSeedMatch 위임 | PR #292 (b755025b) |
| **W-0205** PromotionReport Gate 카드 UI | PR #292 (b755025b) |

---

## 🔴 PR 머지 대기

| PR | 내용 | 선결조건 |
|---|---|---|
| #292 | W-0203/W-0204/W-0205 | App CI 통과 |

---

## 다음 실행 순서 (우선순위 순)

### 즉시
- PR #292 App CI 통과 후 머지

### 중기 (설계 필요)
1. **Layer A 검색 고도화** (40+차원 완성)
2. **카피트레이딩 Phase 1** 구현 시작 — PRD 완성됨, DB 스키마 먼저

---

## 인프라 미완 (사람이 직접 실행)

- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
- [x] Cloud Scheduler HTTP jobs — 5 jobs 등록 완료 (2026-04-25)
- [x] `_primary_cache_dir` NameError 수정 — PR #291 main 머지 + GCP 배포 완료 (2026-04-26)
