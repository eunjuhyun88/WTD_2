# Coin Screener — 설계 문서

> **목적**: 바이낸스 알파 + 선물 전 종목을 11개 기준으로 자동 점수화해서 A/B/C 등급으로 분류.  
> Pattern Engine (차트 타이밍)의 업스트림 필터. 좋은 종목 먼저 걸러두고, 거기서 OI 반전 패턴 나올 때 잡는 구조.

---

## 1. 전체 흐름

```
[데이터 수집 레이어]
바이낸스 FAPI/SAPI  →  가격, OI, 펀딩비, 거래량
BSCscan API         →  지갑 분포, 온체인 거래
CoinGecko API       →  MC, FDV, 고점/저점 히스토리
Twitter API v2      →  팔로워 수, 최근 활동 여부
뉴스/공지 크롤러    →  이벤트, 락업 해제, 소각 일정

        ↓

[Screener Engine]
기준 11개 → 각 기준을 0~100 점수로 변환
→ 가중 합산 → 총점
→ A (80+) / B (60~79) / C (60 미만) 등급

        ↓

[출력]
/screener 페이지   →  등급별 종목 리스트, 기준별 점수 breakdown
알림               →  새로 A등급 진입한 종목 push
Pattern Engine 연동 →  A/B 등급 종목만 패턴 스캔 대상에 포함
```

---

## 2. 기준 11개 — 자동화 분류 및 구현 방법

### 기준 1 — Market Cap (자동화 ✅)

**원본 기준**: 최저점 MC 100M 이하. 이상적으로는 2M~30M.

**점수 로직**:
```python
def score_market_cap(min_mc_usd: float) -> float:
    if min_mc_usd <= 5_000_000:    return 100   # 2M~5M: 최적
    if min_mc_usd <= 30_000_000:   return 85    # 5M~30M: 좋음
    if min_mc_usd <= 100_000_000:  return 50    # 30M~100M: 허용
    return 0                                     # 100M 초과: 제외
```

**데이터 소스**:
- CoinGecko `/coins/{id}/market_chart` → 가격 히스토리
- 최저점 = `min(price_history) * circulating_supply`
- 바이낸스 알파 종목은 FDV 말고 circulating supply 기준

**주의**: FDV는 무시. 원본 기준 그대로.

---

### 기준 2 — 고점/저점 비율 (자동화 ✅)

**원본 기준**: 최저점이 고점 대비 -90% 이내. 20토막 종목 제외.

```python
def score_drawdown(all_time_high: float, all_time_low: float) -> float:
    drawdown = (all_time_high - all_time_low) / all_time_high  # 0~1

    if drawdown <= 0.90:   return 100   # -90% 이내: 좋음
    if drawdown <= 0.95:   return 40    # -90~95%: 애매함
    return 0                            # -95% 초과 (20토막): 제외
```

**추가 체크**: 이미 저점 대비 10~20배 오른 종목은 등급 하향.
```python
recovery_from_low = (current_price - all_time_low) / all_time_low

if recovery_from_low >= 10:
    grade_penalty = -2  # A → B로 강등 가능
```

**데이터 소스**: CoinGecko `/coins/{id}` → `market_data.ath`, `market_data.atl`

---

### 기준 3 — 섹터 (반자동화 ⚠️)

**원본 기준**: "애매하게 어중간한 섹터". 엄청 이슈되는 섹터 NO, 유명했던 종목 NO (IP, STBL 등).

이건 완전 자동화 불가. LLM 활용 + 블랙리스트 방식으로 근사.

**구현 방식**:

```python
# Step 1: 블랙리스트 (완전 제외)
BLACKLIST_TOKENS = ["IP", "STBL", ...]  # 유명했던 종목 수동 관리
BLACKLIST_SECTORS = ["meme_mainstream", "defi_bluechip", "l1_major"]

# Step 2: CoinGecko 카테고리로 섹터 분류
coin_categories = coinGecko.get("/coins/{id}")["categories"]

# Step 3: LLM으로 "어중간함" 점수화
prompt = f"""
다음 코인의 섹터를 평가해줘.
코인명: {name}, 카테고리: {categories}, 설명: {description}

아래 기준으로 0~100 점수를 줘:
- 100: 들어는 봤는데 대중적이지 않은 섹터 (GameFi 중소형, RWA 틈새 등)
- 50: 완전 생소하거나 너무 일반적
- 0: 이미 다 아는 메이저 섹터 (L1, 주요 DeFi 등)

숫자만 반환.
"""
sector_score = llm_call(prompt)
```

