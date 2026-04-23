# Domain: Terminal AI / Scan Architecture

## Goal

터미널 제품의 핵심 수직 경로를 아래 하나의 구조로 정렬한다.

`raw data -> canonical feature plane -> pattern/search plane -> agent context -> surface`

그리고 이 흐름과 별도로, workflow truth 를 담당하는 engine-owned
`runtime state / workflow state` plane 을 둔다.

이 구조의 목표는 세 가지다.

1. AI 가 raw provider fan-out 없이도 일관된 사실을 읽게 한다.
2. pattern/search 가 common feature 재계산 없이 canonical feature plane 위에서 동작하게 한다.
3. surface 는 비교/저장/실행 UX 만 담당하게 한다.

## Current Diagnosis

현재 문제는 기능 부족보다 책임 경계 부재다.

- `/terminal/+page.svelte` 가 UI, fetch scheduling, SSE, persistence, scan orchestration 을 동시에 가진다.
- `scanEngine.ts` 가 provider fetch, cache, scoring, summary shaping 을 한 곳에서 처리한다.
- `marketDataService.ts` 는 raw adapter bag 이지만, product truth 가 그 위에서 여기저기 재조립된다.
- `terminalParity.ts` 는 read-model 의 시작점이지만, fact/search 경계가 아직 약하다.
- parked `seed_search.py` 는 persistence, retrieval, ranking, promotion 을 모두 가지고 있어 search plane 분해가 필요하다.

즉 현재는 “레이어가 많은 것”이 문제가 아니라, 같은 의미를 여러 파일이 다시 만든다는 점이 문제다.

## Design Principles

1. `engine/` 만 backend truth 를 가진다.
2. `app/` 은 surface 와 orchestration 만 가진다.
3. AI 는 bounded context pack 만 읽고 raw source 를 직접 읽지 않는다.
4. broad retrieval 은 scheduler-built corpus 뒤로 숨긴다.
5. degraded provider state (`live / blocked / reference_only`) 는 first-class contract 다.
6. refactor 는 plane 단위 strangler 방식으로 하고, big-bang rewrite 는 금지한다.
7. raw retention 은 `replay 가능한 truth` 중심으로만 durable 하게 저장하고, provider blob 전체 보관은 금지한다.
8. shared feature math belongs to the data engine; pattern engines only interpret those features.

## Raw Storage Policy

트레이딩뷰 CTO 기준으로도 답은 `모든 응답을 다 저장` 이 아니다.
정답은 아래처럼 나누는 것이다.

### 1. Canonical Raw Plane

durable 하게 저장해야 하는 것:

- `raw_market_bars`
- `raw_perp_metrics`
- `raw_orderflow_metrics`
- `raw_liquidation_events` 또는 liquidation aggregate snapshot
- `raw_onchain_metrics`
- `raw_fundamental_metrics`
- `raw_macro_metrics`
- human research inputs (`capture`, chart snapshot metadata, source note, manual labels)

조건:

- normalized schema
- deterministic primary key
- `provider`, `source_ts`, `ingested_at`, `freshness_ms`, `quality_state`, `fallback_state` 포함
- replay / audit / recompute 에 사용 가능해야 함

### 2. Provider Blob Cache

durable canonical plane 으로 두지 말아야 하는 것:

- provider-native JSON blob 전체
- websocket tick/event full firehose without aggregation
- UI/debug 용 ad hoc payload dumps

정책:

- short TTL cache 또는 object storage
- debugging / forensic 용도만 허용
- fact/search/pattern/surface contract 는 이 layer 를 직접 읽지 않음

### 3. Canonical Feature Plane

raw 위에서 한 번만 계산해 저장해야 하는 것:

- bar features
- window features
- similarity/search signatures

대표 예:

- `oi_zscore`
- `funding_flip_flag`
- `volume_percentile`
- `cvd_divergence_price`
- `liq_imbalance`
- `pullback_depth_pct`
- `timeframe_alignment_score`

규칙:

- pattern family 마다 재계산 금지
- AI/surface/search 는 raw 대신 이 plane 을 우선 읽음

### 4. Retention Rule

- replay-critical raw: long retention, partitioned hot/cold storage
- feature windows/signatures: durable retention
- provider blobs: short TTL only
- full tick/orderbook history: pattern/replay 에 필요할 때만 별도 opt-in lane 으로 저장

한 줄 정책:

`store enough to replay and audit the market truth, but never turn provider exhaust into the product's canonical database.`

## Execution Ownership

이 문서는 architecture truth 다. 실제 execution owner 는 아래로 고정한다.

- `W-0148`: Phase 0 architecture owner only
  - `PR0.1` docs/governance normalize
  - `PR0.2` contract skeleton + plane-specific app proxies
- `W-0122`: Fact Plane owner
  - `GET /ctx/fact`
  - canonical `/facts/*`
  - `engine/market_engine/indicator_catalog.py`
- `W-0145`: Search Plane owner
  - corpus accumulation
  - canonical `/search/*`
- `W-0142`: Runtime State owner
  - captures / pins / setups / research context / ledger
  - canonical `/runtime/*`
- `W-0143`: Agent/Search integration owner
  - `AgentContextPack`
  - agent route unification after fact/search/runtime lanes merge
- `W-0139` + `W-0140`: Surface owner
  - terminal page, compare/pin, analyze workspace slimming
- `W-0141`: assist/doc lane only
- `W-0146`: governance/reference lane only

Parallel rule:

- `Dedicated contract PR first` 가 blocking step 이다.
- `W-0122`, `W-0145`, `W-0142` parallel lanes 는 `PR0.2` merge 후 updated `main` 에서만 시작한다.

## Target Topology

### 1. Raw Provider Layer

역할:

- 외부 provider fetch
- rate limit / retry / timeout / auth / capability detection
- source-specific schema 유지

예시 provider:

- Binance / Coinalyze / CoinGecko / DefiLlama
- Etherscan / Solscan / TRONSCAN
- Dune / LunarCrush / Santiment / CoinMetrics

규칙:

- product semantics 금지
- normalized product object 생성 금지
- provider state 와 raw payload 만 반환

### 2. Fact Plane

역할:

- 시장 사실을 canonical read model 로 합성
- AI 와 scan 이 공유하는 single source of market truth

대표 contract:

- `FactSnapshot`
- `MarketCapSnapshot`
- `ReferenceStackSnapshot`
- `ChainIntelSnapshot`
- `InfluencerMetricSnapshot`

예상 engine module:

- `engine/facts/market_cap.py`
- `engine/facts/reference_stack.py`
- `engine/facts/chain_intel.py`
- `engine/facts/influencer_metrics.py`

