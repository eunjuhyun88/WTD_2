# Design Router Rules

> `/설계` (라우터) 메인 스레드(Sonnet)가 brief 분석 시 참조.

---

## 어휘 → role 매핑

| 키워드 (case-insensitive) | role |
|---|---|
| UI, UX, 화면, 배치, 위계, 차트, 페이지, 모바일, drawer, 디자인, 레이아웃, hover, 컴포넌트, 시각, 면적, hierarchy | **uiux** |
| 이벤트, GTM, 추적, dataLayer, funnel, 전환, conversion, A/B, 메트릭, KPI, 분석, 측정, 분모, 분자 | **gtm** |
| 모델, 학습, 추론, eval, dataset, baseline, LLM, prompt, fine-tune, embedding, classifier, p95 (모델) | **ai** |
| migration, schema, 인덱스, query, RLS, supabase, postgres, 테이블, lock, vacuum, row count | **dba** |
| SLO, latency, 배포, rollback, dependency, scale, infra, fluid, edge, cache, CDN, blast radius | **아키** |
| RPC, finality, gas, ethereum, solana, indexer, re-org, network, chain ID, on-chain | **onchain** |
| solidity, audit, ACL, oracle, upgrade pattern, storage slot, immutable, proxy, smart contract | **contract** |

복수 어휘 = 복수 role.

---

## Lead 자동 결정

1. role 1개 → lead = 그것
2. role ≥2 → 가장 많이 매칭된 role
3. 동률 시 우선순위: **uiux > gtm > 아키 > ai > dba > onchain > contract**
   (사용자 가시성 가까운 쪽이 trade-off 결정 권한 보유)

---

## 자동 dispatch 흐름

```
brief 받기
  ↓
Sonnet (메인): 어휘 매칭 → role 후보 + lead 결정
  ↓
1줄 확인 출력:
  "감지: uiux + gtm. lead=uiux. 5초 후 자동 진행 (n 입력 시 중단/수정)"
  ↓ (5초 timeout 또는 응답)
  
N=1 → 단일 role 진입점 호출 (Step 0 → A → B → C)

N≥2 → Round 1 (병렬 role draft)
       ↓
       Round 2 (Sonnet 메인: constraint 충돌 검출)
       ↓ 충돌 0 → 머지 → Step B
       ↓ 충돌 ≥1
       Round 3 (lead 서브에이전트 Opus: 통합 + 사용자 충돌 결정)
       ↓
       Step B (사용자 검토 1번만)
       ↓
       Step C: 1 epic Issue + N child Issue (role별)
```

---

## Round 1 — 병렬 role draft

각 role 서브에이전트(Opus) 동시 호출:

```python
Agent(
  description=f"설계 [{role}]: {KW}",
  subagent_type="general-purpose",
  model="opus",
  prompt=f"""
당신은 {role} 전문가.
먼저 Read:
  @.claude/commands/_design-shared.md
  @.claude/commands/_design-{role}.md

## brief
{brief verbatim}

## 컨텍스트 (parent 수집)
{KW grep/gh/git 결과}

## 진행
1. _design-shared + _design-{role} 읽고 Step 0 캐묻기 4문항 사용자에 출력
2. 답 받으면 Step A draft (≤80줄, role 슬롯)
3. Hard constraint 1~3개 export
4. parent에 반환: {{ draft, constraints }}

단독 호출이 아니므로 Step B/C 진행하지 마라.
"""
)
```

---

## Round 2 — Constraint 충돌 검출 (Sonnet 메인)

각 draft에서 `### Hard constraint` 섹션만 추출.
충돌 룰:
- latency 합 > 사용자 SLO (예: uiux 1.5s vs ai 600ms + dba 800ms + 네트워크 = 초과)
- cost 합 > 예산
- 시간 의존 reversal (rollback < deploy)

충돌 표:
```
| 출처 | 제약 | 충돌 상대 | 격차 |
```

0개 → Round 3 생략.

---

## Round 3 — Lead 통합 (Opus)

```python
Agent(
  description=f"설계 통합 [lead={lead}]",
  model="opus",
  prompt=f"""
당신은 {lead} role lead.
모든 role의 draft + 충돌 표를 받았다.

진행:
1. 충돌 ≤3개에 대해 사용자 결정 질문 (단일 선택지 형태로)
2. 답 받으면 통합 설계 ≤200줄 작성:
   - Goal / Scope / Non-Goals
   - 각 role 슬롯 통합 표시
   - PR 분해 (shell→data→GTM→확장)
   - Open Questions
3. Step B 사용자 검토
4. y → Step C: epic Issue + child Issue (role별) 생성, 링크
"""
)
```

---

## Frozen 가드

`spec/CHARTER.md` Frozen 섹션 어휘 매칭 → 즉시 중단, 사용자 보고. 절대 진행 금지.