**LLM 비용 절감**: 종목당 1회만 호출, 결과 캐싱 (섹터는 잘 안 바뀜).

---

### 기준 4 — SNS 활동 (반자동화 ⚠️)

**원본 기준**: 트위터 활동 중, 팔로워 2만~40만.

```python
def score_sns(twitter_handle: str) -> float:
    data = twitter_api.get_user(twitter_handle)

    followers = data["public_metrics"]["followers_count"]
    last_tweet_days_ago = (now - data["most_recent_tweet_date"]).days

    # 팔로워 범위 체크
    if followers < 20_000:   follower_score = 0    # 제외
    elif followers <= 400_000: follower_score = 80
    else:                    follower_score = 50   # 너무 유명

    # 활동 여부
    activity_score = 100 if last_tweet_days_ago <= 7 else \
                     50 if last_tweet_days_ago <= 30 else 0

    return (follower_score + activity_score) / 2
```

**Twitter API 제약**: Basic tier $100/월, 읽기 10,000 요청/월.
→ 전 종목 매일 체크 불가. **주 1회 배치 업데이트**로 처리.
→ 팔로워는 잘 안 바뀌므로 캐싱 TTL 7일.

---

### 기준 5 — 호재/이벤트 (반자동화 ⚠️)

**원본 기준**: 1~3달 이내 락업 해제, 소각, 파트너십 등.

```python
# 데이터 소스 1: CoinGecko 공지
# 데이터 소스 2: 해당 프로젝트 트위터 크롤링
# 데이터 소스 3: 토크노믹스 사이트 (TokenUnlocks, Vesting.finance)

def score_events(symbol: str) -> float:
    events = fetch_upcoming_events(symbol, days_ahead=90)

    score = 0
    for event in events:
        if event.type == "token_burn":      score += 40
        if event.type == "unlock":          score -= 20   # 물량 증가 = 부정적
        if event.type == "partnership":     score += 30
        if event.type == "exchange_listing": score += 50
        if event.type == "product_launch":  score += 25

    return min(100, max(0, 50 + score))  # 기본 50, 이벤트로 조정
```

**락업 해제는 감점**: 원본 기준에선 "유통량 이슈"로 체크 — 해제 예정이면 악재.

---

### 기준 6 — 과거 이력 / 설거지 가능성 (자동화 ✅)

**원본 기준**: 이미 저점 대비 10~20배 오른 이력 있으면 등급 하향.

```python
def score_history(price_history: list) -> float:
    all_time_low = min(price_history)
    all_time_high = max(price_history)
    current_price = price_history[-1]

    max_recovery = all_time_high / all_time_low  # 저점 대비 최고점

    # 이미 크게 오른 적 있으면 다시 그만큼 오르기 힘듦
    if max_recovery >= 20:   return 20   # 이미 20배 → 재펌핑 어려움
    if max_recovery >= 10:   return 40   # 이미 10배 → B등급 수준
    if max_recovery >= 5:    return 70
    return 100                           # 아직 큰 상승 없음 → 잠재력 있음
```

---

### 기준 7 — 패턴 (자동화 ✅ — Pattern Engine 연동)

**원본 기준**: 우하향에서 추세 전환 중이거나 아직 하락 중. 이미 우상향 중인 건 손익비 나쁨.

이건 **Pattern Engine이 이미 계산하는 것**과 직접 연결됩니다.

```python
def score_pattern(symbol: str) -> float:
    state = pattern_state_machine.get_state(symbol)

    # Pattern Engine phase 매핑
    phase_scores = {
        "FAKE_DUMP":      60,   # 진입 금지지만 관심 대상
        "ARCH_ZONE":      70,   # 저갱 대기 — 좋음
        "REAL_DUMP":      80,   # 세력 숏 진입 확인 — 매우 좋음
        "ACCUMULATION":   100,  # ★ 진입 구간
        "BREAKOUT":       20,   # 이미 늦음
        None:             40,   # 패턴 미감지 (하락 중이면 별도 체크)
    }

    base_score = phase_scores.get(state.current_phase, 40)

    # 추가: 지금 우상향 중이면 감점
    price_change_30d = get_price_change(symbol, days=30)
    if price_change_30d > 0.5:   base_score -= 30  # 30일 +50% 이상 = 손익비 나쁨

    return max(0, base_score)
```

