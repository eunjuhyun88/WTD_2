# W-0220 부록 — 텔레그램 시그널 채널 4개 분석 (2026-04-26)

> Source: 4 Telegram channel HTML exports (Alpha Hunter / Alpha Terminal / 시그널레이더 / Alpha Flow)
> 목적: 실제 "패턴 헌터"들의 작동 방식 파악 → W-0220 PRD signal vocabulary, message format, copy signal marketplace 설계 보강

---

## 1. 채널 비교표

| 항목 | Alpha Hunter | Alpha Terminal v4 | 시그널 레이더 v3 | Alpha Flow (아카) |
|---|---|---|---|---|
| 컨셉 | 18 단계 퀀트 + 알파 토큰 | 15 지표 + 3 선행지표 (VWAP/RS/청산) | 1m 거래량 가속도 2.5× | 와이코프 + 8-layer (수급/온체인/김프) |
| 핵심 신호 타입 | WHALE / MICRO-SQUEEZE / OB IMBALANCE | OI 변화 / L-S / 청산 우세 | 자금유입 돌파 / Whale Block | ACCUM / DIST / RETEST |
| 점수 체계 | 신호 카운팅 랭킹 | -55 ~ +55 8단계 Alpha | 가속도 배수 | -55 ~ +55 8단계 Alpha |
| 빈도 | 실시간 WS | 배치 + WS | 1m 주기 | 종목당 8-layer 병렬 |
| 가격 모델 | 무료 / 오픈소스풍 | 유료 ("TRUE FULL VERSION") | 무료 | 무료 (로그인 X) |
| 결과 보고 | 30분 핫타겟 랭킹 | 종목별 Alpha 점수 | 30분 누적 | MTF 일관성 |

---

## 2. 공통 Signal Vocabulary (W-0220 §부록 보강)

> 우리 PatternObject의 fixed signal_id 25-30개 vocabulary에 **이 13개를 base layer로 채택** 권고.

| signal_id | 의미 | 임계값 예시 |
|---|---|---|
| `oi_surge` | OI 급증 + 가격↑ (롱 신규) | OI Δ ≥ +5% / 1H |
| `oi_collapse` | OI 감소 + 가격 양방향 (청산) | OI Δ ≤ -5% / 1H |
| `liq_cascade` | 롱/숏 청산 폭발 (WS) | $5M+ 누적 in 5m |
| `funding_extreme_short` | 펀딩 음수 극단 (역발상 매수) | funding ≤ -0.05% |
| `funding_extreme_long` | 펀딩 양수 극단 | funding ≥ +0.05% |
| `cvd_breakout` | 순매수 누적 돌파 | CVD Δ ≥ +$20K in 1m |
| `whale_block` | 대형 단일 거래 | trade ≥ $50K |
| `bb_squeeze_breakout` | 볼린저 압축 후 돌파 | BB width < 0.5% → break |
| `orderbook_imbalance` | 매수벽 3× 이상 | bid/ask depth ≥ 3.0 |
| `micro_volatility_low` | 변동성 극소 (폭발 전조) | ATR%/price < 0.3% |
| `taker_ratio_extreme_buy` | 공격 매수 우세 | taker_buy_ratio ≥ 0.65 |
| `taker_ratio_extreme_sell` | 공격 매도 우세 | taker_buy_ratio ≤ 0.35 |
| `kimchi_premium_extreme` | 김프 역발상 (한국 P0) | \|premium\| ≥ 2σ |

### Phase 명명 (canonical 채택)

```
ACCUMULATION → DISTRIBUTION → BREAKOUT → RETEST → [SQUEEZE 전조]
```
4채널 모두 동일 Wyckoff vocabulary 사용 → **이게 한국 시장 표준**. 우리 PhaseDef도 이걸 따라야 한다.

---

## 3. Chart Selection 자동 추출 Features (F-0 보강)

PRD F-0 ("드래그 → PatternDraft 자동 생성")에 다음 features를 자동 추출 대상으로 명시:

```
Primary  : OI Δ%, L/S ratio, CVD, Liquidation heatmap
Secondary: taker buy/sell ratio, funding rate, OB depth imbalance, BB width %, ATR %
Macro    : 김프 (KRW/USD premium), 온체인 Tx 속도, Fear&Greed
```

