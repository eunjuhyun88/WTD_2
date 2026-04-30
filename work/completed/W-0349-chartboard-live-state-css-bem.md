# W-0349 — ChartBoard 라이브 상태 추출 + TradeMode CSS BEM 마이그레이션

> Wave: 4 | Priority: P2 | Effort: M
> Charter: In-Scope §"surface and orchestration: app/"
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: #751
> Related: #734 (W-0341 완료 기반 — PR #748 bdfdc998)

## Goal
TradeMode/ChartBoard 잔여 렌더 결합 상태와 거대 `<style>` 블록을 정리하여, 향후 차트/HUD 변경이 컴포넌트 단일 파일을 건드리지 않고도 가능해지도록 한다.

## 아키텍처 컨텍스트 (코드 실측)

```
W-0341 완료 후 현황:
  TradeMode.svelte      4390줄  (WS + 데이터 composable 추출 완료)
  ChartBoard.svelte     2450줄  (chartMetrics.ts 추출 완료)
  app.css                611줄  (BEM 없음)
  <style> TradeMode     2235줄  → AC4 목표 미달성
  ChartBoard $state     currentPrice/currentTime/currentChangePct/currentOiDelta
                         ↳ DataFeed.onBar + renderCharts() + crosshair 이벤트와 결합
```

## Scope

### Phase A — ChartBoard 라이브 상태 소유권 분리

**분석**:
- `_ws`(L169)는 DataFeed가 소유하는 dead ref → useChartSocket 신설은 중복 추상화 → 포기
- `currentPrice`(L170) / `currentTime`(L171) / `currentChangePct`(L172) / `currentOiDelta`(L173) 4개 `$state`는 ChartBoard 내 3개 지점에서 갱신:
  - `_dataFeed.onBar` 콜백 (L730) → `currentPrice`
  - `renderCharts()` 내부 (L825-827) → `currentChangePct`, `currentOiDelta`, `currentTime`
  - crosshair 이벤트 (L1106) → `currentTime`
- 추출 방법: **liveTickState 순수 store** — 상태 소유권만 이동, 콜백 결합은 ChartBoard에 유지

**구현**:
```ts
// lib/chart/liveTickState.svelte.ts
export function createLiveTickState() {
  let price = $state<number | null>(null);
  let time  = $state<number | null>(null);
  let changePct = $state<number | null>(null);
  let oiDelta   = $state<number | null>(null);
  return {
    get price()     { return price; },
    get time()      { return time; },
    get changePct() { return changePct; },
    get oiDelta()   { return oiDelta; },
    update(patch: { price?: number | null; time?: number | null; changePct?: number | null; oiDelta?: number | null }) {
      if ('price'     in patch) price     = patch.price ?? null;
      if ('time'      in patch) time      = patch.time  ?? null;
      if ('changePct' in patch) changePct = patch.changePct ?? null;
      if ('oiDelta'   in patch) oiDelta   = patch.oiDelta   ?? null;
    },
  };
}
```

ChartBoard에서:
```ts
const liveTick = createLiveTickState();
// onBar 콜백: liveTick.update({ price: bar.close });
// renderCharts(): liveTick.update({ changePct, oiDelta, time });
// crosshair: liveTick.update({ time: param.time });
// 템플릿: {liveTick.price} 대신 currentPrice 참조 제거
```

### Phase B — TradeMode CSS BEM 마이그레이션

**목표 하향 조정** (현실 근거):
- 2235줄 → ≤300줄: 1회 PR 불가, 시각 회귀 위험 과도
- 현실 목표: **≤1500줄** + 미사용 선택자 0 + `app.css`에 `tm-` BEM 토큰 ≥40개

**전략 — 선택적 이동**:
1. **외부 재사용 후보** (→ app.css 이동): layout grid, color 토큰, spacing utility
   - 예: `.tm-act-col`, `.tm-bias-box`, `.tm-chart-header`, `.tm-compare-card`
2. **컴포넌트 전용 잔류**: 애니메이션, hover/active 상태, pseudo-element, scoped 미디어 쿼리
3. **미사용 선택자 전체 제거**: `pnpm check` 경고 대상 (현재 일부 잔류 가능성)
4. BEM prefix: `tm-` (trade-mode)

**사전 작업**:
```bash
# 다른 컴포넌트에서 동일 클래스 사용 여부 확인 (충돌 방지)
grep -rn "bias-box\|act-col\|chart-header\|compare-card" app/src/ --include="*.svelte" | grep -v TradeMode
```

