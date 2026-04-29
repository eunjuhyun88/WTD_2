# Design v3.1 — Patch from PRD Deep Dives

**버전**: v3.1 (2026-04-25, patch over v3.0)
**상태**: canonical patch
**기반**: `cogochi-design-v3/` v3.0 + PRD set v1.3 (23 docs)
**의도**: PRD deep dive 13개에서 발견된 항목을 design 문서에 반영. **기존 문서 대체 X, 추가/수정 patch 제공**.

---

## 0. 이 문서의 위치

이 문서는 design v3.0의 **patch**다. 기존 8개 design 문서를 갈아엎지 않고, 다음 항목들을 추가/변경한다:

1. **Feature engineering** 추가 (Velo + 김프)
2. **AI agent scope** 보강 (Surf 방어선)
3. **Data contracts** 확장 (외부 source 통합)
4. **Implementation roadmap** 우선순위 재조정 (Surf 2.0 대응)
5. **Visualization** 보강 (한국 KST + 김프 widget)

각 patch는 **어느 design 문서를 수정하는지** 명시.

---

## 1. Feature Engineering 추가 (patches 06_DATA_CONTRACTS.md, 02_ENGINE_RUNTIME.md)

### 1.1 신규 features (P0 priority)

PRD_05C (Velo) + PRD_05N (Korea)에서 발견:

#### `oi_normalized_cvd`

```python
# 06_DATA_CONTRACTS.md feature_snapshot 에 추가
oi_normalized_cvd: float
# 정의: cvd_dollars_aggregated / oi_dollars_aggregated
# 의미: leverage 강도 정규화된 매수 vs 매도 강도
# 사용: pattern engine signal로 직접 활용
# 출처: Velo /market 페이지에서 검증된 derived metric
```

계산:
```python
def calc_oi_normalized_cvd(features):
    cvd = features['buy_dollar_volume_cum'] - features['sell_dollar_volume_cum']
    oi = features['oi_dollars_aggregated']
    return cvd / oi if oi > 0 else None
```

window: 1m, 5m, 15m, 1h, 4h 모두 적용.

#### `session_us / session_eu / session_apac`

```python
# 06_DATA_CONTRACTS.md feature_snapshot 에 추가
session_us: bool   # 8am-6pm New York time
session_eu: bool   # 8am-6pm Brussels time
session_apac: bool # 8am-6pm Seoul time
session_overlap: list[str]  # ['us','eu','apac'] 동시 boolean
```

함의:
- Pattern object에 `preferred_session` field 추가 가능
- 예: "이 패턴은 APAC session에만 발생하는 경향" → conditional retention
- KST 기반 한국 P0 친화

#### `kimchi_premium`

```python
# 06_DATA_CONTRACTS.md feature_snapshot 에 추가
kimchi_premium: float | None
# 정의: (upbit_krw_price / (binance_usdt_price * krw_usd_rate)) - 1
# 단위: %
# 의미: 한국 vs 글로벌 가격 격차
# 적용: BTC, ETH, top altcoin (Upbit 상장 종목만)
```

계산:
```python
def calc_kimchi_premium(symbol, ts):
    upbit = get_upbit_krw(symbol, ts)
    binance = get_binance_usdt(symbol, ts)
    rate = get_usd_krw(ts)
    if not (upbit and binance and rate):
        return None
    return (upbit / (binance * rate)) - 1
```

데이터 source:
- Upbit public API (free)
- Binance API (free)
- USD/KRW 환율 (한국은행 또는 free API)

함의: 한국 P0 unique pattern signal. "김프 5%+ 상태에서 OI spike" = 특수 trigger.

#### `funding_oi_weighted_avg`

```python
# Velo /market의 OI-weighted funding heatmap 패턴
funding_oi_weighted_avg: float
# 정의: sum(funding_rate × oi_per_exchange) / sum(oi_per_exchange)
# 단일 funding 평균 대신 OI 가중
# 사용: 각 거래소 영향력 반영한 종합 funding
```

#### `basis_3m_annualized` (BTC, ETH only)

