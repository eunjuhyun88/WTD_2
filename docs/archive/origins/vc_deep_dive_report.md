# Top 5 VC 테제 심층 분석 — a16z, Sequoia, Bessemer, Greylock, NFX

**작성일**: 2026-04-24
**목적**: 각 VC의 고유한 2024-2026 테제, 핵심 파트너의 관점, 포트폴리오 패턴, 그리고 "Cogochi 같은 제품이 이 VC에 피칭한다면 어떤 대화가 오갈까" 를 VC별로 세로로 분석
**Non-Goals**: 이전 보고서에서 다룬 공통 moat 축의 재설명, 펀드 규모/LP 구조 디테일

---

## § 0. 한 줄 비교

| VC | 한 줄 포지션 | 누가 실권을 잡았나 |
|---|---|---|
| **a16z** | "Bitter Lesson: 자본이 AI 능력으로 전환됨. 앱 레이어에 가치 축적" | Martin Casado (Infra) + Sarah Wang (Growth) |
| **Sequoia** | "Services: The New Software. Long-horizon agents = AGI" | Pat Grady + Alfred Lin (co-stewards, 2025.11 부터) |
| **Bessemer** | "Vertical AI가 새로운 SaaS. Supernova vs Shooting Star" | Mike Droesch, Sameer Dholakia, Lauri Moore |
| **Greylock** | "Seat-based 가격 모델의 죽음. AI-first 창업자 first check" | Saam Motamedi + Reid Hoffman + Sarah Guo (지금은 Conviction) |
| **NFX** | "Bailey 먼저, Motte 나중에. Network effects가 여전히 궁극의 moat" | James Currier, Pete Flint |

---

# § 1. Andreessen Horowitz (a16z)

## 1.1 조직 현황 (2026년 4월 기준)

- AUM 약 $90B+, 2026년 1월 5개 펀드 $15B 조성 완료
- General Partners: Marc Andreessen, Ben Horowitz, Jeff Jordan, Chris Dixon, Martin Casado, Andrew Chen, Raghu Raghuram (2025년 10월 합류, ex-VMware CEO)
- 인프라 팀 (Casado), Growth 팀 (Sarah Wang), 앱 팀 (Jennifer Li, Anish Acharya, David Haber, Alex Rampell), Consumer (Olivia Moore), American Dynamism 라인 분리 운영
- 2020년 이후 유니콘 32개 배출 — VC 중 최다

## 1.2 핵심 테제 (2025-2026)

### 테제 1: "Bitter Economics" (Casado, 2025년 11월)

Casado 의 핵심 주장 — bitter lesson 의 직접 결과는 대량의 자본을 작동하는 솔루션으로 변환하는 시스템을 만들고 있다는 것이다. 이게 AI 사이클에서 기업 성장률과 자금 조달이 왜 그렇게 다른지를 설명한다.

이게 왜 중요한가: a16z 는 "모델 회사는 인프라 회사다 (자본집약적, 고정비 비즈니스)" 라고 재분류. 이전 SaaS 벤처 논리 (인력과 IP 로 승부) 가 아니라 **자본 배치 효율성** 으로 승부하는 게임. 이게 왜 a16z 가 growth-stage 에 거대 금액을 쓰는지의 이유.

### 테제 2: "No Systemic Moats" → "Brand is Emerging" (Casado, 2023 → 2025)

2023년 Casado 진단: 생성 AI 스택 전체에 systemic moat 없음. 2년 후 업데이트: defensibility 없다고 한 사람들이 틀렸다. 브랜드가 실제 moat 으로 부상했다. OpenAI 의 이름 인식이 벤치마크가 비슷해도 채택을 이끈다.

두 포지션이 모순 같지만 아니다 — **개별 제품 기능은 복제 가능하지만, 카테고리 리더 포지션은 브랜드로 유지 가능**. 이게 a16z 가 "Cursor, Decagon, Harvey" 같은 카테고리 리더에게 거액 쓰는 논리.

### 테제 3: "$1B 훈련 runs 경제" & "Capital Flywheel" (Casado + Wang 공동)

모델 labs 가 벤처와 grow 의 경계를 흐리는 현상 — 스타트업이 수익화 이전에 9자리 (hundred-million) 라운드를 올리는 상황을 관찰 중이다. 자본 → 훈련 → 제품 → 더 큰 자본 의 flywheel.

실제 결과: Anthropic (a16z backed), OpenAI, xAI 같은 frontier labs 에 계속 large check, Thinking Machines, World Labs 같은 second wave 에도 투자.

### 테제 4: "Big Ideas 2026" — 섹터별 예측

a16z 가 매년 연말 발표하는 팀별 예측. 2025년 12월에 발표된 2026 Big Ideas 중 중요한 것:

- **Vertical software 의 시스템 오브 레코드 프라이머시 붕괴** (Enterprise 팀): 2026년 엔터프라이즈 소프트웨어의 진짜 혼란은 system of record 가 드디어 primacy 를 잃기 시작하는 것이다. AI 가 intent 와 execution 사이의 거리를 좁혀서, 모델이 운영 데이터 전체를 읽고 쓰고 추론할 수 있게 된다. ITSM 과 CRM 시스템이 수동적 DB 에서 자율적 워크플로 엔진으로 전환. → 레거시 SaaS 를 얹어서 쓰는 게 아니라 **대체**한다는 예측
- **Agent-speed 인프라** (Malika Aubakirova): 에이전트가 초 단위로 5,000개의 재귀 하위 작업을 트리거. 레거시 시스템이 이걸 DDoS 로 오인. Agent-native infra 가 필요
- **Jennifer Li — Unstructured multimodal 데이터**: PDF/비디오/로그가 현재 RAG 와 에이전트를 깨뜨림. 이걸 구조화하고 거버넌스하는 스타트업이 가치 창출
- **Joel de la Garza — AI 가 사이버보안의 level 1 드러저리 자동화**: 인력 부족 문제 해결
- **American Dynamism** (David Ulevitch, Erin Price-Wright): AI-native 산업 기반 — 에너지, 제조, 물류, 광업. 공장이 "Henry Ford 마인드셋" 으로 scale 과 repeatability 를 day 1 부터 설계

