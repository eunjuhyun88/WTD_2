# 02 — User Scenarios (Day in the Life)

**버전**: v1.0 (2026-04-25)
**상태**: canonical
**의도**: P0/P1 페르소나가 제품을 쓰는 하루를 구체적으로 묘사해 기능 설계의 reference로 삼는다

---

## 0. 원칙

- 각 시나리오는 **실제 trade context**를 포함
- 각 단계는 **특정 feature/surface**에 매핑됨
- "재미있는 기능"이 아니라 **유저가 안 쓰고 못 배기는 기능**을 탐지

---

## 1. Primary Scenario (P0) — "Jae의 하루"

### Setup

- 서울 거주, 28세, 전업 3년차
- 운용 자산 $300K, 주로 Binance perp
- 아침 사이클: 일어남 → 잠든 동안 시장 리뷰 → 새 setup 찾기 → 모니터
- 저녁 사이클: 복기 → 다음날 thesis 정리

---

### 07:00 — 기상, Asia open 체크

**상황**: 일어나자마자 폰에서 관심 종목 확인. BTC 지난 6시간 횡보, PTBUSDT 4h 만에 +8% 튐. 눈에 띔.

**행동**:
- 모바일 앱 열기 (Observe mode)
- PTBUSDT 검색
- **Decision HUD** 첫 눈에 보임:
  ```
  Pattern: oi_reversal_v1
  Phase: REAL_DUMP → ACCUMULATION 직후
  Confidence: 0.71
  Top Evidence:
    ✓ OI +18% spike 유지
    ✓ funding flip -0.003 → +0.0002
    ✓ higher_lows 2
  Risk:
    ⚠ breakout 미확정
  ```

**기능 매핑**:
- Mobile observe mode
- Pattern status bar
- Dashboard inbox (잠든 사이 alert)

**감정**: "어? 이거 TRADOOR 비슷한데" → 데스크 가서 확인하고 싶음.

---

### 08:30 — 데스크 앉음, 검색

**행동**:
- Analyze mode로 전환
- PTBUSDT 1h chart open
- 차트 위 자동 phase zone overlay:
  - 회색 (fake_dump, 5일 전)
  - 빨간 (real_dump, 2일 전)
  - 노란 (accumulation, 12시간 진행 중)
- 우측 HUD에 TRADOOR seed와 비교 버튼
- 하단 workspace에 **Phase Timeline** 자동 노출

**"비슷한 거 찾아줘" 버튼 누름**:
- 10초 안에 scan_grid template으로 전환
- 과거 similar cases 8개 떠오름
  - OI reversal 성공 케이스 5개 (avg +34%)
  - near-miss 2개
  - failure 1개

**감정**: "좋아, 지난 6개월 5/7 성공. EV 양수. 진입 고려 가능."

**기능 매핑**:
- Analyze mode layout
- Sequence matcher (§03 search engine)
- scan_grid template
- Ledger stats per pattern

---

### 09:00 — Save Setup (진입 직전)

**상황**: 현재 PTBUSDT가 accumulation 후반. 진입하기 전에 저장.

**행동**:
- Chart range select: 5일 전 fake_dump부터 현재까지
- **Save Setup** 클릭
- Modal 뜸:
  ```
  Pattern: oi_reversal_v1 (auto-detected)
  Thesis tags: oi_spike_with_dump, funding_flip
  User note: "PTB 스타일. 첫 dump는 -6%, 두 번째 -8%.
             funding flip 확인, 세력 숏 정리됨."
  Entry: 0.0412
  Stop: 0.0398 (real_dump low 아래)
  Target: 0.055 (+33%)
  Chart snapshot: auto-attached
  Feature snapshot: 92 cols
  ```
- Save 클릭 → `capture_id=cap_8a3f2e` 생성

**감정**: "이번엔 제대로 기록. 결과 나오면 자동으로 ledger에 붙겠지."

**기능 매핑**:
- Save Setup canonical capture
- Auto chart/feature snapshot
- Trade plan structured fields

---

### 09:15 — 진입, 모니터

**행동**:
- Binance에서 실제 포지션 open (제품 밖)
- 제품은 **monitor 모드**로 전환
- Execution view template
- Entry line / stop line / target line 차트에 overlay

**기능 매핑**:
- Execution view (§05)
- Watch activation

---

### 12:30 — 알림: PTBUSDT 3% 진행

**상황**: 점심 먹다 알림. Dashboard inbox에 "PTBUSDT accumulation → breakout transition"

**행동**:
- 알림 탭 → Analyze mode open
- Phase timeline 업데이트: BREAKOUT entered
- Decision HUD:
  ```
  Phase: BREAKOUT (confirmed)
  Next: extended_expansion or reversal
  Action suggestion: partial TP at 1R
  ```

