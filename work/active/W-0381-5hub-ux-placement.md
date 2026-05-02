# W-0381 — 5-Hub Per-Page UX Placement & Information Hierarchy

> Wave: 5 | Priority: P1 | Effort: L (5d)
> Charter: In-Scope (Frozen 전면 해제 2026-05-01)
> Status: 🟡 IN PROGRESS — 2026-05-02
> Parent: W-0374 Bloomberg UX Restructure
> 선행 의존: PR #869 (D-8 mobile) 머지 후 착수

## Goal

5개 Hub 각각에서 트레이더가 페이지 진입 즉시 L1 정보(가격/결정/신호)를
스크롤 없이 읽고, 다음 행동을 1-click으로 수행한다.

## 설계 원칙

| 원칙 | 내용 |
|---|---|
| Bloomberg 3-tier | L1 항상 노출 / L2 peripheral / L3 on-demand |
| TradingView 타이포 | 최소 11px tabular-nums, 가격 14px bold, 변화율 12px |
| 1-click next action | 각 페이지 진입 후 다음 행동까지 최대 1 click |
| 의도 명시 | 모든 UI 요소에 "왜 여기 있는가" intent 기술 |

---

## Hub 1 — /dashboard (Home)

### 현재 문제
- FlywheelHealth / Gate Specs / AdapterDiffPanel = 운영 지표 → 트레이더 불필요
- Pending Verdicts 레이블링 UI = 작업 도구 → /patterns 으로 이동
- BTC 가격이 헤더 스탯에 있지만 변화율 없음, 크기 미달

### 유저 저니
```
앱 시작 → /dashboard
  ① BTC 지금 얼마야? (L1: price 14px bold + change% 12px)
  ② 나 지금 티어/승률? (L1: Profile Strip — tier badge + WR)
  ③ 지금 스캐너가 뭔가 잡았나? (L1: Top Movers 3-col)
  ④ 지난 내 판단 맞았나? (L2: Last 5 Decisions)
  ⑤ 저장한 챌린지 열기 → Lab
  ⑥ 아무것도 없으면 → Open Terminal CTA
```

### 목표 레이아웃
```
HEADER (fixed 56px)
  BTC/USDT  94,200.00 ▲+1.24%    [Open Terminal]  [Run Scan]
  14px bold             12px green  primary CTA       secondary

PROFILE STRIP (48px)
  ● 0x1a…4f  0.82 ETH  ARB  │  GOLD  Win:68.2%  LP:1,240  🔥+5
  상태표시등 + 지갑 주소/잔액  │  tier badge + passport 핵심 4개

3-COL GRID (above fold, L1+L2)
  [TOP MOVERS]        [LAST 5 DECISIONS]   [TODAY PATTERNS]
  BTC  +3.12%          LONG BTC ✓           Accumulation ×2
  ETH  +1.84%          SHORT ETH ✗          Breakout     ×1
  SOL  -0.91%          WAIT XRP —
  [Open Chart]         [Open Terminal]       [View All →]

MY CHALLENGES (L2, scrollable) — 기존 카드 유지, 폰트 12px
```

### 제거/이전
- FlywheelHealth + Gate Specs → /lab/health (신규)
- Pending Verdicts 레이블링 → /patterns VerdictInboxSection
- AdapterDiffPanel → 완전 제거

### 데이터 배선
| 섹션 | 소스 | 상태 |
|---|---|---|
| Top Movers | data.topOpportunities (server, 기존) | 위치만 이동 |
| Last 5 Decisions | data.pendingVerdicts slice(0,5) | 기존 활용 |
| Today Patterns | data.topOpportunities로 phase 분류 | 신규 derived |
| BTC 가격+변화율 | priceStore.change24h (기존) | 배선만 추가 |

---

## Hub 2 — /cogochi (Terminal)

### 현재 문제
- TopBar: TF 9px, price 13px, change 9px, ctrl-btn 9px, L2(H/L/Vol) 없음
- mode selector가 StatusBar 32px 줄에 매몰 (L1 컨트롤인데 가시성 없음)
- AIAgentPanel 탭: DEC/PAT/VER/RES/JDG (3자 약어)
- ChartToolbar: Replay/Snap stub, 💾/📷 emoji

