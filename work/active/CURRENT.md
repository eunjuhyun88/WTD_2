# CURRENT — 단일 진실 (2026-04-25 CLEAN)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`f98f7648` — origin/main (2026-04-25) — W-0203 terminal UI/UX overhaul

---

## 완료된 것 (main에 머지됨)

### 터미널 UI/UX
| PR | Work Item | 내용 |
|---|---|---|
| #290 | W-0203 | Terminal UI/UX overhaul (data-dense trading interface) |
| `38ce46a8` | W-0210 | 4-layer 데이터 시각화: AlphaOverlay + WhaleWatch + BTC Comparison + NewsBar |
| `4319766c`~`5dd144f3` | — | P0-P12 터미널 UX 리빌드 (pine script, scan cards, workspace wire 등) |

### 엔진/인프라
| PR | Work Item | 내용 |
|---|---|---|
| #281 | — | P0-P2 engine infra: migration runner, corpus bridge, stats engine, wiki agent |
| #280 | W-0280 | Agent execution protocol + evidence runbook |
| #288 | W-0142 | App warning burndown + capture runtime plane refactor |
| #286 | — | CI repair (3 engine import failures) |
| #270 | W-0160 | Pattern draft query transformer contract |
| #269 | W-0159 | Canonical raw plane ingestion (liquidation followup) |
| #268 | W-0159 | Canonical raw plane ingestion |
| #267 | W-0158 | Promotion feature diagnostics |
| #266 | W-0153 | Persistent retrieval index |

### 보안
| PR | Work Item | 내용 |
|---|---|---|
| #253 | W-0162 | JWT P0 hardening (JWKS cache + circuit breaker) |

### 검색/패턴
| PR | Work Item | 내용 |
|---|---|---|
| #259 | W-0156 | Feature materialization plane (FeatureWindowStore) |
| #256 | W-0200 | Core loop proof (range→analyze→similar→save) |

---

## 진행 중 (브랜치 존재, 미완)

| 브랜치 | Work Item | 상태 |
|---|---|---|
| `codex/w-0201-core-loop-contract-hardening` | W-0201 | WIP 저장됨 (#289), 미완성 |

---

## 다음 P0 (코드로 해야 할 것 — 우선순위 순)

| 순위 | 작업 | 이유 |
|---|---|---|
| **P0** | Ledger → Supabase 이전 | Cloud Run 재시작 시 JSON 파일 소실 위험 |
| **P0** | DB migration system | embedded DDL로 schema 변경 불가 |
| **P1** | W-0202: FeatureWindowStore → search corpus 연결 | Layer A 검색에 materialized feature 반영 |
| **P1** | W-0201: core loop contract hardening | 브랜치 WIP 있음, 이어서 완료 필요 |
| **P2** | Context Assembly (`engine/agents/context.py`) | LLM 호출마다 어떤 context 주입할지 규칙 없음 |

---

## 인프라 미완 (사람이 직접 실행해야 함)

- [ ] GCP cogotchi-worker Cloud Build trigger 확인
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` 환경변수 (프로덕션)
- [ ] Cloud Scheduler HTTP jobs 등록 (`docs/runbooks/cloud-scheduler-setup.md`)
- [ ] Supabase migration 021 이후 적용 확인

---

## work/active/ 파일 정리 상태

> 70개 이상의 파일이 있으나 대부분 이미 완료된 작업의 흔적.
> 실제 참조 필요한 파일만 아래에 기록.

| 파일 | 용도 |
|---|---|
| `W-0202-featurewindowstore-search-cutover.md` | P1 다음 구현 대상 |
| `W-0201-core-loop-contract-hardening.md` | P1 WIP 브랜치 있음 |
| `W-0210-terminal-data-visualization-layers.md` | 완료 — 아키텍처 레퍼런스용 |
| `W-0146-lane-cleanup-and-merge-governance.md` | 거버넌스 레퍼런스 |
