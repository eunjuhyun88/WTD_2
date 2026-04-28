**COGOCHI**

**차트 트레이딩 기반 개인화 카피트레이딩 AI 에이전트**

AI Researcher Perspective — Technical Design Document v1.0  |  2026.04

# **1\. 핵심 명제**

| 한 줄 정의 내가 차트에서 발견한 패턴을 AI가 기억하고, 24시간 전체 시장을 스캔해서 패턴이 나타나면, 나 대신 자동으로 거래하고, 결과로 스스로 학습한다. |
| :---- |

기존 카피트레이딩(Bybit, Binance)은 타인의 전략을 복사합니다. Cogochi는 정반대입니다 — 내 고유 트레이딩 패턴을 AI가 학습하여 실행합니다. 이 방향은 2026년 현재 Minara·Hey Elsa·Bankr·Surf AI 어디에도 존재하지 않습니다.

# **2\. 왜 이 설계인가 — AI 리서처 관점**

## **2-1. LLM의 역할에 대한 근본 질문**

트레이딩에서 LLM을 '판단자'로 쓰면 안 되는 이유는 단순합니다. 같은 차트를 100번 보여줘도 100번 다른 확률을 출력합니다. 이는 백테스트를 신뢰할 수 없게 만들고, 전략 개선 루프를 불가능하게 합니다.

**관련 연구에서 도출된 역할 구분:**

| 연구 | LLM 역할 | 판단 방식 |
| ----- | ----- | ----- |
| QuantAgent(Xiong et al., 2025\) | OHLC → 구조화된 신호 추출(Indicator/Pattern/Trend Agent) | 4개 LLM 합의 → 코드가 threshold 적용 |
| TradingAgents(Xiao et al., 2025\) | 뉴스·감성 수집 \+ 분석 보고서(Fundamentals/Sentiment/Technical) | 멀티 LLM 토론 → Fund Manager 결정 |
| ai-hedge-fund(virattt) | 전문 애널리스트 역할 분담(각자 독립 보고서 작성) | LLM이 최종 판단(장기 주식 투자용) |
| **Cogochi(본 설계)** | 자연어 파싱 \+ 결과 설명(판단 안 함) | LightGBM P(win) \+ 코드 threshold |

QuantAgent의 핵심 인사이트(arXiv:2509.09995): "뉴스·감성 텍스트는 가격 발견에 후행한다. 단기 시장 동학은 이미 OHLC 데이터에 인코딩되어 있다." 이는 크립토 단기 트레이딩에서 LLM 텍스트 판단의 한계를 명확히 합니다.

## **2-2. 멀티 에이전트 조직 설계 (arXiv:2603.28990)**

25,000개 태스크 실험 결과: 완전 자율(Shared)보다 '순서 고정 \+ 역할 자율(Sequential)'이 44% 우수합니다. 이를 Cogochi에 적용하면 — 레이어 순서(L1→L2→L3→L4)는 코드가 고정하고, 각 레이어가 수행할 구체적 역할은 맥락에 따라 자율적으로 조정됩니다.

# **3\. 5-레이어 아키텍처**

각 레이어는 '무엇을 하는가'와 '무엇을 하지 않는가'가 명확히 분리됩니다.

| 레이어 | 이름 | 하는 일 | 하지 않는 일 | 기술 |
| ----- | ----- | ----- | ----- | ----- |
| **L1** | **Alpha Hunter스캔 엔진** | CVD·OI·펀딩비·와이코프 15개 레이어 수치 계산.1분 롤링 레이더. Alpha Score (-100\~+100). | 판단하지 않음.숫자만 출력. | Python순수 계산식(이미 동작) |
| **L2** | **LightGBM판단 엔진** | L1 feature → P(win) 확률 출력.Regime Filter(장세 판단).손절·익절 자동 계산. | 설명하지 않음.LLM 없음. | LightGBMscikit-learn(구현 필요) |
| **L3** | **DOUNI언어 레이어** | ① 유저 자연어 → 패턴 조건 구조화(파싱)② L2 결과 → 자연어 설명 생성③ 대화 인터페이스 | 판단하지 않음.확률 계산 안 함.수치 최적화 안 함. | LLM(Qwen3)LoRA 파인튜닝(트레이딩 용어 특화) |
| **L4** | **실행 에이전트** | P(win) ≥ 0.55이면 자동 주문.포지션 사이징(계좌 1% rule).일손실 \-3% 자동 중지. | 분석하지 않음.LLM 없음. | Binance APIElsa x402(시뮬→실거래) |
| **L5** | **AutoResearch학습 루프** | trade\_log 20개+ → Hill Climbing.LightGBM 재학습.패턴 weight 자동 업데이트. | LLM 없음.수치가 수치를 최적화. | PythonHill Climbing(순수 수치 최적화) |

