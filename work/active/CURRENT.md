# CURRENT — 단일 진실 (2026-04-26 업데이트)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0145-operational-seed-search-corpus` | engine | 다음 — 107 symbols corpus 확장 |
| `W-0132-copy-trading-phase1` | engine + app | 다음 — DB migration 022 + ELO score |

---

## main SHA

`30707d34` — origin/main (2026-04-26) — W-0164 repo hygiene + memory sync #305 포함

---

## ✅ 실제로 완료된 것 (코드 검증됨)

| 항목 | 근거 |
|---|---|
| **Engine CI** 1448 passed | PR #291 머지 |
| **Contract CI** PASS | PR #297 포함 |
| **App CI** 250 tests pass, 0 TS errors | PR #293 main 머지 완료 |
| **W-0163** CI governance | PR #293에 포함 — required checks + memory sync |
| **W-0164** repo state hygiene | PR #305 main 머지 완료 |
| **W-0201** query_transformer fix | PR #291 머지 완료 |
| **W-0202** canonical features + active registry | PR #291 머지 완료 |
| **W-0203** terminal UX | PR #290 머지 완료 |
| **W-0204/205** active variant promotion + Gate UI | PR #292 머지 완료 |
| **W-0210** 4-layer terminal viz | main 머지 완료 |
| **W-0211** multi-pane chart + Pine Script engine | PR #298 머지 완료 |
| **Indicator defaults** OI/Funding/Liq 기본 ON | main 머지 완료 |
| **W-0162 P0** JWT JWKS 캐싱 + circuit breaker | PR #253 머지 완료 |
| **W-0162 P1/P2** JWT RS256 + 블랙리스트 | PR #277 머지 완료 |
| **엔진 P0-P2 infra** | PR #281 머지 완료 |
| **GCP cogotchi** 1024MiB + Cloud Scheduler 5 jobs | cogotchi-00013-c7n 서빙 중 |
| **_primary_cache_dir** NameError 수정 | PR #291 머지 + GCP 재배포 확인 |

---

## 🔴 PR 머지 대기

| PR | 내용 | 선결조건 |
|---|---|---|
| (없음) | — | 모든 즉시 항목 완료 |

---

## 다음 실행 순서 (우선순위 순)

### 우선순위 1 — W-0145: Corpus 107 symbols 확장

현재 feature_windows = 29 symbols. 목표 107 symbols.
`work/active/W-next-design-20260426.md` 에 상세 실행 계획 있음.

```bash
git checkout -b feat/w-0145-corpus-107symbols origin/main
```

### 우선순위 2 — W-0132: Copy Trading Phase 1

DB migration 022 + ELO reputation + leaderboard API + UI.
`work/active/W-next-design-20260426.md` 에 SQL 초안 있음.

```bash
git checkout -b claude/w-0132-copy-trading-p1 origin/main
```

---

## 인프라 미완 (사람이 직접 실행)

- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
- [x] Cloud Scheduler 5 jobs 등록 완료 (2026-04-25)
- [x] `_primary_cache_dir` NameError 수정 + GCP cogotchi-00013-c7n (2026-04-26)

---

## 체크포인트 파일

- `work/active/W-next-design-20260426.md` — 다음 세션 실행 설계 (W-0145 + W-0132)
