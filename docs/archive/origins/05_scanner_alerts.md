# COGOCHI — Scanner & 알림 시스템

> 역할: 15레이어 시장 스캔 + 패턴 감시 + 알림 발송  
> Phase 위치: Day-1은 Lab에 흡수 (시그널러 배포 버튼). Phase 2에서 독립 UI.  
> 이 문서는 스캐너 내부 동작 + 알림 규칙을 기술한다

---

## 스캐너 두 가지 역할

| 역할 | 설명 |
|------|------|
| 시장 탐색 | 15레이어 → Alpha Score 계산. "지금 뭐가 뜨겁나" 발견 |
| 패턴 감시 | Doctrine 패턴으로 24시간 스캔. 매칭 시 즉시 알림 |

---

## 15개 레이어 — Alpha Score 구성

| # | 레이어 | Alpha 기여 | 데이터 소스 |
|---|--------|-----------|------------|
| L1 | 와이코프 구조 | ±30 | OHLCV 일/주봉 |
| L2 | 수급 (FR·OI·L/S·Taker) | ±20 | Binance fapi |
| L3 | V-Surge (거래량 이상) | +15 | OHLCV |
| L4 | 호가창 불균형 | ±10 | Binance depth |
| L5 | 청산존 (Basis) | ±10 | Binance spot+fapi |
| L6 | BTC 온체인 | ±8 | Glassnode/CryptoQuant |
| L7 | 공포/탐욕 | ±10 | alternative.me |
| L8 | 김치프리미엄 | ±5 | 업비트/빗썸/Binance |
| L9 | 실제 강제청산 | ±10 | Binance fapi |
| L10 | MTF 컨플루언스 | ±20 | L2+L11 멀티TF |
| L11 | CVD | ±25 | Binance aggTrades |
| L12 | 섹터 자금 흐름 | ±5 | 종목별 Alpha 평균 |
| L13 | 돌파 감지 | ±15 | OHLCV 50봉 |
| L14 | 볼린저밴드 스퀴즈 | ±5 | OHLCV 20봉 |
| L15 | ATR 변동성 | 보조 (필터용) | OHLCV 14봉 |

### Alpha Score 해석

| 범위 | 레짐 | 색상 |
|------|------|------|
| +60 ~ +100 | STRONG BULL | 밝은 초록 |
| +20 ~ +59 | BULL | 초록 |
| -19 ~ +19 | NEUTRAL | 회색 |
| -20 ~ -59 | BEAR | 빨강 |
| -60 ~ -100 | STRONG BEAR | 밝은 빨강 |

---

## SignalSnapshot 데이터 구조

모든 스캔 결과는 이 구조로 저장. Scanner와 Terminal이 동일 구조 사용.

```json
{
  "l1":  { "phase": "DISTRIBUTION", "score": -30 },
  "l2":  { "fr": 0.0012, "oi_change": 0.184, "ls_ratio": 1.8, "score": -15 },
  "l3":  { "v_surge": false, "score": 0 },
  "l4":  { "bid_ask_ratio": 0.82, "score": -8 },
  "l11": { "cvd_state": "BEARISH_DIVERGENCE", "score": -25 },
  "alphaScore": -72,
  "regime": "VOLATILE",
  "symbol": "BTCUSDT",
  "timeframe": "4h",
  "timestamp": 1712345678,
  "hmac": "abc123..."
}
```

### 위변조 방지
- 모든 스캔 결과는 서버에서 계산
- `alphaScore + layers_hash` → HMAC-SHA256 서명
- 적중률은 서버에서 집계 (클라이언트 값 무시)

---

## 스캔 스케줄

| 종류 | 주기 | 트리거 |
|------|------|--------|
| 자동 스캔 | 15분마다 | APScheduler |
| 수동 스캔 | 즉시 | 사용자 요청 |
| 쿨다운 | 수동 최소 3분 간격 | 남용 방지 |

### Binance Rate Limit 관리

| 항목 | 수치 |
|------|------|
| Binance REST 제한 | 1,200 weight/분 |
| 안전 마진 | 800 weight/분 (67%) |
| 초과 시 | 다음 분으로 지연 |

---

## 패턴 매칭 로직

15분마다 실행:

```
1. 대상 종목 목록 가져오기 (Free: 5개, Pro: 전체 30개)
2. 각 종목 SignalSnapshot 계산
3. 유저의 Doctrine 패턴 목록 가져오기
4. 각 패턴 AND 조건 매칭
5. 조건 충족 시:
   - 중복 체크: 같은 패턴+심볼 4시간 이내 알림 없었는지
   - 예외: Alpha Score 변화 ±10 이상이면 4시간 내라도 알림
6. 알림 발송 (Telegram + FCM)
7. alert_logs DB 저장
```

---

## Doctrine 패턴 구조

