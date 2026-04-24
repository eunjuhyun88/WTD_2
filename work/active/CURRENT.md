# CURRENT — 단일 진실 (2026-04-24)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`2e58d5e0` — current local `origin/main` ref

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0200** | `W-0200-core-loop-proof.md` | 🔴 IN-PROGRESS | Save → Find Similar (10개) → Outcome 표시를 한 화면에서 end-to-end로 작동시키는 것 |

> **원칙**: 이 루프가 사용자 화면에서 실제로 돌기 전까지는 다른 work item을 열지 않는다.

---

## Deferred (루프 완성 이후 재개)

아래 work item들은 코드/브랜치가 존재하나, W-0200 완성 전까지 진행 금지.
`work/active/` 파일은 유지하되, 이 index에서는 deferred 처리.

| ID | 상태 | 재개 조건 |
|---|---|---|
| W-0160 | 🟡 DEFERRED | legacy backfill 결정은 루프 완성 후 |
| W-0148 | 🟡 DEFERRED | plane contract skeleton은 루프 완성 후 |
| W-0122 | 🟡 DEFERRED | fact-plane canonical routes는 루프 완성 후 |
| W-0145 | 🟡 DEFERRED | corpus/search store는 루프 완성 후 |
| W-0150 | 🟡 DEFERRED | breakout production lane은 루프 완성 후 |
| W-0151 | 🟡 DEFERRED | active variant registry는 루프 완성 후 |
| W-0152 | 🟡 DEFERRED | state/phase similarity search는 루프 완성 후 |
| W-0156 | 🟡 DEFERRED | feature plane foundation은 루프 완성 후 |
| W-0157 | 🟡 DEFERRED | similar-live feature ranking은 루프 완성 후 |
| W-0158 | 🟡 DEFERRED | promotion feature diagnostics는 루프 완성 후 |
| W-0159 | 🟡 DEFERRED | public liquidation source는 루프 완성 후 |
| W-0149 | 🟡 DEFERRED | benchmark pack builder — stash에 보존됨, W-0200에 흡수 |
| W-0142 | 🟡 DEFERRED | runtime state APIs는 루프 완성 후 |
| W-0140 | 🟡 DEFERRED | bottom ANALYZE slimming은 루프 완성 후 |

## Reference / Assist

| ID | 파일 | 상태 | 역할 |
|---|---|---|---|
| W-0126 | `W-0126-ledger-supabase-record-store.md` | 🟡 FOLLOW-UP | Cloud Run region 결정만 남음 |
| W-0143 | `W-0143-query-by-example-pattern-search.md` | 🟢 COMPLETE | `AgentContextPack` 완료 |
| W-0139 | `W-0139-terminal-core-loop-capture.md` | 🟢 COMPLETE | terminal surface reads 완료 |
| W-0146 | `W-0146-lane-cleanup-and-merge-governance.md` | 🟡 REFERENCE | governance reference only |
| W-0141 | `W-0141-market-data-plane.md` | 🟡 ASSIST | workspace/data contract assist |
| W-0124 | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | infra 변경, 별도 세션 |

---

## Canonical Lane Order (변경 없음)

이 축은 아래 `5 planes + runtime state plane` 으로 고정한다.

1. **Ingress** — raw provider fetch, cache, capability/freshness state
2. **Fact Plane** — `FactSnapshot`, reference stack, chain intel, confluence
3. **Search Plane** — corpus, scan, seed-search, catalog, candidate reports
4. **Agent Context** — `AgentContextPack`, bounded AI inputs
5. **Surface Plane** — terminal page, analyze workspace, save/setup UX

별도 plane:
- **Runtime State** — capture, pins, setups, research context, ledger, outcomes

---

## 현재 브랜치 상태

- active: `codex/w-0148-current-plan-refresh-20260424` (문서 정리 완료, 다음 step 은 W-0200 전용 브랜치)
- stash: `core-loop: capture benchmark_search endpoints + PatternDraft schema [W-0149 scope]`
- 다음 브랜치: `codex/w-0200-core-loop-proof` (새로 생성)

---

## 인프라 미완 (사람 직접 실행 필요)

- [x] Supabase migration 018 실행 및 DB table/index 검증
- [x] Vercel preview branch env 정렬
- [x] deterministic wrapper로 `cogochi-2` preview 재배포 후 live alias/스모크 확인
- [ ] Cloud Run `asia-southeast1/cogotchi` 재배포 또는 `us-east4/cogotchi` 유지 결정
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