### 테제 5: "App 레이어에 자본 집중" + "Apps 과 Infra 선 blur"

a16z 포트폴리오 가장 눈에 띄는 AI 베팅:
- **Foundation models**: Anthropic, Mistral, Character.AI (일부 포지션)
- **Apps/Agents**: Cursor, Decagon (CX agents), Harvey (legal), Happyrobot (freight voice), Keycard (agent fleet management), Hebbia (finance), EliseAI (housing)
- **Dev tools**: Replit, Mintlify (docs for agents), Inferact (vLLM maintainers)
- **Consumer AI**: Character.AI, World Labs (Fei-Fei Li)

## 1.3 Casado vs Wang — 파트너별 렌즈 차이

| | Martin Casado | Sarah Wang |
|---|---|---|
| 역할 | Infra GP | Growth GP |
| 배경 | VMware, 네트워킹 출신 (SDN pioneer) | Enterprise apps / 인프라 growth |
| 핵심 질문 | "이 인프라 레이어가 commodity 인가, control point 인가?" | "이 앱이 growth stage 에서 defensible 한가?" |
| 시그니처 포지션 | Raw compute/GPU 호스팅 회피. Orchestration/control plane 선호 | SaaS 와 AI apps 를 다른 벤치마크로 평가. AI 는 전통 SaaS 보다 높은 gross margin + 더 빠른 $100M ARR 기대 |

## 1.4 "a16z 에 피칭한다면" — 예상 질문

1. **Casado 질문**: "당신 제품이 있는 스택 레이어가 commodity 쪽으로 가는가, control point 쪽으로 가는가?"
2. **Wang 질문**: "이 $100M ARR path 가 얼마나 빨리 가능한가? Year 1 에 얼마?"
3. **공통**: "모델이 내일 2배 좋아지면 당신 회사는 더 좋아지는가, 죽는가?"
4. **공통**: "브랜드는 지금 어디서 누가 얘기하고 있나?"

## 1.5 어떤 회사에 투자하는가 — 패턴

- **Horizontal dev tools** (Cursor, Replit) — 개인 생산성 극대화
- **Vertical agents for knowledge work** (Harvey, Decagon) — 워크플로 전체 대체
- **AI-native industrial** (Anduril, Shield AI) — American Dynamism
- **Agent infrastructure** (Keycard, Inferact) — 에이전트 시대의 피커앤셔블
- **Foundation model 접근권** — 최소 한 회사는 자기 진영에

## 1.6 어디에 투자 안 하는가

- Commodity GPU hosting
- Thin wrapper ("GPT wrapper 신화" 라고 명시적 비판)
- Incumbent 와 정면 충돌 (Salesforce, Workday 가 이미 AI 통합 중)

---

# § 2. Sequoia Capital

## 2.1 조직 현황 (2026년 4월 기준)

- **2025년 11월 leadership 전환**: Roelof Botha → Pat Grady + Alfred Lin co-stewards 체제. Botha 의 정치적 논란 (Matt Maguire 포스팅 파문) 이후 만장일치 투표로 교체
- 2026년 4월, expansion (late-stage) 펀드 $7B 조성 완료 — 2022년 $3.4B 의 2배, 역대 최대
- OpenAI, Anthropic 둘 다 backed. 둘 다 2026년 IPO 전망
- 2023년 Roelof Botha 선언: "우리는 AI 기술 개발 (foundation model) 에 투자 안 한다. AI 애플리케이션에 투자한다". 이 포지션은 application layer 에 투자 집중을 의미했고, Pat Grady 가 2025년 AI Ascent 에서 "우리는 app layer 에 order of magnitude 더 많은 달러를 썼다, revenue 가 훨씬 적더라도" 라고 공개 확인

## 2.2 핵심 테제 (2025-2026)

### 테제 1: "Services: The New Software" (Julien Bek, 2026년 3월)

지금까지 본 AI 테제 중 가장 조회수가 높았던 글. 핵심 주장 세 개:

1. **$1 vs $6 프레임**: 소프트웨어 $1 지출 당 서비스 $6 지출. AI 서비스는 software 마진 (70-80%) 으로 services 달러를 잡는다
2. **Copilot vs Autopilot**: Copilot 은 소프트웨어 예산, Autopilot 은 노동 예산. 카테고리가 완전히 다름
3. **진입점**: 이미 outsource 된 지식 업무부터. Insurance brokerage ($140-200B), 회계/감사, 헬스케어 revenue cycle

**Bek 의 notable line**: "moat 은 기술이 아니라 trust 다. 약간 더 나은 모델을 가진 경쟁자는 상관없다. trust 는 누적된다."

### 테제 2: "2026: This Is AGI" (Pat Grady + Sonya Huang, 2026년 1월)

Long-horizon agents 가 functional AGI 다. 완벽한 인간 추론 모방이 아니라, 복잡하고 오픈 엔드한 태스크를 자율적으로 tackle 하는 시스템. 3층 구조:

1. **Pre-training** (2022~) — 지식 흡수
2. **Inference-time compute** (2024 말 o1 이후) — 추론
3. **Iteration over time** (2025 말~2026 초, Claude Code 등) — 플랜, tool use, state/memory, action, evaluation, loop