```python
# Velo special column. coin-margined futures
basis_3m_annualized: float | None
# 정의: 3개월 만기 dated future 가격과 spot 차이의 연환산
# BTC, ETH coin-margined만 가능
```

### 1.2 Feature snapshot schema 추가 (patch 06_DATA_CONTRACTS.md)

기존 feature_snapshot에 추가:

```json
{
  "...existing fields...": "...",
  
  "oi_normalized_cvd_1m": float,
  "oi_normalized_cvd_5m": float,
  "oi_normalized_cvd_15m": float,
  "oi_normalized_cvd_1h": float,
  
  "funding_oi_weighted_avg_1h": float,
  "basis_3m_annualized": float,
  
  "session_us": bool,
  "session_eu": bool,
  "session_apac": bool,
  
  "kimchi_premium": float
}
```

---

## 2. Pattern Object Model 확장 (patches 01_PATTERN_OBJECT_MODEL.md)

### 2.1 PatternDraft schema 추가 fields

```typescript
interface PatternDraft {
  // ...existing fields...
  
  preferred_session?: 'us' | 'eu' | 'apac' | 'any';
  // 패턴이 특정 session에서만 유효한지
  
  kimchi_premium_condition?: {
    operator: 'gt' | 'lt' | 'between';
    value: number | [number, number];
  };
  // 김프 조건 (한국 specific)
  
  multi_exchange_required?: boolean;
  // 단일 거래소가 아닌 cross-exchange aggregation 요구
}
```

### 2.2 Vocabulary 추가 (25 → 30 signals)

새 signals:

26. `oi_normalized_cvd_spike` (절대값 기준 percentile)
27. `oi_normalized_cvd_divergence` (가격과 반대 방향)
28. `session_open_break` (session 시작 후 N분 내 변동)
29. `kimchi_premium_extreme` (top 5% percentile)
30. `funding_basis_divergence` (funding과 basis 방향 반대)

---

## 3. AI Agent Layer 강화 (patches 04_AI_AGENT_LAYER.md)

### 3.1 Closed-loop 원칙 명시

PRD_05J (TrendSpider Sidekick)에서 차용:

> **Cogochi parser/judge agent는 외부 web search를 하지 않는다. Verdict ledger + pattern library + connected feature snapshot만 reference.**

**이유**:
- Hallucination 최소화 (Sidekick의 trust 모델)
- Surf의 broad-data 접근과 차별화 (우리는 deep-data closed-loop)
- 사용자 데이터 privacy 강화

**구현 변경**:

```python
# 04_AI_AGENT_LAYER.md parser
class Parser:
    """Natural language → PatternDraft JSON"""
    
    allowed_context = [
        "user_verdict_ledger",  # 사용자 본인 verdict
        "pattern_library_public",  # 공개 pattern
        "pattern_library_user",  # 본인 pattern
        "feature_snapshot_current",  # 현재 시점 feature
    ]
    
    forbidden_context = [
        "web_search",  # ❌
        "external_api",  # ❌ (단 verified data sources 제외)
        "social_media",  # ❌
    ]
```

### 3.2 Korean 자연어 parser 강화

기존 parser는 영어 중심. PRD_05N에서 발견된 한국 P0 wedge:

**한국어 parser 우선 학습 set**:
- "BTC 1m봉에서 OI 15% 펌핑 + 펀딩 0.05% 이상"
- "김프 5%+ 상태 + 거래량 급증"
- "비트 1H 양운 이탈 + funding 음수"
- "이더 OI normalized CVD 양수 전환 + 가격 횡보"

**Output**: 동일한 PatternDraft JSON. 단 input은 한국어 natural.

P1 priority. 영어 parser와 multi-language fallback.

### 3.3 Surf 방어 — narrow scope 명확화

PRD_05G (Surf 2.0)에서 발견된 위협 대응:

**Cogochi parser scope**:
- ✅ Pattern 정의 (NL → PatternDraft)
- ✅ Verdict 결과 advice (post-72h judgment)
- ✅ Variant suggestion (threshold tuning)
- ❌ General market research
- ❌ Social sentiment analysis
- ❌ News summarization
- ❌ Trade execution suggestion

