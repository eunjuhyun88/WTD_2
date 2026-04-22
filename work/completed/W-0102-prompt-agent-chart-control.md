# W-0102 — Prompt Agent: 자연어 → 차트 조작 + Indicator Stack

**Status:** Design / Not started
**Owner:** ej
**Date opened:** 2026-04-19
**Related:** W-0099 (Pattern Discovery Agent), W-0100 (UI/UX session), DOUNI prior work

---

## Vision

제품 코어 = **AI-first prompt agent**. 사용자가 자연어로 입력하면 에이전트가
(1) 차트에 symbol/timeframe 연결, (2) 의미있는 annotation 그리기, (3) 관련
indicator를 **TradingView 스타일로 하단 pane에 스택 추가** 해준다. 입력창이
홈/Dashboard/Terminal 어디든 동일한 결과로 수렴.

---

## Goal

하나의 prompt router + tool registry + chart handler 를 통해 아래 플로우가
작동:

```
"btc 4h reclaim 보여줘 CVD도 같이"
         │
         ▼
  Prompt Router  (단일 endpoint — 홈/Dashboard/Terminal 모두 수렴)
         │
         ▼
  LLM Agent     (Terminal state + tool registry 주입)
         │
         ├─ tool: set_context(symbol=BTC, tf=4h)        → ChartBoard 전환
         ├─ tool: add_indicator("cvd")                  → 하단 pane 스택 추가
         ├─ tool: highlight_pattern("reclaim_*")        → 오버레이 마킹
         └─ reply("4h 재탈환 초기, CVD 매수 전환 확인")    → BottomDock 대화
```

---

## Scope

- 홈 히어로 composer / Dashboard Watching / Terminal BottomDock 프롬프트 입력
  **세 경로 모두 단일 API로 수렴**
- LLM tool calling 기반 차트 조작 (`chart_control`, `add_indicator` 등)
- Terminal state (current symbol/tf/verdict/scan)를 LLM context로 주입
- Chart에 indicator 동적 add/remove + 서브페인 스택 유지
- SSE streaming — tool call 시퀀스가 실시간으로 차트에 반영

## Non-Goals

- 완전히 새 LLM provider 추가 (기존 11개 fallback chain 재사용)
- 차트 엔진 교체 (lightweight-charts 유지)
- 음성 입력 / 이미지 업로드 multimodal
- 독립적인 pattern discovery (W-0099와 겹치면 W-0099를 `search_similar_captures` 툴로 호출)
- Non-Terminal surface에서의 차트 조작 (Lab/Dashboard는 이번 범위 밖)

---

## 현 인프라 자산 (재사용)

| 자산 | 위치 | 상태 |
|---|---|---|
| LLM service (11 provider fallback) | `app/src/lib/server/llmService.ts` | ✅ 완성 |
| Tool calling framework (OpenAI 호환) | `app/src/lib/server/llmService.ts:744-787` | ✅ |
| `chart_control` tool 정의 (`change_symbol`, `change_timeframe`, `add_indicator`) | `app/src/lib/server/douni/tools.ts:42-76` | ✅ 정의만 |
| `executeChartControl()` — `chart_action` SSE event 방출 | `app/src/lib/server/douni/toolExecutor.ts:603-625` | ✅ 서버 |
| Intent classifier (`chart_ctrl` 포함) | `app/src/lib/server/douni/intentClassifier.ts` | ✅ |
| SSE endpoint + 4-round tool loop | `app/src/routes/api/cogochi/terminal/message/+server.ts` | ✅ |
| Chart runtime의 `activeOverlaySeries[]` 관리 | `app/src/lib/chart-engine/core/createPriceChartRuntime.ts:66,88-97` | ✅ 부분 |
| ChartBoard sub-pane DOM (vol/rsi/macd/oi/cvd) | `app/src/components/terminal/workspace/ChartBoard.svelte:82-86` | ✅ |
| Active pair store | `app/src/lib/stores/activePairStore.ts` | ✅ |
| Indicator pure functions (EMA/SMA/RSI/ATR/BB/VWAP/MACD) | `app/src/lib/engine/indicators.ts` | ✅ |

---

## 부족한 것 (신규 구현 대상)

1. **URL `?q=` 파싱** — `terminal/+page.svelte`가 `?symbol=`만 읽음. `?q=`로 들어온
   prompt를 BottomDock auto-submit으로 연결해야 함.
2. **`chart_action` SSE client handler** — 서버는 event를 방출하지만 프론트가
   수신해서 `ChartBoard`에 적용하는 로직 없음.
3. **`add_indicator` glue** — tool enum은 `['ema','bb','volume','cvd']` 정의되어
   있지만 실제로 chartRuntime에 시리즈 append하는 브릿지 없음.
4. **Terminal state → LLM context** — 현재 symbol/scan/verdict를 `contextBuilder`가
   LLM system prompt에 주입하지 않음. Stale context 위험.
5. **단일 prompt endpoint 수렴** — 홈/Dashboard 모두 `goto('/terminal?q=...')`로
   리다이렉트만 하고 있음. Terminal BottomDock auto-submit이 핵심.

