# Cogochi 페이지별 제품 설계 V2
> 작성: 2026-05-01 | CPO + UX Designer + GTM Engineer 3-perspective
> 통합: W-0375 설계 + Opus 3-perspective 개선 + 페이지별 설계
> Frozen 전면 해제 (2026-05-01) — TradingView parity, LLM chat, 자동매매, P&L 전부 In-Scope

---

## 0. 설계 기반 (공통)

### 디자인 토큰
```css
--zone-top-bar:    32px;   /* TopBar */
--zone-tab-bar:    24px;   /* TabBar */
--zone-status-bar: 24px;   /* StatusBar */
/* 합계 chrome: 80px */

/* 색상 */
--amb:  #f5a623;   /* amber — active/accent */
--pos:  #4ade80;   /* green — bullish/positive */
--neg:  #f87171;   /* red — bearish/negative */
--g1:   #0c0a09;   /* 배경 최심 */
--g2:   #131110;
--g3:   #1c1918;
--g4:   #272320;
--g5:   #3d3830;   /* 비활성 텍스트 */
--g7:   #9d9690;   /* 보조 텍스트 */
--g9:   #eceae8;   /* 주요 텍스트 */

/* 타이포 */
font-family: 'JetBrains Mono', monospace;
/* 계층: 11px bold(심볼/price) / 10px(라벨) / 9px(보조) / 8px(메타) */

/* 간격 5단계만 */
gap: 1px | 2px | 4px | 6px | 8px;
```

### 공통 컴포넌트 아키텍처
```
AppShell
├── TopBar [32px]          — symbol, TF, chartType, price, IND
├── TabBar [24px]          — 탭목록, OBS|ANL|EXE (우측끝), split ⊞
├── main-row
│   ├── WatchlistRail [160px]
│   ├── WorkspaceStage [flex-1]
│   │   └── mode별: TradeMode | TrainMode | FlywheelMode
│   └── AIAgentPanel [280px]
│       └── tabs: AI | ANL | SCN | JDG | PAT
└── StatusBar [24px]       — mode(TRADE/TRAIN/FLY), scanner, verdicts, drift, shortcuts, clock
```

### 공유 스토어
```ts
// app/src/lib/cogochi/cogochi.data.store.ts (신규, W-0375 Phase 2)
cogochiDataStore: {
  analyzeData: AnalyzeData | null;
  domLadderRows: DomRow[];
  phaseTimeline: PhasePoint[];
  scanCandidates: ScanCandidate[];
  scanProgress: number;
  entryPlan: EntryPlan | null;
}
// TradeMode = producer / AnalyzePanel|ScanPanel|JudgePanel|AIAgentPanel = consumer
```

### Analytics 공통 이벤트 (analytics.ts 신규)
```ts
workmode_switch       { from, to, trigger }
rightpanel_tab_switch { from, to }
analyze_panel_view    { symbol, timeframe }
verdict_submit        { agree, pattern_slug, latency_ms }
topbar_tf_switch      { from, to, latency_ms }
cogochi_legacy_toggle { enabled }
page_view             { route, referrer }
cta_click             { cta_id, page, context }
```

---

## P-01. `/` — Landing

### 현황
WebGL ASCII 배경, HomeHero, HomeSurfaceCards, HomeLearningLoop, HomeFinalCta. GTM 이벤트 부분적.

### CPO
제품 정체성: "당신의 직관을 데이터로 검증하는 전문가 트레이딩 OS"
- 초보자 교육 아님. 진지한 트레이더 (암호화폐 하루 1시간+) 대상
- 핵심 가치 증명: live accuracy%, verdict count, 참여 트레이더 수 — 숫자로만
- CTA 2개: **"무료로 시작"** (signup → /cogochi) + **"패턴 라이브러리 보기"** (/patterns)
- 내비게이션 없는 풀스크린 진입 경험 유지

