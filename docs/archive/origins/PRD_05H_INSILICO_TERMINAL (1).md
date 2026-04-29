# 05H — Insilico Terminal Deep Dive

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: insilicoterminal.com, docs.insilicoterminal.com (live fetch 2026-04-25), Finestel/CoinCodeCap reviews
**의도**: $170B+ 연간 volume, 5000+ active traders 규모. 우리와 카테고리는 다르지만 power trader 시장 지표

---

## 0. 결론 먼저

Insilico Terminal은 **execution terminal** (주문 관리 시스템)이다. **분석/리서치 도구 아님**. 

- 우리(Cogochi) = pattern memory + research
- Insilico = order execution

직접 경쟁 없음. 오히려 **3-layer stack의 Layer 4 (execution) 경쟁자** = Velo Trading + Bybit/Binance native + Insilico.

다만 알아둘 가치:
1. **5000+ active traders × $170B annual volume** = pro segment 시장 검증
2. **완전 무료** (exchange rebate revenue model) — 우리도 distribution 전략 참고 가능
3. **Hyperliquid, Binance, Bybit, OKX, Coinbase, Bitget, BloFin, BitMEX, Apex** 광범위 통합
4. **CLI + GUI 결합** — power user UX 패턴

---

## 1. 가격 / 비즈니스 모델

### 1.1 가격

**완전 무료**. Subscription 없음, premium tier 없음, locked features 없음.

### 1.2 Revenue model

- Exchange brokerage 계약
- 유저 거래 volume의 일부를 rebate로 받음
- 유저는 exchange 표준 fee만 지불 (markup 없음)
- "Positive-sum: trader 좋은 execution + exchange 좋은 order flow + Insilico 지속 가능"

### 1.3 함의

- **유저 acquisition friction 0**
- 5000+ active traders 자랑 가능
- 우리 Cogochi에 적용 가능한가? → ❌ (pattern memory는 거래량 기반 수익 model 어려움)

다만 **Velo가 비슷한 모델로 trading 무료화** 가능성 있음. 그러면 우리는 가격 압박 받을 수 있음.

---

## 2. 핵심 기능

### 2.1 Order types (institutional-grade)

| Order | 설명 |
|---|---|
| **Chase** | 시장 따라가는 limit order. Maker rebate 챙기며 추격 |
| **Limit Chase** | 같은 개념, limit 측면 |
| **TWAP** | Time-Weighted Average Price 분할 |
| **TWAP Chase** | TWAP + chase 결합 |
| **Scale** | 가격대 split 진입 |
| **Swarm** | 여러 작은 주문 분산 |
| **Smart Hedging** | 포지션 자동 hedge |

이게 institutional 수준. 일반 거래소 native UI엔 없음.

### 2.2 Multi-account multi-exchange

- 여러 거래소 계정 단일 interface
- 동시 multi-tasking (한 시장 TWAP, 다른 시장 Limit Chase)
- 모든 잔고 + 포지션 통합 모니터

### 2.3 CLI + GUI 결합

- Visual point-and-click
- Command-line interface (programmable shortcuts)
- Aliases + chained instructions
- Scriptable trading style

### 2.4 Multi Mode

- Synchronized layouts
- 여러 차트 + order panel + instrument link
- Parallel trading workspace

### 2.5 Hobble Mode

- Connection dropout 대응
- Active → passive 전환
- Backend가 exchange 상태 polling
- Dropout 시에도 작동

### 2.6 Security

- API key는 brower local storage (option: synchronization)
- Insilico가 자금 custody 안 함
- Logging 안 함 (자칭)

---

## 3. 지원 거래소

**Futures/Derivatives**:
- Binance (Multi-Assets Mode)
- Bybit (unified trading accounts)
- BitMEX
- OKX
- Bitget
- Coinbase
- BloFin
- Hyperliquid (HyperCore native)
- Apex

**Spot**: 거의 동일 list

**TradingView integration** 명시.

---

## 4. Cogochi와의 관계

### 4.1 직접 경쟁?

❌. 카테고리 다름.
- Insilico = "어떻게 빠르게 잘 주문할 것인가"
- Cogochi = "어떤 패턴인가, 비슷한 케이스 있나, 결과 검증"

### 4.2 P0 유저 stack에서 위치

```
Layer 1: Cogochi ($29-79)        ← Pattern memory + search
Layer 2: Surf ($19-49)           ← Research (optional)
Layer 3: Velo / CoinGlass        ← Data
Layer 4: Insilico Terminal       ← Execution (free) ← 이 지점
        / Velo Trading
        / Exchange native UI
```

P0 power trader가 **Insilico에서 주문 → Cogochi에서 복기**가 자연스럽다.

### 4.3 Integration 가능성 (P3+)

- Cogochi capture → Insilico symbol switch (deeplink)
- Insilico Hobble Mode 같은 resilience 패턴 우리도 차용
- CLI 패턴 — Cogochi power user용 CLI tool 만들 수 있음 (P3)

---

## 5. 배울 점

### 5.1 Free + rebate 모델

우리 직접 적용은 어렵지만, **distribution 전략**으로 시사점:
- "Onboarding friction = 0"이 5000+ users 만들었음
- Cogochi도 free tier를 매우 generous하게? (vs. $29 Pro lock)

### 5.2 CLI for power users

- P0 유저 중 quant-leaning은 CLI 선호
- Cogochi P3 idea: `cogochi search --pattern oi_reversal --confidence 0.7` 같은 CLI

### 5.3 "No fluff" 마케팅

- "Trader-friendly, professional grade, free to use"
- 단순 명확. Cogochi도 marketing copy에서 차용 가능

### 5.4 Multi Mode UX

- Synchronized panels는 Cogochi의 split-pane workspace와 비슷한 철학
- 우리도 Multi Mode 같은 명칭 검토

---

## 6. 위협 평가

### 6.1 Insilico가 분석 영역 진입?

**확률**: Very low.
- 8년+ execution focus 명확
- "분석은 사용자가 다른 도구로" 입장
- TradingView integration이 그 증거

### 6.2 Velo가 Insilico 같은 무료 trading?

**확률**: Medium-high. 이미 Velo Trading 있음 (Bybit + Hyperliquid). 무료화는 시간 문제일 수 있음.

함의: Velo가 풀스택 (data + free trading)을 만들면 Insilico의 trading-only 포지션 약화. 그러면 Insilico가 분석 영역 진출 동기 생길 수 있음. **monitor**.

---

## 7. 한 줄 결론

> **Insilico = free institutional-grade execution terminal. Cogochi 직접 경쟁 아님.**
>
> **함의: P0 stack의 Layer 4. Cogochi → Insilico deeplink가 자연스러운 pairing. 5000+ active traders pro segment 시장 검증 신호.**
>
> **monitor: Velo가 무료 trading 강화하면 Insilico가 분석 영역 진입 가능. 6-12개월 watch.**