**Sarah Guo 의 litmus test** (Huang 이 인용): "Can you hire it?" 고용할 수 있으면 AGI.

### 테제 3: "Age of Abundance" (Sonya Huang, 2025년 5월 AI Ascent)

수천 개의 vertical AI 애플리케이션이 각각 특수 도메인에서 가치를 포착. Legal AI 가 paralegal 을 대체, Medical AI 가 documentation 을 자동화, Coding AI 가 software 개발을 가속.

Huang 의 이 테제에는 **큰 리스크** 가 있음. 공개된 분석: "The exit question is the trillion-dollar question" — Huang 의 포트폴리오가 퍼블릭 시장에서 AI app 을 30-50x revenue multiple 로 가치 평가받아야 works. SaaS comp (5-10x) 로 떨어지면 현재 사모 valuation 이 untenable.

### 테제 4: "Tale of Two AIs — 2026 is Year of Delays" (공식 2025년 12월)

2026년은 데이터센터 빌드와 AGI 타임라인 둘 다 delay 가 걸리는 해. 동시에 end-user AI 채택은 가속. "$0 to $100M" 클럽이 2025년 토픽이었다면 2026년엔 **"$0 to $1B" 클럽** 이 등장.

**TSMC Brake** 개념 (Ben Thompson 인용): TSMC 가 monopolistic 포지션이라 capacity 램프를 강제할 수 없음. revenue 는 50% 늘었는데 CapEx 는 10% 만 늘림.

### 테제 5: "Pat Grady 의 founder thesis"

Grady 가 AI Ascent 2025 에서 발언한 notable 한 한 줄: "가장 큰 AI moat 은 데이터나 기술이 아니다 — relentless execution 을 가진 창업자다."

이 프레임은 ServiceNow (Fred Luddy), Zoom (Eric Yuan), Snowflake 의 성공 패턴을 AI 에 연장한 것. 데이터/모델은 commoditize 되지만 고객 obsession + 제품 iteration + 조직 scaling 강도는 복제 불가.

## 2.3 파트너별 렌즈

| 파트너 | 초점 | 시그니처 딜 |
|---|---|---|
| Pat Grady | Enterprise SaaS → Vertical AI 연장 | ServiceNow, Zoom, Harvey |
| Alfred Lin | Operational scaling, unit economics | Airbnb, DoorDash |
| Sonya Huang | AI application layer 전담 | Glean, Mercury, Harvey |
| Konstantine Buhler | AI infra + apps | Perplexity 등 |
| Julien Bek | Autopilot services | London office, AI services 테제 주도 |

## 2.4 "Sequoia 에 피칭한다면" — 예상 질문

1. **Bek 프레임 질문**: "당신은 software 예산인가, labor 예산에 들어가는가?"
2. **Grady 질문**: "$100M ARR 까지 얼마 걸리나? 그 path 의 보틀넥이 뭔가?"
3. **Huang 질문**: "당신 vertical 에서 incumbent 가 같은 걸 못 하는 이유가 정확히 뭔가?"
4. **공통**: "Long-horizon agent path 가 있는가? 지금 chat 이라도 agent 로 갈 수 있나?"

## 2.5 어떤 회사에 투자하는가

- **Services-as-Software**: Harvey (legal), Pilot/Crescendo 류
- **Foundation models (제한적)**: OpenAI, Anthropic
- **Vertical AI**: Glean, Mercury (fintech as AI copilot)
- **Robotics/Physical AI**: Physical Intelligence
- **Dev agents**: Factory, Cursor

## 2.6 어디에 투자 안 하는가 (Botha 시절 명시)

- Foundation model 건설 자체 (OpenAI/Anthropic backed 는 예외적)
- Horizontal 범용 copilot (incumbent 경쟁 심함)
- 규제 회색지대 소비자 AI

---

# § 3. Bessemer Venture Partners

## 3.1 조직 현황 (2026년 4월 기준)

- AI-native 에 2023년 이후 $1B+ 배치 (공식 공개)
- AI 담당 GP: Mike Droesch, Sameer Dholakia, Lauri Moore, Kent Bennett, Brian Feinstein
- 시그니처 방식: **숫자로 무장한 thesis papers**. State of AI, Vertical AI Roadmap (4 parts), Supernova/Shooting Star 벤치마크
- 다른 top VC 대비 "체계적 프레임워크 provider" 포지션. 창업자들이 VC 전에 Bessemer 글 먼저 읽는 경우 많음

## 3.2 핵심 테제 (2025-2026)

### 테제 1: "Vertical AI eclipses Vertical SaaS" — 메인 테제

Bessemer 자체 표현: 작년에 우리는 대담한 테제를 제안했다 — Vertical AI 는 가장 성공한 legacy vertical SaaS 시장조차 eclipse 할 잠재력이 있다. 올해 우리의 확신은 더 강해졌다.

핵심 관찰: "technophobic" 으로 여겨진 산업들 (헬스케어, 법, 부동산, 홈서비스) 이 실은 그렇지 않았음. 전통 SaaS 가 **high-value, language-heavy, multimodal 업무** 를 못 풀었을 뿐. Vertical AI 가 이걸 해결.

결정적 한 줄: **Vertical AI는 IT budget 과 경쟁하지 않는다. labor budget 과 경쟁한다.**

### 테제 2: "Supernova vs Shooting Star" 벤치마크 (2025년 8월 State of AI)

20개 high-growth AI 스타트업 (Perplexity, Abridge, Cursor 포함) 분석 결과:

**Supernovas**:
- Year 1 평균 ARR: $40M
- Year 2 평균 ARR: $125M
- Gross margin: ~25% (때로 음수)
- ARR/FTE: $1.13M (일반 SaaS 대비 4-5x)
- 리스크: retention 취약 가능성. "thin wrapper" 라벨 리스크

**Shooting Stars** (Bessemer 권장):
- Year 1 ARR: $3M
- Year 4 ARR: $100M
- Gross margin: 60% (SaaS 와 유사)
- ARR/FTE: $164K
- 성장 공식: **Q2T3** (Quadruple, Quadruple, Triple, Triple, Triple) — 기존 SaaS 의 T2D3 대체

Bessemer 의 명확한 입장: Supernova 를 사랑하지만, 이 시대는 **수백 개의 Shooting Stars** 로 정의될 것. Shooting Star 가 AI 창업자에게 가장 중요한 벤치마크.

### 테제 3: "Vertical AI 10개 원칙" (Roadmap Part IV, 2025년 8월, Part V 2026년 1월 갱신)

- 고객이 자동화하기를 **원하는** 워크플로. "자동화 가능" 이 아니라 "원함" 이 키
- Commoditized 기능 회피 — 데이터 추출/검증 같은 건 table stakes 됨
- AI 가 인간이 못 하는 일 (대규모 데이터 분석 등)
- 정량화 가능한 ROI 를 day 1 에
- **Multimodality 가 기술적 moat 의 소스** — 단일 데이터 타입이 아니라 결합
- Modular/adaptable 시스템 — 최신 모델을 유연하게 통합
- 데이터 quality > quantity
- 복잡한 규제/컴플라이언스 요구를 고객 맞춤
- 비즈니스 모델 혁신 (outcome-based pricing 등)

### 테제 4: "Memory is the New Defensibility" (2025년 8월)

Bessemer 내부 프레임: 메모리와 컨텍스트가 새로운 defensibility. 사용자 선호도, 워크플로, 도메인 지식을 학습하고 기억하는 시스템에 집중하라.

이게 왜 중요한가: Per-user personalization 을 moat 으로 명시적 승인. Cogochi 같은 구조는 이 프레임에 직접 부합 (§ 6.4 에서 연결).

### 테제 5: "Systems of Action vs Systems of Record"

Bessemer 가 만든 용어. Legacy enterprise software (Salesforce, Workday) 는 **Systems of Record** — 데이터를 저장하고 조직. AI-native 는 **Systems of Action** — 기존 데이터 위에서 **행동한다**. 빠른 implementation 이 가능하고 AI-powered wedge 로 전통 소프트웨어를 disrupt.

## 3.3 Bessemer 포트폴리오 패턴

- **Vertical AI 챔피언**: Abridge (헬스케어 문서화), Glean (enterprise search), EliseAI (housing)
- **Horizontal AI infra**: Perplexity, LangChain
- **Dev**: Cursor (일부 포지션)
- **Robotics/Physical AI** (2026년 4월 예측 발표): Waymo, Mind Robotics, Foxglove, Breaker, Noda, Voxel51, DroneDeploy, Auterion, Perceptron, ANYbotics

## 3.4 "Bessemer 에 피칭한다면" — 예상 질문

1. **벤치마크 질문**: "Supernova path 인가 Shooting Star path 인가? 숫자로?"
2. **Vertical 질문**: "이 vertical 에서 legacy SaaS 가 못 푼 language-heavy workflow 가 뭔가?"
3. **Labor budget 질문**: "당신은 얼마의 노동 비용을 대체하는가? IT budget 이 아니라 labor 에서 나오는가?"
4. **Memory 질문**: "쓰는 유저가 많아질수록 한 유저의 경험이 어떻게 좋아지는가?"
5. **Moat 10개 원칙 체크**: 위 테제 3 의 각 원칙 순회

## 3.5 어떤 회사에 투자하는가

- Shooting Star trajectory + vertical + labor budget attack
- Multimodal 데이터/워크플로 통합
- Regulation-heavy 산업 (금융, 헬스케어, 법)

## 3.6 어디에 투자 안 하는가

- Horizontal thin wrapper
- Data extraction only (table stakes)
- Gross margin 25% 이하에 고정되는 구조 (Supernova 라도 단기만 OK)

---

# § 4. Greylock Partners

## 4.1 조직 현황 (2026년 4월 기준)

- AUM ~$3.5B, 60년 역사
- 2023년 $1B 펀드 16호 조성 (이후 17호도 조성됨). 80% 이상이 pre-seed / seed / Series A
- 최근 합류/강화: Saam Motamedi (실리콘밸리 최연소 GP, enterprise AI 전담), Seth Rosenberg (consumer/marketplace AI), Christine Kim, Sridhar Ramaswamy (ex-Neeva CEO)
- **Sarah Guo 는 2022년 퇴사해서 Conviction 창업** — 자주 혼동됨. 현재 Greylock 소속 아님
- Greylock Edge 프로그램 (2023년 론치) — pre-idea / pre-seed 창업자에게 flexible 재무 구조 + 파트너 직접 co-build. 타 top VC 의 accelerator 와 차별

## 4.2 핵심 테제 (2025-2026)

### 테제 1: "Every Company Becomes an AI Company"

Motamedi 공식 발언: "우리는 모든 회사가 AI 회사가 될 것이라 예상한다." 이게 Greylock 17호의 전체 mandate. 과거 10년간 AI 중심 투자를 사이버보안, 인프라, SaaS, 마켓플레이스/커머스, 핀테크, 크립토로 확장하는 방식.

### 테제 2: "The Death of Seat-Based Pricing" (Motamedi)

