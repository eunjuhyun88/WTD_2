# 01 — User Persona

**버전**: v1.0 (2026-04-25)
**상태**: canonical
**의도**: 막연한 "고급 트레이더"를 구체적 세그먼트로 쪼개 제품 결정의 기준점을 만든다

---

## 0. 원칙

### 0.1 페르소나는 평균 유저가 아니다

한 명에게 제품이 붙으면 10명이 따라온다. 반대로 평균치에 맞추면 아무에게도 안 붙는다.

### 0.2 4가지 기준으로 페르소나 필터링

1. **Capture behavior** — 복기를 실제로 하는가
2. **Derivatives literacy** — OI / funding / liq 읽는가
3. **Willingness to pay** — 월 $30+ 쓸 용의
4. **Team context** — 혼자인가, 팀인가

이 4개 축이 모두 강한 세그먼트가 primary.

### 0.3 비-목표

- 초보자 (복기 습관 없음, derivatives 이해 부족)
- 스팟/롱온리 투자자 (OI/funding 관심 없음)
- 카피트레이딩 유저 (판단을 아웃소싱)

---

## 1. Primary Persona (P0) — "복기하는 개인 프로"

### 1.1 Profile

- **이름**: "Jae" (가칭), 28-38세
- **직업**: 전업 or 반전업 크립토 트레이더
- **거주**: 한국·대만·홍콩·싱가포르·베트남 중심, 일부 미국
- **거래 경력**: 3-7년
- **운용 자산**: $50K - $2M
- **일일 거래 시간**: 4-10시간
- **주 사용 거래소**: Binance perp (primary), Bybit, OKX
- **Leverage**: 3-10x 기본, 이벤트 시 20x
- **Preferred TF**: 15m, 1h, 4h 조합

### 1.2 Behavior

**이미 하고 있는 것**:
- Telegram/X에 복기 포스트 쓴다 (공개 or 비공개)
- 스크린샷 저장, Notion/Bear에 메모
- 매일 2-4시간 차트 분석
- OI/funding/liq 데이터 확인 (CoinGlass/Hyblock 사용 중)
- 과거 매매 기록 csv로 관리 (부분적)

**잘 못하고 있는 것**:
- 저장한 스크린샷 다시 못 찾음
- "비슷한 패턴" 기억 안 남
- 복기 → 다음 매매 연결 약함
- 승률은 알아도 왜 틀렸는지 구조화 못 함
- 팀/친구와 패턴 공유할 때 말로만 함

### 1.3 Pain Points (우선순위)

1. **"내가 본 그 패턴 다시 못 찾아"** — 가장 큰 불만
2. "복기하면 뭐해 시장은 이미 지나감"
3. "내 edge가 뭔지 숫자로 몰라"
4. "CoinGlass는 데이터만 주고 해석을 안 해줌"
5. "Surf는 요약은 잘해도 내 관점이 아님"

### 1.4 JTBD (Jobs To Be Done)

- "When I see a setup unfold, I want to **save it with context**, so that I can recall and validate the pattern later."
- "When I spot a move, I want to find **similar historical cases**, so I know if this setup actually works."
- "When I finish a trade, I want to **know if my pattern generalizes**, so I can scale conviction."

### 1.5 WTP

- 현재 지출: CoinGlass Prime ($12/mo) + Hyblock Pro ($50-100/mo) + TradingView Premium ($60/mo) = **~$120-170/mo**
- 추가 지출 여력: $30-80/mo
- **제품 합리적 가격**: **$29-79/mo Pro**

### 1.6 Size Estimate [estimate]

- 글로벌 active crypto perp traders: ~500k-1M [estimate, Binance annual report 간접 추정]
- "복기하는" subset (10-15%): ~50k-150k
- 영어/한중 언어 커버: ~30k-80k
- **realistic TAM**: 20k-50k

M3 목표: 200 WAA → TAM의 0.5-1%. M12 목표: 2,000 WAA → 4-10%.

### 1.7 Primary-segment 여부

| Criterion | Score |
|---|---|
| Capture behavior | ★★★★★ |
| Derivatives literacy | ★★★★★ |
| Willingness to pay | ★★★★ |
| Team context | ★★ (개인) |