---

## Architecture

### 5.1 Entry Point Convergence (단일 수렴)

```
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ Home composer        │  │ Dashboard Watching    │  │ Terminal BottomDock  │
│ (+page.svelte)       │  │ (/dashboard)          │  │ (CommandBar/Dock)    │
└──────────┬───────────┘  └──────────┬────────────┘  └──────────┬───────────┘
           │                         │                           │
           └─────────────────┬───────┴────────────┬──────────────┘
                             ▼                    ▼
                    goto('/terminal?q=...')  submitLocal(text)
                             │                    │
                             └────────┬───────────┘
                                      ▼
                      Terminal `?q=` auto-submit →
                      POST /api/cogochi/terminal/message  ← 단일 endpoint
                                      │
                                      ▼
                              SSE stream events
```

**규칙**: 홈/Dashboard 진입은 `/terminal?q=...` 경유 (Terminal state로 warp).
직접 API 호출은 Terminal 내부에서만. 항상 Terminal 화면에서 대화가 진행됨.

### 5.2 Tool Registry (확장)

기존 `chart_control`을 다음 축으로 분해/확장:

| Tool | Purpose | Args | 현 상태 |
|---|---|---|---|
| `set_context` | symbol + tf 동시 세팅 | `{symbol, timeframe}` | 기존 `chart_control` 재사용 |
| `add_indicator` | 하단 pane에 indicator 추가 | `{indicator, params?, pane?}` | enum 확장 필요 |
| `remove_indicator` | pane 제거 | `{indicator_id}` | 신규 |
| `draw_annotation` | zone/line/label 오버레이 | `{type, price_range?, label?}` | 신규 |
| `highlight_pattern` | 저장된 pattern_slug 오버레이 | `{pattern_slug, version?}` | 신규 (W-0099 연동) |
| `search_similar` | 과거 capture/pattern 검색 | `{query, limit}` | 신규 (future) |

**indicator enum 확장** (현재 `['ema','bb','volume','cvd']` → 타깃):
- 트렌드: `ema`, `sma`, `vwap`
- 모멘텀: `rsi`, `macd`, `atr`
- 볼륨/플로우: `volume`, `cvd`, `delta`, `oi`
- 변동성: `bb`, `bb_squeeze`
- 패턴-전용: `funding_flip`, `absorption`, `alt_btc_ratio`

### 5.3 Event Schema (SSE → Client)

기존 `chart_action` SSE event를 타입화:

```ts
type ChartActionEvent =
  | { action: 'set_context'; symbol: string; timeframe: string }
  | { action: 'add_indicator'; indicator: IndicatorKey; params?: object; pane_id?: string }
  | { action: 'remove_indicator'; pane_id: string }
  | { action: 'draw_annotation'; type: 'zone'|'line'|'label'; ... }
  | { action: 'highlight_pattern'; pattern_slug: string; version: number }
```

프론트 handler: `chart_action` event 수신 → action별로 dispatch → ChartBoard 업데이트.

### 5.4 Context Builder (Terminal state → LLM)

`contextBuilder`에 주입할 정보:
- `symbol`, `timeframe` (activePairStore)
- 현재 scan 결과 최상위 5개 (recent verdict)
- 활성 indicator 리스트 (`add_indicator` 누적 상태)
- Verdict hero 요약 (BULLISH/BEARISH + ML score)

→ LLM system prompt에 "현재 Terminal은 BTC 4h, CVD+BB 활성, 최근 verdict=BULLISH" 같은
block 삽입.

---

## Slice Plan (Execution Order)

### Slice 1 — URL `?q=` 파싱 + BottomDock auto-submit (End-to-end proof)
**의도**: 홈 composer에 타이핑한 프롬프트가 Terminal에서 **사라지지 않고
대화로 이어짐** 을 증명.
- `terminal/+page.svelte`가 `?q=` 읽어서 BottomDock의 prompt state로 주입
- BottomDock이 auto-submit (단, `?q=`는 한 번만 소비)
- 기존 DOUNI `/api/cogochi/terminal/message` 호출
- 차트 조작은 아직 연결 X (이번 slice 범위 아님)

**Exit criteria**:
- [ ] 홈에서 "btc 4h reclaim" 타이핑 + Enter → Terminal이 열리고 BottomDock에
      메시지가 자동 전송됨
- [ ] SSE 응답이 BottomDock 스레드에 표시됨
- [ ] 페이지 새로고침 시 `?q=`가 재실행되지 않음 (URL clear 처리)

### Slice 2 — `chart_action` SSE client handler (Recommended 시작점)
**의도**: LLM이 "4h로 보여줘" 말하면 **실제로 차트가 4h로 전환**.
- 프론트에 `chart_action` event handler 작성
- `set_context` action → `activePairStore.setActivePair` + `setActiveTimeframe`
- ChartBoard가 store 변화 반응해 자동 reload

**Exit criteria**:
- [ ] Terminal에서 "4h로 전환" 프롬프트 → LLM이 tool call →
      chart이 4h로 바뀜 (수동 클릭 없이)