### UX Spec
```
┌─────────────────────────────────────────────────────────┐
│ COGOCHI                              [로그인]  [무료 시작]│
├─────────────────────────────────────────────────────────┤
│                                    ┌──────────────────┐ │
│  당신의 패턴이                      │ BTC 4H           │ │
│  실제로 작동하는가                  │ [미니 라이브 차트]  │ │
│  지금 검증하세요.                   │ 77,270  +1.2%    │ │
│                                    │ 패턴: bull_flag   │ │
│  [무료로 시작 →]                    │ 정확도: 89%      │ │
│  [패턴 라이브러리]                  └──────────────────┘ │
├─────────────────────────────────────────────────────────┤
│  Live 지표 (실시간 업데이트):                             │
│  ● 정확도 67.3%  ● verdict 2,847개  ● 트레이더 143명    │
├─────────────────────────────────────────────────────────┤
│  3단계 루프                                              │
│  1. ANALYZE — 차트 분석 + AI 해석                        │
│  2. CAPTURE — 패턴 기록                                  │
│  3. VERDICT — 결과 검증 → 실력 지표                      │
├─────────────────────────────────────────────────────────┤
│  BTC ETH SOL BNB ... [실시간 스캔 ticker strip]          │
├─────────────────────────────────────────────────────────┤
│  [무료로 시작하기] — 카드 불필요, 5초 가입               │
└─────────────────────────────────────────────────────────┘
```

**인터랙션:**
- ASCII 배경: 마우스 따라 파동, 모바일은 static (성능)
- ticker strip: 자동 스크롤, hover pause
- live 지표: 30초 갱신 (WebSocket or polling)
- 모바일: hero + CTA만, 미니 차트 숨김

**상태:**
- 로딩: skeleton (지표 영역)
- 비로그인 default

### GTM
```
track('cta_click', { cta_id: 'hero_start' | 'hero_patterns' | 'footer_start', page: '/' })
track('page_view', { route: '/', referrer: document.referrer })
track('home_scroll_depth', { pct: 25 | 50 | 75 | 100 })
track('ticker_symbol_click', { symbol })
```
- Funnel: Landing → Signup → `/cogochi` 첫 analyze → 첫 verdict (D+1 목표 = verdict 1개)
- SEO: title "Cogochi — 패턴 검증 트레이딩 OS", OG image = 라이브 accuracy% 다이나믹

---

## P-02. `/cogochi` — 메인 터미널 ★ (핵심)

### 현황
AppShell → WorkspaceStage → TradeMode(4258L) | TrainMode | FlywheelMode

### CPO
이 페이지가 제품 그 자체. DAU 체류 시간 = 핵심 KPI.
- TRADE: 지금 이 심볼 어떻게 볼 것인가
- TRAIN: 과거 패턴으로 직관 훈련
- FLYWHEEL: 통계 돌아보기 + 다음 개선점

### UX Spec — TopBar
```
[BTC▾] [4H]  1m 3m 5m 15m 30m 1h 4h 1D  CNDL LINE HA BAR  77,270 +1.2%  [IND] [⚙]
↑symbol      ↑TF strip (amber underline active)  ↑chartType     ↑price(pos)  ↑drawer
```
- symbol 클릭 → SymbolPickerSheet
- IND 클릭 → IndicatorLibrary drawer (W-0374 D-4)
- price: liveTickStore, change%: dailyChangePct, 색상 pos/neg/g6

### UX Spec — TabBar
```
[BTC×] [ETH×] [+]    ░░░░░░░░░░░░░░░░    [OBS][ANL][EXE]  [⊞]
↑탭목록                ↑공간              ↑workMode(우측끝) ↑split
```
- 탭: 드래그 재정렬, × 닫기, + 신규
- workMode: amber active, ⌘1/2/3 shortcut
- 첫 진입: amber pulse 1.5s + tooltip "OBS·ANL·EXE를 ⌘1/2/3로 전환"

