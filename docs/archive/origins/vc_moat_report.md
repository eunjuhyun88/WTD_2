# AI 시대 VC 테제 보고서 — commoditization 이후의 moat

**작성일**: 2026-04-24
**목적**: Top-tier VC 들이 "AI로 다 만들 수 있는 시대"에 무엇을 moat 으로 보는지, 그 렌즈로 프로젝트를 어떻게 설계/피봇해야 하는지 정리
**범위**: a16z, Sequoia, Bessemer, Greylock, NFX — 2024 ~ 2026년 4월 공개 테제
**Non-Goals**: VC 별 포트폴리오 전체 리스트, 섹터별 시장 규모 추정, 펀드 LP 구조 분석

---

## § 0. TL;DR

1. **AI 모델 자체는 moat 이 아니다**. 2023년 a16z Casado 의 "any-systemic-moats-anywhere" 진단이 2026년 재확인됨. 모델/컴퓨트/GPU 호스팅은 commoditize 됨.
2. **진짜 moat 은 모델 밖**에 있음. Sequoia / a16z / Bessemer 가 수렴하는 6개 축 — 워크플로 embedding, proprietary 데이터 flywheel, 신뢰/브랜드, 유통, 멀티모달 통합, 스위칭 비용.
3. **Thin wrapper 는 unfundable**. VC 들은 "UI-over-API" 구조를 structurally fragile 로 분류.
4. **전략 방향은 2 갈래**. Sequoia — "Services: The New Software" (autopilot, 결과 판매). Bessemer — "Vertical AI" (산업별 워크플로 지배).
5. **시기적 moat 순서가 바뀜**. NFX 업데이트: 초기엔 distribution + growth 가 moat, 후기에 network effects + embedding 으로 이행. Brand 가 이전보다 훨씬 일찍 작동.

---

## § 1. 문제 정의 — 왜 지금 이 질문이 핵심인가

2023 ~ 2024년까지 "AI 스타트업"은 대부분 다음 중 하나였다.

- Foundation model 빌더 (OpenAI, Anthropic, Mistral)
- 모델 위 API wrapper (chat UI, prompt 체인)
- AI infra (GPU cloud, vector DB, orchestration)

2025 ~ 2026년에 세 카테고리 모두 commoditize 압력을 받고 있다. a16z는 2023년에 생성 AI 스택 어디에도 systemic moat 이 보이지 않는다고 진단했다. 모델 제공사는 유사한 데이터와 아키텍처로 학습하므로 장기 차별화가 불분명하고, 애플리케이션은 유사 모델을 쓰므로 제품 차별성이 약하며, 클라우드 제공사는 같은 GPU 를 돌린다.

Casado 의 2025년 업데이트: defensibility 가 없다고 단정한 사람들은 틀렸고, 브랜드가 실제 moat 으로 부상하고 있다. OpenAI 의 이름 인식이 벤치마크가 비슷해도 채택을 이끈다.

핵심 질문이 바뀜:
- 이전: "우리 모델이 더 좋으면 이길 수 있을까?"
- 지금: "모델이 같아진다는 전제에서, 무엇이 남아 있는가?"

---

## § 2. VC 별 테제 요약 — 한 줄씩

| VC | 2025~2026 핵심 테제 | 한 줄 요약 |
|---|---|---|
| **a16z** (Casado / Wang) | "This feels like 1996" — mobile-era analogy | 모델은 commoditize, 가치는 애플리케이션 레이어로 흐름. 브랜드 + 워크플로 embedding |
| **a16z Infra 팀** | Software-led infra > raw compute | GPU 호스팅 같은 commodity 는 VC 스케일 리턴 불가. orchestration / control plane 만 funding |
| **Sequoia** (Bek) | "Services: The New Software" | 다음 $1T 회사는 소프트웨어가 아니라 work 를 판다. Autopilot > Copilot |
| **Sequoia** (Grady / Huang) | "2026: This Is AGI" | Long-horizon agents 가 functional AGI. 코딩 에이전트부터 넘어가는 중 |
| **Bessemer** | "Vertical AI" | 수직 워크플로 + proprietary 데이터 + multimodal 통합 = defensibility. labor budget 이 IT budget 보다 큼 |
| **Greylock** (Motamedi) | "Every company becomes AI company" | AI-first 창업자에게 first institutional check. 에이전트가 work 를 실행 |
| **NFX** (Currier) | "Defensibility layering" | 초기엔 distribution + brand, 후기에 network effects + embedding. bailey 먼저, motte 는 나중에 |

