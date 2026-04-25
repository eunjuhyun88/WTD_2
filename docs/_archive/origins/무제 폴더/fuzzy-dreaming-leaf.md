# TradingView/Binance 수준 UI/UX 재설계

## Context
Terminal 페이지에서 MissionFlowShell(~130px) + StrategyVariantWorkbench(~290px)가 뷰포트 상단을 전부 차지해서 **차트가 fold 아래로 밀려남**. 트레이딩 플랫폼에서 차트가 안 보이는 건 치명적. Home도 게임적 요소가 과해 GTM 전환율이 낮음.

## 핵심 원칙
- **차트 퍼스트**: 뷰포트 70%+ 차트 영역
- **정보 위계**: 가격/차트/시그널 > 에이전트 상태 > 설정
- **프로페셔널 트레이딩 데스크 느낌**: 장식적 그라데이션/애니메이션 제거

---

## Phase A: Terminal 레이아웃 수정 (최우선)

### 변경 파일: `src/routes/terminal/+page.svelte`

**현재 구조 (문제)**:
```
terminal-route-shell (flex column)
  MissionFlowShell        ← ~130px 차지
  StrategyVariantWorkbench ← ~290px 차지
  terminal-shell           ← 나머지 (fold 아래)
```

**새 구조**:
```
terminal-route-shell (flex column)
  term-topbar              ← 40px 고정 (MissionFlowShell 대체)
  terminal-shell           ← flex:1 (차트 + 3패널, fold 위!)
  strategy-drawer          ← 0px 기본 접힘 (토글 시 280px)
```

- `term-topbar` (40px): 에이전트명 + 리디니스 도트(M·D·V) + `01 CREATE ✓ › 02 TRAIN › 03 ARENA` 브레드크럼 + `[STRATEGY ▲]` 토글
- `strategy-drawer`: StrategyVariantWorkbench를 감싸는 접힘 패널. `max-height: 0` → `280px` CSS 트랜지션
- `let strategyDrawerOpen = false` 상태 추가

### 결과: 900px 뷰포트 기준
- Header 58px + topbar 40px = 98px → 차트 영역 **802px** (현재 ~420px에서 2배)

---

## Phase B: StrategyVariantWorkbench 드로어 모드

### 변경 파일: `src/components/agent/StrategyVariantWorkbench.svelte`

- `export let drawer = false` prop 추가
- `drawer=true` 시: summary-grid 숨김, control-grid를 4컬럼 1행, variant-list 숨김
- 높이 ~170px 이내로 컴팩트화
- Terminal에서 `<StrategyVariantWorkbench compact dense drawer />`로 사용

---

## Phase C: Header 업그레이드

### 변경 파일: `src/components/layout/Header.svelte`

1. **24h 변동률 표시**: selected-ticker에 `+2.3%` / `-1.5%` 칩 추가 (녹색/적색)
2. **Terminal 전용 플랫 배경**: `#nav.is-terminal { background: rgba(6,9,18,0.98) }` — 장식 그라데이션 제거
3. **Terminal 브레드크럼**: `isTerminal` 일 때 `CREATE › TRAIN › ARENA` 퀵네비 표시

### 의존성: `priceStore`에서 `change24h` 데이터 노출 필요
- `updatePriceFull()`이 이미 `change24h`를 저장함
- `livePricesFull` derived store 추가 or 기존 스토어 확장

---

## Phase D: Home 페이지 GTM 개선

### 변경 파일: `src/routes/+page.svelte`

1. **카피 교체**:
   - eyebrow: `"DRAFT. RAISE. TRAIN. PROVE. RENT."` → `"CRYPTO AI TRADING PLATFORM"`
   - h1: `"Draft the crew. Raise the lead."` → `"AI Agents. Real Signals. Your Edge."`
   - subtitle: → `"Train crypto AI agents in a live terminal. Backtest strategies, scan signals, and compete in the Arena."`

2. **Journey Status 승격**: hero-copy 최상단으로 이동, pill 형태 (inline-flex, border-radius: 999px)

3. **스프라이트 자동회전 제거**: `onMount`의 `setInterval` 삭제 → 정적 featured shell

4. **미니 차트 프리뷰 추가**: CTA 아래에 pair/price/change24h 칩 + "Opens in Terminal →" 티저

5. **Companion Bay 축소**: max-width 360px → 320px, 로스터 그리드를 "Change roster" 디스클로저 뒤로

---

## Phase E: 비주얼 디노이징

### 변경 파일: `src/routes/terminal/+page.svelte` (CSS)

1. `terminal-shell` 배경: 라디얼 그라데이션 → 플랫 `var(--term-bg2)`
2. `.term-stars-soft` 애니메이션 → `animation: none; opacity: 0.1`
3. `.term-grain` → `display: none`
4. 스캔라인 `::before` opacity → 0.15 (은은하게 유지)

---

## 실행 순서

```
A (Terminal 레이아웃) → B (Workbench 드로어) → C (Header) → D (Home) → E (디노이징)
```

A+B가 가장 임팩트 큼 — 차트가 즉시 보이게 됨.

## 검증
- Terminal: 900px 뷰포트에서 차트가 fold 위에 보이는지 확인
- Strategy drawer: 토글 시 슬라이드 애니메이션, 칩 선택 가능
- Header: 24h 변동률 표시, Terminal에서 플랫 배경
- Home: 새 카피, journey-status pill, 스프라이트 회전 없음
- 모바일: 기존 탭 레이아웃 깨지지 않음