### UX Spec — TRADE mode 레이아웃
```
┌────────────────────────────────────┬────────────────────┐
│ WatchlistRail [160px]              │ AIAgentPanel [280px]│
│ BTC  77,270 +1.2%                  │ [AI][ANL][SCN][JDG][PAT]│
│ ETH  3,421  -0.3%                  │                    │
│ SOL  142    +2.1%                  │ AI탭: context LLM  │
│ [+심볼추가]                         │ "BTC 4H 분석해줘"  │
├────────────────────────────────────│ → analyzeData inject│
│ chart-controls-bar [28px]:         │                    │
│ fund:0.012% OI CVD  CNDL/HM/FP    │ ANL탭: AnalyzePanel│
│ ●●●○○ conf:67%  [SAVE RANGE]      │ SCN탭: ScanPanel   │
├────────────────────────────────────│ JDG탭: JudgePanel  │
│                                    │  entry/SL/TP + R:R │
│     Chart (full bleed)             │  [EXECUTE] (Ph2)   │
│                                    │                    │
│  indicator overlays                │ PAT탭: PatternList │
│  drawing tools (left edge)         │                    │
└────────────────────────────────────┴────────────────────┘
StatusBar: [TRADE TRAIN FLY] │ ● 300sym 14s │ verdicts<17> │ +0.024 │ ⌘B ⌘K ⌘T │ 14:23
```

**AIAgentPanel 탭 상세:**
- AI: AIPanel (LLM chat, analyzeData + symbol + TF 자동 주입)
- ANL: AnalyzePanel (phase timeline, DOM ladder, evidence table, confidence)
- SCN: ScanPanel (후보 리스트, similarity %, age)
- JDG: JudgePanel (entry plan, R:R, SL/TP, EXECUTE 버튼 placeholder Phase 2)
- PAT: PatternList (inline fetch, symbol/TF/verdict 3col)

**빈 상태:**
- ANL: analyzeData=null → "분석 중…" skeleton 3행 → 5s후 "데이터 없음 · ⌘R"
- SCN: candidates=0 → "스캔 대기 · 다음 cycle 14s" countdown
- JDG: entryPlan=null → "신호 없음 · ANL에서 분석 시작"

### UX Spec — TRAIN mode
```
┌─────────────────────────────────────────────────────────┐
│ [차트 2/3 표시 — 나머지 가림]                             │
│                                                         │
│  QUIZ: 다음 4개 바의 방향은?                              │
│  [▲ 상승]    [▼ 하락]    [━ 횡보]                        │
├─────────────────────────────────────────────────────────┤
│ 진행: ██████░░░░ 6/10    streak: 🔥4    pattern: bull_flag│
└─────────────────────────────────────────────────────────┘
```

### UX Spec — FLYWHEEL mode
```
RadialTopology (기존) + 우측:
┌────────────────────────┐
│ 내 통계 (30일)          │
│ accuracy 67.3% ▲2.1%   │
│ verdict 47개           │
│ 최강: bull_flag 89%    │
│ 약점: bear_wedge 54%   │
│                        │
│ 추천:                   │
│ ETH 1h — 2패배 복습 필요│
│ [→ TRAIN 시작]          │
└────────────────────────┘
```

**로컬 storage migration (D-0009 / Spec-8):**
```ts
const RIGHT_PANEL_MIGRATION = {
  'research': 'decision',
  'verdict':  'judge',
  'pattern':  'pattern',
  'decision': 'decision',
};
// migration version key: cogochi.migration.v = 2
// ?cogochi_legacy=1 → 7일간 구버전 chrome 렌더
```

### GTM
```
track('analyze_panel_view', { symbol, timeframe })
track('workmode_switch', { from, to, trigger: 'click'|'kbd' })
track('rightpanel_tab_switch', { from, to })
track('verdict_submit', { agree, pattern_slug, latency_ms })
track('topbar_tf_switch', { from, to, latency_ms })
track('train_session_complete', { score, streak, pattern })
track('flywheel_recommendation_click', { pattern, suggested_mode })
```
- Retention hook: "3일 연속 verdict → StatusBar amber dot 뱃지"
- D+1: 첫 analyze → 첫 verdict 완료가 핵심 activation 지표

---

## P-03. `/dashboard` — 대시보드

### 현황
1244줄, 내부 지표 중심, AdapterDiffPanel, passport summary, flywheel health

### CPO
역할 재정의: "오늘 뭘 해야 하는가" = 행동 유도판
- 3 zone: **지금 기회** / **내 성과** / **시스템 상태**
- 내부 지표(AdapterDiff 등) → settings/status로 이동