한 가지 흥미로운 수렴: 서로 다른 VC 들이 **"모델이 아니라 바깥을 봐라"** 라는 같은 메시지에 도착함.

---

## § 3. 여섯 가지 Moat 축 — 세부 분석

VC 테제를 교차 분석하면 6개 moat 축이 반복해서 등장한다.

### 3.1 Workflow Embedding (시스템 오브 레코드)

**핵심 주장**: AI 가 단순히 "답"을 주는 게 아니라 고객의 업무 프로세스 자체가 되는 것.

a16z Eve 투자 사례 — Eve 의 방어력은 전화를 걸거나 요약을 쓰는 능력이 아니라 system of record 가 되는 데 있다. 더 많은 케이스를 처리할수록 결과에 대한 비공개 데이터가 쌓이고, 변호사에게 "이 케이스는 5천 달러 가치고 손댈 가치가 없다" 같은 판단을 줄 수 있다. 이 판단은 OpenAI 같은 범용 모델이 얻을 수 없다 — 데이터가 공개되지 않기 때문이다.

Glean 사례 — Glean 은 기업별 데이터 moat, 복제에 18-24개월 걸리는 깊은 통합, 전환 비용이 CRM 수준에 근접하는 embedded 워크플로를 갖추고 있다.

**무엇이 embedding 인가**:
- 고객이 daily/weekly 로 이 도구에서 일함
- 고객의 다른 시스템과 deep integration (API, webhook, sync)
- 도구를 빼면 워크플로가 멈춤
- 도구 안의 history/state 가 고객 자산이 됨

### 3.2 Proprietary Data Flywheel

**핵심 주장**: 쓸수록 제품이 좋아지고, 그 개선이 경쟁자가 복제할 수 없는 데이터에서 나오는 구조.

a16z 원칙 — 데이터 moat 은 데이터 수집만으로 유지되지 않는다. 단순 scale effect 로서도 데이터는 강한 moat 이 드물다. 고유 데이터를 추가하는 비용은 올라가고 추가 데이터의 가치는 떨어지는 역방향 경제가 흔히 나타난다.

조건부로 작동 — 대형 모델의 능력이 commoditize 되는 지금, proprietary data 가 유일한 walled garden 이 된다. OpenEvidence 는 ChatGPT 도 의학 질문에 답할 수 있지만, The New England Journal of Medicine 같은 핵심 의학 문헌에 대한 독점 사용권을 가지고 있다.

**실제로 작동하는 data flywheel 조건**:
- 데이터가 **유저 사용을 통해서만 생성**됨 (스크랩 불가)
- 데이터가 **결과에 직접 연결**됨 (사용자 행동이 라벨)
- 데이터가 **sector-specific 판단**을 담고 있음

경고: 대부분의 "data network effects" 주장은 실제로 작동하지 않음. a16z 가 명시적으로 반박한 내용이다.

### 3.3 Trust & Brand

**핵심 주장**: 기능이 같을 때 신뢰가 결정함. AI 가 환각과 프라이버시 이슈를 가질 때 브랜드가 이전보다 일찍 moat 이 됨.

NFX 업데이트 — 한때 약한 defensibility 로 여겨진 브랜드가 이제 최우선이 되었다. 많은 제품이 비슷한 기능을 가지고 환각과 데이터 프라이버시 우려가 있기 때문에, 브랜드(유통 + 제품 품질과 연결)가 회사를 구분짓는 역할을 한다.