예상 app route:

- `/api/market/reference-stack`
- `/api/market/chain-intel`
- `/api/market/influencer-metrics`
- `/api/market/macro-overview`

규칙:

- provider 여러 개를 읽어도 output contract 는 한 개여야 한다.
- `live / blocked / reference_only` state 를 반드시 포함한다.
- UI/AI 는 provider 개별 응답을 몰라도 된다.

### 3. Canonical Feature Plane

역할:

- normalized market series에서 reusable feature를 계산
- 공통 zscore / slope / divergence / percentile / duration / regime 계열을 한 번만 계산
- fact, pattern, AI, runtime 이 같은 feature vocabulary 를 재사용하게 함

대표 object / store:

- `feature_bar_snapshots`
- `feature_windows`
- compact feature projections inside bounded fact contracts

규칙:

- `oi_zscore`, `funding_flip_flag`, `volume_percentile`,
  `cvd_divergence_price`, `liq_imbalance`, `pullback_depth_pct`,
  `timeframe_alignment_score` 같은 공통 재료는 여기서만 계산한다.
- pattern family 마다 같은 feature 를 다시 계산하지 않는다.
- 자세한 지표 정의는 `docs/domains/canonical-indicator-materialization.md` 를 canonical spec 으로 따른다.

### 4. Pattern / Search Plane

역할:

- canonical feature plane 위에서 phase / family / replay / similarity 를 정의
- 유사 패턴 탐색
- market-wide retrieval
- replay / rerank / promotion
- pattern catalog / live candidate context

대표 contract:

- `PatternCatalogEntry`
- `ScanRequest`
- `ScanResult`
- `SeedSearchRequest`
- `SeedSearchResult`
- `HistoricalCandidate`
- `CorpusWindowSignature`

예상 engine module:

- `engine/search/pattern_catalog.py`
- `engine/search/scan_runtime.py`
- `engine/search/seed_search.py`
- `engine/search/market_corpus.py`
- `engine/search/pattern_family.py`

규칙:

- pattern/search 는 feature producer 가 아니라 feature interpreter 다.
- phase rule, transition, family definition, replay score 는 이 plane 소유다.
- on-demand live scan 과 historical retrieval 을 분리한다.
- historical retrieval 은 corpus-first 로만 간다.
- search plane 은 explanation 과 score 를 같이 반환한다.

### 5. Agent Context Layer

역할:

- fact plane + search plane 의 bounded subset 을 LLM context 로 조립

대표 contract:

- `AgentContextPack`

필수 필드:

- current symbol / timeframe
- active decision / evidence
- fact snapshot summary
- latest scan or seed-search result
- provider state summary
- compare selection summary

규칙:

- raw tables, long histories, provider-specific objects 금지
- token budget 우선
- LLM 이 다시 broad retrieval 을 트리거하지 않아도 되게 구성

### 6. Runtime State Plane

역할:

- capture
- saved setup
- pattern runtime state
- research context
- ledger / outcome
- restore / project workflow

규칙:

- fact/search 결과를 참조할 수는 있어도 소유하면 안 된다.
- user workflow truth 는 fact/search cache 와 분리되어야 한다.
- local SQLite/file 은 fallback only 이다.

### 7. Surface Plane

역할:

- terminal page
- compare / pin workspace
- save setup / lab handoff
- AI chat shell

대표 surface object:

- `TerminalWorkspaceState`
- `PinnedPanel`
- `SavedSetup`
- `CompareSelection`

규칙:

- surface 는 fact/search 결과만 소비
- provider fetch 직접 호출 금지
- search/fact composition 금지

## Canonical Data Flow

### A. User asks AI about a symbol

1. surface selects current symbol/timeframe
2. fact plane and canonical feature plane return bounded snapshots
3. pattern/search plane returns latest scan or relevant catalog/search results
4. agent context builder compresses them into `AgentContextPack`
5. runtime state is consulted only for saved workflow context
6. AI route consumes only `AgentContextPack`

### B. User runs pattern scan

1. surface emits `ScanRequest`
2. pattern/search plane executes live scan on canonical features
3. search plane returns `ScanResult`
4. result metadata may be persisted into runtime state
5. result is optionally used by AI

### C. User starts seed search from selected range

1. surface emits `SeedSearchRequest`
2. search plane persists request
3. recent retrieval runs immediately
4. historical retrieval reads corpus
5. compare/pin linkage is stored in runtime state
6. result is restored as a comparable/pinnable search object

## Required Contracts

### FactSnapshot

Minimal schema:

```ts
type FactSnapshot = {
  symbol: string;
  timeframe: string;
  marketCap?: { total: number | null; btcDominance: number | null; stablecoinMcap: number | null };
  referenceStack?: { sources: Array<{ id: string; state: 'live' | 'blocked' | 'reference_only'; summary?: string }> };
  chainIntel?: { family?: string; chain?: string; providerStates: Record<string, string>; summary?: string };
  influencerMetrics?: { topMetrics: Array<{ id: string; value?: number | null; providerState: string }> };
};
```

### ScanResult

```ts
type ScanResult = {
  scanId: string;
  symbol: string;
  timeframe: string;
  summary: string;
  consensus: 'long' | 'short' | 'neutral';
  avgConfidence: number;
  highlights: Array<{ agent: string; vote: string; conf: number; note: string }>;
  patternContext?: { slug: string; family?: string; maturity?: string; candidateStatus?: string };
};
```

### AgentContextPack

```ts
type AgentContextPack = {
  symbol: string;
  timeframe: string;
  decision?: { direction?: string; confidence?: string; reason?: string };
  evidence?: Array<{ metric: string; value: string; state?: string }>;
  facts?: FactSnapshot;
  scan?: ScanResult | null;
  compare?: Array<{ kind: string; id: string; summary: string }>;
};
```

## Execution Spec

### Plane Contract Table

