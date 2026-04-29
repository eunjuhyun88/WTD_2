# W-0285 — 차트 유사 검색 1사이클 UI: 미니차트 + 카탈로그 픽커

> Wave: Wave4/Search | Priority: P1 | Effort: M
> Charter: In-Scope L5 (Search — 결과 시각화)
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-28 by Agent A069
> Issue: #558

## Goal (1줄)
검색 결과 카드에 실제 캔들차트가 보이고, 카탈로그 픽커로 JSON 없이 패턴을 골라 검색할 수 있다.

## 현재 갭 (코드 실측)

```
엔진 POST /search/similar        ✅ 작동 — bar_ts_ms + symbol + timeframe 반환
app fetchKlines(symbol, interval) ✅ 존재 — Binance 직접 호출, LightweightCharts 포맷
app lightweight-charts           ✅ ChartCanvas.svelte (431줄) 이미 사용 중

gap 1: SearchResultCard.mini_chart_url → 항상 undefined → ▤ placeholder만 표시
gap 2: /api/klines SvelteKit proxy route 없음 (클라이언트 직접 Binance 호출만 가능)
gap 3: 검색 입력이 JSON 수동 타이핑 — 52개 패턴 카탈로그 픽커 없음
```

## Scope

**포함:**
- `app/src/routes/api/klines/+server.ts` (신규) — symbol/timeframe/endTime/limit 파라미터, Binance proxy
- `app/src/lib/components/search/SearchResultMiniChart.svelte` (신규) — 120×80px lightweight-charts 캔들차트
- `app/src/lib/components/search/SearchResultCard.svelte` (수정) — mini_chart_url 제거, MiniChart 컴포넌트로 교체
- `app/src/routes/patterns/search/+page.svelte` (수정) — 카탈로그 픽커 추가 (GET /search/catalog → pattern 목록)

**API surface:**
- `GET /api/klines?symbol=BTCUSDT&interval=4h&limit=60&endTime=1714000000000` → `BinanceKline[]`

**파일 건드리지 않는 것:**
- `engine/` (검색 엔진 자체 변경 없음)
- `ChartBoard.svelte` / `MultiPaneChart.svelte` (터미널 차트 분리)
- `app/src/routes/api/cycles/klines/+server.ts` (BTC-only 전용, 그대로 유지)

## Non-Goals

- **차트 range drag → draft-from-range 연결** — 별도 W-0286으로 분리 (범위 선택 UX 필요)
- **결과 클릭 → 터미널 이동** — 별도 이슈 (터미널 symbol 라우팅 필요)
- **pgvector 또는 Layer C 개선** — F-16 (W-0247) 별도
- **터미널 내 search 버튼** — UI 변경 범위 초과

## CTO 관점 (Engineering)

### 아키텍처 결정

**D-001] `/api/klines` SvelteKit proxy route를 신규 생성**
- 거절: 클라이언트에서 Binance 직접 호출 → CORS 이슈 + API key 노출 위험
- 거절: engine GCP에 /klines 엔드포인트 추가 → 불필요한 인프라 복잡도
- 선택: SvelteKit server route가 Binance proxy 역할 (기존 `cycles/klines` 패턴과 동일)

**[D-002] SearchResultMiniChart.svelte를 별도 컴포넌트로 분리**
- 거절: SearchResultCard 안에 인라인 차트 코드 → 카드 파일 비대화 (현재 394줄)
- 선택: 독립 컴포넌트 → 재사용 가능, 테스트 가능

**[D-003] 미니차트 크기: 160×80px, candlestick only**
- 거절: OHLCV + 볼륨 → 너무 복잡, 미니 카드에 불어맞지 않음
- 선택: 캔들스틱만, 배경 어둡게, 축 레이블 없음 (터미널과 다른 compact 스타일)

**[D-004] 카탈로그 픽커: GET /search/catalog → pattern 목록 추출**
- 현재 `/search/catalog`는 corpus windows를 반환 (pattern별 group 포함)
- 픽커에서는 pattern_family 값만 추출해 드롭다운 구성
- 선택 시 → 기존 DEFAULT_DRAFT의 pattern_family만 교체

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Binance rate limit (검색 결과 10개 동시 klines 호출) | 중 | 중 | 순차 로딩 + 500ms 지연 or lazy load (Intersection Observer) |
| lightweight-charts SSR 이슈 (SvelteKit) | 저 | 중 | `{#if browser}` 가드 — ChartCanvas.svelte 기존 패턴 동일 |
| bar_ts_ms가 kline 실제 range 벗어남 | 저 | 저 | endTime = bar_ts_ms + timeframe_ms * 10, limit = 60 |

### Dependencies
- 선행 없음 — 완전 독립 (엔진 변경 없음)
- 차단 없음

### Rollback Plan
- `SearchResultCard.svelte`에서 MiniChart 제거 → 기존 placeholder 복원
- `/api/klines` route 삭제 (stateless, DB 없음)