### 유저 저니
```
/dashboard → Open Terminal → /cogochi
  ① BTC 고/저가 확인 → TopBar L2 (H/L/Vol)
  ② TF 변경 → 11px 버튼 (미스클릭 없어야 함)
  ③ 패턴 확인 → AIAgentPanel "Pattern" 탭 (풀워드여야 함)
  ④ 인디케이터 추가 → "Indicators" 버튼 (현재 "IND" 9px)
  ⑤ 구간 저장 → ChartToolbar "Save Zone"
  ⑥ AI 질문 → AIAgentPanel "Decision" 탭
  ⑦ 판단 → StatusBar verdict "LONG" 14px bold
  ⑧ 모드 전환 → TopBar mode segmented
```

### 목표 레이아웃

**TopBar (48px) 재설계**
```
Row 1: [BTC/USDT▼] [1m|5m|15m|1H|4H|1D] 94,200.00 ▲+1.24%
       14px mono    11px tabular          14px bold   12px pos/neg
Row 2: H:95,100  L:93,400  Vol:2.14B USDT
       11px #a8a09a (L2 보조 정보, priceStore.high24h/low24h/volume24h)
Row 3: [OBSERVE|ANALYZE|EXECUTE|DECIDE]  [Indicators]  [⚙]
       11px segmented, 현재 mode accent   12px          12px
```

**ChartToolbar (36px) 정리**
```
[Candle|Line|HA|Bar|Area]  [Indicators▼]  [Drawings▼]  [Save Zone]  [📸]
제거: Replay 버튼 (D-5 stub)
제거: Snap 버튼 (D-6 stub)
변경: 💾 → "Save Zone" 텍스트 버튼
변경: 📷 → 📸 아이콘만 (screenshot)
```

**AIAgentPanel 탭 (풀워드)**
```
현재: DEC | PAT | VER | RES | JDG
변경: Decision | Pattern | Verdict | Research | Judge
폰트: 11px tabular-nums

탭 의도:
- Decision: 현재 심볼 AI 방향성 판단 (LONG/SHORT/WAIT + 근거 3줄)
- Pattern: 유사 패턴 과거 recall. 로딩 → 스켈레톤. 없음 → empty state
- Verdict: 기존 판정 결과 inbox
- Research: 심볼 뉴스 + 매크로 컨텍스트
- Judge: 앙상블 라운드 판단 패널
```

**StatusBar (32px) 정제**
```
제거: mode selector (TopBar로 이전)
강화: verdict pill 14px bold (LONG ▲ / SHORT ▼ / WAIT —)
변경: "scanner live · 300 sym · 14s" → scannerStore 동적 연결
추가: freshness counter (마지막 분석 경과 시간)
```

**WatchlistRail compact mode**
```
FULL (200px): 심볼 + 가격 + 변화율
COMPACT (56px): 심볼 아이콘만 수직 나열
토글: 좌측 fold 버튼, localStorage 'cogochi.watchlist.folded' 영속
```

---

## Hub 3 — /patterns (Pattern Engine)

### 현재 문제
- 헤더 버튼 5개 (Run Scan / Lifecycle / Open Terminal / Filter Drag→ / Formula→) — CTA 계층 없음
- Entry Candidate 카드에 "왜 이게 alert인가" 설명 없음
- Live States table `desktop-only` → 모바일 완전 숨김
- Verdict Inbox 항상 펼침 → L1(Entry Candidates)이 스크롤 밖으로 밀림
- transitions 렌더링 있지만 font-size: 10px (모바일 625px)

### 유저 저니
```
/patterns 진입
  ① 헤더 스탯: Candidates:12 Active:48 Breakout:3 8s ago
  ② Entry Candidates (above fold):
     BTC Accumulation conf:0.84  entered 2h ago  +2.3%
     "고래 매집 패턴. 2-5봉 내 breakout 확률 64%"  ← 의미 1줄
     [Open Chart →]  [Save Setup]
  ③ Live States (60%) + Pattern Stats (40%)
     - 심볼 클릭 → /cogochi?symbol=XXX
     - ACCUMULATION 행 amber highlight (기존 유지)
     - 모바일: horizontal scroll (desktop-only 제거)
  ④ Verdict Inbox (기본 접힘, badge count만)
     [▶ Verdict Inbox  ● 3 pending]
```

### 목표 레이아웃
```
HEADER (fixed)
  Pattern Engine     Candidates:12  Active:48  Breakout:3  8s ago
                     [▶ Run Scan]  [Lifecycle →]  [Filter →]  [Formula →]
                     primary CTA    secondary      tertiary link

ENTRY CANDIDATES (above fold, L1)
  카드: sym(14px) | phase badge(12px amber) | conf(12px tabular) | age(12px)
  의미 설명 1줄 추가 (11px italic)
  CTA: [Open Chart →] ghost | [Save Setup] primary

LIVE STATES + PATTERN STATS (2-col, L2)
  LEFT 60%: 테이블 — desktop-only class 제거, overflow-x:auto 추가
  RIGHT 40%: stat-card 폰트 11px tabular-nums

TRANSITIONS (L2, 기존 렌더링 유지, font 11px 통일)

VERDICT INBOX (L3, 기본 접힘)
  접힌 상태: "▶ Verdict Inbox  ● N pending" 1줄
  클릭 → VerdictInboxSection 펼침
```