### UX Spec
```
┌─────────────────────────────────────────────────────────┐
│ 오늘의 기회                              [→ 전체보기]    │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│ │ BTC 4H ↑    │ │ ETH 1H ↓    │ │ SOL 15m ↑   │     │
│ │ bull_flag   │ │ bear_wedge  │ │ doji_break  │     │
│ │ 신뢰도 89%  │ │ 신뢰도 76%  │ │ 신뢰도 71%  │     │
│ │ [분석하기]  │ │ [분석하기]  │ │ [분석하기]  │     │
│ └──────────────┘ └──────────────┘ └──────────────┘     │
├──────────────────────────┬──────────────────────────────┤
│ 내 통계 (30일)            │ 시스템 상태                  │
│ verdict  47개             │ ● scanner live 300심볼       │
│ 정확도   67.3% ▲2.1%     │ ● engine 정상                │
│ 연속     12일 🔥          │ 마지막 sync: 14:22:00        │
│ 최강 패턴: bull_flag 89%  │ ● feed BTC/USDT ✓           │
├──────────────────────────┴──────────────────────────────┤
│ 최근 활동                                                 │
│ bull_flag +3개  2h ago    │ BTC 4H ✓ verdict +0.8%      │
│ bear_wedge +1개 6h ago    │ ETH 1H ✗ verdict -0.3%      │
└─────────────────────────────────────────────────────────┘
```

**"분석하기" 버튼** → `/cogochi?symbol=BTC&tf=4h&pattern=bull_flag`

### GTM
```
track('dashboard_opportunity_click', { symbol, pattern, rank, confidence })
track('dashboard_view', { opportunities_count, streak })
```
- D+1 / D+7 retention: 대시보드 방문 = 활성 지표로 사용
- 기회 카드 클릭 = cogochi 재진입 트리거 (가장 중요한 버튼)

---

## P-04. `/patterns` — 패턴 라이브러리

### 현황
612줄, /search + /benchmark + /lifecycle + /strategies 분산 라우트

### CPO
패턴 = 제품의 "지식 자산". TV indicator 라이브러리처럼 브라우징 가능해야 함.
분산된 sub-route → 단일 페이지 tab으로 통합.

### UX Spec
```
패턴 라이브러리     [🔍 검색...]  [정렬: accuracy▾]  [방향 ▾]
[목록] [벤치마크] [라이프사이클] [전략]              ← 탭 (sub-route 통합)

├──────────┬────────────────────────────────────────────┤
│ bullish  │ bull_flag                                  │
│ 22개     │ accuracy 89% · 47 verdicts · 최근 2h       │
│          │ ████████████████░░░░ bullish continuation  │
│ bearish  │ [→ cogochi 분석] [상세 보기]                │
│ 18개     │ ──────────────────────────────────         │
│          │ bear_wedge                                 │
│ neutral  │ accuracy 73% · 31 verdicts · 최근 6h       │
│ 12개     │ ████████████░░░░░░░░ bearish reversal      │
│          │ [→ cogochi 분석] [상세 보기]                │
└──────────┴────────────────────────────────────────────┘
```

### GTM
```
track('pattern_list_view', { filter, sort, count })
track('pattern_to_cogochi_click', { slug, rank_in_list })
track('pattern_detail_view', { slug })
```
- SEO: 각 패턴 slug = 별도 랜딩 페이지 (google "bull_flag 암호화폐")
- 비로그인: 목록 읽기 O, cogochi 링크 클릭 → signup CTA

---

## P-05. `/patterns/[slug]` — 패턴 상세

### UX Spec
```
bull_flag                                     [★ 즐겨찾기] [cogochi에서 분석 →]
accuracy 89% · verdict 47개 · 최근 2h

── 정의 ────────────────────────────────────
강한 상승 후 기 휴식 → 돌파. bullish continuation.
발생 TF: 1h / 4h 최빈.

── 전체 통계 ───────────────────────────────
win rate 89%   avg R:R 1.8×   hold time 4.2h avg
최다 심볼: BTC (23회)  최다 TF: 4H (31회)

── 내 통계 (로그인 시) ──────────────────────
내 accuracy 82% (전체 대비 -7%)
내 verdict 12개   best: BTC 4H ✓×6연속

── 최근 capture ─────────────────────────────
BTC 4H  2h ago  ✓ agree  +0.8%
ETH 1H  6h ago  ✓ agree  +0.3%
SOL 15m 1d ago  ✗ disagree -0.2%
```