**이유**: Surf은 generalist. 우리는 narrow specialist. 자연어 query라도 우리 scope 내만.

scope 외 query 처리:
```python
if query_outside_scope(query):
    return "Cogochi는 pattern memory + verdict 워크플로 전용입니다. "
           "일반 리서치는 Surf, 데이터는 Velo/CoinGlass를 추천합니다."
```

**4-layer stack 메시지를 product UI에 자연스럽게 노출**.

---

## 4. Search Engine 보강 (patches 03_SEARCH_ENGINE.md)

### 4.1 Sequence Matcher 우선순위 격상

PRD_05G에서 Surf 2.0 Studio가 가장 큰 위협. 대응:

**기존 timeline**:
- Slice 6: Search engine stage 1+2 (M3-M6)

**v3.1 변경**:
- Slice 6에 **Sequence Matcher 핵심 알고리즘 포함**
- Stage 1 (candidate filter) + **Stage 2 (sequence matching)**을 GA 시점까지 ship
- Stage 3+ (rerank, LLM judge)는 Open Beta

**Sequence Matcher 구현 spec 강화**:

```python
class SequenceMatcher:
    """Phase path 비교 기반 유사 case 검색"""
    
    def find_similar(
        self,
        target_phase_path: list[Phase],  # 현재 진행 중 패턴의 phase 시퀀스
        target_features: dict,
        k: int = 5,
        time_window: str = "180d",
    ) -> list[SimilarCase]:
        # 1. Phase sequence dynamic time warping 거리
        # 2. Feature snapshot Euclidean (선별 features)
        # 3. Time decay (최근 가중)
        # 4. User-specific verdict bias (verdict한 case 우선)
        ...
```

**Phase path representation**:

```python
@dataclass
class Phase:
    phase_id: str  # 'oi_buildup', 'price_consolidation', 'breakout', ...
    duration_min: int
    transition_score: float  # 0-1, 다음 phase로의 confidence
```

**왜 Studio가 못 만드는가**:
- DTW 알고리즘 + feature engineering depth
- Verdict ledger와 결합한 self-learning ranker
- 사용자별 verdict bias 반영
- 단순 dashboard generator 범위 밖

### 4.2 한국어 query 지원 (Stage 1)

```python
class CandidateFilter:
    """Stage 1: 자연어 query → 후보 set"""
    
    def filter(self, query: str, language: 'auto' | 'en' | 'ko' = 'auto'):
        # 한국어 query 직접 처리
        # 예: "OI 펌핑 + 펀딩 음수" → feature condition mapping
        ...
```

---

## 5. Visualization Engine 보강 (patches 05_VISUALIZATION_ENGINE.md)

### 5.1 신규 widget: Kimchi Premium overlay

PRD_05N 한국 specific:

```typescript
interface KimchiPremiumWidget {
  type: 'overlay' | 'panel';
  symbols: string[];  // BTC, ETH 등 Upbit 상장
  threshold_alerts?: {
    high: number;  // 5% 이상
    low: number;   // -2% 이하
  };
}
```

표시 위치:
- Pattern detail page 보조 panel
- Home dashboard 한국 사용자 default

### 5.2 Session overlay on chart

Velo Cumulative Return By Session 차용:

```typescript
interface SessionOverlay {
  show_us_session: boolean;
  show_eu_session: boolean;
  show_apac_session: boolean;
  background_color: 'subtle' | 'highlight';
}
```

차트 background에 session 구간 색칠. APAC session 강조 (한국 P0 default).

### 5.3 KST default + Overnight digest

```typescript
interface UserPreferences {
  timezone: string;  // 'Asia/Seoul' default for KR users
  daily_digest: {
    enabled: boolean;
    delivery_time: string;  // '07:00' KST
    contents: ('overnight_patterns' | 'verdict_due' | 'open_alerts')[];
  };
}
```

**Overnight digest** = 한국 P0가 잠든 사이 (US session) 발생한 pattern 요약. 매일 아침 7시 KST.

