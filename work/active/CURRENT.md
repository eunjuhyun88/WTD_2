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

`ff5282a2` — origin/main (2026-04-26) — fix/indicator-defaults + worktree 정리 완료 (46→5개) + W-0211 PR #308 오픈

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

---

## 🔴 PR 머지 대기

| PR | 내용 | 선결조건 |
|---|---|---|
| PR #308 | feat(W-0211): native multi-pane + Pine Script | 머지 대기 |
| PR #309 | docs: 설계문서 + CURRENT.md | 머지 대기 |

---

## 다음 실행 순서 (우선순위 순)

### 즉시
1. **W-0212 차트 UX 마무리** — 패인 드래그 리사이즈 검증 + 크로스헤어 값 업데이트 + KPI 스파크라인 확인
   - `feat/w-0212-chart-ux-polish`

### 중기
2. **W-0132 카피트레이딩 Phase 1** — migration 022 + leaderboard API + UI panel
   - `feat/w-0132-copy-trading-phase1`
3. **W-0145 Search Corpus 40+차원** — corpus_builder 40차원 확장
   - `feat/w-0145-search-corpus-40dim`

설계: `work/active/W-next-design-20260426.md`

---

## 인프라 미완 (사람이 직접 실행)

- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
- [x] Cloud Scheduler HTTP jobs — 5 jobs 등록 완료 (2026-04-25): feature-materialization-run, db-cleanup-daily, pattern-scan-run, outcome-resolver-run, feature-windows-build
- [x] `_primary_cache_dir` NameError 수정 — PR #291 main 머지 + GCP cogotchi-00013-c7n 배포 완료 (2026-04-26)

---

## 체크포인트 파일

- `work/active/W-app-ci-repair-checkpoint-20260426.md` — App CI 수리 세션 기록
- `work/active/W-next-design-20260426.md` — 다음 작업 설계 (W-0212 → W-0132 → W-0145)