---

## Hub 4 — /lab (Challenge Lab)

### 현재 문제
- Source Capture 항상 펼침 → 메인 워크스페이스 진입 지연
- 워크스페이스 chart:panel = 50:50 → 차트 너무 좁음
- 탭명 한영 혼용: 챌린지/런결과/리더보드/패턴런/리플레이/로그
- "리더보드" = RefinementPanel 오명
- Header "Waiting" = pendingChallengeCount (의미 불명확)

### 유저 저니
```
/patterns "Save Setup" → /lab?captureId=xxx
  ① Source Capture 1줄 summary (접힌 상태)
     ▸ BTC/USDT  4H  "Bull flag"  verdict:LONG
  ② Run Controls: 챌린지 선택 + 기간 + [▶ Run]
  ③ Workspace (chart 60% / panel 40%):
     LEFT: Replay Canvas + BacktestSummaryStrip strip (항상 노출)
     RIGHT: Strategy | Results | Refinement | Pattern Run
  ④ Results 탭: BacktestSummaryStrip(전체) + EquityCurveChart + TradeLogTable
  ⑤ 만족 → [▶ Run Again] or [→ Terminal] or [Save]
```

### 목표 레이아웃
```
HEADER (fixed 56px)
  Challenge Lab   Loaded: BTC 4H   Tested:12   Best WR:68.2%
                  [▶ Run]  [Reset]  [← Terminal]
                  primary  ghost    ghost

SOURCE CAPTURE (기본 접힘)
  ▸ BTC/USDT  4H  2026-04-15  "Bull flag breakout"  verdict:LONG
  펼치면: 기존 capture-grid 상세
  idle + no capture: 섹션 숨김

RUN CONTROLS (항상 노출)
  LabToolbar 기존 유지

WORKSPACE (chart 60% / panel 40%)
  LEFT: LabChart + BacktestSummaryStrip (하단 strip 항상 노출)
        Win:68%  Sharpe:1.4  MDD:-8%  (11px bold 3개)
  RIGHT: [Strategy][Results][Refinement][Pattern Run]
         (현재: 챌린지/런결과/리더보드/패턴런 → 영문 통일)
         Manual mode: [Replay][Trade Log]
```

### 탭명 변경 대조표
| 현재 | 변경 | 이유 |
|---|---|---|
| 챌린지 | Strategy | StrategyBuilder 컴포넌트명 일치 |
| 런 결과 | Results | 영문 일관 |
| 리더보드 | Refinement | RefinementPanel 오명 수정 |
| 패턴 런 | Pattern Run | 영문 일관 |
| 리플레이 | Replay | 영문 일관 |
| 로그 | Trade Log | 영문, 더 명확 |

---

## Hub 5 — /settings (Settings)

### 현재 문제
- Profile/Subscription 섹션 없음 (Settings인데 내 계정 안 보임)
- AI(DOUNI) 3번째 배치 → 가장 많이 쓰는 설정인데 후순위
- 알림 조건 없음 (어떤 패턴에서 알림 받을지)
- mode-btn 0.7rem (11.2px 아슬아슬) → 명시적 11px

### 유저 저니
```
/settings 진입
  ① 내 계정: Tier / Wallet / Passport (첫 섹션)
  ② AI 설정: mode 변경, API key 입력, 테스트 (2번째)
  ③ 거래 기본 설정 (3번째)
  ④ 알림 설정 + 알림 조건 체크 (4번째)
  ⑤ 디스플레이 (5번째)
  ⑥ Danger Zone (마지막)
```

### 목표 레이아웃
```
HEADER (fixed 56px)
  Settings     Tier: GOLD  Wallet: 0x1a…4f  [Sync: Cloud ✓]

1. PROFILE & SUBSCRIPTION (신규)
   Tier: GOLD  [Upgrade →]
   Wallet: 0x1a…4f  0.82 ETH  ARB  [Disconnect]
   Passport: Win 68%  LP 1,240  🔥+5  [View Passport →]

2. AI (DOUNI) — 기존 섹션 위로 이동

3. TRADING — 기존 유지

4. NOTIFICATIONS
   Signal Alerts toggle
   Sound Effects toggle
   Telegram Bot
   [신규] Alert Patterns (Signal ON일 때):
     ☑ Accumulation alert
     ☑ Breakout confirmation
     ☐ Distribution alert
     ☐ Verdict ready

5. DISPLAY — 기존 유지

6. DANGER ZONE — 기존 유지
```

