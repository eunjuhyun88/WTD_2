# Inventory — 자동 생성 (tools/refresh_inventory.sh)
# 마지막 갱신: 2026-04-29
# 이 파일을 직접 편집하지 말 것 — 다음 갱신 시 덮어씌워짐

## Slash Commands

| Command | Model | Context | Description |
|---|---|---|---|
| /agent-status | - | - | 현재 에이전트 상태 + 모든 활성 lock + 최근 5개 에이전트 한눈에 |
| /claim | - | - | file-domain lock — 다른 에이전트와 충돌 차단 |
| /decision | - | - | 아키텍처 결정 기록 — memory/decisions/에 저장 |
| /end | - | - | 세션 종료 — shipped + handoff + lesson 기록 + lock 해제 |
| /incident | - | - | 사고/장애 기록 — memory/incidents/에 저장 |
| /open-loops | - | - | 미해결 항목 한눈에 — memkraft open-loops |
| /retro | - | - | 일일 회고 — memkraft retro로 Well/Bad/Next 자동 추출 |
| /save | - | - | 세션 중간 체크포인트 — 한 일 + 다음 일을 memkraft에 세트로 기록 |
| /search | - | - | memkraft 메모리 검색 — entity, decision, incident, session 전부 |
| /start | - | - | 세션 시작 — Agent ID 발번 + state + P0 + 직전 handoff |
| /검색 | - | - | 과거 의미 기록 검색 (결정/사고/계약/세션/물음/측정) |
| /검증 | - | - | 종합 검증 — 변경 스코프 자동 감지 + 적절한 테스트 실행 |
| /결정 | - | - | 아키텍처 결정 영구 기록 (immutable, 왜 그렇게 했는가) |
| /계약 | - | - | 도메인 현재 계약/불변식 기록 (mutable, drift 차단용) |
| /닫기 | - | - | 세션 종료 — 인계 작성 → work item 정리 → 다음 설계 → 장기 메모리 보존 |
| /물음 | - | - | 답 못한 열린 질문 기록 (open loop 추적) |
| /빠른검증 | - | - | 빠른 검증 — pytest + 품질 grep만 (≤3파일, 알고리즘 변경 없음) |
| /사고 | - | - | 사고 + 수정 영구 기록 (무엇이 깨졌고 어떻게 고쳤나) |
| /설계 | claude-opus-4-7 | - | CTO + AI Researcher 2-perspective 설계문서 작성 + GitHub Issue 생성 |
| /열기 | - | - | 세션 부팅 — Agent ID 발번 + 현황 한 화면 보고 |
| /완료 | - | - | Work item 완료 마킹 + CURRENT.md/ROADMAP.md 자동 갱신 |
| /인계 | - | - | 다음 에이전트용 인계 기록 (보통 /닫기가 자동 호출) |
| /잠금 | - | - | 도메인 lock — 멀티 에이전트 충돌 차단 |
| /측정 | - | - | 시간 추이 있는 수치 기록 (지표 추적) |

## Tools

| Script | Description |
|---|---|
| backfill_agents_from_timeline.sh | 글로벌 timeline에서 누락된 per-agent jsonl 복구 |
| backfill_agents.sh | Agent 1-6 기록을 memory/sessions/에 backfill |
| backfill_work_issue_map.sh | W-0001~W-#### mapping 1회 초기화 |
| check_drift.sh | drift 검증 (보고만, 자동 수정 안 함) |
| circuit-breaker.sh | W-0273 Phase 3 — Circuit Breaker |
| claim.sh | file-domain ownership lock + GitHub Issue assignee mutex |
| classify_work_items.sh | work/active/W-*.md를 자동 분류 |
| complete_work_item.sh | work item 1개를 active → completed로 이동 |
| end.sh | 세션 종료 (memkraft 통합) |
| integration-test.sh | W-0278 7-Pillar Integration Test — mock sub-agent scenario |
| list_parking_notes.sh | CURRENT.md 미등재 + 머지 PR 없음 work item 표시 |
| live.sh | Agent heartbeat file manager |
| mk.sh | Repo-pinned MemKraft CLI entrypoint. |
| refresh_inventory.sh | state/inventory.md 자동 생성 |
| refresh_state.sh | Derived state 자동 생성 + worktree registry 머지 |
| save.sh | 세션 중간 체크포인트 (memkraft 기반) |
| start.sh | Multi-agent boot (memkraft 통합) |
| sweep_session_artifacts.sh | 세션 아티팩트 + docs/live 중복 자동 정리 |
| sweep_work_items.sh | work/active/ 자동 정리 |
| sweep_zombie_issues.sh | work/completed/ ↔ open GitHub Issues 비교 |
| track_repo.sh | repo 전반 entity를 memkraft에 등록 |
| verify_design.sh | Verify design/current specs against implementation. |
| work_issue_map.sh | work item ↔ GitHub Issue mapping CRUD |
| worktree-registry.sh | Worktree SSOT registry CLI (state/worktrees.json) |
| cycle-smoke.py | 1-cycle pattern finding smoke test. |
| verify.py | CI guard for wtd-v2. |
| verify/architecture.py | Verify design architecture invariants. |
| verify/contracts.py | Verify design contract invariants. |
| verify/invariants.py | Verify design/current/invariants.yml against the repo. |