Sequoia 의 autopilot 논리 — 고객이 당신을 신뢰하기까지 쓰는 시간, 출력 품질 검증, 프로세스가 당신의 결과물 주변에 훈련되는 것, 에러율에 대한 신뢰 — 이것이 moat 이다. 약간 더 나은 모델을 가진 경쟁자는 상관없다. 신뢰는 누적된다.

**실제 적용 방법**:
- 창업자 브랜드 (X/LinkedIn에서 공개적으로 빌드)
- 고객 사례/track record 공개
- "wrong" 사례까지 투명하게 공개 (flywheel closure 에서 자주 나오는 reject report 전략)

### 3.4 유통 (Distribution)

**핵심 주장**: 초기 단계에서 유통 자체가 moat 이 됨. 모델이 복제 가능해도 유통은 시간이 걸림.

NFX — Cursor, Lovable, Clay — 이 회사들은 현대적 유통을 마스터하고 그 모멘텀으로 더 깊은 defensibility 층으로 올라간다.

a16z Casado — AI 기술 스택에 내재적 moat 은 bootstrap 문제를 극복하는 것 외에는 없다. 초기 단계에서 모든 AI 회사는 비슷해 보인다. 차별화는 스케일에서 compounding data advantage, 워크플로 깊이, 브랜드를 통해 나타난다.

**유통 = moat 의 조건**:
- 타깃 세그먼트가 뭉쳐있는 곳에 존재 (Discord, X, Reddit)
- 창업자가 콘텐츠/커뮤니티를 직접 운영
- 경쟁자보다 먼저 bootstrap 문제 해결

### 3.5 Multimodal / Vertical Integration

**핵심 주장**: 단일 데이터 타입이 아니라 여러 modality 를 결합할 때 복제 난이도가 올라감.

Bessemer 원칙 — 기술적 moat 은 multimodality 에서 온다. 경쟁 우위는 데이터 타입과 워크플로 통합의 결합에 달려 있지, 독점 모델만으로는 안 된다.

Bessemer 원칙 재강조 — commoditized 기능을 피해라. 데이터 추출과 검증 같은 것은 table stakes 가 될 것이다. 대신 end-to-end 워크플로를 기존 시스템과 긴밀히 통합해서 다룬다.

### 3.6 Switching Cost & 전환 마찰

**핵심 주장**: 유저가 떠나는 비용이 높을수록 lock-in.

a16z crypto 의 Privacy moat 논리 — 유저는 토큰을 새 체인으로 브리지할 수 있지만, 트랜잭션을 익명으로 만드는 crowd 는 가져올 수 없다. 이 논리는 crypto 외 도메인에도 적용됨 — **개인화된 state 는 가지고 갈 수 없다**.

Cogochi 같은 per-user 학습 구조는 여기에 직접 해당 (섹션 9 에서 다룸).

**Switching cost 의 형태**:
- 학습된 개인 모델/설정
- 축적된 history/ledger
- 팀 협업 구조 embedding
- 커스텀 통합/자동화

---

## § 4. Copilot vs Autopilot — Sequoia 의 결정적 프레임

Julien Bek (Sequoia, 2026년 3월) 의 테제가 가장 날카로움. 이 프레임은 거의 모든 AI 제품에 적용 가능하다.

다음 $1T 회사는 소프트웨어 도구가 아니라 완성된 작업을 판다. 핵심 경제 인사이트: 소프트웨어에 $1 쓸 때마다 서비스에 $6 가 쓰인다. AI autopilot 회사는 서비스 마진 (20-30%) 이 아니라 소프트웨어 마진 (70-80%) 으로 서비스 달러를 잡는다. Copilot (전문가용 도구) 은 새 모델이 나올 때마다 경쟁에 시달리지만, autopilot (완성된 작업을 전달하는 회사) 은 모델 개선마다 운영 비용이 싸진다.