| Plane | Primary input | Primary output | Refresh mode | Durable store | Primary consumers | Forbidden dependency |
|---|---|---|---|---|---|---|
| `Ingress` | provider credentials, symbol, timeframe, chain, query params | provider-shaped raw payload, capability state, freshness metadata | request-time + scheduled prefetch | cache only | fact plane | search, AI, surface wording |
| `Fact` | ingress payloads + cache + global macro context | `FactSnapshot`, `ReferenceStackSnapshot`, `ChainIntelSnapshot`, `MarketCapSnapshot`, `ConfluenceResult` | request-time read model + scheduled refresh | shared canonical tables or engine-owned durable cache | search, agent, surface adapters | search ranking, pin/layout state |
| `Search` | fact snapshots + corpus + catalog + runtime hints | `ScanResult`, `SeedSearchResult`, `PatternCatalogEntry`, `CandidateReport` | request-time execution + scheduler corpus jobs | search run store, corpus store | agent, surface | direct provider fan-out, UI layout |
| `Agent Context` | facts + search outputs + runtime selection summary | `AgentContextPack` | request-time assembly | none required beyond source refs | AI routes | direct ingress reads |
| `Runtime State` | user actions + workflow events + ids referencing facts/search | `CaptureRecord`, `SavedSetup`, `PatternRuntimeState`, `ResearchContext`, `LedgerRecord`, `OutcomeRecord` | command/event driven | durable database | agent, surface, search hints | market truth ownership |
| `Surface` | facts, search outputs, agent context, runtime state | rendered UI, user actions | interactive | browser/app/session persistence only | end user | provider calls, scoring logic |

### Owner Routes

Minimum canonical route set:

| Contract | Owner | Route shape | Notes |
|---|---|---|---|
| `FactSnapshot` | `engine` | `GET /ctx/fact` | current landing zone |
| `ReferenceStackSnapshot` | `engine` | `GET /facts/reference-stack` | can start as subfield of `/ctx/fact` |
| `ChainIntelSnapshot` | `engine` | `GET /facts/chain-intel` | symbol/chain aware |
| `MarketCapSnapshot` | `engine` | `GET /facts/market-cap` | market-wide |
| `ConfluenceResult` | `engine` | `GET /facts/confluence` or `/ctx/fact` subfield | symbol/timeframe |
| `ScanResult` | `engine` | `POST /search/scan` | live scan only |
| `SeedSearchResult` | `engine` | `POST /search/seed` | request/response plus run id |
| `PatternCatalogEntry[]` | `engine` | `GET /search/catalog` | read-only |
| `AgentContextPack` | `engine contract`, `app` consumer | `POST /agent/context` or app-side assembly over engine contracts | app may bridge initially |
| `CaptureRecord` / `SavedSetup` / pins | `engine` long-term, `app` transitional UX route | workflow APIs | runtime state, not fact/search |

### Storage Rules

1. market facts are cacheable but replaceable
   - stale facts may be recomputed
   - fact store is not workflow truth
2. search runs and corpus are reproducible but still durable
   - keep run metadata, score summaries, and candidate references
   - raw replay inputs may remain cached separately
3. runtime state is authoritative
   - captures, ledger, research context, pinned workspace state, saved setups must survive refresh and deployment
4. local SQLite / file stores are fallback only
   - acceptable for dev
   - not acceptable as final production truth

### Refresh Rules

| Data kind | Refresh owner | Mode | Target cadence |
|---|---|---|---|
| provider raw caches | ingress/scheduler | pull/prefetch | source-specific |
| fact snapshots | engine fact plane | on-demand + periodic warm | symbol/timeframe and market-wide |
| confluence | engine fact plane | on-demand + warm | near-live |
| search corpus | scheduler / worker-control | background accumulation | continuous |
| live scan | search plane | on-demand | user-triggered |
| agent context | agent layer | on-demand | per AI request |
| runtime state | workflow handlers | event-driven | immediate persistence |

### Failure Model

Every plane must degrade explicitly.

| Plane | Allowed degraded states |
|---|---|
| `Ingress` | `timeout`, `rate_limited`, `auth_missing`, `partial` |
| `Fact` | `live`, `blocked`, `reference_only`, `stale` |
| `Search` | `live`, `corpus_only`, `fact_only`, `degraded` |
| `Agent Context` | `fact_only`, `fact_plus_search`, `workflow_augmented` |
| `Runtime State` | `durable`, `fallback_local`, `read_only` |
| `Surface` | `interactive`, `degraded_readonly`, `offline_cached` |

## Workspace Bundle Rule

`WorkspaceBundle` is only valid as a fact/read-model contract if all fields are UI-neutral.

Allowed in fact/read-model form:

- symbol
- timeframe
- fact snapshot refs
- study ids
- metric summaries
- source refs
- evidence summaries

Not allowed in fact/read-model form:

- panel placement
- compare slot index
- dock position
- pin state
- open/closed state
- presentation-only labels required only for one shell

If these UI fields are present, the object is a `surface adapter`, not a fact contract.

## Agent Context Rule

`AgentContextPack` must be assembled from four bounded inputs only:

1. fact summary
2. latest search result
3. workflow/runtime selection summary
4. user query and session metadata

It must not include:

- raw provider payloads
- full OHLCV history
- provider-specific auth/capability details beyond summarized state
- UI-local ephemeral layout state unless needed for interpretation

## End-to-End Data Pipeline

### Pipeline Families

There are four separate pipelines and they must not be collapsed into one module.

1. market fact pipeline
2. search/corpus pipeline
3. agent context pipeline
4. runtime state pipeline

### 1. Market Fact Pipeline

Purpose:

- turn raw provider data into canonical market truth

Stages:

1. provider fetch
2. raw cache write
3. normalization
4. fact composition
5. bounded fact route read

Concrete flow:

```text
Binance / CoinGecko / Etherscan / Solscan / DefiLlama
  -> engine ingress adapters
  -> raw cache + freshness/capability state
  -> engine fact builders
  -> FactSnapshot / ChainIntelSnapshot / ReferenceStackSnapshot / ConfluenceResult
  -> /ctx/fact and follow-up /facts/* routes
  -> app surface adapters
```

Rules:

- raw provider payloads may be cached
- fact outputs must be symbol/timeframe scoped or market-wide scoped
- app routes may proxy these facts during migration, but must not become new fact owners

### 2. Search / Corpus Pipeline

Purpose:

- find live and historical candidates without re-running broad provider fan-out per request

Stages:

1. scheduler-driven corpus accumulation
2. compact signature persistence
3. live scan execution
4. historical retrieval and rerank
5. ranked candidate output

Concrete flow:

```text
FactSnapshot + raw replay cache + pattern catalog
  -> worker-control / scheduler
  -> CorpusWindowSignature store
  -> seed search / scan runtime
  -> CandidateReport / ScanResult / SeedSearchResult
  -> AI and surface consumers
```

Rules:

- corpus stores compact signatures, not a full raw tick lake
- live scan is request-time
- historical retrieval is corpus-first
- fallback to raw-cache replay is allowed only as a temporary compatibility path

### 3. Agent Context Pipeline

Purpose:

- compress current facts, candidates, and workflow state into one bounded AI input

Stages:

1. load current fact snapshot
2. load latest scan or seed-search result
3. load workflow selection summary
4. assemble `AgentContextPack`
5. feed AI route

