# Cogochi Market Data Plane

## Purpose

Cogochi 의 차트, 하단 ANALYZE, 오른쪽 HUD, AI panel 이
같은 시장 사실을 서로 다른 방식으로 재사용하도록 하는 **공통 데이터 평면**을 정의한다.

현재 문제는 UI 자체보다 데이터 계약이다.

- `ChartBoard` 는 live chart/pane series 를 가진다.
- `TradeMode` 는 `AnalyzeEnvelope` 와 `ChartSeriesPayload` 를 따로 읽고 다시 summary/detail 을 만든다.
- AI panel 은 별도 자연어 흐름으로 동작해 현재 선택된 pane/study 집합을 직접 알지 못한다.

이 구조는 surface 는 나뉘었지만 data plane 은 아직 분리되지 않은 상태다.

## Design Principles

1. **engine is backend truth**
   - provider normalization, feature derivation, confluence scoring 은 engine 또는 engine-authoritative route 가 담당한다.
2. **ChartBoard is live series owner**
   - price-aligned overlay 와 sub-pane time series 의 렌더 owner 는 `ChartBoard`.
3. **workspace consumes snapshots, not bespoke derivation**
   - 하단 workspace 와 AI 는 개별 필드를 다시 계산하지 않고 `StudySnapshot[]` 와 section config 를 소비한다.
4. **one study, many views**
   - 하나의 study 는 chart, HUD, bottom workspace, AI 에서 다른 형태로 보일 수 있어야 한다.
5. **compare is first-class**
   - 장기적으로 탭은 primary container 가 아니고 `pin / detach / compare` 가 primary interaction 이다.

## Current State

### Already in place

- `ADR-008` 으로 `ChartBoard` 가 단일 WS owner
- `chartIndicators.ts` 로 pane 토글 단일 store
- `W-0137`/`W-0140` 으로 `Summary HUD` 와 `Detail Workspace` 역할 분리

### Still missing

- `ChartBoard` 와 하단 `ANALYZE` 사이의 canonical handoff
- pane/study -> AI explanation selection contract
- compare/pin/detach 를 위한 panel identity model
- source ownership 문서화

## Data Planes

### 1. Ingress Plane

데이터를 긁어오는 층. provider / poll / WS / fallback 책임을 가진다.

| Domain | Current source | Target owner | Mode |
|---|---|---|---|
| Price / Klines | Binance WS + REST | `ChartBoard.DataFeed` | live WS + gap fill |
| OI / Funding history | Coinalyze REST, Binance-derived history | engine/app proxy -> canonical route | poll |
| Liquidations | chart `liqBars`, Coinalyze history, future multi-venue WS | engine ingress | poll now, WS later |
| Options snapshot | Deribit REST | engine/app proxy -> canonical route | poll |
| Venue divergence | Coinalyze + venue REST mix | engine | poll |
| World model scan | engine `/alpha/world-model` | engine | poll |
| Netflow / whale transfers | Arkham | engine | deferred |

Ingress plane rules:

- app route proxy 는 임시 허용이지만, canonical field naming 과 normalization 은 engine contract 를 따른다.
- provider freshness / auth / fallback 을 각 study metadata 에 기록한다.
- live tick ownership 은 `ChartBoard` 밖으로 새지 않는다.

### 2. Study Snapshot Plane

차트와 패널이 함께 재사용할 **정규화된 시장 단위**.

`StudySnapshot` 은 다음을 담는다.

- study identity
- source/freshness
- default placement
- summary metrics
- series refs
- typed payload

이것이 `funding`, `oi`, `cvd`, `liq`, `vpvr`, `gamma`, `venue divergence` 의 공통 단위다.

### 3. Workspace Composition Plane

하단 ANALYZE, 오른쪽 HUD, compare canvas 를 구성하는 층.

여기서는 raw 값이 아니라:

- 어떤 section 이 있는지
- 어떤 study 들이 각 section 에 속하는지
- 어느 study 가 pin 상태인지
- 어떤 study 조합이 compare 대상인지

를 정의한다.

### 4. AI Interpretation Plane

AI 는 data store 가 아니라 interpreter 다.

AI 가 알아야 하는 것은:

- 현재 symbol / timeframe
- 선택된 study ids
- section summaries
- compare 대상 study ids
- thesis / risk / proposal

즉 AI 는 raw provider payload 가 아니라 `AIContextPack` 을 소비해야 한다.