| | Copilot | Autopilot |
|---|---|---|
| 판매 대상 | 소프트웨어 예산 | 노동 예산 |
| 과금 | seat / subscription | per-outcome / per-task |
| 마진 | 70-80% (SaaS) | 70-80% (software margin on services revenue) |
| 경쟁 | 모델 출시마다 | trust 로 방어 |
| 빌드 난이도 | 낮음 | 높음 (워크플로 전체 책임) |
| 예시 | GitHub Copilot, Notion AI | Eve (legal), Harvey, Crescendo |

Autopilot 의 가장 쉬운 진입점은 직원을 대체하는 게 아니라 outsourced 서비스를 대체하는 것이다. 업무가 이미 외주된 상태일 때, 세 가지가 성립한다... 그래서 AI 서비스로 전환이 훨씬 쉽다. 플레이북은 단순하다: 지식 중심(intelligence-heavy) 이면서 이미 외주된 업무부터 시작하라. 보험 브로커리지 ($140-200B), 회계/감사, 헬스케어 revenue cycle 같은 버티컬이 타깃.

**이 프레임의 시사점**:
- "AI 도구 만들기" → "AI 가 처리한 결과 팔기" 로 설계 각도를 틀 수 있는가?
- 완성도 (output quality) 에 대한 책임을 질 수 있는가?
- trust 를 쌓는 데 걸리는 수개월을 견딜 자본이 있는가?

---

## § 5. Vertical AI — Bessemer 의 결정적 프레임

Bessemer 는 2025~2026 년에 가장 체계적인 vertical AI 플레이북을 출판함. 핵심 10개 원칙 요약.

1. 고객이 자동화하기를 원하는 워크플로에 집중. 2. commoditized 애플리케이션 회피. 3. AI 가 인간이 못 하는 일을 할 수 있는 기회 추구 (대규모 데이터 분석 등). 4-10. 정량화 가능한 ROI, 비즈니스 모델 혁신, 복잡한 요구사항 커스터마이즈, multimodality, modular/scalable 모델 스택, 양보다 질의 데이터.

강력한 한 줄 — Vertical AI 는 IT 예산과 경쟁하지 않는다. labor 예산과 경쟁한다. 기존 vertical SaaS 가 Fortune 500 IT 지출의 일부만 잡는 반면, Vertical AI 는 P&L 의 labor 라인에 직접 연결된다.

**체크리스트 — vertical AI 로 성공 가능한가**:
- [ ] 특정 산업의 core workflow 를 깊이 이해하는가?
- [ ] 그 산업의 기존 시스템 (ERP, CRM, 도메인 특화 SW) 와 통합할 수 있는가?
- [ ] 명확히 측정 가능한 ROI (시간/비용 절감, 수익 증가) 가 있는가?
- [ ] 데이터 추출/검증 같은 table-stakes 를 넘어 end-to-end 워크플로를 다루는가?
- [ ] 산업 특화 컴플라이언스/보안 요구사항을 충족할 수 있는가?

---

## § 6. Thin Wrapper 는 왜 unfundable 인가

VC 들의 가장 강한 negative signal.

VC 는 thin wrapper — ChatGPT 나 Claude 같은 기존 모델 위에 UI 를 얹은 애플리케이션 — 를 structurally fragile 하고 궁극적으로 unfundable 로 본다. 이들은 고유 IP 가 없고, 진입 장벽이 거의 0 이며 (마진을 깎는 심한 경쟁으로 이어짐), 기저 모델 제공사가 유사 기능을 네이티브로 출시하면 하룻밤에 쓸모없어지는 existential threat 에 노출된다.

AI-native — AI 가 bolted-on 기능이 아니라 핵심 아키텍처 기반 — 스타트업은 비 AI 대비 최대 41% 가치 프리미엄을 받는다. 또한 이들은 전통 SaaS 벤치마크보다 6배 높은 직원당 매출 지표를 보여주며 놀라운 operational leverage 를 입증한다.

**Wrapper 로 분류되는 신호**:
- 제품 핵심이 "프롬프트 + UI" 에 머물러 있음
- 모델 제공사가 같은 기능을 출시하면 대체 가능
- 유저 데이터/피드백이 제품 개선에 쓰이지 않음
- 워크플로 embedding 이 얕음 (가끔 열어서 쓰는 도구)
- 전환 비용 거의 없음