Concrete flow:

```text
FactSnapshot
  + ScanResult / SeedSearchResult
  + runtime selection summary
  + user query/session metadata
  -> AgentContextPack
  -> terminal AI route / message stream
```

Rules:

- no raw providers
- no full market tables
- no app-local ad hoc joins per route
- one canonical builder per shell

### 4. Runtime State Pipeline

Purpose:

- persist workflow artifacts that must survive refresh, restart, and deployment

Stages:

1. user action or engine event
2. workflow command handling
3. durable persistence
4. restore/project/read for surface or agent

Concrete flow:

```text
user capture / pin / save / verdict / outcome / research event
  -> engine workflow handlers
  -> CaptureRecord / SavedSetup / PatternRuntimeState / ResearchContext / LedgerRecord
  -> restore/project APIs
  -> surface and agent consumers
```

Rules:

- runtime state references fact/search outputs by id or compact summary
- runtime state does not own market truth
- surface persistence may exist temporarily, but canonical workflow state should converge on engine ownership

## Canonical Lane Design Pattern

새 데이터 기능, 새 지표 묶음, 새 패턴 연구 lane 은 아래 순서대로 설계한다.

이 섹션의 목적은 “좋은 구조를 아는 것”이 아니라, 새 작업이 들어올 때마다
같은 질문과 같은 산출물을 강제해 architecture drift 를 막는 것이다.

### Step 1. Name the lane precisely

먼저 이 lane 이 무엇인지 한 문장으로 고정한다.

예시:

- `BTC/ETH perp crowding fact lane`
- `multichain chain-intel fact lane`
- `TRADOOR/PTB seed-search corpus lane`
- `founder hypothesis runtime-state lane`

금지:

- `market improvements`
- `intel cleanup`
- `AI better answers`

이름이 추상적이면 plane 이 섞인다.

### Step 2. Decide the plane first

새 기능은 먼저 어느 plane 인지 결정한다.

| 질문 | 배치 |
|---|---|
| external source 를 읽고 market truth 를 정규화하는가? | `Ingress` 또는 `Fact` |
| live/historical retrieval, ranking, replay 인가? | `Search` |
| user/engine workflow artifact 인가? | `Runtime State` |
| LLM 입력용 압축물인가? | `Agent Context` |
| 화면 배치/상호작용/저장 UI 인가? | `Surface` |

하나의 change set 이 여러 plane 을 건드리면, 기본값은 split 이다.

### Step 3. Fill the split template

새 lane 은 최소 아래 8개를 먼저 채운다.

| Field | Meaning |
|---|---|
| `owner` | `engine` / `app` / `contract` / `research` |
| `plane` | ingress / fact / search / runtime_state / agent_context / surface |
| `source_of_truth` | cache / durable DB / corpus store / workflow store |
| `hot_path` | request-time read / interactive path |
| `background_path` | scheduler / worker-control / warmup |
| `canonical_route` | 최종 route 또는 contract |
| `degraded_states` | live / partial / blocked / stale / corpus_only 등 |
| `forbidden_dependencies` | 이 lane 이 의존하면 안 되는 것 |

이 템플릿을 채우지 못하면 구현을 시작하지 않는다.

### Step 4. Separate rebuildable truth from authoritative truth

가장 자주 꼬이는 지점이다.

- rebuildable:
  - fact snapshots
  - reference stack read models
  - confluence snapshots
  - market context aggregations
- authoritative:
  - captures
  - pins
  - saved setups
  - research_context
  - ledger/outcome
  - corpus signatures / search runs

규칙:

- rebuildable object 를 workflow truth 로 저장하지 않는다.
- authoritative object 에 raw fact payload 전체를 복제하지 않는다.
- authoritative object 는 fact/search output 을 `id + compact summary` 로 참조한다.

### Step 5. Split hot path and background path

같은 provider 라도 호출 방식은 둘로 나눈다.

- hot path
  - request-time fallback
  - bounded read model refresh
  - AI/user interaction 에 필요한 최소 fetch
- background path
  - scheduler warmup
  - corpus accumulation
  - periodic aggregation
  - provider health refresh

규칙:

- `worker-control` 이 background owner 다.
- engine route 내부 request-time fallback 은 허용된다.
- `app` 의 direct upstream fan-out 은 금지다.

### Step 6. Define route shape before UI shape

새 기능은 화면보다 먼저 route contract 를 정한다.

좋은 순서:

1. source capability/state 정의
2. canonical payload 정의
3. degraded payload 정의
4. engine route 정의
5. app adapter 정의
6. UI 연결

나쁜 순서:

1. 화면 먼저 만듦
2. route 는 화면 맞추느라 ad hoc join
3. provider semantics 가 surface 로 샘

### Step 7. Force degraded states into the contract

새 lane 은 “정상일 때 payload”만 설계하면 안 된다.

반드시 같이 적는다.

- source missing
- key missing
- rate limited
- stale cache
- corpus only
- fallback_local
- read_only

운영에서 진짜 중요한 건 success path 보다 degraded path 다.

### Step 8. Define promotion gates

새 lane 은 아래 4단계를 거친다.

1. `cataloged`
   - 존재/부재/status truth 가 문서 또는 catalog 에 등록됨
2. `readable`
   - bounded route 로 읽을 수 있음
3. `operational`
   - scheduler/warmup/caching/health 가 있음
4. `promoted`
   - AI/surface/search 가 canonical consumer 로 사용

모든 lane 을 한 번에 promoted 로 만들려고 하면 다시 꼬인다.

## Karpathy Auto-Research Loop

Andrej Karpathy 식으로 적용하면, architecture 는 “한 번에 완성”이 아니라
작은 가설을 빠르게 externalize 하고 eval 로 승격 여부를 결정하는 구조여야 한다.

이 시스템에서 auto-research loop 는 아래처럼 고정한다.

1. `seed`
   - founder note, chart, Telegram/X post, replay finding, live anomaly 를 runtime state 에 seed 로 남긴다.
   - seed 는 chat 이 아니라 durable artifact 여야 한다.
2. `hypothesis`
   - seed 를 한 문장 hypothesis 와 한 lane name 으로 압축한다.
   - 무엇을 설명하려는지 불명확하면 구현을 시작하지 않는다.
3. `bounded contract`
   - hypothesis 를 가장 작은 `catalog row`, `fact route`, `runtime record`, `search request` 중 하나로 externalize 한다.
   - 첫 구현은 항상 bounded contract 여야지, UI 나 broad framework 가 아니어야 한다.
4. `eval`
   - positive / near-miss / negative case 또는 최소 route contract test 를 만든다.
   - “대충 맞아 보임”은 promotion 근거가 아니다.