## Non-Goals
- **useChartSocket 신설** — DataFeed + useChartDataFeed가 이미 WS 추상화. 중복.
- **TradeMode `<style>` ≤300줄** — 1회 PR에서 불가. 시각 회귀 위험 임계 초과.
- **app.css 디자인 시스템화** — 별도 W.
- **ChartBoard 분할** — 2450줄, W-0341 완료로 안정.

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| BEM rename 후 클래스 오타 | 중 | 시각 회귀 | grep 사전 확인 + preview 스모크 |
| `:global()` 누락으로 자식 컴포넌트 스타일 깨짐 | 중 | 부분 시각 회귀 | Phase B를 그룹별 분리 커밋 |
| liveTickState reactive 누락 (proxy 손실) | 낮음 | 가격 UI freeze | onBar mock 단위 테스트 |
| app.css tm- prefix 충돌 | 낮음 | 글로벌 영향 | prefix 강제 + 사전 grep |

### Dependencies / Rollback
- 기반: W-0341 PR #748 (merged bdfdc998)
- Phase A / Phase B 독립 PR → revert 단위 보존
- Files:
  - `app/src/components/terminal/workspace/ChartBoard.svelte` (L169-173, L730, L825-827, L1106)
  - `app/src/lib/cogochi/modes/TradeMode.svelte` (`<style>` 2235줄)
  - `app/src/app.css` (현재 611줄 → +∼200)
  - 신규: `app/src/lib/chart/liveTickState.svelte.ts`

## AI Researcher 관점

### Failure Modes
- **Phase A — 가격 freeze**: liveTickState가 `$state` rune 경계를 넘을 때 reactive proxy 손실. 검증: onBar mock → `liveTick.price` 갱신 확인.
- **Phase A — currentTime race**: crosshair + onBar 동시 발화 시 time 깜빡임. 완화: crosshair 우선, onBar는 crosshair 비활성 시에만 write.
- **Phase B — 자식 누수**: app.css `tm-` 토큰이 WVPLCard / KimchiPremiumBadge scope에 누수. 검증: `pnpm check` + 시각 diff.
- **Phase B — 클래스 충돌**: `.bias-box` 등이 다른 컴포넌트에 존재 가능. 사전 grep 필수.

## Decisions
- **[D-0349-1]** useChartSocket 추출 → **포기** (DataFeed 중복). liveTickState 순수 store 채택.
- **[D-0349-2]** CSS 전략 → **선택적 이동** (전체 BEM 거부). ≤1500줄 + tm- ≥40개 현실 목표.

## Open Questions
- [ ] [Q-0349-1] Phase B에서 BEM 이동할 40개 토큰 선정 — 사전 grep 결과 기반으로 구현 시점에 결정.

## Implementation Plan

### Phase A — liveTickState (1 PR)
1. `app/src/lib/chart/liveTickState.svelte.ts` 신설
2. ChartBoard L169-173 `$state` 4개 제거 → import + `createLiveTickState()`
3. L730/L825-827/L1106 콜백에서 `liveTick.update(...)` 호출
4. 템플릿 `{currentPrice}` 등 → `{liveTick.price}` rename
5. `pnpm check` 0 new errors

### Phase B — CSS BEM (1 PR, Phase A 이후)
1. `grep -rn "클래스명" app/src/` — 충돌 후보 사전 식별
2. TradeMode `<style>` layout/color 그룹 분리 → `tm-` prefix rename
3. `app.css`에 이동 (≥40 토큰)
4. 템플릿 class 일괄 rename
5. 미사용 선택자 전체 제거 (`pnpm check` 경고 대상)
6. `pnpm check` + preview 5화면 스모크

### Phase C — 검증
1. `pnpm check` 0 new errors, warnings ≤ 17
2. `madge --circular app/src/lib/trade app/src/lib/chart` → 0
3. AC1-AC6 grep 스크립트 일괄

## Exit Criteria
- [ ] AC1: ChartBoard 4개 라이브 `$state` 제거 → `liveTickState.svelte.ts` 이동. `grep "let currentPrice = \$state" ChartBoard.svelte` → 0
- [ ] AC2: `pnpm check 2>&1 | grep -c "Unused CSS selector"` → 0
- [ ] AC3: `awk '/^<style/,/^<\/style/' TradeMode.svelte | wc -l` ≤ 1500 + `grep -c "^\.tm-" app.css` ≥ 40
- [ ] AC4: `pnpm check` 0 new errors, warnings ≤ 17 (베이스라인)
- [ ] AC5: `madge --circular app/src/lib/trade app/src/lib/chart` → 0
- [ ] AC6: PR merged + CURRENT.md main SHA 업데이트
