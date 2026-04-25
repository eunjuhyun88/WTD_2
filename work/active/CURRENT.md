# CURRENT — 단일 진실 (2026-04-26 업데이트)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `App CI repair` | app | local check/test green — PR #293 업데이트 필요 |
| `W-0163-ci-agent-governance` | contract | local gates green — commit/PR 필요 |
| `W-0162 P1/P2` | security | RS256 + 블랙리스트 PR 오픈 — GCP 재배포 필요 |

---

## main SHA

`4c02cd0f` — origin/main (2026-04-26) — PR #291 머지 (W-0201/W-0202 포함)

> ⚠️ PR #293 (App CI fix) 머지 후 이 SHA가 변경됨. 머지 후 업데이트 필요.

---

## ✅ 실제로 완료된 것 (코드 검증됨)

| 항목 | 근거 |
|---|---|
| **Engine CI** 1448 passed | PR #291 머지 (fix/loader-primary-cache-dir) |
| **Contract CI** PASS | PR #291 포함 |
| **App CI** 0 TS errors | `fix/app-ci-ts-errors` 0575515d — PR #293 오픈 |
| **W-0201** query_transformer fix | PR #291 main 머지 완료 |
| **W-0202** canonical features + active registry | PR #291 main 머지 완료 |
| **W-0210** 4-layer viz | main 머지 완료 |
| **W-0203** terminal UX | PR #290 main 머지 완료 |
| **W-0162** JWT security P0 | PR #253 main 머지 완료 |
| **엔진 P0-P2 infra** | PR #281 main 머지 완료 |

---

## 🔴 PR 머지 대기

| PR | 내용 | 선결조건 |
|---|---|---|
| **#293** `fix/app-ci-ts-errors` | App CI 127→0 TS 에러 수리 | — (즉시 머지 가능) |
| **W-0162 P1/P2** `claude/w-0162-stability` | RS256 서명검증 + 토큰 블랙리스트 | GCP 재배포 |

---

## 다음 실행 순서 (우선순위 순)

### 즉시 (PR 머지)
1. **PR #293 머지** → App CI 초록 확보 → CURRENT.md main SHA 업데이트

### 단기 (다음 에이전트 세션)
2. **W-0163** CI governance hardening
   - required check names 설정
   - always-present PR checks
   - memory-sync PR flow
   - stale handoff archive
   - 로컬 검증 완료: App check/test, Contract gate, Engine pytest
3. **W-0162 P1/P2** 머지 + GCP 재배포
   - `claude/w-0162-stability` 브랜치 PR
   - GCP cogotchi-worker 재배포

### 중기 (설계 필요)
4. **Layer A 검색 고도화** (40+차원 완성)
   - feature_snapshot 우선순위 정제
   - 패턴 매칭 정밀도 측정 지표 확립
5. **카피트레이딩 Phase 1** 구현 시작
   - PRD 완성됨: `docs/` 참조
   - DB 스키마 먼저 (Supabase migration)

---

## 인프라 미완 (사람이 직접 실행)

- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
- [x] Cloud Scheduler HTTP jobs — 5 jobs 등록 완료 (2026-04-25): feature-materialization-run, db-cleanup-daily, pattern-scan-run, outcome-resolver-run, feature-windows-build
- [x] `_primary_cache_dir` NameError 수정 — PR #291 main 머지 + GCP cogotchi-00013-c7n 배포 완료 (2026-04-26)

---

## 체크포인트 파일

- `work/active/W-app-ci-repair-checkpoint-20260426.md` — 이번 세션 상세 기록