---

### 기준 8 — 봇 활동 여부 (자동화 ✅)

**원본 기준**: 바이낸스 봇이 매수/매도에 관여하는지.

봇 감지 = 비정상 거래 패턴 탐지.

```python
def score_bot_activity(symbol: str, klines: pd.DataFrame) -> float:
    # 봇 패턴 시그니처
    signals = []

    # 1. 거래량이 없는데 가격이 정확히 움직임
    vol_zero_price_move = (klines["volume"] < 100) & (klines["close"].diff().abs() > 0.001)
    signals.append(vol_zero_price_move.sum())

    # 2. 규칙적인 거래 간격 (봇은 일정 주기로 실행)
    trade_intervals = klines["timestamp"].diff().dropna()
    regularity = trade_intervals.std() / trade_intervals.mean()
    if regularity < 0.1:   signals.append(50)  # 너무 규칙적 = 봇

    # 3. 호가창 스푸핑 (대량 주문 걸었다 취소)
    # → 별도 orderbook 스냅샷 필요

    bot_score = sum(signals)
    # 봇이 관여할수록 오히려 세력 개입 신호일 수 있음
    # 원본 기준: "봇이 관여하는지 체크" → 관여 있으면 관심 대상
    return min(100, bot_score * 2)
```

**참고**: 봇 활동은 나쁜 신호가 아님. 세력이 봇으로 가격 관리한다는 뜻이므로 오히려 관심 신호.

---

### 기준 9 — 물량 독점 여부 (반자동화 ⚠️)

**원본 기준**: 재단/특정 지갑 물량 집중 여부. 개미 간섭 적어야 10~30배 가능.

```python
def score_supply_concentration(contract_address: str) -> float:
    # BSCscan API: top holders
    holders = bscscan.get_token_holders(contract_address, limit=50)

    top10_pct = sum(h["percentage"] for h in holders[:10])

    # 바이낸스 트레저리 지갑은 제외하고 계산
    BINANCE_WALLETS = ["0x...", "0x..."]  # 알려진 바낸 지갑들
    adjusted_holders = [h for h in holders if h["address"] not in BINANCE_WALLETS]
    adjusted_top10 = sum(h["percentage"] for h in adjusted_holders[:10])

    # 집중도 해석
    # 너무 분산 = 개미 많음 = 30배 어려움
    # 적당히 집중 = 세력 있음 = 관리 가능
    # 너무 집중 = 한 방에 덤핑 위험
    if adjusted_top10 > 80:   return 20   # 너무 집중 = 덤핑 위험
    if adjusted_top10 > 50:   return 80   # 적당한 집중 = 좋음
    if adjusted_top10 > 30:   return 60   # 분산됨 = 무거울 수 있음
    return 30                             # 너무 분산 = 개미판
```

**한계**: 바이낸스 트레저리 지갑은 완벽히 추적 불가. 원본 기준에서도 언급된 한계.

---

### 기준 10 — 아스터 상장 여부 (자동화 ✅ — 간단)

```python
def score_aster_listing(symbol: str) -> float:
    # 아스터 API 또는 수동 관리 리스트
    is_listed = check_aster_listing(symbol)
    return 60 if is_listed else 40  # 보너스 점수 정도
```

가중치 낮게 설정. 있으면 보너스, 없어도 감점 없음.

---

### 기준 11 — 온체인 데이터 (자동화 ✅ — Pattern Engine 재활용)

**원본 기준**: OI 변화, 펀딩비 변화, L/S 비율 변화를 큰 틀에서만 체크.