→ **P0 primary**. 제품 결정의 1순위 레퍼런스.

---

## 2. Secondary Persona (P1) — "Trading desk / 팀 리서처"

### 2.1 Profile

- 3-10명 규모 crypto 트레이딩 데스크
- 중간 리서처 / 주니어 애널리스트
- 25-35세
- AUM $1M-$50M (desk 기준)
- Telegram/Discord로 내부 소통
- Notion/Slack에 리서치 아카이브

### 2.2 Behavior

- 리더 트레이더가 rule을 세팅하면 팀이 집행/모니터링
- 매일 morning research note 공유
- 매주 review 회의에서 복기
- 패턴 이름을 팀 내부 용어로 부름 ("TRADOOR 패턴", "PTB 스타일")
- 신입에게 패턴 전수가 비효율적 (말로 설명)

### 2.3 Pain Points

1. **"우리 팀 패턴이 정리돼 있지 않음"** — 리더 머릿속에만
2. "새 팀원 온보딩 2-3개월 걸림"
3. "공유한 스크린샷/복기가 search 안 됨"
4. "리더 없을 때 팀이 독립적 판단 어려움"
5. "performance attribution이 주관적"

### 2.4 JTBD

- "When our senior trader finds a new pattern, we want to **codify it into a searchable library**, so the team can monitor it even when he's asleep."
- "When a junior trader spots a setup, we want them to **verify against the team's pattern corpus**, so they learn faster."

### 2.5 WTP

- Individual tool budget per trader: $100-300/mo 허용
- Team workspace: $200-1000/mo 기꺼이 지출
- Enterprise (>10 seats): $2K-5K/mo 가능

### 2.6 Size Estimate [estimate]

- 글로벌 crypto trading desks (3-10명): ~2K-5K
- 패턴 복기 문화 있는 subset: ~300-800 desks
- 시간당 ARPU $500/desk 가정 → **TAM $150K-400K MRR**

M6 목표: 20 teams. M12: 80 teams.

### 2.7 Persona Score

| Criterion | Score |
|---|---|
| Capture behavior | ★★★★ |
| Derivatives literacy | ★★★★★ |
| Willingness to pay | ★★★★★ |
| Team context | ★★★★★ |

→ **P1 secondary, Phase 2 primary**. 장기 moat 가장 강한 세그먼트.

---

## 3. Tertiary Persona (P2) — "Quant/systematic researcher"

### 3.1 Profile

- 1-3명 small quant shop 또는 solo
- Python/Rust 코딩 가능
- 30-45세
- 데이터 기반 전략 리서치
- 기존 도구: Jupyter + CoinGlass API + proprietary backtester

### 3.2 Behavior

- 아이디어 → SQL/pandas로 feature 생성 → backtest
- LightGBM/XGBoost 모델 학습
- Regime awareness 중요
- UI 덜 중요, API/export 중요

### 3.3 Pain Points

1. "매번 feature 계산 다시 짜야 함"
2. "backtest가 real-time로 안 이어짐"
3. "tick data 좋은 source가 비쌈 ($1K+/mo)"
4. "rule → model promotion 프로세스 없음"

### 3.4 JTBD

- "When I find a feature pattern, I want to **backtest and productionize** without rewriting everything."
- "When I build a model, I want to **share the pattern spec with my discretionary teammate**."

### 3.5 WTP

- API access: $49-199/mo
- Data export: $99/mo
- Enterprise: $500-2K/mo

### 3.6 Size Estimate [estimate]

- Global crypto solo/small quants: ~5K-15K
- Addressable subset: 10-20% = 500-3000
- ARPU $150 avg → TAM ~$75K-450K MRR

### 3.7 Persona Score

| Criterion | Score |
|---|---|
| Capture behavior | ★★★ (코드로 표현) |
| Derivatives literacy | ★★★★★ |
| Willingness to pay | ★★★★ |
| Team context | ★★ |

→ **P2 tertiary, Phase 3 candidate**. API surface 준비되면 접근.

---

## 4. Anti-Persona (절대 타겟 아님)

### 4.1 "초보 카피트레이더"