```
Doctrine
├── agentId        사용자 ID
├── patterns[]     패턴 배열
├── version        버전
└── updatedAt

Pattern
├── id, name, direction (LONG/SHORT)
├── conditions[]   AND 조건 배열
├── weight         0~1, AutoResearch 최적화
├── hitRate        적중률 (자동 집계)
├── totalAlerts    전체 알림 수
├── active         활성/비활성
└── createdAt

Condition
├── field          (예: "l11.cvdState", "l2.fundingRate")
├── operator       (eq / gt / lt / gte / lte / contains)
└── value
```

### 사용 가능한 Condition 필드

| 필드 | 예시 값 |
|------|--------|
| `l1.phase` | "ACCUMULATION", "DISTRIBUTION" 등 6단계 |
| `l2.fr` | 0.0012 (펀딩비 수치) |
| `l2.oi_change` | 0.184 (OI 변화율) |
| `l2.ls_ratio` | 1.8 (롱/숏 비율) |
| `l3.v_surge` | true / false |
| `l4.bid_ask_ratio` | 0.82 |
| `l5.basis_pct` | 0.005 |
| `l7.fear_greed` | 25 (공포/탐욕 지수) |
| `l9.liq_1h` | 1200000 (달러) |
| `l10.mtf_confluence` | "BULLISH" |
| `l11.cvd_state` | "BEARISH_DIVERGENCE" 등 5종 |
| `l13.breakout` | true / false |
| `l14.bb_squeeze` | true / false |
| `l15.atr_pct` | 0.032 |
| `alphaScore` | 82 |
| `regime` | "BULL", "BEAR", "CHOP", "VOLATILE", "UNKNOWN" |

---

## 패턴 저장 3경로

| 경로 | 방법 | 흐름 |
|------|------|------|
| 1. Terminal 대화 | 블록 이름 자연어 파싱 | 쿼리 입력 → 파싱 → `[Save Challenge]` → Lab |
| 2. Lab 딥다이브 | 레이어 체크박스 직접 선택 | Phase 2 이후 Scanner UI에서 제공 |
| 3. 직접 빌더 | field + operator + value UI | Phase 2 이후 고급 설정 |

---

## 알림 시스템

### Telegram 알림 예시

```
🔔 패턴 감지: CVD다이버전스+펀딩과열

심볼:    BTCUSDT
타임프레임: 4H
방향:    SHORT
Alpha:   82/100
레짐:    VOLATILE

L11 CVD: BEARISH_DIVERGENCE
L2 FR:   0.0012 (과열)
L4 호가창: 매도 우세

[✓ 맞아]  [✗ 아니야]  [차트 보기]
```

### FCM (앱 내) 알림 예시

```
제목:  🔔 BTCUSDT SHORT 감지
내용:  CVD 다이버전스 + 펀딩 과열 | Alpha 82
```

### 중복 방지 규칙

| 규칙 | 내용 |
|------|------|
| 기본 | 같은 패턴+심볼 4시간 내 알림 방지 |
| 예외 | Alpha Score 변화 ±10 이상이면 4시간 내라도 발송 |
| 저장 | 모든 알림 alert_logs DB 기록 |

---

## 자동 적중 판정

| 시점 | 설명 |
|------|------|
| P0 | 알림 발송 시점 가격 |
| P1 | 1시간 후 가격 |

### 판정 기준

| 방향 | 조건 | 판정 |
|------|------|------|
| LONG | P1/P0 ≥ +1% | HIT ✅ |
| LONG | P1/P0 ≤ -1% | MISS ❌ |
| LONG | 사이 | VOID 🔘 |
| SHORT | P1/P0 ≤ -1% | HIT ✅ |
| SHORT | P1/P0 ≥ +1% | MISS ❌ |
| SHORT | 사이 | VOID 🔘 |

- 수동 피드백(✓/✗)이 있으면 자동 판정보다 우선
- 자동 판정은 `feedback_source: auto` 로 저장

---

## 피드백 → AutoResearch 연동

| 피드백 유형 | 훈련 데이터 | ML 용도 |
|-----------|-----------|--------|
| Scanner ✓ | 패턴 강화 | weight +0.05 |
| Scanner ✗ | 패턴 약화 | weight -0.03 |
| 자동 HIT | Confidence 보정 | 캘리브레이션 |
| 자동 MISS | Confidence 보정 | 캘리브레이션 |

---

## Phase 2 — Scanner 독립 UI (미래)

Phase 2에서 `/scanner` 라우트 추가. 현재는 Dashboard Section 3에 통합.

예정 기능:
- 30개 종목 Alpha Score 실시간 레이더 차트
- 레이어별 딥다이브 패널 (레이어 체크박스 → 패턴 저장)
- 내 패턴 관리 탭
- 시장 레짐 대시보드

---

## DB 스키마 — alert_logs

```
alert_logs
├── id               UUID
├── user_id          FK → users
├── pattern_id       FK → challenges
├── symbol           "BTCUSDT"
├── timeframe        "4H"
├── alpha_score      82
├── direction        "SHORT"
├── snapshot_json    SignalSnapshot 전체
├── created_at       알림 발송 시각
├── feedback         "hit" / "miss" / "void" / null
├── feedback_source  "manual" / "auto"
├── manual_response  "agree" / "disagree" / null
└── judged_at        판정 시각
```