**Wrapper 에서 벗어나는 path**:
- Vertical 으로 좁히고 도메인 특화 워크플로 지배
- Autopilot 으로 모델 전환 (결과 책임)
- Proprietary 데이터 루프 구축
- Deep integration 으로 switching cost 생성

---

## § 7. Defensibility Layering — 언제 무엇을 쌓아야 하나

NFX 의 시기별 moat 프레임. 핵심은 모든 moat 을 동시에 쌓을 수 없다는 것.

초기 단계 스타트업은 defensibility 가 거의 없다 — defensibility 는 시간에 걸쳐 쌓인다. 질문은 언제 각각을 배포할지다. bailey 먼저, 그다음 motte 를 지어라. 이것이 초기 속도를 극대화해서 더 깊은 defensibility 로 이동할 자원을 얻게 한다.

| Stage | 주요 Moat | 왜 |
|---|---|---|
| Pre-seed ~ Seed | **Growth 자체** | 빠른 성장이 투자자/인재/유저 끌어옴 |
| Seed ~ Series A | **Distribution + Brand** | 초기 bootstrap 문제 해결이 lock-in 전에 먼저 |
| Series A ~ B | **Data flywheel 시작 + Workflow embedding** | 사용자 feedback loop 가 기능하기 시작 |
| Series B ~ C | **Switching cost + Network effects** | scale 에서 비로소 compounding |
| Growth ~ | **Brand + Category ownership** | 카테고리 자체가 된 회사만 |

**실무 의미**:
- 초기에 "완벽한 moat" 설계에 몰두하면 속도를 잃음
- 대신 "1년차 moat → 3년차 moat" 로 layered roadmap
- 각 단계에서 "이 moat 이 없으면 다음 단계로 못 간다" 는 핵심 하나만

---

## § 8. 프로젝트 설계 체크리스트

VC 렌즈를 그대로 자기 프로젝트에 적용하는 체크리스트. 각 질문에 "예" 라고 답할 수 없으면 그 부분은 moat 이 아님.

### A. 기본 생존 (wrapper 테스트)
- [ ] OpenAI/Anthropic 이 내일 같은 기능을 네이티브로 출시해도 유저가 우리를 쓸 이유가 있는가?
- [ ] 우리 제품의 핵심 가치가 "프롬프트 엔지니어링" 이 아닌가?
- [ ] 더 나은 모델이 나와도 우리 제품이 더 좋아지는가? (역관계 아닌가)

### B. Workflow embedding
- [ ] 고객이 주 3회 이상 쓰는가?
- [ ] 고객의 다른 시스템과 양방향 sync 가 있는가?
- [ ] 우리 제품 안에 고객의 history/state 가 쌓이는가?
- [ ] 우리를 제거하면 고객의 업무가 멈추는가?

### C. Proprietary 데이터
- [ ] 우리 데이터는 웹 스크랩으로 얻을 수 없는가?
- [ ] 데이터가 사용자 행동으로만 생성되는가?
- [ ] 데이터가 outcome (결과/라벨) 을 포함하는가?
- [ ] 데이터가 쌓일수록 제품 품질이 눈에 보이게 개선되는가?

### D. Trust/Brand
- [ ] 창업자/팀이 대상 시장에 공개적으로 presence 를 가지고 있는가?
- [ ] 우리의 "wrong" 사례까지 공개할 수 있는 투명성이 있는가?
- [ ] 고객이 친구에게 설명할 수 있는 한 줄 description 이 있는가?

### E. Switching cost
- [ ] 유저가 떠날 때 잃는 구체적 asset 이 있는가? (데이터, 모델, 설정, 팀 워크플로)
- [ ] 그 asset 을 경쟁사로 export 할 수 없는가?
- [ ] 3개월 사용한 유저가 1개월 사용한 유저보다 훨씬 더 많이 잃는가?