Motamedi 의 가장 공격적인 테제. AI 에이전트가 자율적으로 일을 하는 세상에서 $800B+ SaaS 산업 — seat 기반 구독으로 수십억을 버는 Salesforce ($31B 매출), Microsoft 365 ($70B+), ServiceNow ($10B+), Workday ($7B+) — 는 가격 모델 전환을 강제당하거나 revenue erosion 을 겪을 것이다.

대안: **Outcome-based pricing** 이 AI 시대 기본값. "에이전트가 처리한 ticket 개수당 $X", "closed deal 당 $Y" 같은 구조.

이게 왜 중요한가: Greylock 포트폴리오 중 seat 가격을 거부하는 회사 많음 (Cresta, Abnormal, Axiamatic).

### 테제 3: Reid Hoffman 의 "Network Effects 는 여전히 승리" (전통 + AI 융합)

Hoffman 의 signature 프레임이 40년 넘게 변하지 않음. 2025년 기준 Greylock/Hoffman 이 AI 37+ 회사에 투자했다고 공개. 핵심 논리: LinkedIn/Facebook/Airbnb 가 네트워크 효과로 승리. AI 도 같은 구조 — **쓸수록 집단적 사용자 행동에서 배우는 도구**.

Hoffman 의 Tome 투자 예시 (그가 직접 언급): "productivity 도구인데 쓰는 사람이 많아질수록 가치가 올라간다, 특히 집단 사용자 행동에서 학습할 수 있으면."

### 테제 4: "Systems of Action" (Motamedi 도 같은 프레임 사용)

Bessemer 와 같은 용어인데 Greylock 은 cybersecurity 쪽 해석이 강함. 예시:
- **Axiamatic** (2026년 3월 $54M Greylock+Bessemer 투자) — 실패하는 enterprise transformation 을 AI 로 고침
- **Cogent** (2025년 8월) — vulnerability management 에이전트
- **Abnormal Security** — 이메일 위협 탐지 AI 에이전트 
- **Fable Security** — human layer 사이버보안
- **7AI** — SOC (security operations center) 에이전트

패턴: **저부가치 L1 업무를 에이전트가 100% 처리. 인간은 L2-3 로 승급**.

### 테제 5: "First Institutional Check" 포지셔닝

Motamedi 철학: "First check 로서 5-7년 같이 갈 founder selection 이 가장 중요." Greylock Edge 가 이 철학의 제도적 표현. 80%+ 투자가 first check.

## 4.3 파트너별 렌즈

| 파트너 | 초점 | 시그니처 |
|---|---|---|
| Saam Motamedi | Enterprise AI, 사이버보안, infra | Abnormal, Cresta, Opal (Rubrik 인수), Cogent, Axiamatic |
| Reid Hoffman | Consumer AI + network effects | OpenAI (initial), Inflection (co-founded), Tome |
| Seth Rosenberg | Consumer/creator AI | Product-Led AI 팟캐스트 운영 |
| David Sze | 초기 stage 전반 | Facebook, LinkedIn (historic) |
| Jerry Chen | Enterprise infra | Snowflake, Cockroach |

## 4.4 "Greylock 에 피칭한다면" — 예상 질문

1. **Motamedi 질문**: "당신 가격 모델은 seat-based 인가? 그럼 왜 그게 5년 후에도 살아남나?"
2. **Hoffman 질문**: "이게 network effect 있나? 추가 유저가 어떻게 기존 유저 가치를 올리나?"
3. **Edge 질문**: "first check 로 우리가 당신과 무엇을 함께 build 해야 하나?"
4. **공통**: "AI-first 인가 AI-bolted-on 인가?"

## 4.5 어떤 회사에 투자하는가

- **Enterprise agents that replace work** (not copilots): Axiamatic, Cresta, Mandolin, Netic
- **AI-powered cybersecurity**: Abnormal, Cogent, 7AI, Fable
- **Infrastructure 'picks & shovels'**: Snorkel, Baseten, Braintrust
- **Consumer with network effects**: Tome, Inflection

## 4.6 어디에 투자 안 하는가

- Seat-based SaaS extension 만 하는 구조
- Bolted-on AI (기존 프로덕트에 AI feature 얹은 것)
- Crypto-native (Greylock 은 crypto 있지만 fintech/crypto 에서만 선택적)

---

# § 5. NFX

## 5.1 조직 현황 (2026년 4월 기준)

- 2015년 설립, Founding Partners: James Currier, Pete Flint, Gigi Levy-Weiss, Stan Chudnovsky (alumni), Morgan Beller
- Seed-stage 집중, 체크 사이즈 $800K-$1.2M, 지분 타깃 10-14%
- 2025-2026 AI seed deal pace 기준 **가장 active 한 AI seed 투자자 중 하나** — 28 AI seed check
- 시그니처 자원: **Signal 플랫폼** (170,000+ VC 네트워크로 founder intro 제공), **NFX Bible** (네트워크 효과 교과서), **NFX Manual** (16개 network effect 타입 분류)
- 포지션: Thesis-heavy. 글이 너무 많아서 다른 VC 가 인용함

## 5.2 핵심 테제 — NFX 의 뿌리

### 테제 1: "4대 defensibility + 16개 network effect"

James Currier 의 20년 커리어의 중심 프레임. 디지털 시대 moat 은 4개:

1. **Network effects** (압도적 최강)
2. **Embedding** (Oracle 식 lock-in, 워크플로 삽입)
3. **Scale** (고정비 효과, 그러나 AI 시대엔 약해짐)
4. **Brand** (Currier 본인은 브랜드를 낮게 평가하지만, NFX 의 Pete Flint 는 2025년 이걸 승급)

