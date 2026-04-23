# CURRENT — 단일 진실 (2026-04-23)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`7397cbb5` — local `main` baseline; W-0139 merge 반영, PR #189 / #190 포함

## 완료 (이번 세션)

| PR | 내용 |
|---|---|
| #185 (W-0137) | C sidebar ANALYZE를 right-dock collapse + summary/detail 구조로 재분리 |
| #186 (W-0126) | ledger record store boundary refactor를 최신 mainline에 통합 |
| #188 (W-0136) | worker-control research CLI + W-0126 cutover preflight 보강 |
| #189 (W-0140) | bottom ANALYZE tab 상세 workspace 재구성 |
| #190 (W-0138) | `ENGINE_RUNTIME_ROLE` 기반 engine-api / worker-control split |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0152** | `W-0152-market-retrieval-index.md` | 🟢 VERIFIED | cached corpus cheap retrieval + top-N replay rerank over recent history |
| **W-0151** | `W-0151-cached-universe-live-scan.md` | 🟢 VERIFIED | cached symbol inventory + live monitor CLI over canonical shared cache |
| **W-0150** | `W-0150-shared-cache-corpus.md` | 🟢 VERIFIED | shared cache root discovery lets benchmark/search read canonical offline corpus across worktrees |
| **W-0149** | `W-0149-pattern-search-engine-quality.md` | 🟢 VERIFIED | anchored breakout + scoped replay + 15m benchmark axis done; shared cache/corpus follow-up remains separate |
| **W-0147** | `W-0147-html-reference-pattern-engine.md` | 🟢 VERIFIED | 42 HTML-reference slugs registered; benchmark/search validation remains separate research/eval work |
| **W-0139** | `W-0139-terminal-core-loop-capture.md` | 🟡 QA-BLOCKED | manual browser QA + lab autorun/watch activation rule |
| **W-0141** | `W-0141-market-data-plane.md` | 🔴 IN-PROGRESS | chart/analyze/AI/backend source 를 하나의 canonical data plane 으로 재정의 |
| **W-0140** | `W-0140-analyze-tab-consolidation.md` | 🔴 IN-PROGRESS | 하단 ANALYZE 탭 follow-up QA / shared study contract 추가 정리 |
| **W-0126** | `W-0126-ledger-supabase-record-store.md` | 🟡 FOLLOW-UP | migration 018 + live preview redeploy + post-cutover stats hotfix 완료, canonical engine region 결정만 남음 |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🟡 IN-PROGRESS | Confluence Phase 2 (engine scorer + flywheel weights) |
| **W-0124** | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | GCP ingress 인증 — infra 변경, 별도 세션 |

---

## 즉시 실행 순서

1. **W-0152** — cached corpus cheap retrieval + top-N replay rerank over recent history
2. **W-0151** — cached symbol inventory + live monitor CLI over canonical shared cache
3. **W-0150** — shared cache root discovery for benchmark/search/scanner lanes
4. **W-0149** — TRADOOR/PTB anchored breakout + pattern-scoped replay + 15m benchmark axis
5. **W-0147** — HTML-derived pattern runtime block coverage + targeted engine tests
6. **W-0139** — `/terminal` Save & Open Lab manual QA + lab autorun/watch activation rule
7. **W-0141** — app-side pure producer 다음 단계로 backend workspace bundle producer 착수
8. **W-0126** — canonical engine region (`asia-southeast1` 복구 vs `us-east4` 유지) 결정만 정리

---

## 브랜치 매핑

| 브랜치 | Work Item | 상태 |
|---|---|---|
| main | — | 최신 (`7397cbb5`) |
| codex/w-0152-market-retrieval-index | W-0152 | ACTIVE |
| codex/w-0151-cached-universe-live-scan | W-0151 | ACTIVE |
| codex/w-0150-shared-cache-corpus | W-0150 | ACTIVE |
| codex/w-0149-pattern-search-engine | W-0149 | ACTIVE |
| codex/w-0147-html-pattern-engine | W-0147 | ACTIVE |
| codex/w-0139-terminal-core-loop-capture | W-0139 | ACTIVE |
| codex/w-0141-market-data-plane | W-0141 | MERGED INTO `main` |
| codex/w-0138-engine-runtime-role-split | W-0138 | MERGED (#190) |
| codex/w-0140-analyze-tab-consolidation | W-0140 | MERGED (#189) |

---

## 인프라 미완 (사람 직접 실행 필요)

- [x] Supabase migration 018 실행 및 DB table/index 검증
- [x] Vercel preview branch env (`release`, `codex/w-0139-terminal-core-loop-capture`) 정렬
- [x] deterministic wrapper로 `cogochi-2` preview 재배포 후 live alias/스모크 확인
- [ ] Cloud Run `asia-southeast1/cogotchi` 재배포 또는 `us-east4/cogotchi` 유지 결정을 명시
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