- 거래 경력 < 1년
- 판단 외주형
- 저가 구독 ($5-10) 기대
- 복기 안 함
- Derivatives 이해 ≤ 기본

**왜 안 되나**: 제품 핵심 가치(복기 + 검색)를 쓸 habit이 없다. Churn 높음. Support cost 높음. 가격 민감.

### 4.2 "인플루언서 follower"

- 셀럽 call 따라감
- 자기 thesis 없음
- 콘텐츠 소비형

**왜 안 되나**: verdict 데이터 생산 안 함 = moat 기여 0.

### 4.3 "Long-term holder / investor"

- 월 1-2회 거래
- TF 일봉+
- OI/funding 무관심

**왜 안 되나**: 제품 use frequency가 너무 낮음. ARPU 불가.

---

## 5. Persona Decisions Matrix

제품 결정에서 persona가 충돌할 때 우선순위.

| Decision Area | Primary Reference |
|---|---|
| UX density (정보량) | P0 (high density OK) |
| Onboarding length | P0 (자기 학습형) |
| 모바일 지원 범위 | P0 (desktop first, mobile observe only) |
| 팀 기능 priority | P1 (after P0 validated) |
| API surface | P2 (Phase 3) |
| 가격 점프 | P0 → P1 (개인 → 팀) |
| 차트 복잡도 | P0 (multi-pane OK) |
| AI 자동화 수준 | P0/P1 (judge, not decide) |
| 영어/한국어 | Bilingual (P0 Asia 중심) |

---

## 6. Persona → Feature Mapping

각 persona가 가장 쓸 기능 우선순위.

| Feature | P0 | P1 | P2 |
|---|---|---|---|
| Save Setup + auto-feature snapshot | ★★★★★ | ★★★★★ | ★★★ |
| Pattern search (sequence-based) | ★★★★★ | ★★★★★ | ★★★★ |
| Phase timeline visualization | ★★★★ | ★★★★ | ★★ |
| Verdict inbox | ★★★★★ | ★★★★★ | ★★★ |
| Team shared library | ★ | ★★★★★ | ★★ |
| Personal variant threshold | ★★★★ | ★★★ | ★★★★★ |
| API / CSV export | ★★ | ★★★ | ★★★★★ |
| Telegram/Discord alerts | ★★★★ | ★★★★★ | ★★★ |
| Mobile observe mode | ★★★★ | ★★★ | ★ |
| AI explainer | ★★★ | ★★★★ | ★★ |

---

## 7. Persona Interviews Needed (pre-launch)

M0 이전에 실제 대화 필요한 최소 수.

| Segment | Target count | Format |
|---|---|---|
| P0 (개인 프로) | 15-25 | 45min call |
| P1 (팀 리더) | 5-10 | 60min call |
| P2 (quant) | 3-5 | 30min call |

확인할 것:
- 가격 민감도
- 핵심 use case 검증
- 경쟁사 실사용 시간
- 만일 오늘 launch하면 어떤 기능을 가장 먼저 쓸 것인지

---

## 8. Persona validation KPI

페르소나 hypothesis가 맞는지 얼마나 빠르게 검증할 것인가.

| KPI | Target @ M1 | Target @ M3 |
|---|---|---|
| P0 sign-up conversion (landing → trial) | 3% | 5% |
| P0 trial → paid conversion | 15% | 25% |
| P0 W4 retention | 40% | 55% |
| P1 pilot team count | 2 | 8 |
| P1 avg seats per team | 3 | 5 |
| P2 API preview signup | 50 | 200 |

M3까지 P0 retention < 30% → 페르소나 재정의 or pivot 검토.

---

## 9. Non-Goals (Persona 측면)

- "모든 트레이더"를 포괄하려 하지 않는다
- 초보자 onboarding funnel은 investment하지 않는다
- 카피트레이딩 feature 안 만든다
- Spot-only 투자자용 뷰 안 만든다
- Influencer-led social layer 안 만든다

---

## 10. 한 줄 요약

> **P0 = 복기하는 프로 개인 트레이더. 이게 맞으면 P1(팀)으로 확장한다. P2(quant)는 API가 나온 후.**