그중 Network effect 에만 16개 서브 타입. Physical direct (전화, 전력), Direct (Facebook), Platform (App Store), Marketplace (Uber), Data (Netflix recs), Tech performance, Language, Belief, Bandwagon, Expertise, Hub & spoke 등.

**Currier 의 2022년 인용** (여전히 NFX 의 기본): "네트워크 효과는 인터넷 시대 가장 파워풀한 방어벽. 94년 이후 기술 가치의 70% 가 network effect 회사에서 생성됨."

### 테제 2: "Bailey vs Motte" — AI 시대 defensibility layering (Pete Flint, 2025년 7월)

이게 NFX 의 **AI 특화 업데이트** 이며 가장 중요한 최신 글.

중세 motte-and-bailey 성: bailey 는 접근 쉬운 큰 마당 (일상 비즈니스 + 초기 전투), motte 는 언덕 위 견고한 탑 (bailey 가 넘어지면 후퇴). Bailey 는 버릴 수 있게 설계, motte 는 불가함침으로 설계.

**AI 스타트업에게**:
- **Bailey (초기, 빨리 쌓을 수 있음)**: 우수한 유통, 빠른 스케일링, 브랜드 모멘텀
- **Motte (후기, 천천히 쌓음)**: 진짜 network effects, 깊은 워크플로 embedding, 시스템적 lock-in

**정확한 순서 매우 중요**:
1. Series seed 이전: 성장 자체가 defensibility
2. Seed ~ Series A: distribution + brand (Cursor, Lovable, Clay 가 마스터한 것)
3. Series A ~ B: 진짜 network effect 와 embedding 이 기능 시작
4. Series B 이상: 재무적 효과, 다각도 lock-in

### 테제 3: "브랜드 승급" (Flint 2025년 업데이트)

NFX 가 2022년까지는 브랜드를 약한 moat 으로 봄. 2025년 Pete Flint 업데이트: 환각과 데이터 프라이버시 우려 때문에 비슷한 기능의 제품이 많은 AI 세계에서 브랜드가 paramount. Cursor, Lovable, Clay 가 유통을 마스터하고 그 모멘텀을 더 깊은 defensibility 로 catapult.

(중요: James Currier 본인은 여전히 브랜드 낮게 평가함 — 4가지 defensibility 프레임에서 "brand doesn't build much advantage anymore" 라고 말함. NFX 내부에서도 의견 다름. Flint 는 더 pragmatic, Currier 는 더 엄격)

### 테제 4: "Reinforcement" — 단일 moat 보다 moat 의 곱셈

Currier 핵심 통찰: moat 들은 **서로 곱해진다**. Facebook 예시:
- Personal nfx (2004)
- Scale (2006~) — scale 이 network 를 더 강하게
- Embedding (2008 Facebook Connect) — connect 가 scale 를 강화
- 2-sided marketplace (2007, 2009, 2016 시도들)
- Personal utility nfx (2011 Messenger)
- Data nfx (2011+)

**Defensibility × Defensibility = 곱셈 효과**. 이게 NFX 가 "하나만 잘하면 된다" 는 프레임을 거부하는 이유.

### 테제 5: "1인 AI 창업자" (Currier 2025년 인터뷰)

2020년대 최고 스타트업은 AI-first, 3명으로 300명 몫을 하는 회사. 비즈니스 모델, 고용, 심지어 벤처캐피털 자체를 재편. 이게 NFX 가 pre-seed 에서 공격적으로 움직이는 이유.

## 5.3 NFX 의 AI defensibility 프레임 (Flint, 2025년 7월)

AI 시대의 defensibility 항목별 평가:

| Moat | 2025년 NFX 평가 |
|---|---|
| Network effects | 여전히 최강. ChatGPT 같은 single-player 에도 숨겨진 multiplayer functionality 가 있음 (유저 학습이 전체 모델 개선, personal utility 증가) |
| Data | 제한적. 실시간 데이터는 differentiator |
| Distribution | 초기 단계에 가장 빠르게 쌓을 수 있는 방어벽 (Cursor, Lovable, Clay) |
| Brand | 승급됨. AI 환각 + 프라이버시 우려 때문에 신뢰가 프리미엄 |
| Embedding | 여전히 강력. 특히 Series B 이후 |
| Scale | 약해짐 — tech titan 들이 언제든 scale 따라잡음 |

## 5.4 포트폴리오 패턴 (NFX AI bets)

- **AI agents + multimodal + dev tools** 컨센트레이션
- **Replit** (AI 대표작), Humane Intelligence, 다수 stealth agent 스타트업
- 체크 사이즈 작지만 thesis clarity 로 이동 속도 빠름
- **NFX Labs** 프로그램 — 포트폴리오 운영 지원

## 5.5 "NFX 에 피칭한다면" — 예상 질문

1. **Currier 질문**: "16개 network effect 중 어떤 게 당신 제품에 있는가? Bible 을 읽었나?"
2. **Flint 질문**: "지금 bailey 에서 뭘 세우고 있나? motte 를 세울 타임라인은?"
3. **공통**: "Reinforcement — 첫 defensibility 를 두 번째가 어떻게 강화하는가?"
4. **공통**: "3명으로 300명 몫을 낼 수 있나? ARR/FTE 가 얼마 나올 것 같나?"

## 5.6 어디에 투자 안 하는가

- Network effect 가 없는 pure B2B SaaS
- Single-defensibility 구조 (1 layer only)
- IP/patent 기반 moat 에만 의존하는 deep tech (이쪽은 Lux 등이 더 적합)

---

# § 6. 5개 VC 종합 비교

## 6.1 테제별 VC 매핑