```python
def score_onchain(symbol: str) -> float:
    features = get_features(symbol)  # Pattern Engine이 이미 계산함

    score = 50  # 기본값

    # 펀딩비: 음수면 저평가 신호
    if features["funding_rate"] < -0.01:  score += 20
    if features["funding_rate"] > 0.05:   score -= 20

    # OI: 횡보 중에 OI 천천히 증가 = 세력 포지션 쌓는 중
    oi_trend = features["oi_change_24h"]
    if 0 < oi_trend < 0.05:  score += 15  # 천천히 증가 = 좋음
    if oi_trend > 0.15:      score -= 10  # 너무 빠른 증가 = 불안

    # L/S 비율: 숏이 많을수록 숏스퀴즈 잠재력
    ls_ratio = features["long_short_ratio"]
    if ls_ratio < 0.9:  score += 15  # 숏 우세 = 스퀴즈 잠재력

    return min(100, max(0, score))
```

---

## 3. 가중치 설계

기준별 중요도 차이가 크다. 원본 트레이더 기준에서 우선순위를 역산.

| 기준 | 가중치 | 이유 |
|---|---|---|
| MC (기준 1) | 20% | "경험적으로 가장 중요" — 원본 기준 1순위 |
| 고점/저점 비율 (기준 2) | 15% | 설거지 여부의 핵심 |
| 물량 독점 (기준 9) | 15% | "10~30배는 물량 집중 종목만 가능" |
| 패턴 (기준 7) | 12% | Pattern Engine 연동 — 진입 타이밍 |
| 과거 이력 (기준 6) | 10% | 이미 오른 거 또 안 오름 |
| 온체인 데이터 (기준 11) | 8% | 큰 틀에서만 체크 — 원본 기준 |
| SNS (기준 4) | 7% | 팔로워 기본 필터 |
| 섹터 (기준 3) | 5% | 주관적 — 낮게 |
| 호재/이벤트 (기준 5) | 4% | 보조 지표 |
| 봇 활동 (기준 8) | 2% | 참고용 |
| 아스터 (기준 10) | 2% | 보너스 |

**총점 계산**:
```python
total = (
    score_mc * 0.20 +
    score_drawdown * 0.15 +
    score_supply * 0.15 +
    score_pattern * 0.12 +
    score_history * 0.10 +
    score_onchain * 0.08 +
    score_sns * 0.07 +
    score_sector * 0.05 +
    score_events * 0.04 +
    score_bot * 0.02 +
    score_aster * 0.02
)
```

**등급**:
```
A: 총점 80+  → 최저점 대비 10배 이상 잠재력
B: 총점 60~79 → 2~5배 잠재력, 혹은 조건 일부 미충족
C: 총점 60 미만 → 현재 기준으로 패스
```

**하드 필터 (점수 무관 즉시 제외)**:
- MC 최저점 100M 초과
- 고점 대비 -95% 초과 (20토막)
- 트위터 팔로워 2만 미만
- 블랙리스트 종목

---

## 4. 데이터 수집 아키텍처

```
engine/screener/
  collectors/
    binance_collector.py    ← 가격, OI, 펀딩비, L/S (이미 있음)
    coingecko_collector.py  ← MC, ATH/ATL, 카테고리
    bscscan_collector.py    ← 지갑 분포, 온체인
    twitter_collector.py    ← 팔로워, 최근 트윗
    events_collector.py     ← 락업, 소각, 파트너십
  scorers/
    market_cap_scorer.py
    drawdown_scorer.py
    sector_scorer.py        ← LLM 호출 포함
    sns_scorer.py
    events_scorer.py
    history_scorer.py
    pattern_scorer.py       ← Pattern Engine 재활용
    bot_scorer.py
    supply_scorer.py
    aster_scorer.py
    onchain_scorer.py
  engine.py                 ← 전체 조율, 가중 합산, 등급 분류
  scheduler.py              ← 수집/평가 주기 관리
  store.py                  ← 결과 저장 (SQLite)
```

---

## 5. 업데이트 주기

데이터별로 변화 속도가 다르다. 불필요한 API 호출 최소화.

| 데이터 | 주기 | 이유 |
|---|---|---|
| 가격, OI, 펀딩비 | 15분 | 실시간성 필요 — 이미 수집 중 |
| MC, ATH/ATL | 1일 | 느리게 변함 |
| 트위터 팔로워/활동 | 7일 | Twitter API 한도 |
| 물량 분포 (BSCscan) | 1일 | 크게 안 바뀜 |
| 섹터 점수 (LLM) | 신규 종목 추가 시 1회 | 섹터는 안 바뀜, 캐싱 |
| 이벤트/호재 | 1일 | 공지 크롤링 |
| 패턴 점수 | 15분 | Pattern Engine 실시간 연동 |
| 아스터 상장 | 수동 업데이트 | 자주 안 바뀜 |

