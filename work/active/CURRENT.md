# CURRENT — 단일 진실 (2026-04-23)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`9bbc10ba` — PR #190 (`codex/w-0138-engine-runtime-role-split`) 포함 최신 `origin/main`

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
| **W-0146** | `W-0146-lane-cleanup-and-merge-governance.md` | 🔴 IN-PROGRESS | branch/function audit + merge-now / split-next / park-only queue |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🔴 IN-PROGRESS | fact-plane cleanup: reference stack + chain intel + influencer metrics + marketCapPlane |
| **W-0145** | `W-0145-operational-seed-search-corpus.md` | 🔴 IN-PROGRESS | scheduler-driven corpus accumulation + seed-search corpus-first retrieval |
| **W-0144** | `W-0144-memkraft-shadow-memory-lane.md` | 🔴 IN-PROGRESS | commit split plan + MemKraft shadow sync/backfill + seed-search evidence recall |
| **W-0142** | `W-0142-manual-hypothesis-research-context.md` | 🔴 IN-PROGRESS | engine research_context contract commit split + app DB fallback persistence decision |
| **W-0143** | `W-0143-query-by-example-pattern-search.md` | 🔴 IN-PROGRESS | terminal seed-search wiring landed; compare/pin workspace persistence + richer retrieval remain |
| **W-0139** | `W-0139-terminal-core-loop-capture.md` | 🟢 VERIFIED | 사용자 승인 후 scoped commit/PR 정리만 남음 |
| **W-0140** | `W-0140-analyze-tab-consolidation.md` | 🔴 IN-PROGRESS | 하단 ANALYZE 탭 follow-up QA / 추가 정리 |
| **W-0141** | `W-0141-cogochi-protocol-whitepaper-refresh.md` | 🔴 IN-PROGRESS | investor-facing protocol whitepaper repositioning + canonical doc authoring |
| **W-0126** | `W-0126-ledger-supabase-record-store.md` | 🟡 OPS-BLOCKED | engine mainline integration 완료, 운영 migration 018만 남음 |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🟡 IN-PROGRESS | Confluence Phase 2 (engine scorer + flywheel weights) |
| **W-0124** | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | GCP ingress 인증 — infra 변경, 별도 세션 |

---

## Canonical Lane Order — Terminal AI / Scan

이 축은 아래 3-plane 으로 고정한다. 순서를 어기면 surface 와 provider fan-out 이 다시 섞인다.

1. **Fact Plane (`W-0122`)**
   - market reference stack, chain intel, influencer metrics, market-cap plane
   - 목적: API-key 부재(CMC/Santiment/Arkham) 상황에서도 AI 와 scan 이 읽을 canonical fact layer 구축
2. **Search Plane (`W-0145` + `W-0143`)**
   - operational corpus, pattern family / seed-search / pattern catalog / pattern-aware scan
   - 목적: live chat 마다 raw provider 를 다시 긁지 않고, corpus + cached facts 로 즉시 검색
3. **Surface Plane (`W-0140` + `W-0139`)**
   - compare/pin workspace, range capture/save, analyze handoff
   - 목적: 위 두 plane 결과만 소비해 trader workflow 를 닫음

규칙:

- UI 는 raw provider 를 직접 fan-out 하지 않는다.
- AI agent 는 bounded `agentContext` 와 read-model route 만 소비한다.
- historical / market-wide search 는 `worker-control` / scheduler corpus 에서만 확장한다.
- 새 provider 는 먼저 fact plane 에서 `live / blocked / reference_only` state 를 가져야 한다.
- branch cleanup reason: current local stack mixes `W-0139`, `W-0142`, `W-0143`, `W-0144`, `W-0122`, and protocol/doc lanes in one worktree; preserve first on parking branches, then resume next work from a clean main-based branch/worktree.

---

## Dirty Tree Split Snapshot

- `W-0145/W-0142/W-0143`: `engine/api/routes/{jobs,seed_search}.py`, `engine/research/{seed_search,market_corpus}.py`, `engine/scanner/{scheduler.py,jobs/seed_search_corpus.py}`, `app/src/lib/api/seedSearch.ts`, 관련 work item 문서
- `W-0139`: terminal save/range/lab-handoff surface files, `chartSaveMode`, terminal persistence/tests, `/terminal` route, 관련 work item 문서
- `W-0122`: market/intel/reference-stack files, indicator registry updates, `/api/market/*` 확장 routes/tests, 관련 work item 문서
- `W-0141`: protocol whitepaper/architecture docs + `pattern_families` engine lane
- staging 제외 noise: `.playwright-cli/*.png`
- hunk-level staging required: `app/src/hooks.server.ts`, `app/src/routes/api/terminal/intel-policy/+server.ts`, `app/src/lib/api/terminalBackend.ts`, `work/active/CURRENT.md`

---

## 즉시 실행 순서

1. **W-0146 / C0** — lane cleanup / merge governance audit
2. **W-0122 / C1** — fact-plane cleanup: reference stack + chain-intel + influencer metrics + market-cap canonical routes
3. **W-0145 / C2** — scheduler-driven operational seed-search corpus store + retrieval bridge
4. **W-0142 / C3** — engine `research_context` capture contract commit split
5. **W-0143 / C4** — seed-search/catalog/replay follow-up + compare/pin persistence planning
6. **W-0144 / C5** — remaining commit/merge order governance + test isolation follow-up
7. **W-0139 / C6** — terminal surface scoped commit/PR 정리
8. **Supabase migration 018** — `app/supabase/migrations/018_pattern_ledger_records.sql` (MCP or psql)

---

## 브랜치 매핑

| 브랜치 | Work Item | 상태 |
|---|---|---|
| main | — | 최신 (`9bbc10ba`) |
| codex/w-0122-fact-plane-mainline | W-0122 | clean main-based execution lane |
| codex/parking-20260423-mixed-lanes | parking | mixed dirty snapshot preserved (`8e394414`, `b11c7bd4`) |
| codex/stack-20260423-mixed-terminal-stack | parking | stacked local commit history before cleanup split |
| codex/w-0139-terminal-core-loop-capture | mixed stack | preserved only; do not reuse for new work |
| codex/w-0139-terminal-core-loop-capture-mainline | W-0139 | prior clean lane |
| codex/w-0138-engine-runtime-role-split | W-0138 | MERGED (#190) |
| codex/w-0140-analyze-tab-consolidation | W-0140 | MERGED (#189) |

---

## 인프라 미완 (사람 직접 실행 필요)

- [ ] Supabase migration 018 실행 (psql pooler)
- [ ] GCP cogotchi 재배포 필요 시: `gcloud run services update cogotchi-...`
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
