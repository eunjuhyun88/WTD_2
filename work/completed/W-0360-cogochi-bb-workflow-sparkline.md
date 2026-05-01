# W-0360 — Cogochi B,B 워크플로 + WatchlistRail 스파크라인

> Wave: 4 | Priority: P0 | Effort: M
> Issue: #788
> Status: 🟡 In Progress
> Created: 2026-05-01

## Goal

차트 구간선택(B,B → anchorA+anchorB) 확정 시 AIPanel이 자동으로 ANALYZE를 호출하고, WatchlistRail 각 심볼 행에 7-bar 스파크라인을 표시한다. TV 스타일 UX 완성.

## UX 워크플로

```
1. 워치리스트에서 심볼 클릭 → 차트 전환
2. 차트 상단 [B] 버튼 또는 단축키 → 구간 선택 모드 진입
3. 드래그로 anchorA → anchorB 확정
4. → AIPanel 자동: "구간 분석 중…" → /api/cogochi/analyze?symbol=&tf=&from=&to=
5. → AI 카드: 방향 + p_win + evidence + entry/stop price lines
6. WatchlistRail: 각 행 우측에 7-bar 스파크라인 (실시간 miniTicker로 갱신)
7. 내 패턴 행 클릭 → 해당 패턴의 symbol로 차트 전환
```

---

## Scope

### Phase A — chartSaveMode → AIPanel 자동 분석 연결

| 파일 | 변경 |
|---|---|
| `app/src/lib/cogochi/AIPanel.svelte` | `$effect` — `$chartSaveMode.anchorA && $chartSaveMode.anchorB` 감지 → `handleAnalyzeRange()` 자동 호출 |
| `app/src/routes/api/cogochi/analyze/+server.ts` | `from` + `to` query param 추가 (Unix seconds) — engine에 그대로 전달 |
| `engine/api/routes/score.py` (또는 cogochi analyze 담당 파일) | `from_ts`, `to_ts` 파라미터 수신 → 해당 구간 OHLCV로 분석 |

**AIPanel `handleAnalyzeRange(from: number, to: number)`**:
```
GET /api/cogochi/analyze?symbol=BTCUSDT&tf=4h&from=1700000000&to=1700043200
→ 기존 analyze card + "구간 {date} ~ {date}" 레이블 표시
→ setAIOverlay(entry, stop)
```

### Phase B — WatchlistRail 7-bar 스파크라인

| 파일 | 변경 |
|---|---|
| `app/src/lib/cogochi/WatchlistRail.svelte` | 심볼별 최근 7-bar close 가격 배열 유지 → inline SVG 스파크라인 렌더 |

**데이터 소스**: 기존 `subscribeMiniTicker` 콜백에서 close 가격을 circular buffer(7)로 유지.
초기값: 빈 state → 7개 채워지면 라인 표시. SVG `polyline` 단순 구현.

### Phase C — WatchlistRail 내 패턴 클릭 → 차트 전환

| 파일 | 변경 |
|---|---|
| `app/src/lib/cogochi/WatchlistRail.svelte` | 패턴 행 `button`으로 변경, `onSelectSymbol?.(pattern.symbol ?? activeSymbol)` 호출 |
| `app/src/routes/api/patterns/terminal/+server.ts` | 응답에 `symbol` 필드 포함 여부 확인 (이미 있으면 패스) |

---

## Non-Goals

- chartSaveMode에서 캡처 저장 흐름 변경 (기존 SaveStrip 유지)
- 실시간 WebSocket 구독 신규 추가 (기존 miniTicker 재사용)
- 모바일 UX 변경
- analyze endpoint 결과 구조 변경

---

## Owner

app (Svelte) + engine (analyze range param)

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `anchorB` 설정 직후 $effect가 너무 빨리 발화 | 중 | 중 | debounce 300ms + `anchorB !== null` 조건 |
| analyze endpoint `from/to` 무시 시 기존 동작 유지 | 낮 | 낮 | 파라미터 optional, 없으면 기존 full 분석 |
| 스파크라인 7개 미달 시 (초기) | 낮 | 낮 | 배열 길이 < 3이면 숨김 처리 |

### Dependencies