| 핵심 설계 원칙 — LLM과 ML의 역할 분리 LLM(DOUNI): 자연어 ↔ 구조화 변환. '이 상황을 설명하고 파싱하는 것'이 전부. LightGBM: 숫자 → 확률. 재현 가능하고 일관된 판단. 백테스트 신뢰 가능. Hill Climbing: 수치가 수치를 최적화. LLM 개입 없이 순수 수치 피드백 루프. 이미지 입력 불필요: Alpha Hunter가 이미 OHLC를 구조화된 수치로 변환하기 때문. |
| :---- |

# **4\. 핵심 학습 루프 — 쓸수록 정확해지는 구조**

Cogochi의 경쟁 우위는 단순한 자동화가 아닙니다. 거래 결과 데이터가 쌓일수록 모델이 개선되는 피드백 루프입니다. 이 데이터는 외부 플랫폼이 절대 가질 수 없습니다.

| 단계 | 이름 | 상세 | 담당 |
| ----- | ----- | ----- | ----- |
| **①** | **패턴 발견** | DOUNI와 차트 대화 → 자연어로 패턴 기술→ L3가 JSON 조건으로 파싱 → Doctrine DB 저장→ 즉시 24시간 스캔 활성화 | LLM |
| **②** | **시장 스캔** | APScheduler 15분마다 전체 시장 스캔L1 Alpha Score \+ L2 P(win) ≥ 0.55 AND 매칭→ 알림 발송 (FCM/Telegram) | 코드+ML |
| **③** | **시뮬 거래** | Binance Testnet 자동 가상 주문1시간 후 결과 자동 판정 (1%+ 이동 \= 적중)trade\_log 저장 | 코드 |
| **④** | **피드백 수집** | 자동 판정 \+ 유저 ✓/✗ 피드백 이중 수집패턴별 적중률 실시간 집계20개 이상 누적 시 학습 트리거 | 코드 |
| **⑤** | **자동 학습** | Hill Climbing: 패턴 weight 최적화LightGBM 재학습: 새 feature 반영다음 스캔에 즉시 반영 → ①로 돌아감 | ML |

# **5\. 기술 선택 근거**

| 컴포넌트 | 선택 기술 | 선택 이유 | 상태 |
| ----- | ----- | ----- | :---: |
| L1 스캔 엔진 | Alpha Hunter(기존 HTML) | 2305줄 실동작 코드. CVD aggTrade 직접 계산.15레이어 Alpha Score. 조건 필터 빌더 포함. | ✅ 완료**✅ 완료** |
| L2 판단 | LightGBM | Tabular 데이터 최강. 속도 빠름. 해석 가능(SHAP).크립토 feature 기반 분류에 검증된 선택. | 구현 필요**구현 필요** |
| L2 Regime Filter | ATR \+ BTC slope(단순 룰) | 과도한 모델 불필요. 3개 룰로 충분.하락장 롱 차단, ATR 과열 시 진입 차단. | 구현 필요**구현 필요** |
| L3 LLM | Qwen3:35B(M1 로컬) | MoE 아키텍처로 실제 활성 파라미터 \~3B.M1 64GB에서 LoRA 파인튜닝 가능. 서버 불필요. | 환경 준비**환경 준비** |
| L3 학습 | LoRA \+ mlx-lm | 파인튜닝 목적: 트레이딩 용어 파싱 정확도 향상.판단 개선이 아닌 번역 품질 개선. | 환경 준비**환경 준비** |
| L4 실행 | Binance Testnet→ Elsa x402 | testnet=True 한 줄로 시뮬 전환. 검증 후 실거래.Elsa는 DeFi 온체인, Binance는 CEX 백업. | 미착수**미착수** |
| L5 학습 | Hill Climbing(Python 순수) | trade\_log 20개면 시작. 서버 불필요. 10분 이내.과도한 의존성 없이 weight 최적화. | 설계 완료**설계 완료** |

# **6\. 상생 생태계 구조 — 경쟁 아닌 레이어 분담**

Cogochi가 독점하는 것은 하나입니다: 개인 트레이딩 히스토리 데이터. 나머지는 기존 플랫폼의 인프라 위에 올라탑니다.

| 파트너 | 레이어 역할 | Cogochi가 받는 것 | Cogochi가 주는 것 |
| ----- | ----- | ----- | ----- |
| Surf AI($15M Pantera) | L1 데이터 강화 | 온체인+소셜 90+ 엔드포인트L6\~L12 데이터 무료 활용 | 케이스스터디 공동 발표B2C 레퍼런스 |
| Hey Elsa(Coinbase 백) | L4 실행 인프라 | DeFi 온체인 실행 ($0.02/건)자체 실행 레이어 불필요 | Elsa x402 거래 볼륨 증가에이전트 생태계 확장 |
| Bankr($BNKR) | 유통 채널 | X/Farcaster 유저 기반 노출마케팅 비용 0 | Skill 마켓에 없는 기능 추가생태계 가치 향상 |
| Minara AI(Circle 백) | 잠재 경쟁자 | 현재: 개인 패턴 학습 없음공백이 Cogochi의 자리 | 6\~12개월 내 피벗 가능성데이터 플라이휠이 방어선 |

