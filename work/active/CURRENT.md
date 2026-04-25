# CURRENT — 단일 진실 (2026-04-26)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0163-ci-agent-governance` | contract | PR #322 — memory sync 큐 통합 + stale PR 정리 |
| `W-0132-copy-trading-phase1` | engine + app | ✅ 완료 — PR #313 main 머지 완료 |
| `W-0145-operational-seed-search-corpus` | engine | ✅ 완료 — main에 이미 구현됨 (14 tests pass) |

---

## main SHA

`d77af40f` — origin/main (2026-04-26) — W-0132 copy trading + agent session index 포함

## 진행 중 PR

| PR | 내용 | 상태 |
|---|---|---|
| [#322](https://github.com/eunjuhyun88/WTD_2/pull/322) | memory sync 큐 통합 + workflow/script 개선 | 검증 대기 |
| [#285](https://github.com/eunjuhyun88/WTD_2/pull/285) | W-0114 research compare script | triage 대기 |

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
| **W-0211** multi-pane chart + Pine Script engine | PR #298 + #302 main 머지 완료 (87f44b0b) |
| **fix/indicator-defaults** OI/Funding/Liq 기본 ON | PR #302 main 머지 완료 (2026-04-26) |
| **W-0203** terminal UX | PR #290 main 머지 완료 |
| **W-0162** JWT security P0 | PR #253 main 머지 완료 |
| **엔진 P0-P2 infra** | PR #281 main 머지 완료 |
| **W-0162 P1/P2** JWT RS256 + 블랙리스트 | PR #277 main 머지 완료 (2026-04-25) |
| **GCP cogotchi** 1024MiB + Cloud Scheduler 5 jobs | cogotchi-00013-c7n 서빙 중 (2026-04-26) |
| **W-0204** captures.py active_variant_store 연결 | PR #292 main 머지 완료 |
| **W-0203** pattern-seed route delegation | PR #292 main 머지 완료 |
| **W-0205** PromotionReport Gate 카드 UI | PR #292 main 머지 완료 |
| **W-0164** repo state hygiene | PR #305 main 머지 완료 |
| **worktree 정리** 46→5개 | claude/.codex/.worktrees /tmp 전부 정리 완료 (2026-04-26) |
| **Next design** W-0132/W-0145 실행 설계 | PR #311 main 머지 완료 |
| **Session checkpoint** worktree/PR 큐 상태 정리 | PR #314 main 머지 완료 |
| **Agent session records** Agent 1-6 기록 저장 | PR #318 + PR #320 main 머지 완료 |
| **W-0132** copy trading Phase 1 | PR #313 main 머지 완료 |
| **Agent 3 handoff** Cloud Scheduler/GCP/App CI 기록 | PR #323 main 머지 완료 |
| **Agent session index** 가변 번호 체계 | PR #325 main 머지 완료 |

---

## 🔴 정리 대상 PR

| PR | 내용 | 선결조건 |
|---|---|---|
| PR #312/#315/#319/#321/#324/#326 | 오래된 개별 memory sync PR | PR #322에 이벤트 통합 후 close |
| PR #317 | 오래된 agent session docs PR | PR #318/#320에 흡수되어 close |

---

## 다음 실행 순서 (우선순위 순)

### 즉시
1. **PR #322 검증/머지** — memory sync 큐 통합, KST 날짜, 중복 이벤트 방지
2. **stale PR close** — #312/#315/#317/#319/#321/#324/#326
3. **PR #285 triage** — 오래된 research compare PR 유지/종료 판단

### 중기
4. **W-0212 차트 UX 마무리** — 패인 드래그 리사이즈 검증 + 크로스헤어 값 업데이트 + KPI 스파크라인 확인
   - `feat/w-0212-chart-ux-polish`

설계: `work/active/W-next-design-20260426.md`

---

## 인프라 미완 (사람이 직접 실행)

- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
- [x] Cloud Scheduler HTTP jobs — 5 jobs 등록 완료 (2026-04-25): feature-materialization-run, db-cleanup-daily, pattern-scan-run, outcome-resolver-run, feature-windows-build
- [x] `_primary_cache_dir` NameError 수정 — PR #291 main 머지 + GCP cogotchi-00013-c7n 배포 완료 (2026-04-26)

---

## 체크포인트 파일

- `docs/archive/work-checkpoints/W-app-ci-repair-checkpoint-20260426.md` — App CI 수리 세션 기록
- `work/active/W-next-design-20260426.md` — 다음 작업 설계 (W-0212 → W-0132 → W-0145)