5. `promotion`
   - eval 통과 범위에 맞춰 `cataloged -> readable -> operational -> promoted` 로만 올린다.
   - stage 를 건너뛰는 직접 승격은 금지한다.
6. `failure memory`
   - 실패한 source, 틀린 가정, blocked provider, bad proxy 는 work item / catalog / runtime artifact 에 남긴다.
   - 같은 실패를 chat 에서만 반복하지 않는다.

이 loop 의 목적은 “더 똑똑한 추측”이 아니라 아래를 강제하는 데 있다.

- hypothesis 가 route/store/job 으로 외부화될 것
- success 뿐 아니라 degraded / failure path 도 계약에 포함될 것
- promotion 이 느낌이 아니라 eval 결과에 의해 결정될 것
- research memory 와 runtime workflow state 가 durable artifact 로 남을 것

즉 CTO 기준 completion 은 “모든 기능을 한 번에 만드는 것”이 아니라,
새 데이터/패턴 lane 이 모두 이 loop 안에서 반복 가능하게 되는 것이다.

## Lane Checklist

새 lane 추가 전, 아래 checklist 를 work item 에 포함한다.

### Minimal checklist

- lane name 이 한 문장으로 고정되었는가
- plane 이 하나로 고정되었는가
- owner 가 한 팀으로 고정되었는가
- `table / cache / route / job` split 이 적혔는가
- hot path / background path 가 분리되었는가
- degraded states 가 적혔는가
- canonical consumer 가 적혔는가
- forbidden dependency 가 적혔는가
- verification 최소 경로가 적혔는가

### Promotion checklist

- `cataloged` 상태인가
- route payload 가 stable 한가
- 최소 eval artifact 가 존재하는가
- app 가 direct provider fan-out 없이 소비 가능한가
- runtime state 와 fact payload ownership 이 섞이지 않는가
- search 가 fact truth 를 다시 쓰지 않는가

## Examples

### Example A — Influencer metrics 100 catalog

- plane: `Fact`
- owner: `engine`
- source_of_truth: catalog file + bounded read route
- hot_path: `GET /facts/indicator-catalog`
- background_path: none in phase 1
- canonical_route: engine catalog route
- degraded_states: `live / partial / blocked / missing`
- forbidden_dependencies: surface-specific layout fields, AI prompt text

### Example B — Seed-search corpus accumulation

- plane: `Search`
- owner: `engine`
- source_of_truth: durable corpus store
- hot_path: run lookup / retrieval
- background_path: scheduler accumulation
- canonical_route: `POST /search/seed`, corpus-backed retrieval routes
- degraded_states: `live / corpus_only / degraded`
- forbidden_dependencies: direct app provider fan-out, layout state

### Example C — Founder research_context capture

- plane: `Runtime State`
- owner: `engine`
- source_of_truth: durable workflow store
- hot_path: capture write/read
- background_path: optional sync/backfill only
- canonical_route: capture workflow APIs
- degraded_states: `durable / fallback_local / read_only`
- forbidden_dependencies: market fact ownership, search ranking logic

## Hot Path vs Background Path

### Hot Path

Used during interactive terminal usage.

1. user opens symbol/timeframe
2. app requests bounded facts
3. user runs scan or asks AI
4. search or agent context is assembled from facts plus compact state
5. result is shown immediately

Budget:

- avoid market-wide fan-out
- avoid full historical replay unless explicitly requested
- prefer cached fact snapshots and corpus lookups

### Background Path

Used to make hot path cheap.

1. scheduler warms provider caches
2. scheduler refreshes fact snapshots where needed
3. scheduler accumulates corpus signatures
4. scheduler updates freshness and degraded-state metadata

Budget:

- may be slower than hot path
- must be bounded by cadence and quotas
- must expose freshness so hot path can decide whether to trust cached outputs

## Pipeline Cadence

| Pipeline | Trigger | Frequency target |
|---|---|---|
| provider ingress | scheduler + request-time fallback | source-specific |
| fact snapshots | request-time + periodic warm | near-live for active symbols, slower for market-wide |
| confluence | request-time + warm | near-live |
| corpus accumulation | scheduler only | continuous / interval-driven |
| live scan | user-triggered | on-demand |
| seed search | user-triggered with corpus-first read | on-demand |
| agent context | AI request-time | on-demand |
| runtime writes | event-driven | immediate |

## Pipeline Stores

| Store kind | Purpose | Durability |
|---|---|---|
| raw cache | provider payload reuse, replay support | disposable but useful |
| fact cache/read model | bounded market truth | rebuildable |
| corpus store | search signatures and retrieval index | durable |
| runtime store | captures, pins, setups, ledger, research state | authoritative |
| session/browser store | UX continuity only | non-authoritative |

## Pipeline IDs And References

To keep planes decoupled, downstream layers should reference upstream artifacts by ids and compact summaries.

Examples:

- `fact_id`
- `scan_id`
- `seed_run_id`
- `capture_id`
- `saved_setup_id`
- `research_context_id`

Rules:

- surface should not clone whole fact/search payloads into runtime state unless necessary
- runtime state should store references plus minimal replay context
- agent context can inline compact summaries, but should also carry source ids when useful

## Observability Pipeline

Every pipeline stage must emit:

- freshness
- latency
- degraded state
- source coverage
- cache hit/miss

Minimum dimensions:

- symbol
- timeframe
- provider
- route or job name
- state

This is required so we can answer:

- why AI answered with stale facts
- why scan degraded to corpus-only or fact-only
- which provider actually failed
- whether hot-path latency is coming from ingress, fact composition, or search

## Data Domain Split

The reset only works if each data kind has one canonical write path and one canonical read path.

The table names below are target canonical names, not a claim that every table already exists.

For calculation-ready indicator names, raw fields, derived features, and
search signature vocabulary, use
`docs/domains/canonical-indicator-materialization.md` as the companion spec.