→ DESIGN_V3.1_PATCH의 추가 features (kimchi_premium, session_apac, oi_normalized_cvd)와 정확히 일치. **F-6를 P0로 유지하는 근거 확보**.

---

## 4. 시그널 메시지 표준 (F-60 카피시그널 marketplace 사양)

```json
{
  "signal_id": "oi_surge_BTCUSDT_20260426_1330",
  "issued_at": "2026-04-26T13:30:00Z",
  "issuer": {"id": "...", "verified_badge": true, "track_record_months": 3},
  "symbol": "BTCUSDT",
  "pair_type": "PERP",
  "pattern_object_id": "oi_reversal_v1",
  "phase_path_observed": ["fake_dump", "arch_zone", "accumulation"],
  "alpha_score": 45,
  "confidence": 0.85,
  "trigger_features": {
    "oi_change_pct_1h": 5.2,
    "cvd_absolute": 22500,
    "funding_rate": -0.03,
    "kimchi_premium": 1.8
  },
  "trade_plan": {
    "entry_reference": 45230.50,
    "stop_atr_multiple": 1.5,
    "stop_absolute": 44890.00,
    "targets": [45800, 46200],
    "timeframe": "1h",
    "risk_reward": 2.3
  },
  "thesis_one_liner": "축적 후 OI 재확장 + 김프 역방향 = 롱 신규",
  "chart_attachment_url": "...",
  "expiry_ttl_minutes": 180,
  "verdict_eta": "2026-04-29T13:30:00Z"
}
```

### 결과 보고 의무 (책임 추적)
- 진입 → 청산 시각, **실제 체결가 vs 제시가 편차**
- 수익률 % 자동 계산 (slippage + fee 반영)
- 월별 win rate, profit factor 공개
- 손실 발생 시 disclaimer 자동 삽입 ("투자 권고 아님")
- 발행자 신원 verified badge + 3개월 이상 트랙레코드 강제

→ 이 JSON 스키마를 W-0220 §6 F-60 (카피시그널 Phase 1) 컨트랙트로 등록.

---

## 5. 우리 Product의 차별점 (재확인)

| 항목 | 4 채널 평균 | Cogochi |
|---|---|---|
| 빈도 | 실시간 푸시 (1m~5m) | **사용자가 손으로 가리키는 search** (요청 시) |
| 책임 | 사후 보고/랭킹만, 사라짐 | **Verdict ledger 영구 기록**, 책임 추적 |
| 검증 | 신호 카운팅 → 랭킹 | **5-cat verdict + reranker 학습** |
| 설명 | 점수/레이블만 | **Feature 기여도 + 유사 사례 5개** |
| 적응 | 고정 임계값 | **PersonalVariant + threshold sweep** |
| 매칭 | 종목별 독립 | **Phase Path Sequence Match** (LCS) |

**핵심**: 4 채널은 **broadcasting 방식** (다 똑같은 신호를 푸시). 우리는 **on-demand search + verdict-validated** 방식. 카피시그널 marketplace로 가더라도 broadcasting은 검증된 패턴만 켜진다.

---

## 6. PRD 보강 제안 (W-0220에 반영할 항목)

| # | 변경 위치 | 내용 |
|---|---|---|
| 1 | §부록 (signal vocabulary) | 위 13개 base signal_id 채택 명시 |
| 2 | §3 Core Loop step 1 | "Wyckoff phase 명명 (ACCUM/DIST/BREAKOUT/RETEST)을 PatternDraft 기본 어휘로 사용" |
| 3 | F-0 spec | "자동 추출 features = Primary 4 + Secondary 5 + Macro 3 = 12개 최소" |
| 4 | F-60 (카피시그널) | "메시지 JSON 스키마 = 위 §4 표준" |
| 5 | F-60 gate | "발행자 verified badge + 3개월+ 트랙레코드 + 결과 보고 자동화" 추가 |
| 6 | Non-Goal | "broadcasting-only 신호 채널 모방 안 함" 명시 |

---

**A022 / 2026-04-26**