## Engine Endpoints

| Method | Path | File |
|---|---|---|
| GET | /alpha/world-model | routes/alpha.py:78 |
| GET | /alpha/token/{symbol} | routes/alpha.py:120 |
| GET | /alpha/token/{symbol}/history | routes/alpha.py:176 |
| GET | /alpha/anomalies | routes/alpha.py:209 |
| POST | /alpha/watch | routes/alpha.py:244 |
| POST | /alpha/find | routes/alpha.py:293 |
| POST | /auth/logout | routes/auth.py:27 |
| POST | /backtest | routes/backtest.py:18 |
| POST | /captures | routes/captures.py:275 |
| POST | /captures/bulk_import | routes/captures.py:347 |
| GET | /captures/outcomes | routes/captures.py:409 |
| POST | /captures/{capture_id}/verdict | routes/captures.py:438 |
| POST | /captures/{capture_id}/benchmark_pack_draft | routes/captures.py:560 |
| POST | /captures/{capture_id}/benchmark_search | routes/captures.py:585 |
| GET | /captures/chart-annotations | routes/captures.py:627 |
| POST | /captures/{capture_id}/watch | routes/captures.py:699 |
| POST | /captures/{capture_id}/verdict-link | routes/captures.py:708 |
| GET | /captures/{capture_id} | routes/captures.py:738 |
| GET | /captures | routes/captures.py:746 |
| POST | /challenge/create | routes/challenge.py:35 |
| GET | /challenge/{slug}/scan | routes/challenge.py:41 |
| GET | /chart/klines | routes/chart.py:30 |
| GET | /ctx/status | routes/ctx.py:27 |
| POST | /ctx/refresh | routes/ctx.py:33 |
| GET | /ctx/fact | routes/ctx.py:45 |
| GET | /dalkkak/gainers | routes/dalkkak.py:50 |
| GET | /dalkkak/positions | routes/dalkkak.py:93 |
| POST | /dalkkak/positions/open | routes/dalkkak.py:104 |
| POST | /dalkkak/positions/close | routes/dalkkak.py:140 |
| POST | /dalkkak/caption | routes/dalkkak.py:153 |
| GET | /dalkkak/risk | routes/dalkkak.py:173 |
| POST | /deep | routes/deep.py:22 |
| GET | /facts/price-context | routes/facts.py:35 |
| GET | /facts/perp-context | routes/facts.py:47 |
| GET | /facts/reference-stack | routes/facts.py:59 |
| GET | /facts/chain-intel | routes/facts.py:71 |
| GET | /facts/market-cap | routes/facts.py:91 |
| GET | /facts/confluence | routes/facts.py:101 |
| GET | /facts/indicator-catalog | routes/facts.py:113 |
| GET | /features/window | routes/features.py:30 |
| GET | /features/pattern-events | routes/features.py:67 |
| POST | /jobs/pattern_scan/run | routes/jobs.py:181 |
| POST | /jobs/outcome_resolver/run | routes/jobs.py:190 |
| POST | /jobs/auto_capture/run | routes/jobs.py:199 |
| POST | /jobs/market_search_index_refresh/run | routes/jobs.py:208 |
| POST | /jobs/db_cleanup/run | routes/jobs.py:217 |
| POST | /jobs/feature_windows_build/run | routes/jobs.py:261 |
| POST | /jobs/feature_materialization/run | routes/jobs.py:273 |
| POST | /jobs/raw_ingest/run | routes/jobs.py:287 |
| GET | /jobs/status | routes/jobs.py:328 |
| GET | /live-signals | routes/live_signals.py:60 |
| POST | /live-signals/verdict | routes/live_signals.py:85 |
| POST | /memory/query | routes/memory.py:55 |
| POST | /memory/feedback | routes/memory.py:86 |
| POST | /memory/feedback/batch | routes/memory.py:91 |
| POST | /memory/debug-session | routes/memory.py:107 |
| POST | /memory/rejected/search | routes/memory.py:118 |
| GET | /observability/flywheel/health | routes/observability.py:152 |
| GET | /observability/agent-status | routes/observability.py:157 |
| POST | /opportunity/run | routes/opportunity.py:122 |
| POST | /patterns/parse | routes/patterns.py:191 |
| GET | /patterns/library | routes/patterns.py:380 |
| GET | /patterns/registry | routes/patterns.py:386 |
| GET | /patterns/active-variants | routes/patterns.py:399 |
| GET | /patterns/states | routes/patterns.py:414 |
| GET | /patterns/transitions | routes/patterns.py:420 |
| GET | /patterns/candidates | routes/patterns.py:459 |
| POST | /patterns/draft-from-range | routes/patterns.py:467 |
| POST | /patterns/scan | routes/patterns.py:566 |
| GET | /patterns/stats/all | routes/patterns.py:575 |
| GET | /patterns/{slug}/candidates | routes/patterns.py:589 |
| GET | /patterns/{slug}/similar-live | routes/patterns.py:595 |
| GET | /patterns/{slug}/f60-status | routes/patterns.py:650 |
| GET | /patterns/{slug}/stats | routes/patterns.py:671 |
| GET | /patterns/{slug}/training-records | routes/patterns.py:687 |
| GET | /patterns/{slug}/alert-policy | routes/patterns.py:703 |
| PUT | /patterns/{slug}/alert-policy | routes/patterns.py:709 |
| GET | /patterns/{slug}/model-registry | routes/patterns.py:727 |
| GET | /patterns/{slug}/model-history | routes/patterns.py:737 |
| GET | /patterns/{slug}/library | routes/patterns.py:754 |
| POST | /patterns/{slug}/verdict | routes/patterns.py:762 |
| POST | /patterns/{slug}/capture | routes/patterns.py:801 |
| POST | /patterns/{slug}/evaluate | routes/patterns.py:845 |
| POST | /patterns/{slug}/train-model | routes/patterns.py:851 |
| POST | /patterns/{slug}/promote-model | routes/patterns.py:871 |
| POST | /patterns/register | routes/patterns.py:886 |
| POST | /patterns/{slug}/benchmark-pack-draft | routes/patterns.py:945 |
| POST | /patterns/{slug}/benchmark-search-from-capture | routes/patterns.py:963 |
| POST | /rag/terminal-scan | routes/rag.py:24 |
| POST | /rag/quick-trade | routes/rag.py:35 |
| POST | /rag/signal-action | routes/rag.py:40 |
| POST | /rag/dedupe-hash | routes/rag.py:45 |
| GET | /refinement/stats | routes/refinement.py:117 |
| GET | /refinement/stats/{slug} | routes/refinement.py:137 |
| GET | /refinement/suggestions | routes/refinement.py:147 |
| GET | /refinement/leaderboard | routes/refinement.py:169 |
| POST | /runtime/captures | routes/runtime.py:128 |
| GET | /runtime/captures | routes/runtime.py:169 |
| GET | /runtime/captures/{capture_id} | routes/runtime.py:241 |
| GET | /runtime/definitions | routes/runtime.py:249 |
| GET | /runtime/definitions/{pattern_slug} | routes/runtime.py:259 |
| POST | /runtime/workspace/pins | routes/runtime.py:271 |
| GET | /runtime/workspace/{symbol} | routes/runtime.py:289 |
| POST | /runtime/setups | routes/runtime.py:299 |
| GET | /runtime/setups/{setup_id} | routes/runtime.py:317 |
| POST | /runtime/research-contexts | routes/runtime.py:325 |
| GET | /runtime/research-contexts/{context_id} | routes/runtime.py:345 |
| GET | /runtime/ledger/{ledger_id} | routes/runtime.py:353 |
| GET | /runtime/ledger | routes/runtime.py:361 |
| POST | /scanner/run | routes/scanner.py:35 |
| POST | /score | routes/score.py:25 |
| GET | /screener/runs/latest | routes/screener.py:12 |
| GET | /screener/listings | routes/screener.py:20 |
| GET | /screener/assets/{symbol} | routes/screener.py:33 |
| GET | /screener/universe | routes/screener.py:50 |
| GET | /search/catalog | routes/search.py:45 |
| POST | /search/seed | routes/search.py:73 |
| GET | /search/seed/{run_id} | routes/search.py:82 |
| POST | /search/scan | routes/search.py:90 |
| GET | /search/scan/{scan_id} | routes/search.py:99 |
| POST | /search/query-spec/transform | routes/search.py:107 |
| POST | /search/similar | routes/search.py:128 |
| GET | /search/similar/{run_id} | routes/search.py:140 |
| POST | /search/quality/judge | routes/search.py:201 |
| GET | /search/quality/stats | routes/search.py:224 |
| POST | /train | routes/train.py:51 |
| GET | /train/report | routes/train.py:112 |
| GET | /universe | routes/universe.py:73 |
| GET | /universe/sectors | routes/universe.py:177 |
| GET | /universe/search/status | routes/universe.py:195 |
| GET | /users/{user_id}/f60-status | routes/users.py:22 |
| GET | /users/{user_id}/verdict-accuracy | routes/users.py:49 |
| POST | /verdict | routes/verdict.py:47 |
| POST | /viz/route | routes/viz.py:26 |