| 주제 | a16z | Sequoia | Bessemer | Greylock | NFX |
|---|---|---|---|---|---|
| Model commoditization | 확고하게 동의 | 동의 (app layer 투자로 표현) | 동의 | 동의 | 동의하지만 bailey/motte 프레임으로 조정 |
| Autopilot vs Copilot | 둘 다 | **Autopilot 강력 선호** | Autopilot + vertical | Autopilot (seat-price death) | 프레임 쓰지 않음 |
| Vertical AI | 지지 | 지지 (Bek + Huang) | **메인 테제** | 지지 (sector 별 분산) | sector 무관 NFX 중심 |
| Brand as moat | Casado 승급 | 명시 안 함 | 강조 | Hoffman 네트워크 효과 강조 | **내부 의견 엇갈림** (Flint 승급, Currier 냉담) |
| Network effects | 있으면 좋음 | 언급 적음 | moderate | Hoffman 핵심 | **교리 수준** |
| Per-user data | Enterprise 용어로 | app layer 측면에서 | **Memory is new defensibility** | Hoffman 네트워크 학습 관점 | Personal utility nfx 타입으로 정의 |

## 6.2 "같은 스타트업 5군데 동시 피칭" 사고 실험

가상 스타트업: 법무 문서 자동화 AI agent (Harvey 경쟁자).

- **a16z**: "Cursor 에 rival 되는 카테고리 리더 될 수 있나? 브랜드 빌드 플랜?"
- **Sequoia**: "outsource 된 legal service 예산에 얼마 들어가나? autopilot 전환 가능?"
- **Bessemer**: "Supernova 아니면 Shooting Star path? Year 1 ARR 가 얼마? margin?"
- **Greylock**: "seat-based 아니라 outcome-based pricing 가능? Motamedi 가 좋아할 만?"
- **NFX**: "법무팀 간 network effect 있나? 더 많은 로펌이 쓸수록 개별 로펌 가치 올라가는 메카니즘?"

각 VC 가 **같은 사실에 대해 다른 질문** 을 던진다는 점이 핵심. 피칭 시 상대 VC 의 렌즈를 아는 게 통과율을 올림.

## 6.3 "가장 많이 겹치는 포트폴리오"

여러 top VC 가 공동 투자한 대표 AI 회사:
- **Cursor**: a16z, Thrive (Sequoia 안 포함 but follow-on)
- **Harvey**: Sequoia, OpenAI, Elad Gil
- **Perplexity**: Bessemer, IVP, NEA
- **Glean**: Sequoia (Huang lead), Kleiner, General Catalyst
- **Anthropic**: Sequoia, Google, Salesforce (a16z 도 Growth 쪽)

공통 분모 — **AI-native + 분명한 vertical or category + 빠른 $100M ARR path**. Thin wrapper 는 없음.

## 6.4 Cogochi 에 각 VC 가 할 가능한 반응

(이전 보고서에서 다룬 것을 VC 별 심층 버전으로 갱신. 이전에 말한 범용 약점 5개는 그대로 유효.)

### a16z 반응

**Casado 평가**: per-user LoRA 는 "control point" 냐 "commodity" 냐? 답: LLM fine-tuning 이 커머디티화되는 중이라 per-user **모델** 은 moat 이 약할 수 있음. 그러나 per-user **데이터 루프** 는 moat. 이 구분을 명확히 해야 함.

**Wang 평가**: Year 1 $40M ARR path 보이는가? 크립토 retail 타깃이라 불가능에 가까움. "prosumer AI" 로 재정의 필요.

**결론**: **지금 형태로는 fund 안 할 것**. B2B 피봇 (헤지펀드, 프롭데스크) 또는 pro-sumer 카테고리 리더 포지션 강화 시 고려.

### Sequoia 반응

**Bek 프레임**: Copilot 임이 명백. Autopilot 피봇 path 를 구체화 필요. "내가 판단하는 자율 거래" + "성과 기반 과금" 이 돼야 Sequoia thesis 에 align. 법적/규제 이슈 크지만, **한국 시장 (금감원)** 에서 샌드박스 가능성 검토 가치 있음.

**Huang 평가**: vertical 이 "crypto retail" 인데 이게 labor budget 을 가진 vertical 인가? **아님**. 헬스케어/법무처럼 외주 노동 예산 없음. 문제.

**결론**: **Application layer 는 맞지만 vertical 선택이 Sequoia thesis 와 안 맞음**. 미팅까지 못 감.

### Bessemer 반응

**State of AI 프레임**: Supernova 불가능. Shooting Star 가능할까? 리테일 크립토 $19/월로 Year 4 $100M ARR = 약 43만 명 유료 유저 필요. 쉽지 않음.

**Memory = defensibility 프레임**: Cogochi 가 이 테제에 **가장 잘 부합**. per-user LoRA 는 말 그대로 memory as defensibility 의 구현체.

**Vertical 체크**: labor budget 없음 (리테일). 그러나 **금융 프로 트레이더** 로 vertical 을 좁히면 vertical AI 테제 부합.

**결론**: **리테일 형태로는 안 맞음. B2B 금융 프로 (헤지펀드 리서처, 퀀트) 로 피봇 시 thesis 정확 부합**. 5개 VC 중 Cogochi core tech 에 가장 공감할 가능성 높음.

### Greylock 반응

**Motamedi 질문**: "이게 seat-based 아닌 outcome-based pricing 갈 수 있나?" → Cogochi 수익 모델은 subscription. seat 은 아니지만 outcome 도 아님. **중간**.

**Hoffman 질문**: Network effect 있나? → 명시적 network effect 는 없음. "어댑터 마켓플레이스" (Phase 2) 가 제일 가까운 것. Phase 1 에는 없음.