### 5.4 Telegram out 채널

PRD_05L (Telegram ecosystem) 통합:

```typescript
interface TelegramOutChannel {
  bot_token: string;  // 사용자가 직접 봇 만든 token
  chat_id: string;    // 본인 채널
  trigger_events: ('capture' | 'verdict_due' | 'pattern_alert' | 'similar_case_found')[];
  format: 'compact' | 'detailed';
  language: 'ko' | 'en';
}
```

**왜 중요**: 한국 P0의 복기 routine이 Telegram 위에 있음. 우리가 Telegram을 대체하지 말고 **출구 통합**.

---

## 6. Data Contracts 확장 (patches 06_DATA_CONTRACTS.md)

### 6.1 외부 데이터 source 통합

PRD_05C (Velo) + PRD_05D (CoinGlass) 차용:

```yaml
data_sources:
  primary:
    - name: binance
      type: native_websocket
      cost: free
      data: [futures, spot, OHLC, trades]
    - name: bybit
      type: native_websocket
      cost: free
      data: [futures, spot, OHLC, trades]
    - name: okx
      type: native_websocket
      cost: free
      data: [futures, spot, OHLC, trades]
  
  aggregated:
    - name: coinglass
      type: rest_api
      cost: $12/mo (Premium) or $99/mo (API Standard)
      data: [funding, oi, liquidation, etf, hyperliquid_whale]
      use: macro context, ETF flows
    
    - name: velo_data_api
      type: rest_api + sdk
      cost: $199/mo (yearly required for full history)
      data: [oi_normalized_cvd, basis, options, cme]
      use: derived features, high-quality cross-exchange
    
    - name: velo_news_api
      type: websocket
      cost: $129/mo
      data: [news_priority, news_per_coin]
      use: news-conditioned pattern reset
  
  korea_specific:
    - name: upbit
      type: rest_api
      cost: free
      data: [krw_price, volume, orderbook]
      use: kimchi_premium calculation
    
    - name: forex_rate
      type: rest_api
      cost: free (multiple sources)
      data: [usd_krw_rate]
      use: kimchi_premium denominator
```

### 6.2 News WebSocket consumer (P1)

PRD_05C에서 발견된 Velo News API 가치:

```python
# News-conditioned pattern reset
@news_handler('priority_1')
def on_priority_news(news: NewsEvent):
    affected_coins = news.coins
    for coin in affected_coins:
        # 해당 코인의 active pattern_runtime_state pause
        # 5분 후 resume + 사용자에게 alert
        # Pattern confidence -50% if news 동안 capture
        ...
```

함의:
- Pattern engine이 시장 노이즈 (FOMC, ETF approval 등)에 false positive 안 냄
- 사용자에게 "주의: 큰 뉴스 발생 중" warning

### 6.3 CSV export endpoint (P0 power user)

PRD_05C에서 차용:

```yaml
api_endpoints:
  - GET /api/v1/captures/export?format=csv&from=YYYY-MM-DD&to=YYYY-MM-DD
  - GET /api/v1/verdicts/export?format=csv
  - GET /api/v1/patterns/export?pattern_id=...
```

Pro Plus tier에 CSV export 기본 포함. P0 power user retention 도구.

---

## 7. Implementation Roadmap 우선순위 재조정 (patches 07_IMPLEMENTATION_ROADMAP.md)

### 7.1 Slice 우선순위 변경 근거

PRD_05G (Surf 2.0)에서 도출된 결론: **Sequence Matcher + Verdict Ledger 깊이 = 우리 핵심 moat**. 6개월 내 GA 필요.

### 7.2 v3.1 새 slice 순서

