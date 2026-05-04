# W-0402 — Terminal/Cogochi UX 재설계 (CSS Grid + Design Tokens + AI Agent 통합)

> Wave: 6 | Priority: P1 | Effort: XL (16 PRs)
> Charter: In-Scope L1 (Terminal/Cogochi surface)
> Status: 🟡 Design Approved — Implementation In Progress
> Created: 2026-05-04

## Goal

사용자가 차트 + 데이터 + AI를 한 화면에서 단일 시각 위계로 본다. 패널은 fold/wide 자유, 디자인 토큰 통일, AI 슬래시 커맨드로 모든 분석 진입.

## Scope

- 포함: `app/src/lib/hubs/terminal/**`, `app/src/routes/cogochi/**`, `app/src/routes/dashboard/**`, `app/src/routes/patterns/**`, `app/src/lib/styles/**`
- API: 신규 없음 (UI 재배치 + 토큰 + 이벤트 버스)
- 신규 이벤트: `cogochi:ai-ask`, GTM `wave6.ai_ask`, `wave6.tab_switch`

## Non-Goals

- 신규 백엔드 API (W-0404 트랙)
- 모바일 native 앱
- 다크/라이트 테마 분기 (단일 다크 유지)

---

## §1. 디자인 토큰 (PR1 — 모든 PR의 기반)

### 1.1 Type Scale (5단계)
```
--type-xs: 10px / 14px line   /* L3 micro labels */
--type-sm: 12px / 16px line   /* L2 metrics, body */
--type-md: 14px / 20px line   /* L1 default, buttons */
--type-lg: 18px / 24px line   /* hero numbers */
--type-xl: 24px / 32px line   /* dashboard hero */
```

### 1.2 Spacing Scale
```
--sp-1: 4px   --sp-2: 8px   --sp-3: 12px
--sp-4: 16px  --sp-5: 24px  --sp-6: 32px
```

### 1.3 Color Tier
```
--text-primary:   #e8ebf0
--text-secondary: #9aa3b2
--text-tertiary:  #5a6172

--accent-pos: #26d07a   /* LONG, gain */
--accent-neg: #ff5a4f   /* SHORT, loss */
--accent-amb: #f5b942   /* AVOID, neutral, active state */

--surface-0: #0c0e12     /* base bg */
--surface-1: #14171c     /* panel bg */
--surface-2: #1c2026     /* elevated card */
--border-subtle: #232830
```

### 1.4 Density Mode
```
[data-density=compact]      → --sp-base: 4px
[data-density=comfortable]  → --sp-base: 8px (default)
```
모든 패널 padding은 `--sp-base` 배수.

---

## §2. 전체 CSS Grid 구조 (PR2)

```css
.app-shell {
  display: grid;
  grid-template-rows: 40px auto 1fr 28px;
  grid-template-columns:
    var(--watch-w, 200px)    /* WatchlistRail */
    40px                     /* DrawingRail (항상) */
    1fr                      /* ChartArea */
    var(--ai-w, 320px);      /* AIAgentPanel */
  grid-template-areas:
    "topbar    topbar topbar topbar"
    "news      news   news   news"
    "watchlist draw   chart  ai"
    "statusbar statusbar statusbar statusbar";
  height: 100dvh;
}

[data-watch=folded]  { --watch-w: 20px; }
[data-ai=folded]     { --ai-w: 20px; }
[data-ai=wide]       { --ai-w: 480px; }
```

---

## §3. TopBar (40px, L1 6-slot 압축) (PR4)

**디자이너 리뷰 C1 반영**: TF 8개 + 차트타입 4개를 chip popover로 collapse.

```
[BTC/USDT▾] │ [4H▾] │ [Candle▾] │ 95,650 +1.2% H L Vol $1.2B │ OI/FR/Kim │ ──flex── │ 🔔3 ⚙
```

| 슬롯 | 너비 | 클릭 동작 |
|---|---|---|
| Symbol | 80px | SymbolPicker modal |
| TF chip (현재 TF만 표시) | 48px | popover → 8 TF |
| Type chip | 60px | popover → Candle/HA/Bar/Line/Area |
| Price block + OHLC + L2 quant | flex | (≤1024px hidden, ≤1280px Vol/Kim hidden) |
| 알림 dot | 32px | inbox surface |
| 설정 | 32px | settings sheet |

L2 quant strip(OI/FR/Kim) 별도 row → TopBar 통합. NewsFlashBar는 별도 22px row 유지.

---

## §4. NewsFlashBar (22px) (PR4 부속)

`auto` height. 뉴스 없으면 `display:none`.

---

## §5. WatchlistRail (200/20px) (PR2 부속)

200px 펼침 시: 헤더 28px + items 44px (심볼/변화율/가격/sparkline) + Whales 섹션 collapsed.
20px strip 시: 중앙 `[>]` 버튼.
단축키 `[`.

---

## §6. DrawingRail (40px 고정) (PR2 부속)