**감정**: "계획대로 움직임. 1R 부분 익절."

**기능 매핑**:
- Real-time phase transition alerts
- Transition event log

---

### 18:00 — 일봉 종가, 다른 종목 리서치

**행동**:
- Scan mode 전환
- "지금 accumulation phase인 종목" 필터
- scan_grid에 12개 후보
- 각 tile에 pattern family, confidence, key signal
- 2개 더 Save Setup (관찰용)

**기능 매핑**:
- Multi-symbol scanner
- Tier-based scan cadence

---

### 21:00 — 복기

**상황**: PTBUSDT +28% 진행 후 target 도달 근접, 일부 청산.

**행동**:
- `/lab` 열기
- 오늘 capture 3개 list
- PTBUSDT capture → detail view
- Ledger outcome: **HIT** (auto-computed, peak +31%)
- User verdict 버튼:
  - ✅ Valid
  - Near Miss
  - Too Early
  - Too Late
  - Invalid
- **"Valid"** 선택
- Comment: "OI 재확장 구간에서 1R 더 욕심부렸으면 좋았음"

**결과**:
- Personal stats 업데이트: oi_reversal 개인 hit rate 73% (N=11)
- Ledger verdict 저장
- Refinement engine이 comment를 threshold suggestion으로 변환 대기

**기능 매핑**:
- Verdict inbox
- Personal stats dashboard
- Ledger judgment
- Refinement proposal generator

---

### 22:30 — 팀 Telegram에 공유

**행동**:
- PTBUSDT capture 오른쪽 상단 "Share" → Telegram
- 자동으로 thesis + chart + phase path + outcome 포함된 포스트
- 팀원들이 react

**기능 매핑**:
- Share-out integration
- Public capture view

---

### Daily Summary

- **Captures saved**: 3
- **Verdicts submitted**: 1
- **Searches**: 4
- **Mode transitions**: Observe → Analyze → Execute → Analyze
- **Alerts received**: 2 (1 acted)
- **Time in app**: 2.5h (분산)

---

## 2. Secondary Scenario (P1) — "Kim's team"

### Setup

- 6명 trading desk, Seoul
- Lead: Kim (10년차), AUM $15M
- Researchers: 2명 mid, 2명 junior, 1 intern
- Workspace: Slack + Notion + 개별 TradingView

---

### 09:00 — Morning standup

**행동**:
- Team workspace 열기
- "Patterns Active Overnight" 뷰
- 지난 8시간 동안 team watchlist에서 phase transition이 일어난 종목 12개
- 각 transition: symbol, pattern, phase, confidence, assigned analyst

**Kim이 분배**:
- A급 (conf > 0.7): 본인이 검토
- B급: mid researcher
- C급: junior가 리서치 초안

**기능 매핑**:
- Team shared dashboard
- Phase transition log per team
- Assignment system

---

### 10:00 — Junior researcher: 신입 패턴 발견

**상황**: Junior가 "이거 TRADOOR 패턴 변종 같아요" 보고

**행동**:
- Junior가 chart range select + Save Setup
- 팀 shared library에 draft로 제출
- Kim에게 review 요청

**Kim review**:
- Modal에서 PatternDraft 확인
- 자동 parsed signals:
  - price_dump ✓
  - oi_spike ✓
  - missing: funding_flip
- Kim이 note 추가: "funding_flip 없으면 fake일 가능성 있음. 보조 조건으로 추가."
- Draft → PatternCandidate 승격
- Review 대기열에 올라감

**기능 매핑**:
- Team pattern library
- Draft review workflow
- Senior → junior feedback loop

---

### 14:00 — Backtest request

**상황**: Mid researcher가 TRADOOR 변종을 전체 유니버스에 돌려보고 싶어함

**행동**:
- `/lab` Challenge create
- Pattern variant select (Kim 수정 버전)
- Universe: binance_perp_top_200
- Lookback: 180일
- Run evaluation
- 결과:
  - N matches: 47
  - Avg forward return: +18%
  - Positive rate: 68%
  - SCORE: 0.73 (HIT gate 통과)

**결과**:
- Team variant approved
- Live watch activation

**기능 매핑**:
- Challenge evaluator
- Benchmark pack infra
- Activation gate

---

### 17:00 — Team review

**행동**:
- 주간 review 세션
- Dashboard → "Team performance this week"
- Per-trader verdict distribution
- Per-pattern hit rate
- Pattern decay alerts (한 패턴 hit rate 최근 ↓)
- Discussion → Kim이 threshold raise 제안
- Refinement proposal 생성 → propose new variant v2