### F. Category clarity
- [ ] Copilot 인지 Autopilot 인지 명확한가?
- [ ] Horizontal 이면 왜 incumbent (Microsoft, Google) 가 못 하는가?
- [ ] Vertical 이면 왜 이 산업이 특별히 AI 로 뒤집히는가?

---

## § 9. Cogochi 적용 — 별도 섹션

VC 렌즈로 본 현재 설계 진단. 이건 일반론이 아니라 프로젝트에 대한 구체 판단이라 섹션을 분리.

### 9.1 Cogochi 의 moat 포지션 — 현재 설계 기준

프로젝트 문서에서 주장하는 moat:
- **Per-user LoRA 어댑터** (유저별 개인화 모델)
- **자동 훈련 데이터 생성** (피드백 → chosen/rejected → LoRA)
- **4-layer ML 아키텍처** (Base → Asset LoRA → User LoRA → Validation)
- **Judgment ledger / 패턴 라벨 flywheel** (WTD 트랙)

VC 프레임으로 매핑하면:

| Moat 축 | Cogochi 현재 포지션 | VC 렌즈 평가 |
|---|---|---|
| Workflow embedding | Terminal/Training/Performance 3면 구조, daily 사용 가정 | **중** — 아직 가정이지 검증 아님. D7 retention 30%+ 목표가 이 검증 |
| Proprietary data | 유저의 ✓/✗ 피드백 + 패턴 라벨이 per-user 모델로 축적 | **강** — 스크랩 불가, outcome 연결, 개인화. 설계상 유효 |
| Trust/Brand | 리테일 트레이더 대상, 개인 창업자 발신 | **약** — 아직 brand 미축적, 공개 track record 없음 |
| Distribution | GTM 미정 (X/Discord 가정) | **약** — 구체 채널 설계 부재 |
| Multimodal | 차트 + 텍스트 + 지표. 음성/비디오 없음 | **중** — 크립토 도메인에는 충분할 수도 |
| Switching cost | 3개월 훈련한 LoRA 버릴 수 없음 | **강 (이론)** — 단, 유저가 실제로 "이 LoRA 없으면 안 된다" 고 체감해야 작동 |

### 9.2 강점 — 이건 VC 설명이 쉬움

1. **per-user model 은 genuine differentiation**. ChatGPT/Claude/AIXBT 는 글로벌 모델. 이건 Sequoia Huang 이 말한 "vertical specialization + data moat + workflow integration" 의 교과서적 구성.
2. **data flywheel 이 설계 자체에 박혀 있음**. 유저 행동 → 훈련 데이터 → 모델 개선 → 유저 가치 → 더 많은 행동. a16z Eve 케이스 구조와 동일.
3. **Non-Goals 가 명시적**. "Minara 가 한 것은 안 함" — VC 미팅에서 scope 질문 방어 가능.
4. **Autopilot 으로 진화 path 있음**. 현재 Copilot (유저가 판단) → Phase 2 에서 "AI 가 자동 실행" (Autopilot) 으로 Sequoia 테제와 align.

### 9.3 약점 — VC 가 반드시 질문할 것

**W1. TAM 숫자가 낙관적임**.
프로젝트 문서의 TAM 근거: `3억 트레이더 × $10 ARPU` 와 `크립토 AI 에이전트 시총 $28B`. 둘 다 [추정] 태그 있음. VC 는 이것을 "fundable TAM 스토리" 로 못 읽을 가능성 높음. 리테일 크립토 트레이더 중 **월 $19 지불 의향** 이 있는 집단 사이즈가 진짜 TAM.

**W2. Brand/Distribution 부재**.
NFX 업데이트 프레임에 따르면 2026년에는 brand 가 **일찍** moat 이 됨. Cogochi 문서는 GTM 이 "Twitter/Discord" 수준으로만 스케치 됨. VC 질문 예: "창업자의 크립토 트위터 팔로워가 몇 명이며, 지난 3개월 impressions 는?"

