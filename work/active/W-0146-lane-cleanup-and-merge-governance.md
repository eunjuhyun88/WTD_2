# W-0146 — Lane Cleanup And Merge Governance

## Goal

현재 로컬 브랜치/parking/stack 상태를 CTO 관점에서 재분류해, 어떤 기능이 무엇을 하는지, 현재 제품 구조보다 나아진 점/리스크가 무엇인지, merge 가능한 것과 split/park 해야 하는 것을 canonical queue 로 정리한다.

## Owner

research

## Primary Change Type

Research or eval change

## Scope

- active local branches 와 parking branches 의 기능/리스크 분석
- fact/search/surface plane 기준 우선순위 queue 작성
- merge 금지/허용 기준 정의
- 다음 execution branch / commit split 순서 정의

## Non-Goals

- 이번 슬라이스에서 모든 parked branch 를 실제 PR 로 승격 완료
- product surface 신규 구현
- unrelated legacy branch cleanup 전부 수행

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0146-lane-cleanup-and-merge-governance.md`
- `work/active/W-0122-free-indicator-stack.md`
- `work/active/W-0143-query-by-example-pattern-search.md`
- `work/active/W-0145-operational-seed-search-corpus.md`

## Facts

1. current local state was cleaned by preserving mixed work on `codex/parking-20260423-mixed-lanes` and `codex/stack-20260423-mixed-terminal-stack`, while the active clean lane moved to `codex/w-0122-fact-plane-mainline`.
2. the preserved mixed stack still contains multiple work items (`W-0139`, `W-0142`, `W-0143`, `W-0144`) and is not safe to merge as-is.
3. parking branches are recovery assets, not product branches; they should never be merged directly.
4. the canonical product order is now `Fact Plane (W-0122) -> Search Plane (W-0145/W-0143) -> Surface Plane (W-0140/W-0139)`.
5. `main..codex/parking-20260423-mixed-lanes` contains four distinct product lanes at once: fact-plane market intel, seed-search/search-plane, terminal save/surface work, and protocol docs/memory artifacts.

## Assumptions

1. no branch should be merged to `main` unless it is both lane-pure and verified.
2. the next productive branch should start from the clean `W-0122` mainline lane rather than the preserved mixed stack.

## Open Questions

- whether `W-0143` should be extracted as a clean branch before or after `W-0122` fact-plane completion.

## Decisions

- merge decisions will be made per lane, not per old branch name.
- parking/stack branches are preservation-only and must be excluded from merge candidates.
- priority is determined by architecture leverage and fan-out reduction, not by which branch already exists.
- `codex/w-0122-fact-plane-mainline` is the only branch that should receive new work immediately.
- no direct merge to `main` is authorized from the parking or mixed-stack branches.
- do **not** start with a repo-wide refactor. Start with a bounded architecture audit of the terminal AI / scan vertical slice, freeze contracts, then extract modules one plane at a time.

## Architecture Diagnosis

1. current surface ownership is too fat: `/terminal/+page.svelte` is a large orchestration component that mixes UI state, fetch scheduling, SSE AI flow, persistence, and scan actions.
2. current app-side server layer is also too fat: `scanEngine.ts` mixes provider fetch, cache, scoring, summarization, and response shaping in one module.
3. `marketDataService.ts` is acceptable as a raw adapter bag, but only if all product logic moves out of it and callers stop composing business truth ad hoc.
4. `terminalParity.ts` is a good direction for read-model composition, but it still derives product semantics in the app layer instead of consuming a stricter fact/search contract.
5. parked `seed_search.py` is powerful but too broad; it combines persistence, retrieval, ranking, and promotion logic in one runtime path, so it needs search-plane extraction rather than more feature accretion.

## Refactor Posture

- first: architecture map and contract freeze
- second: strangler extraction by plane
- third: delete/retire old call paths only after new paths are verified

This means:

- no blind rename/move cleanup
- no whole-repo “clean code” pass
- no new surface feature work until fact/search boundaries stop leaking

## Immediate Architecture Audit Scope

Audit only these verticals:

1. raw data ingress
   - providers, quotas, degraded states
2. fact composition
   - market/reference/intel/macro read models
3. search composition
   - seed-search, pattern catalog, corpus, scan results
4. AI context assembly
   - what facts/search results become `agentContext`
5. surface consumption
   - terminal page, save/setup, compare/pin

## Lane Assessment

### Fact Plane — `W-0122`

- 기능:
  - `chain-intel`, `supportedChains`, `solscan`, `tronscan`, `etherscan`, `coingeckoOnchain`
  - `marketReferenceStack`, `marketCapPlane`, `influencerMetrics`
  - `/api/market/*` read models
- 현재보다 좋아진 점:
  - API-key 부재 상황에서도 `live / blocked / reference_only` truth를 유지할 수 있다.
  - AI/scan 이 raw provider fan-out 대신 bounded market facts 를 읽게 된다.
  - CoinGecko/CMC 단일 provider 의존도를 줄인다.
- 설계 판정:
  - 방향은 맞다.
  - 아직 문제는 lane purity 가 부족하다는 점이다. `intel-policy`, `terminal`, `opportunity` 소비 경계가 일부 섞여 있다.
- merge 판정:
  - **split-next**
  - clean branch `codex/w-0122-fact-plane-mainline` 에서 재검증 후 별도 PR 로 가야 한다.

### Search Plane — `W-0145` + `W-0143`

- 기능:
  - `seed_search`, `pattern catalog`, `pattern family`, `market_corpus`, scheduler corpus refresh
  - terminal pattern-aware scan / AI context handoff
- 현재보다 좋아진 점:
  - founder seed -> search -> candidate -> explanation 흐름이 실제 계약으로 닫히기 시작했다.
  - AI agent 가 latest pattern scan / catalog 를 읽을 수 있다.
  - scheduler corpus 로 가면 broad historical retrieval 비용이 크게 줄어든다.
- 설계 판정:
  - `W-0143`는 search contract 측면에서 좋다.
  - `W-0145` corpus 는 성능/비용 측면에서 필수다.
  - 다만 `pattern_family`, `seed_search`, `market_corpus` 가 parking branch 안에서 아직 한 덩어리라 merge-ready 는 아니다.
- merge 판정:
  - **split-next**
  - `W-0145` corpus lane 과 `W-0143` app/scan lane 을 따로 extraction 해야 한다.

### Surface Plane — `W-0139` + `W-0140`

- 기능:
  - range capture, Save Setup, lab handoff, compare/pin workspace 기반 surface
- 현재보다 좋아진 점:
  - trader core loop 가 훨씬 명확하다.
  - analyze/scan/judge 를 실제 action flow 와 연결한다.
- 설계 판정:
  - surface 자체는 올바른 방향이다.
  - 하지만 fact/search plane 이 완전히 닫히기 전에 더 확장하면 다시 임시 조립 UI가 된다.
- merge 판정:
  - `W-0140` 은 이미 merged.
  - `W-0139` old mixed branch 는 **park-only**.
  - clean lineage 는 `codex/w-0139-terminal-core-loop-capture-mainline` 만 reference 로 본다.

### Protocol / Whitepaper Lane — `W-0141`

- 기능:
  - Cogochi protocol docs, route/object/shared-state architecture docs
- 설계 판정:
  - 제품/투자자 커뮤니케이션 가치는 있지만, 현재 fact/search/surface unblock 우선순위보다 낮다.
- merge 판정:
  - **defer**

## CTO Priority Queue

1. `W-0122` fact-plane extraction and verification
2. `W-0145` corpus lane extraction and targeted engine tests
3. `W-0143` app/scan/AI context extraction and compare-persistence plan
4. `W-0142` research_context persistence split
5. `W-0139` surface-only cleanup if still needed after upstream planes settle
6. `W-0141` protocol docs lane

## Branch Action Table

- `codex/w-0122-fact-plane-mainline`
  - classification: **active / split-next**
  - action: continue here, keep lane pure, prepare PR after targeted tests
- `codex/parking-20260423-mixed-lanes`
  - classification: **park-only**
  - action: never merge; source branch for later extraction/cherry-pick only
- `codex/stack-20260423-mixed-terminal-stack`
  - classification: **park-only**
  - action: preserve old local commit order; do not develop further here
- `codex/w-0139-terminal-core-loop-capture`
  - classification: **retire**
  - action: do not reuse; historical reference only
- `codex/w-0139-terminal-core-loop-capture-mainline`
  - classification: **reference**
  - action: use only if `W-0139` surface follow-up is explicitly reopened

## Merge Queue

- merge-now:
  - none
- split-next:
  - `W-0122` fact-plane files from clean branch
  - `W-0145` corpus files from parking branch
  - `W-0143` app seed-search/pattern-catalog/AI-context files from parking or mixed stack
- park-only:
  - parking branch snapshots
  - screenshot artifacts
  - memory decision dumps unless a specific memory lane needs them

## Improvement Gaps

1. `W-0122` still needs a single `terminal AI fact context` builder so agent calls do not hand-assemble read models.
2. `W-0145` needs a clear storage contract for corpus retention and pruning before it grows unchecked.
3. `W-0143` still lacks compare/pin persistence for scan results, so search output is not yet a stable workspace object.
4. `hooks.server.ts`, `intel-policy`, `terminalBackend`, and `terminal/+page.svelte` remain hot spots for accidental cross-lane leakage and should be staged hunk-by-hunk.

## Next Steps

1. finish `W-0122` on `codex/w-0122-fact-plane-mainline` and keep it lane-pure.
2. after `W-0122`, create a fresh `W-0145` branch from `main` and cherry-pick only corpus files from the parking branch.
3. only after `W-0145` settles, extract `W-0143` app-side follow-up from the preserved stack/parking branches.

## Exit Criteria

- one canonical queue exists for what to merge, what to split, and what to defer.
- current clean branch for next work is explicit.
- parking branches are clearly marked as non-merge assets.

## Handoff Checklist

- active work item: `work/active/W-0146-lane-cleanup-and-merge-governance.md`
- branch: `codex/w-0122-fact-plane-mainline`
- verification: git branch/log/status inspection only
- remaining blockers: clean extraction of `W-0145`, `W-0143`, and `W-0142` from preserved mixed branches, plus final PR verification per lane