**Motamedi AI-first 기준**: Cogochi 는 AI-first 맞음. 아키텍처 자체가 LoRA 기반.

**결론**: **Phase 2 어댑터 마켓플레이스를 "Phase 1 직후 roadmap" 으로 presentation 하면 관심 가능**. Greylock Edge 프로그램 대상으로 작은 체크 받는 시나리오 가능.

### NFX 반응

**Currier 16개 NFX 체크**: Cogochi 에 있는 것:
- Personal utility nfx — 더 쓸수록 개인 가치 증가 (per-user LoRA) — **있음**
- Direct network effect — 없음 (single player)
- Data nfx — 모델 개선에 유저 피드백 쓰이지만 개별 유저 모델이라 집단 효과 제한적. **약함**
- Platform nfx — Phase 2 어댑터 마켓 시. **계획 단계**
- Expertise nfx — 숙련된 트레이더들이 모이면 가능. **잠재**

**Flint bailey/motte 체크**:
- Bailey (지금): 빠른 성장? 없음. 브랜드 모멘텀? 없음. 유통? 없음
- Motte (향후): per-user lock-in 은 강력한 motte 후보. 그러나 **bailey 없이 motte 못 짓는다**

**결론**: **Phase 1 의 distribution + brand 플랜이 부족**. NFX 는 Phase 1 PMF 증거 + 초기 distribution 플랜 확보 시 재고. 현재는 "setup 단계".

---

## § 7. 결론 — Cogochi 에 실질적 권고

각 VC 의 testing criteria 를 종합하면:

### 7.1 현재 상태 강점
- Bessemer "Memory is new defensibility" 테제에 정확히 align
- NFX personal utility nfx 구조 갖춤
- Greylock AI-first 기준 통과

### 7.2 현재 상태 약점 (5개 VC 공통)
- Year 1 ARR $40M (Supernova) 또는 $3M (Shooting Star) 도달 path 불투명
- Distribution/brand bailey 전혀 없음
- Vertical 이 labor budget 있는 시장이 아님
- Pricing 이 seat 도 outcome 도 아닌 flat subscription

### 7.3 VC-fundable 하려면 바꿔야 할 3가지 (우선순위 순)

1. **Vertical 변경 또는 명확화** — "리테일 크립토" 를 유지하되 **"수년 경력 파워 트레이더"** 로 좁히거나, **"퀀트/프롭 트레이더 리서처 도구"** 로 피봇. 이렇게 하면 labor budget 접근.
2. **Distribution bailey 시작** — 창업자 개인이 2-3개월 내 크립토/AI 트위터에서 1K → 10K 팔로워 build. 공개 track record, 실패 사례 포함한 reject 리포트. NFX bailey 모델.
3. **Pricing 재설계** — $19 flat 을 "$19 기본 + 성과 기반 추가" 로 hybrid. 이게 Greylock Motamedi thesis 통과 조건.

### 7.4 VC 선호도 순위 (Cogochi 기준)

**이 프로젝트를 가장 긍정적으로 볼 것 같은 VC 순**:
1. **Bessemer** — Memory-as-defensibility 테제 직접 부합, thesis 글이 많아서 레퍼런스 가능
2. **NFX** — personal utility nfx 인정, seed 체크 사이즈와 타이밍 맞음
3. **Greylock** — Phase 2 마켓플레이스 포함 시 흥미 가능, Edge 프로그램 fit
4. **a16z** — Casado 의 control point 질문에 설득 어려움
5. **Sequoia** — vertical 선택이 thesis 와 가장 멀음

**실질적 추천**: VC 미팅 타겟팅을 **Bessemer + NFX** 부터. 이 둘이 관심 가지면 Greylock 도 따라올 가능성. a16z/Sequoia 는 Series A 이후 또는 B2B 피봇 이후 재고.

---

## 부록 A. 출처 링크

**a16z**
- *Bitter Economics* (Casado, 2025.11): a16z.com/bitter-economics/
- *Big Ideas 2026 Part 1-3* (2025.12)
- *Where Value Will Accrue in AI* podcast (Casado + Wang, 2025 AI Ascent)
- *The New Business of AI* (2020, 원전 테제)
- *The Empty Promise of Data Moats*

**Sequoia**
- *Services: The New Software* (Julien Bek, 2026.03)
- *2026: This Is AGI* (Grady + Huang, 2026.01)
- *AI in 2026: A Tale of Two AIs* (2025.12)
- AI Ascent 2025 keynote (Huang, Grady, Buhler)

**Bessemer**
- *The State of AI 2025* (2025.08)
- *Vertical AI Roadmap Part I-IV* (2025.08)
- *Building Vertical AI* playbook (2026.01)
- *Bessemer Predicts: Robotics and Physical AI* (2026.04)

**Greylock**
- *Introducing Cogent* (2025.08)
- Motamedi LinkedIn / Twitter 공개 발언
- Hoffman *Intelligent Future* 팟캐스트
- Greylock Edge 프로그램 페이지

**NFX**
- *How AI Companies Will Build Real Defensibility* (Pete Flint, 2025.07)
- *The 4 Types Of Defensibility* (Currier, 2022 원전)
- *The Network Effects Manual* (16 types)
- *Reinforcement* (Currier)
- James Currier 팟캐스트 인터뷰 (2025)

---

*이 문서는 2024-2026년 공개된 VC 테제 분석과 Cogochi 프로젝트 문서 교차 분석 결과. 각 VC 에 대한 가상 반응 (§ 6.4) 은 문서화된 thesis 로부터의 추론이지 실제 VC 의견이 아님.*