---

## 6. Pattern Engine 연동

Screener와 Pattern Engine은 **두 가지 방향으로 연결**된다.

### 방향 1: Screener → Pattern Engine (필터)
```
Screener A/B 등급 종목만 Pattern Engine 스캔 대상에 포함
C등급은 패턴 감시 제외 → 연산량 감소
```

```python
# engine/universe/dynamic.py 수정
def load_screened_universe() -> list[str]:
    """A/B 등급 종목만 반환"""
    screener_results = screener_store.get_latest()
    return [r.symbol for r in screener_results if r.grade in ["A", "B"]]
```

### 방향 2: Pattern Engine → Screener (점수 피드백)
```
Pattern Engine이 ACCUMULATION phase 감지
→ Screener 패턴 점수 업데이트
→ 해당 종목 총점 상승 → 등급 상향 가능
```

---

## 7. 앱 표면화

```
/screener 페이지
  ├── 등급별 탭 (A / B / C)
  ├── 종목 카드: 총점 + 기준별 점수 bar
  ├── 정렬: 총점 / MC / 패턴 phase 기준
  ├── 필터: 섹터, MC 범위, 등급
  └── 클릭 → 터미널로 이동 (해당 종목 차트 로드)

알림
  ├── 새로 A등급 진입한 종목
  ├── A등급 종목이 ACCUMULATION phase 진입 (최우선 알림)
  └── A등급 종목 등급 하락 (매도 참고)
```

---

## 8. 한계 및 수동 유지 필요 항목

자동화 못 하는 것들 — 사람이 주기적으로 업데이트해야 함.

| 항목 | 이유 | 관리 방법 |
|---|---|---|
| 블랙리스트 종목 (IP, STBL 등) | "유명했던 종목" 판단은 사람만 가능 | 수동 리스트 관리 |
| 바이낸스 트레저리 지갑 목록 | 공개 안 됨 | 알려진 것만 수동 추가 |
| KOL 팔로워 성향 분류 | afeng vs 王小二 같은 판단 | 수동 레이블 (KOL DB) |
| 섹터 "어중간함" 최종 판단 | LLM이 근사하지만 틀릴 수 있음 | LLM 점수 + 사람 검토 |
| 신규 종목 추가 | 알파 상장은 수시로 일어남 | 일 1회 신규 종목 체크 알림 |

---

## 9. 구현 우선순위

| 순서 | 작업 | 난이도 | 임팩트 |
|---|---|---|---|
| 1 | MC + 고점/저점 비율 scorer | 쉬움 | 높음 — 가장 중요한 기준 |
| 2 | 물량 분포 scorer (BSCscan) | 중간 | 높음 |
| 3 | Pattern Engine 연동 (패턴 점수) | 쉬움 — 이미 있음 | 높음 |
| 4 | 온체인 scorer (펀딩비/OI/LS) | 쉬움 — 이미 있음 | 중간 |
| 5 | 과거 이력 scorer | 쉬움 | 중간 |
| 6 | /screener 페이지 UI | 중간 | 높음 — 사용성 |
| 7 | Twitter SNS scorer | 중간 — API 비용 | 중간 |
| 8 | 섹터 scorer (LLM) | 중간 — LLM 비용 | 낮음 |
| 9 | 이벤트/호재 크롤러 | 어려움 | 중간 |
| 10 | 봇 활동 감지 | 어려움 | 낮음 |

**Sprint 1** (바로 시작 가능): MC + 고점저점 + 물량분포 + Pattern 연동 + onchain  
→ 이 5개만 있어도 원본 기준의 핵심 70%를 커버함.

---

## 10. 핵심 철학

> **Screener는 Pattern Engine의 업스트림 필터다.**  
> "좋은 종목"을 먼저 걸러두고, 그 중에서 "지금 타이밍인 종목"을 패턴으로 잡는다.

- Screener 없이 Pattern Engine만 돌리면: 쓰레기 종목에서도 패턴 알림이 온다.
- Pattern Engine 없이 Screener만 있으면: 언제 살지 모른다.
- 둘이 연결되면: **"A등급 종목이 ACCUMULATION 진입"** = 최우선 알림.
