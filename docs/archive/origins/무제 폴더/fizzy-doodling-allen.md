# Cogochi ChartGame 배틀 — 구현 설계

## 레퍼런스: chartgame.com

과거 차트가 한 봉씩 나타남. [Next Bar]로 전진. Long/Short 진입. End Game → PnL 결과.

## Cogochi 차별점

ChartGame = 유저 혼자.
Cogochi = **AI가 옆에서 같이 분석. 유저가 AI 판단에 동의/반대 → 학습 데이터.**

## 화면 구조

```
┌──────────────────────────────────────────────────────────────────┐
│  BTC/USDT  │  ??? (날짜 숨김)  │  ▶ Next Bar  │  ⏩ 5x  │ End  │
├────────────────────────────────┬─────────────────────────────────┤
│                                │                                 │
│   실제 캔들 차트               │  Position                       │
│   (lightweight-charts v5)      │  Type: L  Shares: —             │
│                                │  Cost: —  Market: $95,420       │
│   ▄▄▄▄                        │  Unrealized P/L: —              │
│       ▀▀▀▀▄▄                  │                                 │
│               ▀▀▀▄▄           │  ── AI Signal ──                │
│                                │  CVD: 약세 다이버전스           │
│   볼륨 바                      │  Funding: 롱 과열               │
│   ▅▂▃▆▇█▅▃▁▂▄▅▇              │  HTF: BEARISH                  │
│                                │  Strength: 0.87                 │
│                                │                                 │
│                                │  ── AI 추천 ──                  │
│                                │  SHORT 84%                      │
│                                │  SL $96,100  TP $93,200        │
│                                │                                 │
│                                │  ┌──────┐ ┌──────┐            │
│                                │  │ Long │ │ Short│            │
│                                │  └──────┘ └──────┘            │
│                                │  ┌────────────────┐            │
│                                │  │   ▶ Next Bar   │            │
│                                │  └────────────────┘            │
│                                │                                 │
│                                │  ── Trades ──                   │
│                                │  L/S  Enter   Exit  Gains      │
│                                │                                 │
│                                │  Cash: $100k  PnL: $0          │
│                                │                                 │
├────────────────────────────────┴─────────────────────────────────┤
│  CVD ▅▆▇ | OI ▃▄▅ | Funding 0.09%                              │
└──────────────────────────────────────────────────────────────────┘
```

## 게임 플로우

### 시작
- Binance 역사 klines 100봉 fetch (50 visible + 50 hidden)
- 종목/날짜 숨김 (게임 끝나면 공개)
- 초기 자금 $100,000

### 플레이
```
1. [Next Bar] → 캔들 1봉 추가
2. AI 시그널 갱신 (CVD/Funding/구조)
3. AI가 FLAT이 아닌 판단 시 추천 표시: "SHORT 84%"
4. 유저 선택:
   [Long] → 현재가로 롱
   [Short] → 현재가로 숏
   [Next Bar] → 패스
5. 포지션 보유 중:
   차트에 Entry/TP/SL 라인 표시
   P/L 실시간 갱신
   [5x Buy] 추가 매수 / [Sell] 청산
6. 50봉 소진 or [End Game]
```

### 종료 (End Game)
- Profit per trade 라인 차트
- 총 PnL + 승률
- AI 동의했을 때 승률 vs 무시했을 때 승률
- 종목/날짜 공개
- [Play Another] [Play in Practice]

## 파일 구조

```
src/routes/cogochi/battle/+page.svelte      ★ 메인 게임 페이지
src/lib/engine/cogochiGameEngine.ts         ★ 게임 상태 (시나리오, Next Bar, 포지션)
src/components/cogochi/
  GameChart.svelte                          ★ lightweight-charts 캔들+볼륨+라인
  GamePanel.svelte                          ★ 우측 AI+주문 패널
  GameResult.svelte                         ★ 결과 화면 (Profit per trade)
```

## 기술 결정

- **차트**: lightweight-charts v5 (이미 설치됨, ChartPanel.svelte 패턴 재사용)
- **데이터**: fetchKlines() 기존 함수로 Binance 역사 데이터 fetch
- **AI 판단**: cogochiDoctrine.ts makeDecision() 클라이언트에서 실행 (Ollama 불필요)
- **시그널**: 기존 engine/indicators.ts + factorEngine.ts 활용 가능
- **학습 데이터**: 유저 행동 기록 → PairSource → AutoResearch

## 구현 순서

```
Step 1: cogochiGameEngine.ts (게임 상태머신)
Step 2: GameChart.svelte (lightweight-charts 래퍼)
Step 3: GamePanel.svelte (AI 시그널 + Long/Short/Next Bar)
Step 4: /cogochi/battle/+page.svelte (조립)
Step 5: GameResult.svelte (End Game 결과)
Step 6: AI 시그널 연동 (makeDecision 매 봉마다 호출)
```
