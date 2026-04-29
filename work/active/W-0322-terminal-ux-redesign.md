# W-0322 — Terminal UX 전체 재설계

> **Status**: 🟡 Design Draft (사용자 검토 대기)
> **Issue**: #690
> **Charter**: F-5 IDE split-pane + AI command flow (In-Scope L5/L6)
> **Depends on**: W-0317 (SplitPaneLayout 마운트 — ✅ b0a48805)
> **D-axis**: D-D (UX), D-A (architecture)
> **Created**: 2026-04-30

---

## Goal

트레이더가 AI에게 명령하면 → 토큰 리스트를 받고 → 클릭해서 차트에 즉시 로드하고 → 구간을 선택하면 → 유사 패턴이 하락/매집/상승전/하락전으로 분류되어 공유 가능한 형태로 나온다.

## Owner

app

## Scope

| 파일 | 역할 |
|---|---|
| `app/src/routes/terminal/+page.svelte` | 레이아웃 모드 + 테마/밀도 CSS 변수 |
| `app/src/lib/components/terminal/SplitPaneLayout.svelte` | 3-rail / 2-rail / focus 모드 확장 |
| `app/src/components/terminal/workspace/TerminalLeftRail.svelte` | AI 토큰 리스트 UI 개선 |
| `app/src/components/terminal/workspace/TerminalCommandBar.svelte` | AI 명령창 + ModeToggle 통합 |
| `app/src/lib/components/terminal/ModeToggle.svelte` | CommandBar에 통합 연결 |
| `app/src/components/terminal/peek/CenterPanel.svelte` | 차트 영역 극대화 |
| `app/src/routes/terminal/+layout.svelte` (신규 또는 수정) | 테마/밀도 CSS 변수 루트 |
| `app/src/lib/stores/terminalLayout.ts` (신규) | 레이아웃 모드 + 테마 + 밀도 store |

## Non-Goals

- DogeOS / React island 연동 (별도 W-item)
- 실주문 / copy trading (Charter §Frozen)
- TradingView 교체
- MultiPaneChart 완전 교체 (개선만)

---

## 3개 레이아웃 시안 (Design Canvases)

### 시안 A: "3-Rail Pro" ⭐ 추천
```
┌─────────────────────────────────────────────────────────────────┐
│  [◉ BTC/USDT  $67,420  +2.1%]  [Observe | Analyze | Execute]  │  ← CommandBar (56px)
├──────────┬────────────────────────────────────┬─────────────────┤
│  AI CMD  │                                    │  VERDICT HUD   │
│  ────── │         CHART (lightweight)         │  ─────────────  │
│  토큰리스트 │         70% width                  │  Confidence    │
│  ─────── │         drag-resizable ↔           │  Entry / Stop  │
│  • BTCUSDT│                                   │  Target        │
│  • ETHUSDT│  [구간 선택 → 패턴 매칭 버튼]      │  ─────────────  │
│  • SOLUSDT│                                    │  PATTERN MATCH │
│  ─────── │                                    │  하락  ████ 43% │
│  [Analyze]│  [Indicator bar: VWAP SMA RSI OI] │  매집  ███  31% │
│  [Scan]  │                                    │  상승전 ██  18%  │
│  [Save]  │                                    │  하락전 █    8%  │
└──────────┴────────────────────────────────────┴─────────────────┘
  260px      ←────── flex:1 (drag handle) ──────→  320px
```

**특징**:
- 왼쪽 rail = AI 명령창 + 토큰 리스트 + 액션 버튼
- 중앙 = 차트 70% (기존보다 +15%), 인디케이터 바 하단
- 오른쪽 = Verdict HUD + 패턴 분류 결과 (하락/매집/상승전/하락전 %)
- 모든 칸 drag-resize 가능 (SplitPaneLayout 2단 중첩)

**Observe 모드**: 왼쪽+오른쪽 숨김 → 차트 100%  
**Analyze 모드**: 3-rail  
**Execute 모드**: 오른쪽에 주문 패드 추가

---