| Data kind | Ingress sources | Canonical store | Hot cache | Owner routes | Background jobs | Primary plane |
|---|---|---|---|---|---|---|
| `ohlcv bars` | Binance, Coinbase, OKX, Bybit | `market_ohlcv_bars` | redis key by `symbol:timeframe` | `GET /facts/price-context`, `GET /ctx/fact` | kline prefetch/warm job | Fact |
| `perp metrics` | Coinalyze, exchange perp APIs, liquidation streams | `market_perp_snapshots`, `market_liquidation_windows` | redis snapshot + rolling window cache | `GET /facts/perp-context`, `GET /facts/confluence`, `GET /ctx/fact` | perp warm job, liquidation aggregation job | Fact |
| `macro series` | FRED, fear-greed, DXY/equity/yield sources | `market_macro_series` | redis macro snapshot | `GET /facts/macro`, `GET /ctx/fact` | macro refresh job | Fact |
| `onchain series` | Etherscan, Solscan, TRONSCAN, DefiLlama, CryptoQuant-like free sources | `market_onchain_series`, `chain_activity_snapshots` | redis chain snapshot | `GET /facts/chain-intel`, `GET /ctx/fact` | chain-intel refresh job | Fact |
| `options snapshots` | Deribit REST/WS | `market_options_snapshots`, `market_options_surface_points` | redis latest options regime | `GET /facts/options-context`, `GET /facts/confluence`, `GET /ctx/fact` | options chain refresh job | Fact |
| `news/social items` | news feeds, LunarCrush, Santiment replacement, X-derived metrics | `market_news_items`, `market_social_signals` | short-lived feed cache | `GET /facts/news-social`, `GET /ctx/fact` | news/social polling job | Fact |
| `reference health/status` | all ingress adapters | `provider_health_events`, `provider_capability_state` | redis capability state | `GET /facts/reference-stack`, `GET /ctx/fact` | provider health heartbeat job | Fact |
| `confluence snapshots` | fact-plane outputs only | `market_confluence_snapshots` | redis confluence cache | `GET /facts/confluence`, `GET /ctx/fact` | confluence warm job | Fact |
| `pattern catalog` | engine pattern registry/library | `pattern_catalog_entries` | memory cache okay | `GET /search/catalog` | catalog sync job if needed | Search |
| `corpus windows` | fact snapshots + replay cache signatures | `search_corpus_windows` | redis retrieval shortlist cache | none direct for end-user; read via search routes | corpus accumulation job | Search |
| `seed search runs` | user requests + corpus lookup + replay rerank | `search_seed_runs`, `search_seed_candidates` | active-run cache | `POST /search/seed`, `GET /search/seed/{run_id}` | optional rerank/promote worker | Search |
| `live scan runs` | user-triggered scan request + fact snapshot | `search_scan_runs`, `search_scan_candidates` | active scan cache | `POST /search/scan`, `GET /search/scan/{scan_id}` | none required beyond async continuation | Search |
| `captures` | user capture actions | `runtime_captures` | optional session cache | workflow routes only | projection/materialization job optional | Runtime State |
| `pins / compare state` | user workspace actions | `runtime_workspace_pins`, `runtime_compare_sets` | browser/session cache | workflow routes only | none | Runtime State |
| `saved setups` | user save/restore actions | `runtime_saved_setups` | browser/session cache | workflow routes only | none | Runtime State |
| `pattern runtime state` | engine scanner/pattern runtime | `runtime_pattern_states`, `runtime_phase_transitions` | in-memory active state cache | internal runtime routes only | runtime checkpoint job | Runtime State |
| `research context` | user/manual hypothesis flow, AI follow-up, evaluation artifacts | `runtime_research_contexts`, `runtime_research_links` | active session cache | workflow routes + agent inputs | research compaction job | Runtime State |
| `ledger / outcomes / verdicts` | engine decisions and execution flow | `runtime_ledger_records`, `runtime_outcomes`, `runtime_verdicts` | optional hot state cache | workflow/report routes | outcome resolver job | Runtime State |

## Write Path / Read Path Rules By Data Kind

### Fact data

- write path:
  - ingress adapter -> canonical fact store/cache -> fact builder
- read path:
  - fact builder -> bounded fact route

Rules:

- app may proxy reads during migration
- app must not own writes for canonical fact data

### Search data

- write path:
  - scheduler or request-triggered search runtime -> search store
- read path:
  - search route -> ranked result + compact candidate summaries

Rules:

- corpus writes are background-first
- live scan writes are request-triggered
- search routes may reference facts, but must not rewrite fact truth

### Runtime state

- write path:
  - user action / engine event -> workflow handler -> durable runtime store
- read path:
  - workflow route -> surface or agent consumer

Rules:

- runtime records may embed compact fact/search references
- runtime records should not duplicate whole fact payloads unless necessary for audit/replay

## Proposed Route Families

### Fact routes

- `GET /ctx/fact`
- `GET /facts/price-context`
- `GET /facts/perp-context`
- `GET /facts/macro`
- `GET /facts/chain-intel`
- `GET /facts/options-context`
- `GET /facts/news-social`
- `GET /facts/reference-stack`
- `GET /facts/confluence`

### Search routes

- `GET /search/catalog`
- `POST /search/scan`
- `GET /search/scan/{scan_id}`
- `POST /search/seed`
- `GET /search/seed/{run_id}`

### Runtime routes

- `POST /workflow/captures`
- `GET /workflow/captures/{capture_id}`
- `POST /workflow/pins`
- `POST /workflow/compare-sets`
- `POST /workflow/saved-setups`
- `POST /workflow/research-contexts`
- `GET /workflow/research-contexts/{id}`
- `GET /workflow/ledger/{record_id}`

## Proposed Job Families

| Job family | Purpose | Writes |
|---|---|---|
| `provider warm` | warm raw caches for active symbols and market-wide sources | raw cache, provider health |
| `fact warm` | precompute active fact snapshots/confluence | fact cache/store |
| `corpus accumulate` | persist rolling search signatures | corpus store |
| `search rerank/promote` | enrich recent seed-search runs | search candidate store |
| `runtime checkpoint` | compact or checkpoint active runtime state | runtime stores |
| `research compaction` | compact long research context/memory artifacts | runtime research store |
| `outcome resolver` | settle verdict/outcome/ledger transitions | runtime outcome/ledger store |

## Cutover Plan

### Cut 1 — Fact landing zone

- keep `GET /ctx/fact` as the sole new canonical entry
- stop adding new fact semantics to app-side `/api/market/*`
- make app consumers read from engine-owned fact route first where possible

### Cut 2 — Search extraction

- extract corpus accumulation out of mixed search/runtime code
- make live scan consume fact snapshots instead of provider fan-out
- preserve app route shapes but push logic under engine search contracts

### Cut 3 — Agent unification

- define one `AgentContextPack`
- route all AI entry points through the same bounded context builder
- remove app-specific ad hoc fact joins from AI handlers

### Cut 4 — Surface slimming

- split terminal shell from orchestration logic
- keep compare/pin/save UX
- remove hidden scoring/data-engine logic from UI and server surface helpers

## Verification By Plane