**W3. Per-user LoRA 가 실제로 +5%p 정확도를 낼지가 H1**.
문서에서 스스로 "검증 가능한 주장(H1)" 이라고 명시. VC 관점에서 이건 **technical risk** 가 아니라 **business risk** — 검증 못 하면 moat 전체가 무너짐. Kill criteria 설정은 건강한 신호지만, VC 미팅 시점에 이게 아직 검증 중이면 seed 를 받기 쉽지 않음.

**W4. Crypto retail 이라는 시장 자체가 VC 선호 밖**.
Sequoia / a16z 의 vertical 선호는 insurance, legal, healthcare, accounting — B2B 대형 TAM, 규제된 시장. Crypto retail 은 cyclicality, regulatory risk, 유저 churn 높음. a16z crypto 가 예외지만 그쪽도 onchain/privacy/RWA 쪽 테제.

**W5. Autopilot 이 아님**.
Sequoia Bek 프레임에서 Cogochi 는 명백히 Copilot. "AI 가 판단하고 유저가 확인" 구조. $19/월 subscription 은 software budget 에서 나오지 labor budget 이 아님. Autopilot 으로 넘어가려면 "AI 가 실제로 거래를 실행하고 수익률로 과금" 해야 함 — 이건 regulatory risk + 책임 문제 큼.

### 9.4 피봇팅 옵션 — 3 갈래

VC 렌즈에서 Cogochi 가 취할 수 있는 전략 방향 세 개. 각각 장단 명확.

#### Option 1. 현재 유지 — "Personal Crypto Copilot"

유지하는 경우의 포지셔닝: "리테일 크립토 트레이더를 위한 per-user 학습 AI 분석 도구".

- **장**: 빠른 개발, 명확한 페르소나 (Jin), 설계 완성도 높음
- **단**: VC-fundable 하지 않을 수 있음. 부트스트랩 사업으로는 좋지만 $100M+ 회사 되기 어려움
- **적합한 자금**: 자기자본 + 소형 angel / pre-seed ($100K~500K)
- **성공 기준**: M6 MRR $5K+ 로 PMF 증명 → 부트스트랩 또는 보다 약한 VC round

#### Option 2. B2B 피봇 — "Hedge Fund / Prop Desk Personal Models"

같은 per-user LoRA 기술을 리테일이 아니라 **헤지펀드/프롭트레이더/리서처** 에게 판매.

- **장**: VC 가 좋아하는 B2B, ACV $1K~10K/월, labor budget 에 접근, 규제 회피 (트레이더가 자기 계정으로 돌림)
- **단**: 엔터프라이즈 세일즈 사이클, 페르소나 완전 변경 필요, 기술은 같아도 제품은 다시 만들어야 함
- **선례**: flywheel-closure-design 문서에 이미 "Research Transparency Lab" / "B2B Research License" 가 fallback 으로 언급됨 — 즉 이 가능성은 이미 고려 중
- **결정 기준**: Phase 1 에서 리테일 10명 베타가 "나 이거 회사에서도 쓰고 싶다" 같은 시그널을 주는가

#### Option 3. Autopilot 피봇 — "AI Trader as a Service"

per-user LoRA 로 학습된 AI 가 **유저 대신 거래를 실행**. Subscription 이 아니라 수익률 공유.

- **장**: Sequoia Bek 테제에 정확히 부합, labor budget 에 들어감, moat 이 훨씬 강함 (실제 수익 track record)
- **단**: regulatory risk 매우 큼 (자산운용업 라이선스), 책임 보험, 손실 시 분쟁, 에러 용인도 0 에 가까움
- **현실성**: 초기 스테이지에서는 불가능에 가까움. Phase 3+ 옵션으로만

#### 추천

**Option 1 로 Phase 1 완주 + Option 2 로 pivot 가능성 오픈**.