### GTM
- SEO: `<title>bull_flag 패턴 분석 — 정확도 89% | Cogochi</title>`
- `track('pattern_share_click', { slug })`
- 비로그인 → 내 통계 "로그인하면 내 성과 확인" overlay

---

## P-06. `/verdict` — Verdict 제출 (딥링크)

### 현황
243줄, token 파싱, 만료/상태 처리. Telegram 딥링크 진입.

### CPO
속도가 전부: **3초 내 agree/disagree → 제출 완료**.
모바일 first (딥링크는 거의 모바일에서 열림).

### UX Spec
```
모바일 풀스크린:

  ┌────────────────────────────────┐
  │ BTC 4H · bull_flag             │
  │ ──────────────────────────────│
  │ [미니 차트 — 캡처 시점]        │
  │ ──────────────────────────────│
  │ AI: "강한 지지 + 거래량 급증.  │
  │ bullish 진입 확률 89%."        │
  │ ──────────────────────────────│
  │                                │
  │  [✓ 동의]        [✗ 이견]      │
  │  (tap anywhere left/right)     │
  │                                │
  │  만료까지  2h 14m              │
  └────────────────────────────────┘

제출 완료:
  ┌────────────────────────────────┐
  │ ✓ Verdict 기록됨               │
  │ BTC 4H bull_flag — 동의        │
  │                                │
  │ [cogochi에서 더 분석하기 →]    │
  └────────────────────────────────┘
```

**상태 처리:**
- loading: spinner (< 500ms 목표)
- expired: "만료됨 · cogochi에서 새 분석 시작"
- invalid token: "유효하지 않은 링크"
- submitted: 완료 + cogochi CTA

**제스처:** 좌/우 스와이프 = disagree/agree (모바일)

### GTM
```
track('verdict_submitted', { method: 'deeplink', agree, latency_ms })
track('verdict_to_cogochi_click')
track('verdict_expired_view')
```
- 비로그인 → 제출 시도 → wallet modal (로그인 후 자동 제출)

---

## P-07. `/settings` — 설정

### CPO
Thin. 핵심만: tier upgrade + API 키 (자동매매 Phase 2 준비).

### UX Spec
```
[프로필] [알림] [연결] [구독] [API키]

── 구독 ──────────────────────────────────
현재: Free
  └ verdict 10개/일, 패턴 52개, 실시간 스캔 X

  [Pro $29/mo →] verdict 무제한, 실시간 스캔, API access

Pro: $29/mo
  └ 전체 기능 + API
  [업그레이드]

── API 키 (Pro+) ──────────────────────────
Binance   ●●●●●●●● [수정] [삭제]
Bybit     미연결   [+ 연결]

자동매매 모드:  OFF  ·  개발 중 (Phase 2)  [알림 신청]

── 알림 ──────────────────────────────────
Telegram: @username 연결됨  ✓
패턴 감지 알림: ON
verdict 마감 알림: ON  (만료 30분 전)
```

### GTM
```
track('settings_upgrade_click', { from_tier, to_tier })
track('api_key_saved', { exchange })
track('auto_trade_notify_signup')  // Phase 2 대기
```

---

## P-08. `/passport` — 트레이더 패스포트

### CPO
트레이더의 성과 증명서 + 공유 가능한 퍼블릭 URL.
정체성 형성 → 자부심 → 재방문 + 바이럴.

### UX Spec
```
@username                           [공유하기] [설정]
Silver Trader 🥈  · 가입 30일

accuracy  67.3%  (전체 58.7% 대비 ▲8.6%)
verdict   203개
연속       12일 🔥
최강 패턴  bull_flag 89%

── 배지 ──────────────────────────────────
[7일 연속] [첫 50 verdict] [정확도 70%+] [잠금: Gold 100개+]

── 패턴별 성과 ───────────────────────────
bull_flag   89%  47ver  ▲+12%
bear_wedge  71%  31ver  ▼-2%
doji_break  61%  18ver  ━±0%

── 최근 활동 ─────────────────────────────
BTC 4H ✓  2h ago  +0.8%
ETH 1H ✗  6h ago  -0.3%

[cogochi 열기]
```