### 시안 B: "Chart-Dominant"
```
┌──────┬──────────────────────────────────────────────────────────┐
│TOKEN │                                                          │
│LIST  │              CHART (80% width)                          │
│80px  │                                                          │
│icons │   ┌──────────────────────────────────────────┐          │
│only  │   │  VERDICT OVERLAY (glassmorphism)         │          │
│      │   │  BUY  Confidence 72%  [Save Setup]       │          │
│[AI]  │   └──────────────────────────────────────────┘          │
│[SCN] │                                                          │
│[SAV] │  패턴 매칭: 하락 43% / 매집 31% / 상승전 18%           │
└──────┴──────────────────────────────────────────────────────────┘
  80px                    flex:1
```

**특징**:
- 왼쪽 아이콘 사이드바(80px) — 클릭 시 슬라이드 패널
- Verdict가 차트 위 glassmorphism 오버레이
- 패턴 분류는 차트 하단 바로 아래 인라인
- 차트 공간 최대화

---

### 시안 C: "Command-Center"
```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AI: "BTC 오늘 압력구간 찾아줘"  [→]     [Cmd+K 단축키]    │  ← AI Bar (48px)
├─────────────────────────────────────────────────────────────────┤
│  [BTCUSDT ×] [ETHUSDT] [SOLUSDT] [BNBUSDT]  ← 수평 토큰 탭   │  ← Token Tabs (36px)
├──────────────────────────────┬──────────────────────────────────┤
│                              │  PATTERN RESULTS                │
│     CHART                    │  ─────────────────────────────── │
│     (60% height)             │  하락   ████████████  43%        │
│                              │  매집   ████████      31%        │
│  [구간선택 드래그]            │  상승전  █████        18%        │
│                              │  하락전  ██            8%        │
│  [Indicator: VWAP SMA RSI]   │  ─────────────────────────────── │
│                              │  [공유] [저장] [더보기]           │
└──────────────────────────────┴──────────────────────────────────┘
```

**특징**:
- 상단 AI 명령바 전체폭 (항상 보임)
- 수평 토큰 탭 (스크롤 가능, 클릭→차트 로드)
- 하단 좌우 분할: 차트 | 패턴 분류 결과
- 모바일: 세로 스택으로 자동 전환

---

## 테마 / 밀도 시스템

### CSS 변수 구조
```css
/* 테마: data-theme="dark|deep|neon|muted" */
[data-theme="dark"]     { --bg-0: #0b0e14; --accent: #63b3ed; --text-0: #f7f2ea; }
[data-theme="deep"]     { --bg-0: #060810; --accent: #a78bfa; --text-0: #e2e8f0; }
[data-theme="neon"]     { --bg-0: #030508; --accent: #39ff14; --text-0: #ffffff; }
[data-theme="muted"]    { --bg-0: #111318; --accent: #94a3b8; --text-0: #cbd5e1; }

/* 밀도: data-density="compact|cozy|comfortable" */
[data-density="compact"]     { --rail-w: 200px; --row-h: 28px; --font-size: 11px; }
[data-density="cozy"]        { --rail-w: 260px; --row-h: 36px; --font-size: 12px; }
[data-density="comfortable"] { --rail-w: 320px; --row-h: 44px; --font-size: 13px; }
```

---

## North Star 구현 흐름

```
1. 사용자: TerminalCommandBar에 "BTC 매집 구간 찾아줘" 입력
2. AI 응답: token list [BTCUSDT, ETHUSDT, SOLUSDT...] → LeftRail에 표시
3. 사용자: BTCUSDT 클릭 → setActivePair('BTC/USDT') → ChartBoard 로드
4. 사용자: 차트 구간 드래그 (기존 RangePrimitive 활용)
5. 구간 선택 완료 → "유사 패턴 검색" 버튼 활성화
6. fetchSimilarPatternCaptures() 호출 → 결과 분류
7. 분류 결과 (하락/매집/상승전/하락전) → RightRail 또는 오버레이에 표시
8. [공유] 버튼 → URL 파라미터로 share
```

---

## AI Researcher 리스크

### 훈련 데이터 영향
- 레이아웃 변경 자체는 ML 파이프라인 무관
- 패턴 분류 표시 (하락/매집/상승전/하락전) = 기존 `PatternPhase` enum 재활용 → schema 변경 없음

### 통계적 유효성
- 유사 패턴 분류 비율 표시 시 n < 10 이면 "데이터 부족" 표시 필수
- 현재 53 PatternObject corpus → 유사도 매칭 풀 작을 수 있음 (⚠️ WARN)