세로 아이콘 컬럼 — cursor/trend/horizontal/rectangle/fib/pitchfork/text + undo/redo/clear.
36×36 button, active = amber bg + border. `shellStore.drawingTool` 반영.

---

## §7. ChartArea (PR2 + PR11 drag-to-save)

Internal flex column:
- ChartToolbar 36px (TF popover trigger / Type popover / +Indicator / DRAW / Snap / ⚙ / Save)
- TabBar 32px (탭 ≥2 일 때만)
- ChartCanvas flex:1 + PaneInfoBar overlay (per pane)

### Drag-to-save (PR11)
`Save` 클릭 → range mode → drag → mouseup toast (5s):
```
BTC/USDT 5m  2026-05-04 14:00 → 15:30
[💾 저장] [🔍 패턴 찾기] [📝 Draft] [✕]
```

---

## §8. AIAgentPanel 3-state 320/480/20px (PR3 + PR6 + PR10)

### 8.1 펼침 320px 구조 (PR3)

```
[DEC] [PAT] [VER] [RES] [JDG]    ← 40px tab strip
─────────────────────────────────
🔍 AI search... (⌘L)              ← 32px sticky input
─────────────────────────────────
[active tab content scroll]
```

### 8.2 5 탭 인라인 (PR3)

- **Decision**: Direction badge + Confidence% + top 3 SourcePill + `→ 더 보기`
- **Pattern**: 매칭 카드 5개 + 라이브러리 링크
- **Verdict**: 최근 알림 10개 + VIEW 버튼
- **Research**: 쿼리 입력 + 마지막 분석 3줄 요약
- **Judge**: 진입 승률 / 회피 적중 (7일) + 전체 기록

### 8.3 Drawer slide-out 320px (PR10)

`→ 더 보기` 클릭 → 패널 우측 320px slide → 총 640px. 탭별 L3 컨텐츠.

### 8.4 상단 AI input + 슬래시 커맨드 (PR6)

placeholder 회전 4초마다:
- "AI에 물어보기..."
- "/scan funding<0"
- "/why BTC"
- "/judge 최근 7일"

슬래시 매핑 (PR6 + PR7 listener):
| 입력 | 액션 |
|---|---|
| `/scan ...` | Research 탭 활성, intent=scan |
| `/why <symbol>` | Decision 탭 활성, intent=why |
| `/judge ...` | Judge 탭 활성 |
| `/recall ...` | Pattern 탭 활성, intent=recall |
| `/inbox` | Verdict 탭 활성 |
| 자연어 ("비슷한 패턴") | NLU intent → 해당 탭 |

이벤트: `window.dispatchEvent(new CustomEvent('cogochi:ai-ask', { detail: { intent, query } }))`.
GTM: `wave6.ai_ask` (intent, query_len) + `wave6.tab_switch` (from, to, source).

---

## §9. StatusBar (32px, Tier 분리) (PR5)

**디자이너 C2 반영**: 24px → 32px(코드 실측), L2 항상 표시 / L3 hover-expand.

| 항상 표시 | hover/expand 표시 |
|---|---|
| F60 mini gate | FR (BTC funding) |
| Freshness ↻ | Kimchi premium |
| mini Verdict | HoldTime p50/p90 |
| Drift indicator | scanner detail |
| Time | system health detail |

---

## §10. /dashboard Hero re-weight (PR12)

**디자이너 M2 반영**: Streak 60% width hero, Wallet/Tier sub-row.

```
┌────────────────────────────────────────────┐
│ 🔥 STREAK 12 days  → next: 14 (2 more)    │  ← 60%
├────────────────────────────────────────────┤
│ Wallet $5,420 │ Pro Tier │ Verdicts 47    │  ← 40% sub-row
└────────────────────────────────────────────┘
```

---

## §11. /patterns 3-column 재배치 (PR13)

**디자이너 M3 반영**: Detail + VerdictInbox 같은 영역 탭/스택.

```
[Filter 200] [Grid auto] [Detail/Inbox 320 (탭)]
```
≤1280px에서 Detail 탭 활성 시 Inbox는 stack 하단. ≥1440px에서만 두 영역 분리 옵션.

---

## §12. Mobile 5-region (PR14)

**디자이너 M4 반영**: 8-region → 5-region.

```
TopBar 40
ChartCanvas flex:1   (DrawingStrip floating overlay)
TabBar 32
Content auto
BottomNav 56          (StatusBar 흡수, TabStrip 통합)
```
DrawingStrip은 차트 위 floating, 평소 숨김 → DRAW 모드에서만 표시.

---

## §13. Settings 3-tab 축소 (PR15)

**디자이너 M5 반영**: 7탭 → 3탭(Account / Notifications / Display). 나머지는 후속.

---

## §14. /scanner /terminal redirect (PR8)

`/scanner` → `/cogochi?panel=scn` 301
`/terminal` → `/cogochi` 301
QS preserve.

---

## §15. Component→Zone 테이블 dup 정리 (PR16)

**디자이너 C3 반영**: 기존 dup 7행 제거 + unique count 재계산.

