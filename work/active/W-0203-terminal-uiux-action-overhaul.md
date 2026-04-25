# W-0203 — Terminal UIUX Action Overhaul

## Goal

`/cogochi` terminal을 최신 main 기준에서 다시 잡고, 엔진 산출물의 성격에 맞춰 화면을 재배치한다. 구현은 큰 화면 재작성보다 사용자의 실제 동작 단위로 나눈다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- Desktop `/cogochi` TradeMode의 정보 위계 재정렬
- 오른쪽 rail을 판단 HUD로 축약
- 하단 peek `ANALYZE`를 검증/비교/ledger/refinement workspace로 재구성
- flowsurface의 microstructure 시각화 방법론을 surface에 흡수: chart-adjacent heatmap/footprint toggle, DOM ladder, Time & Sales, footprint matrix
- 실제 market microstructure contract 추가: recent trade tape, L2 depth ladder, footprint buckets
- browser live stream 연결: Binance Futures `aggTrade` + `depth20@100ms`를 UI live layer로 소비
- `SCAN`/`JUDGE`/`AI`/`Save Setup` 동작을 화면 책임에 맞게 연결
- `/cogochi`가 새 microstructure route를 소비해 fallback shell보다 실제 market data를 우선 표시

## Non-Goals

- engine feature/scoring/benchmark search 로직 변경
- 모바일 전면 재설계
- server-side WebSocket proxy 또는 persisted stream storage 구현
- persisted L2/tick 저장소 또는 replay engine 구현
- Lab activation 또는 watch 생성 흐름 변경

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0203-terminal-uiux-action-overhaul.md`
- `docs/product/terminal-attention-workspace.md`
- `docs/product/core-loop-surface-wireframes.md`
- `docs/product/indicator-visual-design-v2.md`
- `docs/domains/terminal.md`
- `docs/domains/terminal-backend-mapping.md`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/cogochi/workspaceDataPlane.ts`
- `app/src/lib/contracts/ids.ts`
- `app/src/lib/contracts/marketMicrostructure.ts`
- `app/src/lib/server/marketDataService.ts`
- `app/src/lib/server/providers/rawSources.ts`
- `app/src/routes/api/market/microstructure/+server.ts`

## Facts

1. 최신 `origin/main`은 `18187dcf`이며 W-0200 core loop proof가 이미 머지되어 있다.
2. `/terminal`은 현재 `/cogochi`로 리다이렉트되고, desktop 구현 중심 파일은 `TradeMode.svelte`다.
3. 현재 화면은 right rail과 bottom analyze가 confidence/evidence/execution 정보를 중복 노출한다.
4. `workspaceDataPlane.ts`는 이미 `summary-hud`, `detail-workspace`, `evidence-log`, `execution-board` 섹션을 만든다.
5. 차트의 `Save Setup`/range capture는 `ChartBoard`/core-loop 경로에 이미 연결되어 있고, microstructure raw는 `DEPTH_L2_20` + `AGG_TRADES_RECENT`로 분리했다.

## Assumptions

1. 이번 slice는 desktop 정보 구조를 우선하고 mobile은 기존 동작을 깨지 않는 선에서 유지한다.
2. `SCAN`은 global world-model 후보와 saved captures preview를 유지하되, pattern-object compare UI는 후속 확장 가능하게 만든다.
3. `Execute`는 별도 hard route가 아니라 하단 `JUDGE`/execution workspace로 격리한다.

## Open Questions

1. Find Similar는 저장 직후 자동 결과를 우선 보여줄지, `SCAN/COMPARE` 탭 진입 시 명시적으로 보여줄지 후속 결정이 필요하다.
2. server-side WebSocket proxy와 persisted stream storage는 별도 slice로 둔다.

## Decisions