## App API Routes

/agents/stats
/agents/stats/[agentId]
/analyze
/auth/login
/auth/logout
/auth/nonce
/auth/register
/auth/session
/auth/verify-wallet
/auth/wallet-auth
/beta/feedback
/beta/waitlist
/captures
/captures/[id]/verdict
/captures/[id]/verdict-link
/captures/[id]/watch
/captures/chart-annotations
/captures/outcomes
/chart/feed
/chart/klines
/cogochi/alerts
/cogochi/alpha/world-model
/cogochi/analyze
/cogochi/news
/cogochi/outcome
/cogochi/pine-script
/cogochi/terminal/message
/cogochi/thermometer
/cogochi/whales
/cogochi/workspace-bundle
/coinalyze
/coingecko/global
/confluence/current
/confluence/history
/copy-trading/leaderboard
/copy-trading/subscribe
/copy-trading/subscribe/[id]
/cycles/klines
/doctrine
/engine/[...path]
/etherscan/onchain
/exchange/analysis
/exchange/connect
/exchange/import
/facts/[...path]
/feargreed
/gmx/balance
/gmx/close
/gmx/confirm
/gmx/markets
/gmx/positions
/gmx/prepare
/klines
/lab/autorun
/lab/forward-walk
/live-signals
/live-signals/verdict
/macro/fred
/macro/indicators
/market/alerts/onchain
/market/chain-intel
/market/chains/search
/market/depth-ladder
/market/derivatives/[pair]
/market/dex/ads
/market/dex/community-takeovers
/market/dex/orders/[chainId]/[tokenAddress]
/market/dex/overview
/market/dex/pairs/[chainId]/[pairId]
/market/dex/search
/market/dex/token-boosts
/market/dex/token-pairs/[chainId]/[tokenAddress]
/market/dex/token-profiles
/market/dex/tokens/[chainId]/[tokenAddresses]
/market/events
/market/flow
/market/funding
/market/funding-flip
/market/indicator-context
/market/influencer-metrics
/market/liq-clusters
/market/liquidation-clusters
/market/macro-calendar
/market/macro-overview
/market/microstructure
/market/news
/market/ohlcv
/market/oi
/market/options-snapshot
/market/reference-stack
/market/rv-cone
/market/snapshot
/market/sparklines
/market/stablecoin-ssr
/market/symbols
/market/trending
/market/venue-divergence
/memory/[agentId]
/notifications
/notifications/[id]
/notifications/read
/observability/agent-status
/observability/flywheel
/observability/metrics
/onchain/cryptoquant
/patterns
/patterns/[slug]/capture
/patterns/[slug]/stats
/patterns/[slug]/verdict
/patterns/draft-from-range
/patterns/parse
/patterns/scan
/patterns/states
/patterns/stats
/patterns/transitions
/pine/generate
/pine/templates
/pnl
/pnl/summary
/polymarket/markets
/polymarket/orderbook
/portfolio/holdings
/positions/polymarket
/positions/polymarket/[id]/close
/positions/polymarket/auth
/positions/polymarket/prepare
/positions/polymarket/status/[id]
/positions/polymarket/submit
/positions/unified
/predictions
/predictions/positions/[id]/close
/predictions/positions/open
/predictions/vote
/preferences
/profile
/profile/passport
/profile/passport/learning/datasets
/profile/passport/learning/evals
/profile/passport/learning/reports
/profile/passport/learning/reports/generate
/profile/passport/learning/status
/profile/passport/learning/train-jobs
/profile/passport/learning/workers/run
/progression
/quick-trades
/quick-trades/[id]/close
/quick-trades/open
/quick-trades/prices
/refinement/leaderboard
/refinement/stats
/refinement/suggestions
/runtime/[...path]
/search/[...path]
/senti/social
/signals
/signals/[id]
/signals/[id]/convert
/signals/track
/terminal/alerts
/terminal/alerts/[id]
/terminal/anomalies
/terminal/compare
/terminal/exports
/terminal/exports/[id]
/terminal/hud
/terminal/intel-agent-shadow
/terminal/intel-agent-shadow/execute
/terminal/intel-policy
/terminal/opportunity-scan
/terminal/pattern-captures
/terminal/pattern-captures/[id]/benchmark
/terminal/pattern-captures/[id]/project
/terminal/pattern-captures/similar
/terminal/pattern-seed/judge
/terminal/pattern-seed/match
/terminal/pins
/terminal/query-presets
/terminal/research
/terminal/scan
/terminal/scan/[id]
/terminal/scan/[id]/signals
/terminal/scan/history
/terminal/scan/jobs/[jobId]
/terminal/session
/terminal/status
/terminal/watchlist
/ui-state
/wallet/intel
/wizard
/yahoo/[symbol]