**기능 매핑**:
- Team performance view
- Per-pattern decay monitor
- Refinement propose flow

---

## 3. Edge Case Scenarios

### 3.1 Failure Recovery — "Save Setup 실패"

**상황**: Jae가 Save Setup 눌렀는데 feature snapshot 생성 실패

**기대**:
- Graceful degrade
- Save draft without feature snapshot
- "Features will attach later" 배너
- Background job이 24h 내 attach

**기능 매핑**:
- Capture idempotency
- Lazy feature attach

### 3.2 Pattern Ambiguity — "Parser 확신 없음"

**상황**: Jae가 포스트를 paste, AI parser가 `confidence=0.42`

**기대**:
- "Ambiguous parse" 배너
- Specific ambiguities list 표시
- User가 편집하거나 추가 설명 가능
- 저장하지 않음 (또는 review_required=true로 저장)

**기능 매핑**:
- Parser confidence gate
- Manual correction UI

### 3.3 False Alert — "오탐"

**상황**: Team watch가 ETH에서 accumulation이라고 alert 보냈지만 실제론 chop

**행동**:
- Team member가 dashboard inbox에서 "Invalid" verdict
- Comment: "BTC regime이 chop, accumulation 오탐"

**기대**:
- Refinement engine이 regime filter 부족 감지
- Threshold suggestion: `require btc_trend != 'chop'` 추가 제안
- Team lead 승인 시 variant v2 발행

**기능 매핑**:
- Regime-conditional rules
- Refinement suggestion engine

### 3.4 Pattern Decay — "이 패턴 이제 안 먹힘"

**상황**: oi_reversal_v1이 지난 30일 hit rate 40% (180일 baseline 68%)

**기대**:
- Dashboard에 decay badge
- "Pattern decay detected" alert
- 옵션:
  - Pause watch
  - Investigate (lab에서 recent misses review)
  - Refine (threshold 조정 proposal)
  - Retire

**기능 매핑**:
- Decay monitor
- Pause / retire lifecycle

### 3.5 Cross-Timeframe Conflict

**상황**: 15m chart에서는 breakout, 1h에서는 아직 accumulation

**기대**:
- Phase timeline이 multi-TF row 표시
- Conflict badge
- Confidence down-weight

**기능 매핑**:
- Multi-TF state (Phase 2, Slice 11)

---

## 4. Non-Scenarios (의도적으로 다루지 않음)

- 완전 자동매매
- Social feed / comment threading
- Influencer following
- 초보자 튜토리얼 세션
- 실시간 voice chat
- Portfolio management / P&L tracking (지갑 연결)

---

## 5. Flow Metrics per Scenario

### P0 — Jae's day

| Moment | Target metric |
|---|---|
| Morning check → Decision HUD | < 10s to first useful info |
| Search for similar | < 2s for scan_grid |
| Save Setup submit | < 500ms |
| Verdict submit | 1-click (2s total) |

### P1 — Kim's team

| Moment | Target metric |
|---|---|
| Team dashboard load | < 2s |
| Assignment action | < 1s |
| Backtest evaluate | < 30s for 180d universe |
| Refinement propose | async, <10min |

---

## 6. 각 Scenario에서 나온 Missing Features

이 시나리오를 짜면서 드러난 미구현 feature 리스트.

| Missing | Priority | Notes |
|---|---|---|
| Telegram share-out | P1 | 사용성 핵심 |
| Team assignment system | P1 | Phase 2 |
| Multi-TF state display | P2 | Phase 2, slice 11 |
| Pattern decay monitor | P1 | Phase 2 |
| Draft review workflow | P0 | Slice 3 |
| Regime filter in rules | P0 | 현재 stub만 있음 |
| Cross-member watch list | P1 | Phase 2 |
| Lazy feature attach | P0 | Slice 4 |

---

## 7. Success Signals

시나리오대로 사용하면 자연히 이 숫자가 나와야 한다.

| Signal | P0 Day-1 | P0 W4 |
|---|---|---|
| Captures per session | 1+ | 3+ |
| Search usage per session | 1+ | 2+ |
| Mode transitions per session | 2+ | 4+ |
| Verdict per capture | 0 | 0.6 (72h window) |
| Returning next day | 40% | 65% |

이 signals가 안 나오면 persona 또는 시나리오 hypothesis 재검토.

---

## 8. 한 줄 요약

> **P0 시나리오 핵심: "본 것 → 저장 → 검색 → 비교 → 판정" 5단계가 하루에 2-3번 자연스럽게 돈다.**
> **P1 시나리오 핵심: "개인이 모은 capture가 팀 library가 되고, junior onboarding을 compress한다."**