---

## /lab/health (신규 — 운영팀 페이지)

```
URL: /lab/health
접근: 직접 URL 진입 (nav 미노출)
내용: FlywheelHealth gate-grid + Gate Specs + AdapterDiffPanel
      (기존 /dashboard 코드 그대로 이전)
의도: 운영팀/개발자용 엔진 상태 모니터링.
      트레이더 홈에서 분리.
```

---

## Scope 요약

### 수정 파일
| 파일 | 변경 내용 |
|---|---|
| app/src/lib/cogochi/TopBar.svelte | L1+L2 enrichment, mode segmented, 9px→12/14px |
| app/src/lib/cogochi/StatusBar.svelte | mode 제거, verdict 14px, scanner 동적 |
| app/src/lib/cogochi/AIAgentPanel.svelte | 탭 풀워드 11px |
| app/src/lib/cogochi/ChartToolbar.svelte | Replay/Snap 제거, emoji→텍스트 |
| app/src/lib/cogochi/WatchlistRail.svelte | 56px compact mode |
| app/src/routes/dashboard/+page.svelte | 3-col grid, flywheel 제거, verdicts 제거 |
| app/src/routes/patterns/+page.svelte | 헤더 계층화, desktop-only 제거, verdict 접힘 |
| app/src/routes/lab/+page.svelte | capture 접힘, 60/40 split, 탭명 영문 |
| app/src/routes/settings/+page.svelte | 섹션 재배치, Profile 신설 |

### 신규 파일
| 파일 | 내용 |
|---|---|
| app/src/lib/cogochi/tokens.ts | --ui-text-xs/sm/md/lg/xl CSS 변수 |
| app/src/lib/styles/typography.css | 글로벌 타이포 토큰 |
| app/src/routes/lab/health/+page.svelte | FlywheelHealth 이전 |

---

## Exit Criteria

### /dashboard
- [ ] AC-D1: 3-col grid (Top Movers / Last 5 Decisions / Today Patterns) above fold
- [ ] AC-D2: FlywheelHealth → /lab/health, /dashboard에서 미노출
- [ ] AC-D3: Pending Verdicts 레이블링 UI /dashboard에서 제거
- [ ] AC-D4: BTC 가격 ≥14px bold + change% ≥12px 색상

### Terminal (/cogochi)
- [ ] AC-T1: TopBar L1 전체 ≥12px tabular-nums
- [ ] AC-T2: TopBar L2 (24h H/L/Vol) 노출
- [ ] AC-T3: Mode segmented TopBar 우측 배치
- [ ] AC-T4: StatusBar mode 버튼 0개
- [ ] AC-T5: AIAgentPanel 탭 풀워드 Decision/Pattern/Verdict/Research/Judge
- [ ] AC-T6: ChartToolbar Replay/Snap 0개, 💾 emoji 0개
- [ ] AC-T7: WatchlistRail fold/unfold (200px ↔ 56px) + localStorage 영속
- [ ] AC-T8: StatusBar verdict pill ≥14px bold

### /patterns
- [ ] AC-P1: 헤더 버튼 계층 (Run Scan primary / 나머지 secondary/link)
- [ ] AC-P2: Entry Candidate 카드 phase 의미 설명 1줄
- [ ] AC-P3: Live States desktop-only 제거 → 모바일 horizontal scroll
- [ ] AC-P4: Verdict Inbox 기본 접힘, pending count badge

### /lab
- [ ] AC-L1: Source Capture 기본 접힘 (1줄 summary)
- [ ] AC-L2: Workspace chart 60% / panel 40%
- [ ] AC-L3: 탭명 영문 통일 (Strategy/Results/Refinement/Pattern Run/Replay/Trade Log)
- [ ] AC-L4: BacktestSummaryStrip 차트 하단 strip 항상 노출

### /settings
- [ ] AC-S1: Profile & Subscription 섹션 최상단
- [ ] AC-S2: AI (DOUNI) 2번째 섹션
- [ ] AC-S3: Alert Patterns 체크리스트 신설
- [ ] AC-S4: 모든 폰트 ≥11px

### 공통
- [ ] AC-G1: grep font-size 9/10px → 0 instances
- [ ] AC-G2: svelte-check error 증가 0
- [ ] AC-G3: CI green + CURRENT.md SHA 업데이트
