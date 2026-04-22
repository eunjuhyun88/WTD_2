# W-0103 — Terminal UI 중복 제거 (Dedup)

## Goal

터미널 데스크톱 화면에서 심볼/가격/TF/변동률이 4-5회 중복 노출되는 문제를 제거한다.
각 정보는 정확히 1개의 정규 위치에만 노출하고, 나머지는 제거하거나 다른 용도로 교체한다.

## Owner

frontend / app

## Why

W-0102 세션 사용자 피드백 (2026-04-19):
> "중복된 차트의 숫자 보이는거랑, 토큰가격보이는거랑 다 최고의 위치를 재정비하고,
>  중복을 최소화, 그리고 올바른 정보 배치를 위해 최고의 선택해서 완료할때까지 진행"

## 현재 중복 맵

| 정보 | 노출 위치 | 중복 횟수 | 문제 |
|------|----------|----------|------|
| **심볼 (SOL)** | Header nav pill / left rail 워치리스트 / chart sub-header / VerdictHeader | 4-5회 | 과도한 반복 |
| **가격 ($86.xx)** | Header nav pill / left rail 워치리스트 / chart LAST price | 3-4회 | 과도한 반복 |
| **24H 변동률** | left rail "▼54.03%" / chart sub-header "+3.18%" | 2회 + **값 불일치** | 출처가 달라 숫자 다름 |
| **TF pill strip** | TerminalCommandBar / ChartBoard 헤더 | 2회 | 동기화는 되지만 중복 |

## 정규(Canonical) 위치 결정

| 정보 | 정규 위치 | 제거 대상 |
|------|----------|----------|
| 심볼 + 가격 + 변동률 | **ChartBoard header** (chart 상단) | Header nav의 `selected-ticker` div |
| TF pill strip | **ChartBoard header** (TerminalCommandBar에서 제거됨 후 chart로 이동 완료) | TerminalCommandBar에 남은 TF 중복 |
| VerdictHeader 심볼 | **제거** — 우측 패널 컨텍스트는 `SUMMARY / ENTRY / RISK` 탭명으로 충분 | VerdictHeader의 `{symbol} · {timeframe}` span |
| 24H 변동률 | `snapshot.change24hPct` (분석 데이터 기준) 단일 출처 | kline 1-bar 계산값 분기 제거 |

## Scope

### Slice A — Header nav 심볼/가격 pill 제거

파일: `app/src/components/layout/Header.svelte`

변경:
```html
<!-- 제거 대상 -->
<div class="selected-ticker">
  <span class="st-pair">{selectedToken}</span>
  <span class="st-price">${selectedPriceText}</span>
</div>
```
→ `.selected-ticker` div 전체 제거.
→ 관련 CSS (`st-pair`, `st-price`, `selected-ticker`), JS (`selectedToken`, `selectedPrice`, `livePrices` import) 미사용 시 함께 제거.

모바일: `.mobile-page-chip`은 유지 (페이지 컨텍스트 레이블 — 심볼 아님).

### Slice B — TerminalCommandBar TF pill 중복 제거

파일: `app/src/components/terminal/workspace/TerminalCommandBar.svelte`

현황: `tf` prop + `onTfChange` 콜백 + TF pill strip이 CommandBar 안에 있음.
이미 W-0102에서 `+page.svelte` 는 CommandBar에 `tf` / `onTfChange` 전달을 제거한 diff 존재(확인 필요).

변경:
- CommandBar에서 TF pill strip 완전 제거 (chart header `TerminalHeaderMeta`에 이미 있음)
- `tf` / `onTfChange` prop 제거

### Slice C — VerdictHeader 심볼/TF 중복 제거

파일: `app/src/components/terminal/workspace/VerdictHeader.svelte`

변경:
```html
<!-- 제거 대상 -->
{#if symbol}
  <span class="meta">{symbol}{timeframe ? ` · ${timeframe.toUpperCase()}` : ''}</span>
{/if}
```
→ 해당 블록 제거. `symbol` / `timeframe` prop 제거.
→ 호출처(`+page.svelte`)에서 해당 prop 전달 제거.

### Slice D — 24H 변동률 출처 통일

파일: `app/src/routes/terminal/+page.svelte` + 관련 컴포넌트

현황:
- TerminalCommandBar/HeaderMeta: `change24h` prop (종종 kline 계산값)
- TerminalLeftRail: `coin.change24h` (watchlist preview)

변경:
- `activeAnalysisData?.snapshot?.change24hPct ?? activeAnalysisData?.change24h` 를 단일 헬퍼로 추출
- ChartBoard `change24hPct` prop → 이 헬퍼 값으로 통일
- TerminalCommandBar `change24h` prop → 동일 헬퍼로 통일
- LeftRail 워치리스트 row는 각 코인별 preview 데이터를 쓰므로 **유지** (다른 심볼 비교 목적)

## Non-Goals

- LeftRail 워치리스트 row의 가격/변동률 제거 — 여러 심볼 비교 컨텍스트 → 유지
- Chart LAST price 레이블 제거 — lightweight-charts 내장 기능
- 모바일 레이아웃 재설계 — 별도 작업

## Canonical Files

- `app/src/components/layout/Header.svelte`
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte`
- `app/src/components/terminal/workspace/VerdictHeader.svelte`
- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte` (change24hPct prop 확인)

## Exit Criteria

- [ ] Slice A: nav에 심볼/가격 표시 없음 — COGOCHI 로고 + 탭 + 지갑만
- [ ] Slice B: TF pill strip은 chart header 1개만 존재
- [ ] Slice C: VerdictHeader에 심볼/TF 표시 없음
- [ ] Slice D: 24H 변동률이 `snapshot.change24hPct` 단일 출처, 불일치 없음
- [ ] 기존 테스트 회귀 없음 (≥ 946 pass)
- [ ] Preview 스크린샷 — 심볼이 chart header에만 1회 표시