- Phase A: `chartSaveMode` 기존 `anchorA/anchorB` 상태 활용 (신규 API 없음)
- Phase B: 기존 `subscribeMiniTicker` 콜백 재사용 (신규 WS 불필요)
- Phase C: `/api/patterns/terminal` 응답 `symbol` 필드 확인 필요

---

## Facts

- `chartSaveMode.anchorA/anchorB`: Unix seconds, ChartBoard drag으로 이미 설정됨
- `subscribeMiniTicker`: `app/src/lib/api/binance.ts:179` — WatchlistRail에서 이미 실행 중
- `/api/cogochi/analyze`: `symbol`, `tf` param만 현재 수신 — `from/to` 추가 필요
- ChartBoard `$chartSaveMode.active`: TradeMode에서 `enterRangeMode()` 호출로 이미 진입 가능

---

## Assumptions

- Analyze API에 `from/to` 파라미터를 추가해도 엔진에서 무시하면 기존 분석 동작 (graceful degradation)
- 스파크라인은 miniTicker push 간격(~1s)으로 자연스럽게 갱신됨

---

## Implementation Plan

### Phase A (45분)

1. `AIPanel.svelte`: `import { chartSaveMode } from '$lib/stores/chartSaveMode'`
2. `$effect`: anchorA/anchorB 모두 non-null → 300ms debounce → `handleAnalyzeRange(from, to)`
3. `handleAnalyzeRange`: `fetch(/api/cogochi/analyze?symbol=&tf=&from=&to=)` → 기존 analyze card + "구간 {date1}~{date2}" subtitle
4. `analyze/+server.ts`: `url.searchParams.get('from')` → engine으로 전달
5. `engine/score.py` (혹은 cogochi담당): `from_ts`/`to_ts` optional 파라미터 추가

### Phase B (30분)

1. `WatchlistRail.svelte`: `sparkData = $state<Record<string, number[]>>({})` 추가
2. `onUpdateFull` 콜백에서 `sparkData[sym] = [...(sparkData[sym] ?? []).slice(-6), tick.price]` 업데이트
3. SVG 스파크라인 inline 컴포넌트 (30×14px polyline)

### Phase C (15분)

1. PatternRow 타입에 `symbol?: string` 추가
2. fetch 응답에서 `p.symbol` 추출
3. 패턴 행 `<div>` → `<button>` + `onclick={() => onSelectSymbol?.(p.symbol ?? activeSymbol)}`

---

## Open Questions

- [ ] [Q-01] `/api/cogochi/analyze` 엔진 담당 파일: `engine/api/routes/score.py`? `alpha.py`? → 확인 후 수정
- [ ] [Q-02] anchorB 설정 후 자동 exitRangeMode() 필요 여부 — 현재는 사용자가 직접 나가야 함

---

## Exit Criteria

- [ ] AC01: 차트 구간 드래그 확정(anchorA+anchorB) → AIPanel ANALYZE 자동 호출 (≤300ms debounce)
- [ ] AC02: AI 카드에 "구간 YYYY-MM-DD ~ YYYY-MM-DD" 레이블 표시
- [ ] AC03: WatchlistRail 각 행에 7-bar 스파크라인 (SVG, 3개 미달 시 숨김)
- [ ] AC04: WatchlistRail 내 패턴 행 클릭 → 차트 심볼 전환
- [ ] AC05: `pnpm check` 0 errors
- [ ] AC06: CI green

---

## Handoff Checklist

- [ ] PR merged
- [ ] CURRENT.md SHA 업데이트
- [ ] work item completed 이동

## Decisions

- [D-01] 스파크라인 외부 라이브러리 없음 — inline SVG polyline. 이유: 의존성 최소화, 7-bar는 단순 path로 충분.
- [D-02] 자동 분석 debounce 300ms — anchorB drag 완료 직후 중간 상태 발화 방지.

## Canonical Files

```
app/src/lib/cogochi/AIPanel.svelte             — chartSaveMode $effect + handleAnalyzeRange
app/src/routes/api/cogochi/analyze/+server.ts  — from/to param 전달
engine/api/routes/score.py (또는 alpha.py)     — from_ts/to_ts optional
app/src/lib/cogochi/WatchlistRail.svelte       — sparkData + SVG + pattern click
```