- 기준 branch/worktree는 최신 main에서 만든 `codex/w-0203-terminal-uiux-overhaul`이다.
- 화면 책임은 `chart = observation`, `right = decision`, `bottom = verification/comparison/refinement`, `AI = interpretation`으로 고정한다.
- 오른쪽 rail은 4개 block만 남긴다: Current State, Top Evidence, Risk, Actions.
- 하단 `ANALYZE`는 카드 모음이 아니라 넓은 workspace로 만든다: Phase Timeline, Evidence Table, Compare, Ledger, Judgment.
- raw 수치와 execution plan은 오른쪽에서 제거하고 하단으로 내린다.
- `Save Setup`은 모달 중심이 아니라 차트 range 문맥 아래의 inline flow를 우선한다.
- implementation slice 기준으로 right rail `SCAN/JUDGE` 직접 노출은 제거하고 CTA로 하단 workspace에 라우팅한다.
- flowsurface는 앱으로 embed하지 않고, 밀도/패널 방법론만 `/cogochi` surface에 재구현한다.
- 이 slice의 DOM/Time&Sales/Footprint/Heatmap은 browser WS live를 우선 소비하고, `/api/market/microstructure` REST snapshot은 boot/fallback으로 사용한다.
- dev/auth 환경에서 chart/analyze payload가 비어도 화면의 구조와 밀도를 검증할 수 있도록 microstructure surface에는 deterministic fallback bars를 둔다.
- `AGG_TRADES_LIVE`의 WebSocket 의미는 유지하고, REST 기반 trade tape는 `AGG_TRADES_RECENT` raw atom으로 별도 명명한다.
- `/cogochi` surface는 browser WS live data를 최우선, REST snapshot을 fallback, deterministic shell을 최후 fallback으로 사용한다.
- `BTCUSDT`와 `BTC/USDT` 입력은 같은 Binance futures stream/API pair로 정규화한다.
- Visual salvage pass는 기본 진입을 chart-first로 돌린다: left library와 AI panel은 default closed, bottom workspace는 명시적으로 열 때만 노출한다.
- Microstructure belt는 차트 하단의 얇은 live status strip으로 낮추고, 세부 DOM/Tape/Footprint/Heatmap은 bottom workspace에만 둔다.
- 기본 work mode는 `observe`로 전환하고 right Decision HUD도 slim rail로 시작한다. 차트/가격축/레벨/체결흐름이 1순위이며 판단/검증은 사용자가 열 때만 확장한다.
- Observe mode에서는 workspace pane header, layout strip, ChartBoard 내부 toolbar/header를 숨기고 TradeMode의 단일 chart control row만 남긴다.
- TradingView식 보조 지표는 카드가 아니라 차트 직하단 indicator lane으로 렌더링한다: `OI FLOW`, `FUNDING`, `CVD DELTA`, `LIQ DENSITY`는 최근 시점 막대/방향색/강도로 읽히고 raw table은 계속 하단 workspace 책임으로 둔다.

## Behavior Contract

| 동작 | 트리거 | 차트 | 오른쪽 HUD | 하단 Workspace | AI/저장 결과 |
|---|---|---|---|---|---|
| Observe | `/cogochi` 진입, 심볼 변경 | 항상 최대 면적 유지, phase/level/indicator pane 유지 | Current State + Evidence 3만 표시 | 닫힘 또는 마지막 상태 유지 | 없음 |
| Open Analyze | 하단 `ANALYZE` 클릭 또는 HUD `Open Workspace` | 차트 크기 유지, peek만 상승 | 요약 유지 | Timeline + Evidence Table + Compare/Ledger/Judgment 표시 | 없음 |
| Toggle Microstructure | `Candle / Heatmap / Footprint` 토글 | 차트 아래 microstructure belt 강조 변경 | 변화 없음 | 관련 DOM/Tape/Footprint/Heatmap 패널 유지 | 없음 |
| Live Microstructure | `/cogochi` desktop mount | `aggTrade` + `depth20@100ms` stream 수신 | `BINANCE WS LIVE` 상태 표시 | DOM/Tape/Footprint/Heatmap live 우선 갱신 | WS 실패 시 REST snapshot 유지 |
| Save Setup | 차트 range 선택 후 SaveStrip 저장 | 선택 range 유지 | Actions에 저장 상태만 반영 | Similar/ledger preview로 이어짐 | capture 생성 |
| Compare | HUD/Workspace `Compare` 클릭 | 현재 차트 유지 | compare CTA active | `SCAN/COMPARE` 영역에 current vs saved/near-miss 표시 | benchmark 결과 소비 |
| Judge | HUD/Workspace `Judge` 클릭 | entry/stop/target overlay 유지 | 판단 CTA active | Valid/Invalid/Too Early/Too Late/Near Miss 또는 기존 Agree/Skip 흐름 | verdict/outcome 저장 |
| Explain | HUD/Workspace `Explain` 클릭 | 변화 없음 | AI CTA active | 현재 workspace context 유지 | AI panel에 structured context 전달 |
| Execute | `JUDGE` 또는 execution board 진입 | execution levels 강조 | execution 숫자 미표시 | Entry/Stop/Target/R:R만 execution 영역에 표시 | exchange open은 helper |