```
Phase 1 (M0-M1, 6주):
  Slice 1: Contract cleanup [unchanged]
  Slice 2: Durable state plane [unchanged]
  Slice 3: AI parser (KO + EN) [+한국어 parser]
  Slice 4: Save Setup canonical [unchanged]
  Slice 5: Split ledger [unchanged]

Phase 2 (M1-M3, 8주):
  Slice 6: Search engine Stage 1 + 2 [Sequence Matcher 격상]
  Slice 7: Visualization 6 templates [+ KST + 김프 + session overlay]
  Slice 8: Verdict loop + refinement [unchanged]
  Slice 9: Reranker v1 (shadow) [unchanged]

Phase 3 (M3-M6, 12주):
  Slice 10: Personal variants [unchanged]
  Slice 11: Telegram out + Korean payment [신규, 한국 진입]
  Slice 12: News API consumer (Velo or self-built) [신규]
  Slice 13: Reranker promotion to primary [unchanged]
```

### 7.3 신규 slice 상세

#### Slice 11: Telegram out + Korean payment (M4-M5)

**목표**: 한국 P0 채널 통합 + 결제 friction 제거

**Tasks**:
- Telegram Bot API integration (out direction)
- 사용자 Telegram bot setup 가이드 (한국어)
- KG inicis 또는 토스 페이먼츠 결제 게이트 PoC
- 한국어 UI 100% (영어 fallback)

**Success criteria**:
- 사용자 5명 Telegram alert 정상 수신
- 카카오페이 결제 1회 성공
- 한국어 UI complete (모든 string)

#### Slice 12: News API consumer (M5-M6)

**목표**: 노이즈 시점 false positive 차단

**Decision needed**:
- Option A: Velo News API $129/mo subscribe
- Option B: 자체 구축 (CoinDesk + Twitter + 주요 거래소 announcement)
- Option C: 둘 다 (high-priority Velo, 일반 self-built)

**Tasks**:
- News classifier (priority 1 vs 일반)
- Pattern runtime state news-pause 로직
- News-conditioned verdict adjustment

---

## 8. Surf 위협 대응 — Defense Plan (신규 section, patches 00_MASTER_ARCHITECTURE.md)

### 8.1 Defense layers

PRD_05G에서 도출:

**Layer 1: Algorithmic depth** (3-6개월)
- Sequence Matcher GA — DTW + feature ML
- Phase overlay engine
- Personal variant threshold engine

**Layer 2: Verdict data moat** (6-12개월)
- 1000+ verdicts 누적
- Verdict-conditioned reranker
- "사용자 N명 검증한 패턴" badge

**Layer 3: Korean lock-in** (3-9개월)
- 한국어 parser
- 김프 metric
- Telegram 통합
- 카카오페이 결제

**Layer 4: Niche depth** (12+개월)
- Team workspace (Phase 2)
- Personal LoRA adapter (Phase 3)
- API + MCP server (Phase 3)

### 8.2 Surf Studio Gallery 모니터링 routine

```yaml
weekly_check:
  - url: https://asksurf.ai/studio/gallery
  - search_terms: ['pattern', 'memory', 'verdict', 'derivatives', 'OI', 'funding']
  - threshold: 같은 카테고리 app 등장 시 alert
  - response: 24h 내 marketing 대응 (차별화 메시지 강화)
```

monthly:
- Surf release notes 추적
- Surf Twitter @askSurfAi
- CAIA benchmark 외부 검증 자료 search

---

## 9. 성능 / SLA 보강 (patches 02_ENGINE_RUNTIME.md)

### 9.1 Velo style 5Hz update target

기존 design v3에서 1m resolution. v3.1에서:

- **Pattern engine scan cycle**: 15min (unchanged)
- **Feature snapshot update**: 1min (unchanged)
- **Live chart data**: **5Hz** (Velo 수준, P0 power user 기대치)
- **Alert delivery**: < 5s (capture → Telegram out)

### 9.2 Multi-exchange aggregation latency

Velo 스타일:
- Binance + Bybit + OKX 동시 stream
- aggregation latency p95 < 200ms
- failover: 1개 거래소 down 시 가중치 재계산

---

## 10. P3 — MCP server 출시 (patches 06_DATA_CONTRACTS.md)

PRD_05F (Surf), PRD_05I (Laevitas)에서 발견된 트렌드:

**Cogochi MCP server (P3)**:

```yaml
mcp_endpoints:
  - search_patterns: "유저 verdict ledger 검색"
  - get_pattern_detail: "특정 pattern object 조회"
  - find_similar_cases: "현재 setup과 유사한 과거 case"
  - get_user_verdict_stats: "사용자 verdict 누적 통계"

target_clients:
  - Claude Code
  - Cursor
  - Custom AI agents
```

**Distribution**:
```bash
npx skills add cogochi/cogochi-skill --skill cogochi
```

**Pricing**:
- Free tier: 30 requests/day (Surf 모방)
- Pro tier: 우리 Pro Plus 구독 시 unlimited

P3 timeline. 단 우선 P0/P1에 집중.

---

## 11. 변경 영향 받는 design 문서 list

| 문서 | 변경 내용 |
|---|---|
| 00_MASTER_ARCHITECTURE.md | Section 8 Defense Plan 신규 |
| 01_PATTERN_OBJECT_MODEL.md | Vocabulary 25→30, PatternDraft schema 확장 |
| 02_ENGINE_RUNTIME.md | 신규 features (kimchi, session, oi_norm_cvd), 5Hz target |
| 03_SEARCH_ENGINE.md | Sequence Matcher 격상, 한국어 query |
| 04_AI_AGENT_LAYER.md | Closed-loop 원칙, KO parser, scope narrow |
| 05_VISUALIZATION_ENGINE.md | KST + 김프 + session + Telegram out |
| 06_DATA_CONTRACTS.md | 외부 source list, news consumer, CSV export, MCP |
| 07_IMPLEMENTATION_ROADMAP.md | Slice 11+12 신규, 우선순위 재조정 |

---

## 12. 즉시 적용 vs 점진 적용

### 12.1 즉시 (M0-M1)

- [ ] 한국어 parser 학습 set 작성 (50 examples 수집)
- [ ] Closed-loop 원칙 명문화 (parser/judge agent)
- [ ] Sequence Matcher 알고리즘 spec 작성
- [ ] Telegram out webhook 설계

### 12.2 Phase 1 (M1-M3)

- [ ] kimchi_premium feature 구현
- [ ] Session overlay UI
- [ ] News API consumer PoC (Velo $129 trial)
- [ ] KST default 처리

### 12.3 Phase 2+ (M3-M6+)

- [ ] Korean payment (KG inicis / 토스)
- [ ] Telegram out 통합 GA
- [ ] CSV export endpoint
- [ ] MCP server (P3)

---

## 13. Non-Goals (v3.1 patch)

명시적으로 안 하는 것:

- ❌ Trading execution 추가 (Velo와 분리 유지)
- ❌ DEX swap (Surf executor mode와 분리)
- ❌ DeFi lending (Velo HyperEVM 영역)
- ❌ Options 완전 분석 (Laevitas 영역)
- ❌ On-chain 깊이 (Surf, Glassnode 영역)
- ❌ Social sentiment (Surf 영역)
- ❌ News aggregation 자체 (Velo News API consume)
- ❌ Generic crypto chat (Surf 영역)
- ❌ No-code app builder (Surf Studio 영역)
- ❌ 자체 trading bot (Telegram bot 생태계 영역)

---

## 14. 변경 이력

| Version | Date | Change |
|---|---|---|
| v3.0 | 2026-04-25 | Initial canonical set (8 docs) |
| v3.1 | 2026-04-25 | PRD deep dive 13개 반영 patch — features, KO parser, Sequence Matcher 격상, Telegram out, KST default, MCP server P3 |

---

## 15. 한 줄 요약

> **Design v3.1 = v3.0 + PRD deep dive 인사이트 반영.**
>
> **핵심 변경: (1) 신규 features (oi_normalized_cvd, session, kimchi_premium), (2) 한국어 parser P0 priority, (3) Sequence Matcher 격상 (Surf 방어), (4) Closed-loop AI scope, (5) Telegram out 통합, (6) KST default + 김프 widget, (7) Slice 11(한국 진입) + 12(news consumer) 신규.**
>
> **Surf 2.0 Studio 위협 대응 = Algorithmic depth + Verdict data moat + Korean lock-in + Niche depth 4-layer defense.**