| Plane | Minimum verification |
|---|---|
| `Ingress` | source adapter tests, timeout/fallback tests |
| `Fact` | contract shape tests, degraded-state tests, symbol/timeframe route tests |
| `Search` | catalog/seed/scan tests, corpus retrieval tests |
| `Agent Context` | context shape tests, token-budget assertions, AI route contract tests |
| `Runtime State` | persistence and restore tests |
| `Surface` | app checks, targeted route tests, UX smoke checks |

## Ownership

### Engine owns

- provider normalization
- fact composition
- search composition
- corpus jobs
- ranking / scoring / promotion

### App owns

- UI state
- route proxy / session orchestration
- bounded agent-context assembly until it can be moved to engine
- compare/pin/save UX

## Current Repo Mapping

### Ingress Layer

Keep as ingress/raw adapters:

- `engine/data_cache/fetch_*`
- `engine/data_cache/loader.py`
- `app/src/lib/server/marketDataService.ts`
- `app/src/lib/server/coinmarketcap.ts`
- `app/src/lib/server/marketFeedService.ts`

Rules:

- keep source quirks here
- do not let these modules produce trader-facing verdicts or AI prose

### Fact Layer

Canonical engine direction:

- `engine/market_engine/fact_plane.py`
- `engine/market_engine/types.py`
- `engine/api/routes/ctx.py`
- future `engine/facts/*` extraction from current `market_engine` and app-side market services

Current app-side fact assembly that should shrink over time:

- `app/src/lib/server/marketSnapshotService.ts`
- `app/src/lib/server/terminalParity.ts`
- `app/src/routes/api/market/*`
- `app/src/lib/cogochi/workspaceDataPlane.ts`

Refactor rule:

- `workspaceDataPlane.ts` may keep view-model shaping, but market fact assembly must move underneath it into engine-owned fact read models.

### Search Layer

Canonical search ownership:

- `engine/research/pattern_search.py`
- `engine/scanner/*`
- `engine/patterns/*`
- future `engine/search/*` extraction

App-side consumers/adapters:

- `app/src/lib/server/scanEngine.ts`
- `app/src/lib/server/scanEngine.scoring.ts`
- `app/src/lib/server/scanEngine.ta.ts`
- `app/src/routes/api/terminal/scan*`
- `app/src/routes/api/patterns/*`

Refactor rule:

- `app/src/lib/server/scanEngine.ts` is the main split target.
- provider fan-out and scoring logic must move down into engine/search ownership.
- app-side search code should end as a thin proxy plus UI-specific persistence.

### Agent Layer

Canonical target:

- engine-owned bounded context route(s) rooted at `engine/api/routes/ctx.py`
- one shared `AgentContextPack` contract in app/contract boundary

Current app-side assembly hotspots:

- `app/src/routes/api/terminal/intel-policy/+server.ts`
- `app/src/lib/server/intelPolicyRuntime.ts`
- `app/src/lib/server/analyze/orchestrator.ts`
- `app/src/routes/api/terminal/intel-agent-shadow/*`
- `app/src/lib/server/intelShadowAgent.ts`

Refactor rule:

- these modules must stop assembling their own fact/search truth independently.
- they should consume a single fact pack plus selected search outputs.

### Surface Layer

Should remain surface-owned:

- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/cogochi/AppShell.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/api/terminalBackend.ts`
- `app/src/routes/api/terminal/session/+server.ts`
- `app/src/routes/api/terminal/pins/+server.ts`
- `app/src/routes/api/terminal/compare/+server.ts`
- `app/src/routes/api/terminal/pattern-captures/*`

Refactor rule:

- surface keeps interaction, persistence, and rendering.
- surface should not own market truth, search scoring, or provider decisions.

## Keep / Split / Retire

### Keep

- `engine/api/routes/ctx.py` as the bounded fact landing zone
- `engine/market_engine/fact_plane.py` as fact-plane seed
- `app/src/lib/cogochi/workspaceDataPlane.ts` as a view-model adapter only
- `app/src/lib/server/analyze/orchestrator.ts` only if it becomes a thin consumer

### Split

- `app/src/lib/server/scanEngine.ts`
- `app/src/routes/terminal/+page.svelte`
- `engine/research/pattern_search.py`
- `app/src/lib/server/marketSnapshotService.ts`
- `app/src/lib/server/intelPolicyRuntime.ts`

### Retire Over Time

- app-owned `/api/market/*` routes that duplicate engine fact read models
- any AI path that directly stitches provider-specific payloads
- mixed branches that combine fact/search/surface changes in one lineage

## Merge Units

### Unit 1 — Fact Plane

Owner: `W-0122`

Files first:

- `engine/api/routes/ctx.py`
- `engine/market_engine/fact_plane.py`
- `engine/market_engine/types.py`
- `app/src/lib/server/terminalParity.ts`
- `app/src/lib/server/marketSnapshotService.ts`
- selected `app/src/routes/api/market/*` cutover points

Success condition:

- app consumers can read bounded engine fact models without adding new provider fan-out.

### Unit 2 — Search Plane

Owner: `W-0145` then `W-0143`

Files first:

- `engine/scanner/scheduler.py`
- `engine/research/pattern_search.py`
- `engine/patterns/library.py`
- `engine/patterns/scanner.py`
- `app/src/lib/server/scanEngine.ts`
- `app/src/routes/api/terminal/scan*`

Success condition:

- search reads fact/cache/corpus, not raw providers on every request.

### Unit 3 — Agent Layer

Owner: follow-up after fact/search stabilization

Files first:

- `engine/api/routes/ctx.py`
- `app/src/lib/server/intelPolicyRuntime.ts`
- `app/src/lib/server/analyze/orchestrator.ts`
- `app/src/routes/api/terminal/intel-policy/+server.ts`
- `app/src/routes/api/terminal/intel-agent-shadow/*`

Success condition:

- one canonical `AgentContextPack` exists and all AI entry points consume it.

### Unit 4 — Surface Layer

Owner: `W-0139` / `W-0140`

Files first:

- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/cogochi/AppShell.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/routes/api/terminal/compare/+server.ts`
- `app/src/routes/api/terminal/pins/+server.ts`

Success condition:

- surface composes compare/pin/save UX only, with no hidden data-engine logic.

## File Mapping Matrix

| File | Current Role | Target Layer | Action | Primary Work Item |
|---|---|---|---|---|
| `engine/data_cache/fetch_*` | raw upstream fetch | Ingress | keep | `W-0122` |
| `engine/data_cache/loader.py` | shared raw/cache loader | Ingress | keep, narrow public surface | `W-0122` |
| `engine/market_engine/fact_plane.py` | bounded fact read-model seed | Fact | expand, keep engine-owned | `W-0122` |
| `engine/api/routes/ctx.py` | engine fact route entry | Fact | keep, grow as canonical read route | `W-0148` then `W-0122` |
| `engine/market_engine/indicator_catalog.py` | canonical indicator inventory | Fact | keep in fact lane; expose through `/facts/indicator-catalog` | `W-0122` |
| `engine/market_engine/types.py` | fact/runtime typing | Fact | keep, split if needed | `W-0122` |
| `engine/research/pattern_search.py` | replay/search benchmark monolith | Search | split into search runtime + corpus concerns | `W-0145` / `W-0143` |
| `engine/scanner/scheduler.py` | job scheduling | Search | extend for corpus accumulation | `W-0145` |
| `engine/scanner/jobs/*` | live scan / refinement jobs | Search | keep, separate from agent/surface concerns | `W-0145` |
| `engine/patterns/library.py` | pattern registry | Search | keep as catalog source | `W-0143` |
| `engine/patterns/scanner.py` | pattern scan runtime | Search | keep, tighten contract inputs | `W-0143` |
| `engine/capture/store.py` | capture persistence | Runtime State | keep | `W-0142` |
| `engine/patterns/state_store.py` | pattern state persistence | Runtime State | keep, long-term storage cutover | follow-up storage lane |
| `engine/research/state_store.py` | research run persistence | Runtime State | keep, long-term storage cutover | `W-0142` / storage lane |
| `app/src/lib/server/marketDataService.ts` | app-side raw provider adapter bag | Ingress adapter | keep temporarily, do not grow semantics | `W-0122` |
| `app/src/lib/server/marketFeedService.ts` | mixed feed composition | Ingress adapter | narrow or retire behind fact routes | `W-0122` |
| `app/src/lib/server/marketSnapshotService.ts` | app-owned market fact assembly | Fact adapter | split, then shrink behind engine facts | `W-0122` |
| `app/src/lib/server/terminalParity.ts` | app read-model assembly | Fact adapter | keep short-term, migrate to engine facts | `W-0122` |
| `app/src/lib/cogochi/workspaceDataPlane.ts` | workspace envelope + view formatting | Surface adapter | keep, remove fact derivation over time | `W-0141` follow-up |
| `app/src/lib/server/scanEngine.ts` | provider fetch + scoring + summary monolith | Search adapter | split aggressively | `W-0143` |
| `app/src/lib/server/scanEngine.scoring.ts` | scan scoring helpers | Search adapter | keep temporarily, likely migrate to engine | `W-0143` |
| `app/src/lib/server/scanEngine.ta.ts` | TA utilities for scan | Search adapter | keep temporarily, then decide engine/app owner | `W-0143` |
| `app/src/lib/server/analyze/orchestrator.ts` | engine call fan-in | Agent consumer | keep thin only | `W-0148` follow-up |
| `app/src/lib/server/intelPolicyRuntime.ts` | AI policy/context assembly | Agent | split to consume canonical `AgentContextPack` | agent follow-up |
| `app/src/lib/server/intelShadowAgent.ts` | shadow agent execution | Agent | keep only as consumer of bounded context | agent follow-up |
| `app/src/routes/api/market/*` | app-owned fact routes | Fact adapter | retire progressively after engine cutover | `W-0122` |
| `app/src/routes/api/terminal/intel-policy/+server.ts` | AI entry route | Agent | keep route, replace internal assembly | agent follow-up |
| `app/src/routes/api/terminal/intel-agent-shadow/*` | AI shadow routes | Agent | keep route, replace internal assembly | agent follow-up |
| `app/src/routes/api/terminal/scan*` | terminal search endpoints | Search adapter | keep route shape, move logic downward | `W-0143` |
| `app/src/routes/api/patterns/*` | pattern UI/search APIs | Search adapter | keep route shape, move logic downward | `W-0143` |
| `app/src/routes/terminal/+page.svelte` | terminal orchestration monolith | Surface | split heavily, keep as shell | `W-0139` |
| `app/src/lib/cogochi/AppShell.svelte` | shell composition | Surface | keep | `W-0139` / `W-0140` |
| `app/src/lib/cogochi/modes/TradeMode.svelte` | trader surface composition | Surface | keep, consume upstream results only | `W-0139` / `W-0140` |
| `app/src/lib/api/terminalBackend.ts` | surface API client | Surface adapter | keep | `W-0139` |
| `app/src/routes/api/terminal/compare/+server.ts` | compare workspace API | Surface | keep | `W-0139` |
| `app/src/routes/api/terminal/pins/+server.ts` | pinned workspace API | Surface | keep | `W-0139` |
| `app/src/routes/api/terminal/pattern-captures/*` | capture/project workspace APIs | Surface + Runtime edge | keep, align with runtime contracts | `W-0142` / `W-0139` |

## Immediate Split Targets

These are the files with the worst responsibility overlap and should be decomposed first.

1. `app/src/lib/server/scanEngine.ts`
2. `app/src/routes/terminal/+page.svelte`
3. `engine/research/pattern_search.py`
4. `app/src/lib/server/marketSnapshotService.ts`
5. `app/src/lib/server/intelPolicyRuntime.ts`

## Migration Strategy

### Phase 0 — Audit And Contract Freeze

- map current vertical path only
- freeze `FactSnapshot`, `ScanResult`, `AgentContextPack`
- define provider-state vocabulary

### Phase 1 — Fact Plane Extraction

- finish `W-0122`
- make all terminal AI / scan consumers read bounded fact routes
- remove ad-hoc market truth assembly from surface modules

### Phase 2 — Search Plane Extraction

- finish `W-0145` corpus-first retrieval
- extract `W-0143` search runtime and app consumers
- turn pattern scan / seed-search results into workspace objects

### Phase 3 — Surface Slimming

- reduce `/terminal/+page.svelte` to orchestration shell
- move save/setup/compare/pin into explicit surface controllers
- delete old path-specific fetch glue

## Performance Rules

1. AI path never performs broad historical retrieval synchronously.
2. corpus refresh runs in scheduler / worker-control only.
3. all fact-plane providers must expose explicit timeout and degraded state.
4. scan/search outputs must be cacheable and reusable by both UI and AI.
5. compare/pin consumes stored search objects, not rerun results.

## Merge Rules

- never merge parking branches directly
- merge only lane-pure branches
- merge order:
  1. fact plane
  2. search plane
  3. surface plane

## Immediate Recommendation

The next implementation should **not** be a general refactor.

It should be:

1. complete fact-plane extraction (`W-0122`)
2. then extract corpus/search plane (`W-0145`, `W-0143`)
3. only then continue surface refactor

That is the shortest path to lower latency, lower cost, and a cleaner AI architecture.