## Next Steps

1. server-side WS proxy 또는 persisted tick/L2 storage가 필요한지 별도 slice로 결정한다.
2. Find Similar 결과의 기본 노출 정책을 결정한다: save 직후 자동 vs Compare 진입 시 명시.
3. 실제 데이터가 있는 환경에서 evidence table threshold 문구를 엔진 threshold와 더 가깝게 맞춘다.

## Verification

- `npm --prefix app run check` — 0 errors, 0 warnings.
- `curl /api/market/microstructure?pair=BTC/USDT&timeframe=4h&limit=120` — `ok: true`, `source: binance-futures-rest`, trades 120, bids 12, asks 12, footprint buckets 생성 확인.
- Playwright Chrome smoke — `/cogochi` render 확인.
- Click smoke — `Open Workspace`, `Open Compare Workspace`, `Judge`, `Explain` 확인.
- Playwright Chrome smoke — `CANDLE/HEATMAP/FOOTPRINT` toggle 확인, `FOOTPRINT` pressed 상태 확인.
- Playwright Chrome smoke — `BINANCE SNAPSHOT` belt 확인.
- Playwright Chrome smoke — browser WS 수신 후 `BINANCE WS LIVE` belt 확인.
- Playwright Chrome smoke — bottom workspace에 실제 trade side가 포함된 `DOM LADDER`, `TIME & SALES`, `FOOTPRINT`, `LIQ HEATMAP` 노출 확인.
- Symbol normalization smoke — `BTCUSDT`/`BTC/USDT` 모두 `BTC/USDT` API pair와 `btcusdt` stream key로 변환되는 코드 경로 확인.
- Playwright visual smoke after clearing shell localStorage — default first screen is chart-first: left library closed, AI panel closed, right Decision HUD slim, bottom workspace closed, microstructure strip remains attached to chart.
- Playwright interaction smoke — `ANALYZE`를 열면 차트가 상단에 계속 남고, DOM/Tape/Footprint/Liq Heatmap workspace가 하단 overlay로만 확장된다.
- Playwright visual smoke — observe 화면에서 `OI FLOW`, `FUNDING`, `CVD DELTA`, `LIQ DENSITY` indicator lane이 차트 직하단에 노출되고 `BINANCE WS LIVE` microstructure belt와 함께 갱신된다.
- Local dev degraded notes — `DATABASE_URL` 없음으로 capture API 401와 engine fallback 로그가 있었으나 UIUX 변경과 무관한 dev env 제약이다.

## Exit Criteria

- 오른쪽 rail에서 raw metric 카드와 execution board 중복이 제거된다.
- 하단 `ANALYZE`가 한눈에 `phase → evidence → compare → ledger → judgment` 흐름으로 읽힌다.
- `Explain`, `Judge`, `Compare`, `Open Workspace` 버튼의 클릭 결과가 명확하다.
- chart-first 비율이 유지되고 `Save Setup` range flow가 깨지지 않는다.
- flowsurface식 chart-adjacent microstructure belt와 하단 market-depth workspace가 실제 화면에 노출된다.
- 차트 하단에 OI/Funding/CVD/Liq가 보조 지표 레인으로 붙어, 사용자가 카드 대신 차트 시계열 맥락에서 지표를 읽을 수 있다.
- `/api/market/microstructure`가 실제 Binance futures REST snapshot을 반환하고 `/cogochi`가 이를 우선 소비한다.
- `npm --prefix app run check`가 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0203-terminal-uiux-action-overhaul.md`
- branch: `codex/w-0203-terminal-uiux-overhaul`
- worktree: `.codex/worktrees/w-0203-terminal-uiux-overhaul`
- verification: `npm --prefix app run check` passed; microstructure curl passed; Playwright Chrome smoke passed with dev-env auth fallback caveat
- blockers: Find Similar result placement final policy; server-side WS proxy/persisted L2 storage remains a separate slice