### Files Touched (예상)

| 파일 | 변경 | 줄수 |
|---|---|---|
| `app/src/routes/api/klines/+server.ts` | 신규 | ~60줄 |
| `app/src/lib/components/search/SearchResultMiniChart.svelte` | 신규 | ~120줄 |
| `app/src/lib/components/search/SearchResultCard.svelte` | 수정 | +30 / -15 |
| `app/src/routes/patterns/search/+page.svelte` | 수정 | +50줄 (카탈로그 픽커) |

## AI Researcher 관점 (Data/Model)

### Data Impact
- 없음 — 순수 UI 레이어. 검색 엔진/스코어링 변경 없음.

### Statistical Validation
- 검색 결과 카드에 차트가 표시되면 사용자가 유사도를 직관적으로 검증 가능
- 향후 quality_judgement (hit/miss) 클릭 전환률 측정 지표로 활용 가능

### Failure Modes
- Binance API 오프라인 → 미니차트 로딩 실패 → placeholder 표시 (AC2 graceful degrade)
- bar_ts_ms가 너무 오래된 경우 (>2년) → Binance 무료 API 범위 초과 가능 → 에러 처리 필요

## Open Questions (사용자 결정 필요)

- [ ] [Q-001] 미니차트 lazy load vs 즉시 렌더링?
  - lazy (Intersection Observer): 스크롤 시 순차 로드 → 느리지만 API rate 안전
  - 즉시: top-k 10개 동시 → 빠르지만 rate limit 위험
  - **권장**: lazy load (10개 카드 동시 Binance call은 위험)

- [ ] [Q-002] 카탈로그 픽커에서 패턴 선택 시 phase 자동 채우기 방식?
  - 옵션 A: `/patterns/catalog` 엔드포인트에서 definition 전체 로드 → phase 자동 채움
  - 옵션 B: pattern_family만 바꾸고 phase는 유저가 수동 수정
  - **권장**: 옵션 A (engine `GET /patterns/catalog` 이미 존재)

## Implementation Plan

### Phase 1: /api/klines proxy route (30분)
```typescript
// app/src/routes/api/klines/+server.ts
GET /api/klines?symbol=BTCUSDT&interval=4h&limit=60&endTime=1714000000000
→ Binance /api/v3/klines proxy
→ BinanceKline[] JSON
```

### Phase 2: SearchResultMiniChart.svelte (1시간)
```svelte
<!-- props: symbol, timeframe, bar_ts_ms -->
<!-- mount: fetch /api/klines → createChart(container, compact options) → addCandlestickSeries -->
<!-- unmount: chart.remove() -->
<!-- loading/error state: spinner → chart / error → placeholder -->
```
LightweightCharts 옵션: `handleScroll: false, handleScale: false, crosshair: none`

### Phase 3: SearchResultCard.svelte 수정 (30분)
- `mini_chart_url` prop 제거
- `symbol`, `timeframe`, `bar_ts_ms` prop 추가
- `<SearchResultMiniChart {symbol} {timeframe} {bar_ts_ms} />` 교체

### Phase 4: search/+page.svelte 카탈로그 픽커 (1시간)
```svelte
<!-- 페이지 마운트 시 GET /search/catalog → pattern 목록 추출 -->
<select bind:value={selectedPattern} onchange={onPatternPick}>
  {#each catalogPatterns as p}
    <option value={p.pattern_family}>{p.pattern_family}</option>
  {/each}
</select>
<!-- 선택 시: JSON editor의 pattern_family 자동 교체 -->
```

### Phase 5: 테스트 + CI (30분)
- App CI: `npm run check` + `npm run build`
- 수동 검증: `/patterns/search` 접속 → 패턴 선택 → 검색 → 미니차트 확인

## Exit Criteria

- [ ] AC1: 검색 결과 카드에 해당 bar_ts_ms 기준 캔들차트 렌더링 (lightweight-charts)
- [ ] AC2: Binance API 실패 / bar_ts_ms 없을 때 placeholder 유지 (graceful degrade)
- [ ] AC3: 카탈로그 드롭다운 선택 → JSON pattern_family 자동 교체 → 검색 가능
- [ ] AC4: `npm run check` 0 에러 (App CI green)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## References

- `app/src/lib/components/search/SearchResultCard.svelte` — mini_chart_url prop 현황 (394줄)
- `app/src/routes/patterns/search/+page.svelte` — 현재 검색 페이지 (569줄)
- `app/src/lib/api/binance.ts:45` — `fetchKlines()` 기존 유틸
- `app/src/components/terminal/workspace/ChartCanvas.svelte` — lightweight-charts 기존 사용 패턴 (431줄)
- `app/src/routes/api/cycles/klines/+server.ts` — Binance proxy 기존 패턴 (163줄)
- `docs/design/03_SEARCH_ENGINE.md` — 4단 검색 파이프라인
- Issue #558, spec/PRIORITIES.md §6 F-16