- Phase 1 에서는 리테일로 진짜 moat 증거 (per-user LoRA 가 +5%p 내는지, D7 retention 30%+ 나는지) 를 모음
- Phase 1 베타 유저 중 파워 유저 2-3명에게 "당신 회사/팀에서 이걸 써볼 생각 있나요?" 질문
- 그 답이 예스면 Option 2 로 B2B 피봇 가능 — 이때 VC 펀딩 가능성 열림
- 답이 노면 부트스트랩/인디 핵커 경로로 지속 (이것도 나쁜 건 아님)

### 9.5 VC 미팅 준비 — 지금 당장 강화할 것

VC 에게 피칭한다면 (시점 상관없이) 반드시 보강해야 할 5가지:

1. **TAM 스토리 다시 쓰기**. `리테일 트레이더 × $19` 가 아니라 `"학습형 AI 에이전트 툴" 이라는 신 카테고리가 X 년 내 Y 규모` 같은 카테고리 내러티브.
2. **창업자 brand 빌드 시작**. 크립토/AI 트위터에서 공개적으로 진행 상황, 실패 사례, 기술 인사이트 공유. Cursor 와 Lovable 이 한 것.
3. **Track record 페이지 공개**. `H1 검증 상태`, `실제 파인튜닝 결과 ±%p`, 공개 URL 로. flywheel-closure-design 문서의 "reject 포함 reproducible report" 전략이 여기 정확히 부합.
4. **10명 베타 의 video testimonial** 혹은 "내 AI 정확도 63%" 유저 스크린샷. Trust moat 은 말이 아니라 증거.
5. **Phase 2 vision 한 장짜리 슬라이드**. 리테일 → B2B 경로, 혹은 Copilot → Autopilot 경로. VC 는 "지금 $1B 가 될 path" 를 본다.

---

## § 10. 결론

1. AI 모델 자체는 moat 이 아니라는 것이 top VC 들의 수렴 결론. 이건 2026년 시점에서 거의 합의.
2. 진짜 moat 은 모델 밖의 6개 축 — workflow embedding, proprietary data, trust/brand, distribution, multimodal, switching cost.
3. 전략 방향은 두 갈래 — Services-as-Software (Sequoia) 와 Vertical AI (Bessemer). 둘 다 labor budget 타깃.
4. Moat 은 한 번에 쌓는 게 아니라 layered 로 쌓음 (NFX).
5. Cogochi 는 **설계상 per-user data moat 은 강**하지만 **brand/distribution/TAM 스토리는 약**함. 리테일 Phase 1 완주 + B2B 피봇 옵션 유지 가 현실적 경로.

---

## 부록 A. 참고 문헌 (원문 링크 포함)

주요 VC 테제 원문:

- a16z — *The New Business of AI* (2020, 여전히 인용됨): 모델 commoditization 과 gross margin 문제 최초 지적
- a16z — *The Empty Promise of Data Moats*: 데이터 자체는 moat 이 아니라는 반론
- a16z — *State of AI / Big Ideas 2026*: 섹터별 예측
- Sequoia — *Services: The New Software* by Julien Bek (2026년 3월): Copilot/Autopilot 프레임
- Sequoia — *2026: This Is AGI* by Grady & Huang (2026년 1월): long-horizon agents 테제
- Sequoia — *AI in 2026: A Tale of Two AIs* (2025년 12월): 데이터센터 공급 제약
- Bessemer — *Vertical AI Roadmap* Part I~IV (2025~2026년): 10개 원칙
- Bessemer — *State of AI 2025*: 카테고리별 분석
- Bessemer — *Building Vertical AI* (2026년 1월): 창업자용 플레이북
- NFX — *How AI Companies Will Build Real Defensibility* (2025년 8월): defensibility layering
- NFX — *The Network Effects Manual*: 16개 network effect 타입
- Greylock — Edge 프로그램 / Saam Motamedi 인터뷰: AI-first 포지션

---

*이 보고서는 공개 VC 테제/블로그와 Cogochi 프로젝트 문서를 교차 분석한 결과다. 모든 VC 인용은 2024-2026 원문 링크 확인됨. Cogochi 섹션은 프로젝트 문서 기반 진단이며, 외부 VC 의견이 아님.*