---

## §16. Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| CSS Grid 전환 시 패널 깨짐 | 중 | 높음 | PR2 별 점진 마이그레이션 + visual regression test |
| 디자인 토큰 누락 색상 | 높 | 중 | PR1 토큰 머지 후 grep로 raw hex 잔존 검출 |
| AIAgent 슬래시 커맨드 NLU 오분류 | 중 | 낮 | 명시 슬래시 우선 + fallback intent log |
| ChartBoardHeader observe-mode CSS 충돌 | 중 | 중 | M6 — `.chart-header--tv` 숨김 케이스 회귀 테스트 |
| Mobile 5-region에서 DrawingStrip 누락 | 낮 | 중 | floating overlay + DRAW 모드 토글 |

---

## §17. PR 분해 (16개)

> 각 PR ≤ 8 files, 독립 배포 가능. 순서: 토큰 → grid 기반 → 패널 통합 → 슬래시 → 마이그레이션 → 폴리시.

| # | PR 제목 | 파일 | 의존 |
|---|---|---|---|
| **PR1** | Design tokens (type/spacing/color/density) | ≤4 | — |
| **PR2** | `.app-shell` CSS Grid 4-column + Watchlist/Drawing 분리 | ≤8 | PR1 |
| **PR3** | AIAgentPanel 3-state shell (320/480/20) + 5탭 인라인 | ≤6 | PR2 |
| **PR4** | TopBar L1 6-slot 압축 + L2 quant 통합 + popover | ≤6 | PR1 |
| **PR5** | StatusBar 32px + Tier 분리 (always/hover) + mini-verdict | ≤4 | PR1 |
| **PR6** | /cogochi 상단 AI input + placeholder 회전 + 슬래시 파서 | ≤4 | PR3 |
| **PR7** | Panel listeners — cogochi:ai-ask → 탭별 query 실행 | ≤6 | PR6 |
| **PR8** | /scanner /terminal → /cogochi 301 redirect (QS preserve) | ≤4 | — |
| **PR9** | GTM dual-emit `wave6.ai_ask` + `wave6.tab_switch` schema | ≤3 | PR6 |
| **PR10** | AI Drawer slide-out 320px (5탭 L3 컨텐츠) | ≤6 | PR3 |
| **PR11** | Drag-to-save toast + chartSaveMode 진입 | ≤5 | PR2 |
| **PR12** | /dashboard hero re-weight (Streak 60%) | ≤3 | PR1 |
| **PR13** | /patterns 3-column (Detail/Inbox 탭 stack) | ≤4 | PR1 |
| **PR14** | Mobile 5-region (BottomNav 흡수, Drawing floating) | ≤6 | PR2 |
| **PR15** | Settings 7→3 탭 축소 | ≤4 | PR1 |
| **PR16** | Component→Zone 테이블 dup 정리 (docs only) | ≤2 | — |

---

## §18. Exit Criteria (Wave-level)

- [ ] 모든 PR1-16 머지
- [ ] 코드 내 raw hex 색상 0건 (PR1 토큰만 사용)
- [ ] CSS Grid app-shell 단독 layout (flex column 잔재 0)
- [ ] AIAgentPanel `--ai-w` 토큰 3-state 동작 (Lighthouse layout shift = 0)
- [ ] 슬래시 커맨드 6종 + 자연어 1건 vitest PASS
- [ ] /scanner /terminal 301 — playwright redirect 통과
- [ ] GTM `wave6.ai_ask` payload Zod schema PASS, 0 PII
- [ ] Mobile (iPhone 14, 844pt) 차트 ≥ 480pt 확보
- [ ] Settings 3-tab — 기존 7-tab 항목 후속 issue 분리

---

## §19. 디자이너 리뷰 매핑

| 코멘트 | 반영 PR |
|---|---|
| C1 TopBar 12+ 슬롯 → 6 | PR4 |
| C2 StatusBar 24→32 + Tier 분리 | PR5 |
| C3 Component→Zone dup 정리 | PR16 |
| M1 Type/Spacing/Color/Density 토큰 | PR1 |
| M2 dashboard hero re-weight | PR12 |
| M3 patterns 3-column | PR13 |
| M4 Mobile 5-region | PR14 |
| M5 Settings 3-tab | PR15 |
| M6 ChartBoardHeader observe-mode 회귀 | Risk Matrix + PR2 테스트 |
| M7 TopBar 알림 dot 간격 명시 | PR4 wireframe 주석 |

---

## §20. Open Questions

- [ ] [Q-7401] 슬래시 NLU — 정규식 1차 + 임베딩 fallback? 또는 정규식만? (PR6 결정)
- [ ] [Q-7402] AI Drawer 320px slide — `position:absolute` vs grid-column 확장? (PR10 결정)
- [ ] [Q-7403] Mobile floating DrawingStrip — 차트 위 어느 모서리? (PR14 wireframe)
- [ ] [Q-7404] Density 토글 위치 — Settings? StatusBar? (PR15)