## Surface Placement Rules

### Main Chart

가격축과 직접 결합된 것만 둔다.

- candles
- EMA / VWAP
- VPVR / HVN / LVN
- gamma pin / max pain
- entry / stop / target
- liq rails / key levels

### Sub-panes

시간축 동기화가 필요한 것만 둔다.

- funding histogram
- OI candles / OI delta
- CVD / normalized CVD
- liquidation imbalance
- volume spike / delta bars

### Right Summary HUD

2초 의사결정용만 둔다.

- direction
- confidence
- regime
- top evidence 3
- risk warning
- next action

### Bottom Workspace

실제 비교 / 실행 준비 공간이다.

- LIVE STACK
- OPTIONS
- VENUE DIVERGENCE
- EVIDENCE TABLE
- EXECUTION BOARD
- pinned study panels
- compare slots

### AI

자연어 해석 / 비교 / 반론 생성.

- 왜 bullish/bearish 인지
- 무엇이 바뀌었는지
- 두 심볼 비교
- 반대 시나리오
- 실행 요약

## Canonical Contract

```ts
interface StudySnapshot {
  id: string;
  title: string;
  family: 'price' | 'flow' | 'oi' | 'funding' | 'cvd' | 'liquidity' | 'options' | 'venue' | 'execution';
  defaultSurface: 'chart-overlay' | 'chart-subpane' | 'right-hud' | 'bottom-workspace';
  compareMode: 'timeseries' | 'price-level' | 'summary' | 'execution';
  freshnessMs: number | null;
  sourceRefs: ProviderRef[];
  summary: StudyMetric[];
  seriesRef?: StudySeriesRef;
  payload?: Record<string, unknown>;
}

interface WorkspaceSection {
  id: string;
  title: string;
  kind: 'summary' | 'detail' | 'evidence' | 'execution' | 'compare';
  studyIds: string[];
  collapsible?: boolean;
}

interface AIContextPack {
  symbol: string;
  timeframe: string;
  selectedStudyIds: string[];
  compareStudyIds: string[];
  thesis?: string;
  warnings?: string[];
}
```

## Compare Canvas Model

탭 중심이 아니라 panel 중심으로 이동한다.

### Actions

- `pin study`
- `detach panel`
- `send to compare`
- `send to AI`

### Examples

- BTC `Funding` pane + ETH `Funding` pane 를 나란히 비교
- BTC `Options` + BTC `Venue Divergence` + BTC `Execution` 을 한 canvas 에 pin
- 선택한 3개 study 를 AI 로 보내 “bull thesis vs bear thesis” 설명

## Producer Roadmap

### Phase A — Contract

- `StudySnapshot[]`
- `WorkspaceSection[]`
- `AIContextPack`

### Phase B — Bundle Producer

신규 producer 후보:

- `GET /api/cogochi/workspace-bundle?symbol=&tf=`

반환:

- `AnalyzeEnvelope`
- `ChartSeriesPayload`
- `studies: StudySnapshot[]`
- `workspaceSections: WorkspaceSection[]`
- `aiContextDefaults`

### Phase C — Consumer Migration

- `TradeMode` 가 `proposal/evidence/sidebarIntel` 을 수동 생성하는 경로 제거
- section 은 `workspaceSections`
- 하단 pinned panels 은 `studies`
- AI 는 `AIContextPack`

### Phase D — Compare Canvas

- bottom tabs 를 compare canvas 로 축소/전환
- `ANALYZE / SCAN / JUDGE` 는 panel presets 로 재정의

## Explicit Gaps to Close

1. `AnalyzeEnvelope` 와 `ChartSeriesPayload` 가 현재 서로 독립적이다.
2. `TradeMode` 가 backend fact 를 UI 에서 다시 조립한다.
3. app provider route 와 engine route 의 ownership 이 문서화돼 있지 않다.
4. chart pane state 가 bottom workspace 로 직접 주입되지 않는다.
5. AI 가 현재 selected study set 을 구조적으로 받지 못한다.

## Success Criteria

- 같은 시장 데이터가 chart / bottom workspace / AI 에서 같은 identity 로 재사용된다.
- 새 study 를 추가할 때 chart pane, bottom section, AI handoff 가 동일 contract 위에서 자동 확장된다.
- compare canvas 구현이 기존 탭 구조를 깨지 않고 단계적으로 가능하다.