**퍼블릭 URL:** `/passport/[username]` — 비로그인 접근 가능
- 내 통계 full 공개 or 비공개 toggle (설정에서)
- 비로그인 방문자: "나도 만들기 →" CTA

### GTM
```
track('passport_share_click', { via: 'twitter'|'copy'|'telegram' })
track('passport_public_view', { viewer_is_auth })
track('passport_to_signup_click')  // 비로그인 방문 → 가입
```

---

## P-09. `/lab` — 실험실

### CPO
Phase 1: 내부/파워유저 도구.
Phase 2: Pro+ 기능 공개 (백테스트, custom indicator, Pine Script).

### UX Spec
```
[Analyze] [Backtest] [Pine Editor Pro+] [Research]

── Analyze ──────────────────────────────
심볼: [BTC    ] TF: [4H▾]  [분석 실행]

결과 JSON 트리 (분석가/개발자용):
{
  pattern_slug: "bull_flag",
  confidence: 0.892,
  phase: 3,
  evidence: [...]
}

── Backtest (Pro+) ──────────────────────
전략 선택 + 기간 → 백테스트 실행 → 수익률 그래프
```

**Free 유저 진입 시:** "이 기능은 Pro+에서 제공됩니다" overlay + 업그레이드 CTA

### GTM
```
track('lab_feature_gate_hit', { feature, user_tier })
track('lab_backtest_run', { strategy, period })
```

---

## P-10. `/agent`, `/agent/[id]` — AI 에이전트

### 현황
에이전트 목록 + 상세 페이지

### CPO
자동매매 Phase 2 + 커스텀 AI 전략 진입점.
현재: 내부 도구. 추후: Pro+ 기능으로 전환.

### UX Spec
```
내 에이전트                              [+ 새 에이전트]

┌──────────────────────────────────────────────────┐
│ Bull Flag Hunter                    ● 활성        │
│ bull_flag 패턴 감지 → 자동 알림     24시간 전 시작  │
│ 정확도 87%  알림 23회  [상세] [중지] [편집]        │
└──────────────────────────────────────────────────┘
```

---

## 우선순위 로드맵

| W | 페이지 | 내용 | 상태 |
|---|---|---|---|
| **W-0375** | `/cogochi` | chrome purge + TradeMode 분해 | 🟡 설계 완료 |
| **W-0376** | `/dashboard` | 행동 유도판 재구성 | 📋 설계 필요 |
| **W-0377** | `/verdict` | 모바일 first + 스와이프 | 📋 설계 필요 |
| **W-0378** | `/patterns` | sub-page 통합 + SEO | 📋 설계 필요 |
| **W-0379** | `/passport` | 공유 URL + 배지 | 📋 설계 필요 |
| **W-0380** | `/` | copy 개선 + GTM 완성 | 📋 설계 필요 |
| **W-0381** | `/settings` | API 키 + tier upgrade | 📋 설계 필요 |

---

## W-0375 실행 통합 요약

위 P-02 설계 기준으로 W-0375 구현 우선순위:

**Phase 1 (4h):** TopBar price/change% + chart-header symbol/TF 제거
**Phase 2 (10h):** cogochi.data.store.ts + AnalyzePanel/ScanPanel/JudgePanel 추출
**Phase 3 (8h):** AIAgentPanel 5탭 재편 + analytics.ts + localStorage v2
**Phase 4 (4h):** TabBar workMode 우측 + StatusBar 유지 + CommandBar unused
**Phase 5 (4h):** 빈 상태 3종 + 밀도 토큰 + CI

**확정 결정 (D-0007~D-0010):**
- D-0007: mode(trade/train/fly) vs workMode(obs/anl/exe) 분리 유지
- D-0008: TradingView parity 해제 — 이제 full parity 목표
- D-0009: 즉시 cutover + ?cogochi_legacy=1 (7일 escape hatch)
- D-0010: workMode = TabBar 우측 끝 (StatusBar 충돌 해소)