### 실데이터 검증 시나리오
- 138,915 feature_window rows 기준 유사 패턴 검색 쿼리 부하 → `/api/terminal/pattern-captures/similar` 기존 엔드포인트 재활용

---

## CTO 설계 결정

| 결정 | 내용 |
|---|---|
| [D-0322-1] 레이아웃 store | `$lib/stores/terminalLayout.ts` 신규 (theme + density + layoutMode) — localStorage 지속 |
| [D-0322-2] 시안 A 채택 | 3-Rail Pro — 거래 도구 멘탈모델과 가장 일치. B/C는 이후 테마로 제공 |
| [D-0322-3] CSS 변수 루트 | `+layout.svelte`에 `data-theme`, `data-density` 바인딩 — JS 최소화 |
| [D-0322-4] 토큰 리스트 | TerminalLeftRail 개선 (신규 컴포넌트 없음) — AI 응답 결과를 기존 `queryPresets` 패턴으로 주입 |
| [D-0322-5] 패턴 분류 UI | RightRailPanel 하단에 `PatternClassBreakdown` 섹션 추가 |

---

## Facts (실측)

```bash
# 기존 SplitPaneLayout: ratio 0.4~0.85, localStorage 지속
# - mode='observe': rightPane 숨김
# - mode='analyze': rightPane 표시
# - mode='execute': rightPane 표시

# ModeToggle: $lib/stores/terminalMode store 직접 write
# → W-0317에서 store↔local sync effect 추가 완료 (b0a48805)

# 패턴 유사도: fetchSimilarPatternCaptures() in $lib/api/terminalPersistence
# 패턴 분류: PatternPhase enum (ACCUMULATION_ZONE, SQUEEZE_TRIGGER, etc.)

# 현재 RightRailPanel 너비: flex:1 (고정 없음, SplitPaneLayout ratio=0.72 기준 ~28%)
# LeftRail 너비: 260px 고정 → CSS var(--rail-w)로 교체 예정
```

## Assumptions

- SvelteKit, Svelte 5, lightweight-charts v5.1 환경
- W-0317 SplitPaneLayout 마운트 완료 (✅)
- DogeOS React island은 별도 W-item (본 범위 외)
- 기존 `fetchSimilarPatternCaptures` API 그대로 사용

## Canonical Files

- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/components/terminal/SplitPaneLayout.svelte`
- `app/src/components/terminal/workspace/TerminalLeftRail.svelte`
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte`
- `app/src/lib/stores/terminalLayout.ts` (신규)
- `app/src/routes/terminal/+layout.svelte` (신규 또는 수정)

---

## Exit Criteria

- [ ] E1: 시안 A (3-Rail) 기준 레이아웃 구현 — Observe/Analyze/Execute 3모드 동작
- [ ] E2: SplitPaneLayout drag-resize 양방향 (center↔right) 동작
- [ ] E3: AI 명령 → 토큰 리스트 → 클릭 → 차트 로드 전체 flow 동작
- [ ] E4: 구간 선택 → 패턴 분류 결과 (하락/매집/상승전/하락전) 표시
- [ ] E5: CSS 변수 4 테마 × 3 밀도 = 12 조합 스위치 동작
- [ ] E6: 모바일(≤767px) 세로 스택 레이아웃 동작 + 스크롤 정상
- [ ] E7: svelte-check 0 errors
- [ ] E8: /terminal Playwright smoke — 3모드 전환 + 토큰 클릭 + 차트 로드

## Open Questions

- [ ] [Q-1] 시안 A/B/C 중 어느 것을 기본값으로? → **사용자 결정 대기 (A 추천)**
- [ ] [Q-2] 토큰 리스트 = AI 응답 파싱인가, Scanner 결과 재활용인가? → 현재 scannerAlerts 재활용 권장
- [ ] [Q-3] 패턴 분류 공유 = URL 파라미터? Supabase 공유 링크? → URL 파라미터로 MVP

## Handoff Checklist

- [ ] `terminalLayout.ts` store 신규 작성
- [ ] SplitPaneLayout 2단 중첩 (left ↔ (center | right)) 확장
- [ ] TerminalLeftRail AI 토큰 리스트 모드 추가
- [ ] PatternClassBreakdown 컴포넌트 신규
- [ ] CSS 변수 테마/밀도 시스템 루트 적용
- [ ] 모바일 레이아웃 검증