- [ ] "ETH 보여줘" → symbol 변경
- [ ] 단위 테스트: action handler dispatcher

### Slice 3 — `add_indicator` 구현 (TV 스택)
**의도**: "CVD 추가해" → 하단 pane에 indicator가 append.
- `createPriceChartRuntime`에 `addIndicator(key, params)` 메서드 추가
- ChartBoard sub-pane 재사용 (vol/rsi/macd/oi/cvd 5개 예약 pane 구조 활용)
- active indicator 상태를 store에 저장 (refresh 유지)
- 초기 지원 indicator: `cvd`, `rsi`, `macd`, `bb` (기존 pure function 활용)

**Exit criteria**:
- [ ] "CVD 추가" → pane 하나 append됨, 실제 CVD 라인 렌더
- [ ] "RSI도 같이" → 두 번째 pane append (clear 없이 스택)
- [ ] 새로고침 후 indicator 상태 복원
- [ ] 같은 indicator 중복 추가 시 no-op 또는 업데이트

### Slice 4 — Context Builder 확장
**의도**: LLM이 stale context 갖지 않고 현재 차트 상태를 안다.
- `contextBuilder`에 ActivePair + active indicators + latest verdict 주입
- system prompt에 "현재 Terminal 상태:" block 삽입
- 오래된 context는 turn마다 갱신

**Exit criteria**:
- [ ] "지금 뭐 보고 있어?" → LLM이 현재 symbol/tf/indicator 나열
- [ ] 이전 turn에서 add_indicator 한 뒤 "그거 지워" → LLM이 해당 indicator
      찾아서 remove_indicator tool call

### Slice 5 — `draw_annotation` + `highlight_pattern` (선택적)
- Zone/line/label primitives를 chart-engine에 추가
- W-0099 Pattern Discovery Agent 결과를 `highlight_pattern` tool로 연결

---

## Risks / Decisions to make

| Risk | Mitigation |
|---|---|
| Tool call loop이 4 round 한계 (MAX_TOOL_ROUNDS=3) | 단순 prompt는 2 round 이하로 설계, 복잡한 건 turn 분리 유도 |
| LLM이 잘못된 indicator 이름 생성 | tool args에 enum 제약, invalid면 reply로 "지원 안 함" |
| 동일 symbol+tf 전환 중복 요청 | set_context는 idempotent, no-op 처리 |
| Indicator 상태 persistence | localStorage (기존 activePairStore 패턴) |
| `?q=` 재실행 (새로고침 무한 루프) | `window.history.replaceState`로 URL clear 후 submit |
| User API Key mode에서 tool calling 미지원 provider | intentClassifier로 chart_ctrl 판단 시 fallback heuristic 분기 |

## Decisions (확정 2026-04-19)

- [x] **Home/Dashboard → `/terminal?q=` warp 유지** — Terminal이 대화 anchor.
      모든 surface 입력은 Terminal로 수렴해 단일 SSE 스레드에서 결과 확인.
- [x] **Pane 최대 5개** — ChartBoard의 기존 예약 DOM (vol/rsi/macd/oi/cvd)을
      generic slot 5개로 재사용. TV UX 참조, 모바일 성능 보호.
- [x] **remove_indicator: LLM + user 수동 X 버튼 둘 다** — 자연어("그거 지워")와
      pane 헤더의 X 버튼 모두 지원. 구현 차이 작음, UX 자연스러움.
- [x] **Annotation persistence — localStorage만 MVP** — DB 저장은 future.
      Capture 저장 시 `capture.chart_context`에 현재 annotation snapshot 병합
      가능하도록 훅만 열어둠.

---

## Non-technical Exit Criteria (제품 레벨)

- 홈에서 "btc 4h reclaim CVD도" 입력 → 3초 이내 Terminal에서:
  1. symbol=BTC, tf=4h 차트 로드
  2. CVD pane 하단에 스택
  3. 대화로 "4h reclaim 초기 단계입니다. CVD가 buying 전환 확인됨" 응답
- 동일한 입력을 Dashboard Watching 카드에서도 같은 결과
- 동일한 입력을 Terminal BottomDock에서도 같은 결과

---

## Open Questions

1. Prompt router가 intent 분류를 LLM에 맡길지(더 유연), 기존 regex 유지할지(빠름).
   → Slice 1-3은 regex 유지, Slice 4 이후 재평가.
2. Multi-indicator prompt ("CVD랑 RSI 둘 다") 처리 순서가 LLM tool call
   sequence에 위존 — 순서 보장 필요한지? → 렌더 순서는 display 순서와 무관,
   stack에 추가만 되면 OK.
3. Error recovery — tool 실행 실패 시 LLM에 피드백 loop? → 현 toolExecutor에
   이미 tool_result event 있음, LLM이 재시도 가능.

---

## Next Action

**Slice 1부터 시작** — URL `?q=` 파싱 + BottomDock auto-submit. 이게
증명되면 나머지 slice는 점진적으로 붙음.