# **7\. 구현 우선순위 — 8주 플랜**

| 주차 | 작업 | 내용 | 완료 기준 |
| ----- | ----- | ----- | ----- |
| **W1** | Hill Climbing 검증 | prepare\_data.py \+ 시나리오 20개 레이블링weight 최적화 전후 비교'학습이 효과 있다'는 증거 확보 | 승률 45% → 58%+ 개선수치 데이터 존재 |
| **W2** | LightGBM Signal Engine | feature 계산 (RSI·ATR·EMA·BB·OI·FR)학습 → P(win) 출력threshold 0.55 / 0.60 백테스트 | P(win) 출력 동작AUC ≥ 0.60 |
| **W3** | Regime Filter \+ L1-L2 연결 | Alpha Hunter → FastAPI → LightGBMRegime Filter 3개 룰 구현AND 조건 충족 시 신호 발생 | E2E 신호 발생 확인 |
| **W4** | sim\_trader.py \+ trade\_log | Binance Testnet 연결신호 → 가상주문 → 1H 후 결과 자동 기록trade\_log DB 저장 | 시뮬 루프 동작trade\_log 20개 축적 |
| **W5** | AutoResearch 루프 | trade\_log → Hill Climbing 자동 실행LightGBM 재학습 연결전후 PnL 비교 | 학습 루프 1회 완전 동작 |
| **W6** | LoRA \+ DOUNI Terminal | mlx-lm \+ Qwen3:35B 파인튜닝트레이딩 용어 파싱 정확도 향상CLI \+ MCP 서버 | 자연어 → 패턴 JSON 변환 동작 |
| **W7** | 실거래 전환 | Binance testnet=False계좌 1% rule \+ 일손실 \-3% 중지소액($100) 실거래 2주 테스트 | 실거래 10회 이상 무손실 |
| **W8** | 베타 \+ 수익화 | Stripe 연결 (Free 시뮬 / Pro $19 실거래)베타 10명 초대Elsa x402 볼륨 데이터 확보 | 베타 10명월 $200 Elsa 볼륨 |

# **8\. 리스크 및 검증 기준**

| 리스크 | 유형 | 대응 방안 |
| ----- | ----- | ----- |
| **LightGBM 과적합** | **치명 기술** | Walk-forward validation 필수.OOS(Out-of-Sample) 검증 없으면 배포 금지.과거 데이터에만 맞는 전략 → 즉시 폐기. |
| **Bear market 레짐** | **시장 환경** | Regime Filter가 핵심 방어선.하락장 판정 시 롱 신호 전면 차단.BTC trend slope \+ ATR 기반 3개 룰. |
| **W4 E2E 실패** | **Kill 기준** | 신호→주문→결과 루프 미동작 시 중단.기술 문제가 아닌 설계 재검토 신호. |
| **W5 PnL 마이너스** | **Kill 기준** | 시뮬 100회 후 기대값 마이너스 시 배포 중단.feature 재설계 또는 threshold 재조정. |
| **Minara 피벗** | **경쟁 위협** | 6\~12개월 내 개인화 카피트레이딩 출시 가능.데이터 플라이휠(내 거래 결과 축적)이 유일한 방어선.W1\~W5 최대한 빠르게 완료해야 함. |
| **Elsa 의존성** | **파트너 리스크** | Elsa x402 정책 변경 시 L4 전체 무너짐.Binance API 직접 연결을 항상 백업으로 유지.단일 실행 파트너 의존 절대 금지. |

# **9\. AI 리서처 결론**

| 이 설계가 트레이딩에서 의미 있는 이유 ① LLM은 판단하지 않는다. 자연어 ↔ 구조화 변환만 담당한다.    → 재현 가능성과 백테스트 신뢰성 확보. ② ML(LightGBM)이 판단한다. 같은 입력 \= 같은 확률.    → threshold 기반 일관된 진입 기준. 과거 데이터 검증 가능. ③ 수치가 수치를 최적화한다(Hill Climbing \+ 재학습).    → 인간의 개입 없이 성능이 점진적으로 향상. ④ 개인 트레이딩 데이터가 핵심 자산이다.    → 외부 플랫폼이 복제 불가. 시간이 방어선. ⑤ 지금 당장 필요한 것은 W1 Hill Climbing 검증이다.    → 이 숫자 없이는 나머지 8주가 의미 없다. |
| :---- |

Cogochi Technical Design Document v1.0  |  Holo Studio Co., Ltd.  |  2026.04