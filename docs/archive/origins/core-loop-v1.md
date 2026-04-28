# Cogochi Core Loop v1 — 단일 빌드 명세

> **Layer B 정본.** core-loop 계열 7개 문서를 통합한 엔지니어/에이전트 빌드 기준 명세. 제품 서사는 최소화하고 객체·상태·계약·와이어프레임만 남겼다.
>
> **Supersedes:** `core-loop.md`, `core-loop-system-spec.md`, `core-loop-agent-execution-blueprint.md`, `core-loop-object-contracts.md`, `core-loop-route-contracts.md`, `core-loop-state-matrix.md`, `core-loop-surface-wireframes.md`
>
> **Day-1 surfaces:** `/terminal`, `/lab`, `/dashboard`.  
> **상위 문서:** Layer A (제품 PRD, v7 계열).  
> **하위 문서:** Layer C (엔진 런타임 스펙).

---

## 0. 읽는 순서

이 문서 한 개로 Day-1 core loop 빌드/리뷰/QA가 가능해야 한다. 그래도 작업별 진입점은 다음과 같다.

| 작업 | 진입 섹션 |
|---|---|
| 전체 그림 파악 | §1 Thesis, §2 Canonical Loop |
| 새 객체 필드 추가/변경 | §5 Object Contracts |
| 새 lifecycle 전이 추가 | §6 State Matrices |
| 새 route 추가 | §7 Route Contracts |
| 새 surface 추가/수정 | §8 Surface Wireframes |
| 엔진-앱 권한 경계 충돌 | §4 Authority & Runtime Lanes |
| 에이전트에 작업 분배 | §10 Agent Execution |
| 불일치 발견 시 | §13 원본 간 충돌 / 해결 |

---

## 1. Product Thesis

Cogochi는 "의견 주는 AI"가 아니다. 네 가지 시스템의 합성이다.

1. **Capture system** — 트레이더 판단을 박제한다.
2. **Scanning system** — 반복되는 시장 구조를 전 종목에서 찾는다.
3. **Verification system** — 저장된 구조가 실제로 먹혔는지 닫는다.
4. **Refinement system** — 판정된 결과로 다음 탐지를 개선한다.

제품의 다섯 동사: `Scan`, `Chat`, `Judge`, `Train`, `Deploy`.  
Day-1에서 3개 surface가 이 동사를 나눠 가진다.

- `/terminal` — review + capture
- `/lab` — evaluate + activate
- `/dashboard` — monitor + judge

### 1.1 Design Principles

1. **Capture before compose.** Day-1 입력은 "리뷰한 차트 구간"이지 추상 전략 폼이 아니다.
2. **AutoResearch expands; it does not invent.** 모든 라이브 검색/알림은 저장된 유저 증거 또는 평가된 가설로 역추적 가능해야 한다.
3. **Deterministic judgment authority.** LLM은 해석/설명, 엔진과 deterministic ML은 scoring/evaluate/judge.
4. **One surface, one primary job.**
5. **Every click must move the loop forward.**

### 1.2 One-Cycle Definition

한 사이클이 닫혔다고 말할 수 있는 조건 8개 — 하나라도 빠지면 "스캐너일 뿐"이다.

1. 트레이더가 실매매 경험에서 setup을 말로 풀어낸다
2. 그 setup이 재사용 가능한 pattern definition으로 바뀐다
3. scanner가 전 유니버스에서 그 pattern을 감시한다
4. engine이 actionable phase를 탐지한다
5. 유저가 검토하고 save 또는 reject 한다
6. 결과가 자동 또는 수동으로 판정된다
7. 판정 결과가 ledger에 쓰인다
8. 누적된 판정이 미래 탐지 품질을 바꾼다

### 1.3 Core Rule

Loop가 건강하다는 조건:

- saved pattern → live watch 가능
- live watch → surfaced candidate 가능
- surfaced candidate → saved capture 가능
- saved capture → judged outcome 가능
- judged outcome → 미래 탐지 품질 변화 가능

하나라도 끊기면 시스템은 미완이다.

---

## 2. Canonical Core Loop

### 2.1 텍스트 플로우

```text
실전 매매 복기
  → 차트 검토 + Save Setup               [/terminal]
  → Lab 평가 + 가설 정리                  [/lab]
  → Watch 활성화                          [/lab]
  → 전 종목 스캔                          [engine scanner]
  → Phase 추적                            [engine runtime]
  → Actionable Candidate 서페이싱          [engine → surfaces]
  → 유저 검토 (차트 컨텍스트)               [/terminal]
  → Capture (ignore 또는 save)             [/terminal]
  → Outcome Evaluation                    [engine + user]
  → Ledger Aggregation                    [/lab + /dashboard]
  → Refinement Proposal                   [research lane]
  → Train / Deploy                        [worker-control]
  → 갱신된 Candidate로 루프 재진입
```

### 2.2 Four-Layer Flywheel (시스템 관점)

```text
Pattern Object
  → State Machine
  → Result Ledger
  → User Refinement
  → revised Pattern Object / thresholds / model state
```

### 2.3 Runtime Loop는 Core Loop가 아니다

다음은 실행 기계일 뿐이다 — core loop의 정의에 포함되지 않는다:

- scheduler loop
- periodic scan job
- background evaluation job

제품의 core loop는 이 실행 기계들이 만들어 내는 **학습 순환**이다.

---

## 3. Reference Pattern — Five-Phase State Model

레퍼런스는 TRADOOR/PTB OI 반전 구조. 다른 pattern은 각자의 phase 시퀀스를 가지지만 `PatternObject + PhaseCondition[] + StateMachine` 구조는 공통이다.

| # | Phase | Evidence | Action |
|---|---|---|---|
| 1 | `FAKE_DUMP` | 급락, OI 소폭 증가, 거래량 확신 부족 | 진입 금지 |
| 2 | `ARCH_ZONE` | 아치 반등 / 압축 횡보, 번지대 형성 | 저갱 대기 |
| 3 | `REAL_DUMP` | 급락 + OI 대폭 증가 + 거래량 확신 | 구조적 앵커 마킹 |
| 4 | `ACCUMULATION` | 저점 상승, OI 유지, 펀딩 전환, 타이트한 무효화 | **actionable entry** |
| 5 | `BREAKOUT` | OI 동반 확장, 빠른 상승 | 결과 확인, 보통 늦음 |

**Design implication:** 시스템은 `BREAKOUT` 확인이 아니라 `ACCUMULATION` 서페이싱에 최적화된다. 이게 제품 엣지.

핵심 구분 두 가지:
- `FAKE_DUMP` vs `REAL_DUMP` — 함정 회피
- `ACCUMULATION` ≫ `BREAKOUT` — 늦지 않은 진입

---

## 4. Authority & Runtime Lanes

### 4.1 Authority Split

| Layer | Owns | Must Not Own |
|---|---|---|
| **App** | 페이지 컴포지션, 로컬 상호작용 state, optimistic/degraded UX, route 오케스트레이션 | scoring 수학, pattern matching 로직, ledger 판정 로직 |
| **Engine** | capture 영속 truth, evaluation truth, monitoring truth, verdict & ledger truth | surface-only 레이아웃, client navigation |
| **Contract** | route/payload 경계, versioning, schema 안정성, deep-link 보장 | 페이지 스펙을 우회하는 UX 결정 |
| **Research** | similarity/ranking 방법론, refinement 정책, 피드백→개선 해석 | unversioned UI-only heuristic을 truth로 제시 |

### 4.2 Runtime Lanes

| Lane | 책임 |
|---|---|
| **Lane 1. App-Web** | surface 렌더, 얇은 engine route 프록시, 유저 액션 캡처, pattern/alert 상태 표시 |
| **Lane 2. Engine-API** | pattern definition, phase tracking, candidate 생성, deterministic stats, capture/verdict ingestion |
| **Lane 3. Worker-Control** | scheduled scans, auto evaluation, dataset 생성, refinement proposal 생성, training/rollout job |
| **Lane 4. Data Plane** | state store, ledger store, training projection, model registry |

### 4.3 Surface Responsibility Summary

| Surface | Primary Job | Must Own | Must Not Own |
|---|---|---|---|
| `/terminal` | 라이브 컨텍스트 관찰, pattern query 구성/정제, 라이브 candidate 검사, Save Setup, 즉각 yes/no 판단 | 현재 symbol/timeframe, 차트 렌더, 선택 range capture, 빠른 capture flow, inline AI 해석 | canonical pattern truth, 최종 scoring 로직, 영속 runtime state |
| `/lab` | pattern 품질 히스토리 검사, evaluation 실행, instance 비교, score/outcome 분포, promotion 여부 결정 | challenge/pattern 인벤토리, metrics/scorecard, instance 테이블, evaluation run initiation | 실시간 scanning, live alert routing |
| `/dashboard` | active work 인박스, watching 상태, pending 피드백, 최근 alert, adapter 상태 | watch list, signal 인박스, pending feedback queue, 최근 model/adapter 상태 | 상세 pattern 편집, 전체 evaluation workflow |

---

## 5. Object Contracts

**Scope:** Day-1 필수 객체 7개. 필드 레벨 계약은 engine 진짜 영속과 일치해야 한다. UI는 view-model을 만들 수 있지만 engine이 truth.

### 5.1 Global Rules

1. 모든 durable 객체는 `id`, `schema_version`, `created_at`, `updated_at`을 가진다.
2. cross-object relation은 display label이 아니라 **stable id**로 연결한다.
3. `challenge`는 내부 객체 이름. 유저에게는 `saved setup` / `setup`으로 표기해도 된다 — **내부 id는 절대 바꾸지 않는다**.
4. manual verdict와 auto verdict는 분리 가능한 채로 남는다. 단일 boolean으로 합치지 않는다.
5. App은 view model을 만들 수 있지만, engine-backed 영속은 truth.

### 5.2 Identity and Versioning (공통)

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | UUID 또는 slug-safe stable 식별자 |
| `schema_version` | `integer` | yes | `1`부터 시작. breaking change에 bump |
| `created_at` | `datetime` | yes | UTC ISO8601 |
| `updated_at` | `datetime` | yes | UTC ISO8601 |

### 5.3 `capture`

**Meaning:** terminal에서 저장된 정확한 리뷰 차트 증거.  
**Owner:** terminal이 생성, engine-backed 영속이 durable truth.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | durable capture id |
| `schema_version` | `integer` | yes | 현재 `1` |
| `symbol` | `string` | yes | exchange symbol |
| `timeframe` | `string` | yes | `15m`, `1h`, `4h` 등 |
| `range_start` | `datetime` | yes | 선택 범위 시작 |
| `range_end` | `datetime` | yes | 선택 범위 끝 |
| `range_kind` | `enum` | yes | `review`, `candidate`, `alert`, `instance_replay` |
| `source_ref` | `object` | no | `candidate_id`, `alert_id`, `challenge_slug` 등 상위 소스 |
| `ohlcv_slice` | `object` | yes | 선택 range의 candle payload 또는 immutable reference |
| `indicator_slice` | `object` | yes | OI, funding, volume, structure 등 가시 컨텍스트 |
| `note` | `string` | no | 해당 range에 대한 짧은 thesis |
| `similarity_seed` | `object` | no | similar-capture preview용 정규화 seed |
| `status` | `enum` | yes | `saved`, `archived` |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

**Rules:**
- 항상 구체적 선택 range를 표현한다. `symbol`, `timeframe`, `range_start`, `range_end` 없이 저장 불가.
- `note`는 선택 사항이나 있을 때는 **심볼 일반이 아니라 선택 range에** 귀속된다.
- `capture`는 UI 북마크가 아니다. 선택된 차트 세그먼트를 최신 symbol state와 함께 보존한다.

**Two save paths (같은 substrate):**
- `manual_pattern_seed` — 유저가 차트 세그먼트를 먼저 마킹, candidate 연결 없이 선택 range 증거 저장.
- `pattern_candidate` — 서페이싱된 candidate에서 출발, 선택 range 증거 + `candidate_id` + `transition_id` 저장.

### 5.4 `challenge`

**Meaning:** capture 또는 explicit 구조화 입력에서 투영된 **evaluated setup hypothesis**.  
**Owner:** lab이 evaluation lifecycle 소유.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `slug` | `string` | yes | stable challenge 식별자 |
| `schema_version` | `integer` | yes | 현재 `1` |
| `source_capture_ids` | `string[]` | yes | 하나 이상의 capture id |
| `projection_mode` | `enum` | yes | `capture_only`, `capture_plus_hint`, `explicit_query` |
| `title` | `string` | yes | 유저 노출 라벨 |
| `description` | `string` | no | lab readable 요약 |
| `direction` | `enum` | no | `long`, `short`, `both`, `unknown` |
| `timeframe` | `string` | yes | 표준 evaluation timeframe |
| `universe` | `string` | yes | evaluation 유니버스 이름 |
| `definition_ref` | `object` | yes | `answers.yaml`, `match.py` 등 definition 참조 |
| `evaluation_status` | `enum` | yes | `projected`, `queued`, `running`, `evaluated`, `accepted`, `rejected`, `failed`, `archived` |
| `latest_summary` | `object` | no | 최신 deterministic evaluation 요약 |
| `artifacts_ref` | `object` | no | instance/result artifact 위치 |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

**Rules:**
- 모든 challenge는 최소 1개 capture 또는 explicit 구조화 입력 경로로 역추적 가능해야 한다.
- lab은 challenge 표현을 정제할 수 있지만 source capture 링크를 **silent하게 끊으면 안 된다**.

### 5.5 `pattern`

**Meaning:** monitoring/refinement layer가 쓰는 **재사용 가능 runtime 표현**.  
**Owner:** engine + research lane.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable runtime pattern id |
| `schema_version` | `integer` | yes | 현재 `1` |
| `challenge_slug` | `string` | yes | 출처 evaluated challenge |
| `pattern_family` | `string` | yes | pattern 그룹 라벨 |
| `runtime_state` | `enum` | yes | `candidate`, `active`, `paused`, `retired` |
| `matching_strategy` | `enum` | yes | `state_machine`, `similarity`, `deterministic_ml`, `hybrid` |
| `threshold_profile` | `object` | yes | runtime이 쓰는 active threshold |
| `summary_stats` | `object` | no | success rate, coverage, decay 등 |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

**Rules:**
- UI는 pattern id를 로컬에서 만들 수 없다.
- pattern runtime state는 evaluation/refinement 하위. terminal이 직접 바꾸는 액션이 아니다.

### 5.6 `watch`

**Meaning:** evaluated setup에 대한 **라이브 모니터링 등록**.  
**Owner:** lab이 활성화, dashboard가 continuity state 관리.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable watch id |
| `schema_version` | `integer` | yes | 현재 `1` |
| `challenge_slug` | `string` | yes | 모니터링 중인 evaluated challenge |
| `pattern_id` | `string` | no | 링크된 runtime pattern (있을 때) |
| `status` | `enum` | yes | `live`, `paused`, `retired` |
| `delivery_targets` | `string[]` | yes | `dashboard`, `terminal`, `telegram` 등 |
| `activation_source` | `enum` | yes | Day-1은 `lab_evaluate_accept`만 |
| `scope` | `object` | yes | symbols, timeframe, universe, phase scope |
| `last_evaluated_summary` | `object` | no | dashboard 컨텍스트용 복사본 |
| `activated_at` | `datetime` | yes | UTC |
| `paused_at` | `datetime` | no | UTC |
| `retired_at` | `datetime` | no | UTC |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

**Rules:**
- Day-1에서 **terminal이나 dashboard에서 새 watch 활성화 금지**. lab에서만.
- dashboard는 기존 watch를 pause/resume/retire.

### 5.7 `alert`

**Meaning:** watch 또는 active pattern 컨텍스트에 대해 emit된 **라이브 시장 이벤트**.  
**Owner:** scanner + alerts pipeline.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable alert id |
| `schema_version` | `integer` | yes | 현재 `1` |
| `watch_id` | `string` | no | watch 기원 alert일 때 기본 링크 |
| `pattern_id` | `string` | no | runtime 링크 (있을 때) |
| `challenge_slug` | `string` | yes | 유저 readable setup 컨텍스트 |
| `symbol` | `string` | yes | alert symbol |
| `timeframe` | `string` | yes | alert timeframe |
| `detected_at` | `datetime` | yes | UTC |
| `phase_summary` | `string` | no | `accumulation`, `breakout risk` 등 |
| `score_summary` | `object` | no | deterministic engine/ML scoring 요약 |
| `drilldown_context` | `object` | yes | terminal 오픈에 필요한 replay 컨텍스트 |
| `dedup_key` | `string` | yes | stable dedup 식별자 |
| `manual_verdict_state` | `enum` | yes | `pending`, `agree`, `disagree` |
| `auto_verdict_state` | `enum` | yes | `pending`, `hit`, `miss`, `void` |
| `status` | `enum` | yes | `pending`, `judged`, `archived` |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

**Rules:**
- 모든 alert는 terminal drilldown을 지원해야 한다 — `drilldown_context` required.
- manual과 auto verdict state를 하나의 ambiguous 필드로 병합하지 않는다.

### 5.8 `verdict`

**Meaning:** alert, instance, 기타 evaluable subject에 붙는 **명시적 판정 기록**.  
**Owner:** engine이 truth 저장, dashboard + outcome system이 소스 제공.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable verdict id |
| `schema_version` | `integer` | yes | 현재 `1` |
| `subject_kind` | `enum` | yes | `alert`, `instance`, `challenge_outcome` |
| `subject_id` | `string` | yes | 참조 객체 id |
| `source` | `enum` | yes | `manual`, `auto` |
| `label` | `enum` | yes | `agree`, `disagree`, `hit`, `miss`, `void` |
| `confidence` | `number` | no | auto verdict에서 선택적 |
| `note` | `string` | no | 유저/오퍼레이터 노트 |
| `recorded_at` | `datetime` | yes | UTC |
| `recorded_by` | `string` | yes | `user:<id>` 또는 `system:auto` |

**Rules:**
- verdict는 **append-first 레코드**. mutable boolean이 아니다.
- 한 subject에 manual verdict와 auto verdict가 공존 가능.

### 5.9 `ledger_entry`

**Meaning:** outcome, verdict, 성과 증거를 묶는 **durable aggregation-ready 레코드**.  
**Owner:** engine + research lane.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable ledger record id |
| `schema_version` | `integer` | yes | 현재 `1` |
| `capture_id` | `string` | no | 상류 source capture |
| `challenge_slug` | `string` | no | evaluated setup 링크 |
| `watch_id` | `string` | no | 라이브 모니터링 링크 |
| `alert_id` | `string` | no | alert 링크 |
| `verdict_ids` | `string[]` | no | 링크된 manual/auto verdict id |
| `outcome_metrics` | `object` | yes | pnl, duration, regime bucket 등 |
| `bucket_keys` | `object` | yes | symbol, timeframe, btc regime, pattern family, user scope |
| `recorded_at` | `datetime` | yes | UTC |

**Rules:**
- ledger entry는 **append-only 증거 행**이다.
- aggregate view는 ledger entry에서 파생한다. 과거 원본을 파괴적으로 mutate하지 않는다.

### 5.10 Relationship Rules

| From | To | Rule |
|---|---|---|
| `capture` | `challenge` | 하나의 capture는 0/1/N개 challenge로 투영 가능 |
| `challenge` | `pattern` | accepted challenge 하나가 1개 이상 runtime pattern 산출 가능 |
| `challenge` | `watch` | watch 활성화에는 evaluated challenge 컨텍스트 필수 |
| `watch` | `alert` | alert는 live 또는 최근 live였던 watch/pattern 컨텍스트에만 존재 가능 |
| `alert` | `verdict` | alert는 manual/auto verdict를 독립적으로 수집 |
| all | `ledger_entry` | ledger는 cross-object outcome 증거를 통합 |

### 5.11 Day-1 Prohibited Shapes

1. `watch` without `challenge_slug`
2. `alert` without `drilldown_context`
3. `capture` without explicit range bounds (`range_start`, `range_end`)
4. 단일 merged verdict 필드로 manual/auto source 숨김
5. UI-only로 생성된 `pattern_id` (engine-backed 소스 없이)

### 5.12 보조 엔티티 (full loop에서 언급되나 Day-1 객체 계약 밖)

이 객체들은 system spec에서 나열되지만 Day-1 필드 계약은 엔진 내부 스키마를 따른다. 변경 시 Layer C (엔진 런타임 스펙)를 참조한다.

| Entity | Purpose | Day-1 외부 노출 |
|---|---|---|
| `Scan Cycle` | scan run metadata (scan_id, started_at, universe_version, symbols_scanned, data_quality) | 운영 레코드. UI 노출 선택적 |
| `Signal Snapshot` | 시점의 시장 증거 (feature_vector, layer summary, alpha score) | evidence 필드에 참조 |
| `Pattern State` | 1 symbol × 1 pattern의 현재 phase (current_phase, entered_at, bars_in_phase, last_transition_at, block_coverage, latest_feature_snapshot_ref) | terminal phase 배지의 소스 |
| `Phase Transition Event` | append-only state 변경 (transition_id, from_phase, to_phase, reason, feature_snapshot, block_coverage) | `capture.source_ref.transition_id`로 링크 |
| `Candidate Event` | actionable phase에 들어온 서페이스 시그널 (candidate_id, phase, candidate_score, delivery_policy_state) | `capture.source_ref.candidate_id`로 링크 |
| `Outcome Record` | capture/entry 이후 실제 결과 (peak_price, exit_price, breakout_at, invalidated_at, auto_outcome, manual_verdict, final_outcome) | ledger_entry의 `outcome_metrics`로 승격 |
| `Refinement Proposal` | 제안된 rule/threshold 개선 | Lab/Dashboard refinement 섹션 |
| `Training Run` | ML 최적화 artifact | adapter 상태 페이지 |
| `Deployment Record` | model/adapter rollout artifact | adapter 상태 페이지 |

---

## 6. State Matrices

### 6.1 Global Loop Progression

canonical Day-1 state 전이:

```text
reviewing → captured → projected → evaluated → watch_live → alert_pending → judged → ledgered
```

- 모든 capture가 live watch까지 가야 하는 것은 아니다.
- 모든 alert가 manual + auto verdict를 다 가져야 하는 것도 아니다.
- 그러나 **어떤 후기 state도 상류 valid state 없이는 나타나지 않는다**.

### 6.2 Action × Surface 매트릭스

| Action | From | To | Surface Owner |
|---|---|---|---|
| select range | reviewed chart | capture draft | terminal |
| save setup | capture draft | capture saved | terminal |
| project setup | capture saved | challenge projected | lab |
| run evaluate | challenge projected | challenge evaluated | lab |
| accept and activate | challenge evaluated | watch live | lab |
| pause / resume | watch live/paused | watch paused/live | dashboard |
| emit alert | watch live | alert pending | scanner/alerts |
| manual feedback | alert pending | alert judged_manual | dashboard |
| auto outcome | alert pending | alert judged_auto | engine |
| aggregate evidence | judged states | ledgered | engine/research |

### 6.3 `capture` State Matrix

| State | Meaning | Entered By | Allowed Next | Forbidden Next |
|---|---|---|---|---|
| `draft` | reviewed range가 UI에만 존재 | terminal 선택 | `saved`, `discarded` | `projected`, `archived` |
| `saved` | durable capture 영속됨 | `Save Setup` | `projected`, `archived` | `draft` |
| `discarded` | 미저장 로컬 리뷰 폐기 | terminal clear / route leave | none | 모든 durable state |
| `archived` | active reuse에서 의도적 retire | 명시적 archive 액션 | none | `projected`, `saved` |

**Rules:** `Save Setup`이 Day-1에서 `draft → saved`의 유일한 전이. `projected`는 capture state가 아니라 challenge state다.

### 6.4 `challenge` State Matrix

| State | Meaning | Entered By | Allowed Next | Forbidden Next |
|---|---|---|---|---|
| `projected` | capture 또는 query에서 파생된 가설 존재 | lab projection | `queued`, `running`, `archived` | evaluate 없이 `accepted` |
| `queued` | evaluation 요청됨, 대기 | evaluate 요청 | `running`, `failed` | `accepted`, `rejected` |
| `running` | deterministic evaluation 진행 중 | lab run start | `evaluated`, `failed` | `accepted`, `watch_live` |
| `evaluated` | 평가 완료 + 요약/인스턴스 존재 | run 완료 | `accepted`, `rejected`, `running`, `archived` | `projected` |
| `accepted` | 유저가 evaluated 가설을 수락 | 명시적 lab accept | `watch_live`, `archived` | `queued` |
| `rejected` | 유저가 live use에 reject | 명시적 lab reject | `projected`, `archived` | `watch_live` |
| `failed` | run 또는 parse 실패 | evaluation 실패 | `queued`, `running`, `archived` | `accepted` |
| `archived` | active workflow에서 retire | 명시적 archive | none | any active state |

**Rules:** `evaluated` 결과 없이 `accepted` 불가. `rejected`는 다시 `projected`로 rework 가능.

### 6.5 `watch` State Matrix

| State | Meaning | Entered By | Allowed Next | Forbidden Next |
|---|---|---|---|---|
| `live` | 프로덕션 플로우에서 active 모니터링 | lab 활성화 | `paused`, `retired` | `draft`, `queued` |
| `paused` | 모니터링 일시 중단 | dashboard pause | `live`, `retired` | `projected` |
| `retired` | 모니터링 의도적 종료 | lab 또는 dashboard retire | none | `live`, `paused` |

**Rules:** 새 `live` watch는 `challenge.accepted`에서만 생성 가능. dashboard는 continuity 관리만.

### 6.6 `alert` State Matrix

| State | Meaning | Entered By | Allowed Next | Forbidden Next |
|---|---|---|---|---|
| `pending` | alert emit됨, 판정 대기 | scanner/alerts | `judged_manual`, `judged_auto`, `archived` | `live` |
| `judged_manual` | 수동 agree/disagree 기록됨 | dashboard 액션 | `judged_manual_and_auto`, `archived` | `pending` |
| `judged_auto` | 자동 outcome 기록됨 | engine outcome 로직 | `judged_manual_and_auto`, `archived` | `pending` |
| `judged_manual_and_auto` | manual + auto 판정 모두 존재 | 두 번째 판정 소스 추가 | `archived` | `pending` |
| `archived` | 인박스에서 비활성 | retention 또는 명시적 archive | none | any active state |

**Rules:** manual과 auto 판정은 **additive**. 두 소스를 하나의 hidden boolean으로 무너뜨리지 않는다.

### 6.7 `verdict` State Matrix

verdict는 append-first 레코드다. mutable state container가 아니다.

| Event | Result |
|---|---|
| manual feedback submitted | 새 manual verdict row 생성 |
| automatic outcome computed | 새 auto verdict row 생성 |
| manual note edited | audit-safe 허용 metadata에 한해 revision 또는 update |

**Rules:** 이전 verdict source 히스토리를 덮어쓰지 않는다. alert/instance state가 verdict 존재를 요약할 수는 있지만, verdict row 자체는 durable.

### 6.8 `ledger_entry` State Matrix

ledger entry는 append-only 증거 행이다.

| State | Meaning | Entered By | Allowed Next |
|---|---|---|---|
| `recorded` | 증거 행 영속됨 | engine/research 집계 | none |

**Rules:** 재계산은 새 aggregate output을 만들지, 과거 raw row를 파괴적으로 mutate하지 않는다.

### 6.9 Hard Gates

1. `watch.live` ← `challenge.accepted` 필수
2. `alert.pending` ← `watch.live` 또는 active runtime pattern 컨텍스트 필수
3. `judged_manual` ← 유효한 alert 식별 + 사람 액션 필수
4. `judged_auto` ← 유효한 outcome 윈도우 또는 deterministic auto-judge 이벤트 필수
5. `ledger_entry.recorded` ← 상류 durable 객체 id 최소 1개 + outcome 증거 필수

### 6.10 Prohibited Cross-Surface Shortcuts

1. terminal → new watch live
2. dashboard → new challenge projection
3. dashboard → evaluated lab 컨텍스트 없이 모니터링 활성화
4. lab → dashboard/engine 계약 없이 수동 alert 피드백 mutation
5. app-only 로컬 pattern activation (engine-backed 객체 없이)

### 6.11 Failure and Recovery

| Failure Point | Allowed Recovery |
|---|---|
| capture save 실패 | 선택 range/note 손실 없이 retry |
| challenge run 실패 | `failed` 또는 `queued`에서 rerun, 로그 보존 |
| watch activation 실패 | `evaluated` 또는 `accepted`에 머물며 실패 state 명시 |
| alert feedback save 실패 | alert UI를 이전 상태로 롤백, retry 허용 |
| ledger aggregation 실패 | 상류 객체 유지, 집계 degraded 마킹 |

### 6.12 QA Focus — 최고 위험 불법 전이

1. evaluation 없이 watch 생성
2. challenge projection 중 source capture 링크 분실
3. manual과 auto 판정을 하나의 state로 병합
4. drilldown context 없이 alert에서 terminal 이동

---

## 7. Route Contracts

### 7.1 Route Design Rules

1. 한 route는 **하나의 durable 객체 또는 하나의 명시적 lifecycle 액션**을 표현한다.
2. Browser-facing route는 contract-safe envelope과 객체 shape을 반환한다.
3. Engine route는 evaluation/verdict/ledger 결정 권한을 가진다.
4. 기존 route 이름은 migration 기간 유지 가능, canonical 역할은 명시해야 한다.
5. `terminal/alerts`와 live `alerts`는 **다른 객체**다. 의미 공유 금지.

### 7.2 Ownership Types

| Type | 예시 | Rule |
|---|---|---|
| **Proxy** | `/api/engine/[...path]` | 패스스루만 (transport, timeout, error 정규화). 제품 결정 로직 금지. |
| **Orchestrated** | `/api/cogochi/analyze` | 상류 raw 데이터 수집, 복수 서비스 호출, 응답 shaping. scoring/verdict truth는 engine. |
| **App-domain** | `/api/terminal/scan` | 전체 app 소유 (auth/session/rate-limit/persistence/workflow). engine 통합 선택적. |

모든 신규 route는 ownership type을 route-level comment에 명시한다.

### 7.3 Runtime Placement

1. **Public app-facing route → `app-web`** (proxy + 얇은 orchestrated)
2. **Engine-owned compute route → `engine-api`** (deterministic score/deep/evaluate)
3. **Scheduler, training, report, queue consumer → `worker-control`** (public 브라우저 origin 책임 아님)

### 7.4 Canonical Route Pack

#### 7.4.1 Capture Routes

**`POST /api/terminal/pattern-captures`** (app-domain orchestrator)  
- Canonical: `capture` 생성
- Status: implemented
- Primary caller: `/terminal`
- Request: `PatternCaptureCreateRequestSchema`. 최소 `symbol`, `timeframe`, `triggerOrigin`, concrete `snapshot.viewport` 또는 동등 증거.
- Response: `PatternCaptureResponseSchema`. `records[0]`에 새로 생성된 capture.
- **Day-1 Save Setup의 canonical browser-facing route.** migration 중 app-side 영속 허용. 타겟은 engine-backed durable capture truth 위의 app orchestration.

**`GET /api/terminal/pattern-captures`** (app-domain read)  
- 저장된 capture 리스트.
- Query: `symbol?`, `timeframe?`, `verdict?`, `triggerOrigin?`, `limit?`
- Response: `PatternCaptureResponseSchema`

**`POST /api/terminal/pattern-captures/similar`** (app-domain / research-facing)  
- 현재 reviewed range에 대해 similar saved capture preview.
- Request: `PatternCaptureSimilarityDraftSchema`
- Response: `PatternCaptureSimilarResponseSchema`
- **helper 전용.** backtest/verdict/activation 권한 주장 금지.

#### 7.4.2 Explicit Query Helper

**`POST /api/wizard`** (app-domain helper)  
- explicit query/blocks → challenge composition payload
- Status: implemented
- **Secondary path.** `Save Setup` 실패 시 fallback으로 쓰면 안 된다.

#### 7.4.3 Challenge Projection + Evaluation

**`POST /api/lab/challenges/project`** (app-domain orchestration)  
- Canonical: 1개 saved capture → lab-owned `challenge`
- Status: target (아직 canonical 구현 아님)
- Request:
```json
{
  "captureId": "cap_123",
  "projectionMode": "capture_only",
  "title": "TRADOOR-style OI reversal",
  "description": "optional override",
  "preserveNote": true
}
```
- Response:
```json
{
  "ok": true,
  "challenge": {
    "slug": "tradoor-oi-reversal-v1",
    "source_capture_ids": ["cap_123"],
    "evaluation_status": "projected"
  },
  "sourceCapture": { "id": "cap_123" }
}
```
- 모든 projected challenge는 source capture 링크 보존.

**`GET /api/lab/challenges`** (app-domain read)  
- lab-owned challenge 요약 리스트
- Response fields: `slug`, `title`, `source_capture_ids`, `evaluation_status`, `latest_summary`, `updated_at`

**`GET /api/lab/challenges/{slug}`** (app-domain read)  
- 단일 challenge 상세. challenge identity, source capture 요약, definition ref, latest summary, artifacts ref.

**`POST /api/lab/challenges/{slug}/evaluate`** (orchestrated, engine/runner 권한 downstream)  
- deterministic evaluation 실행
- Request:
```json
{ "mode": "manual", "requestedBy": "user" }
```
- Response: accepted/started envelope 또는 SSE stream. 최종 요약에 `SCORE`, `N_INSTANCES` 포함.
- app이 `prepare.py evaluate`로 브리지하면 그건 orchestration. engine evaluate로 브리지하면 engine이 scoring 권한.

#### 7.4.4 Watch Activation + Continuity

**`POST /api/lab/challenges/{slug}/activate`** (orchestrated)  
- evaluated challenge → `watch` 생성/업데이트
- Status: target
- Primary caller: `/lab`
- Request:
```json
{
  "activationMode": "manual_accept",
  "deliveryTargets": ["dashboard"],
  "scopeOverride": null
}
```
- Response:
```json
{
  "ok": true,
  "watch": {
    "id": "watch_123",
    "challenge_slug": "tradoor-oi-reversal-v1",
    "status": "live"
  }
}
```
- **Day-1 유일한 browser-facing activation route.** dashboard는 새 watch 직접 생성 금지.

**`GET /api/watches`** (app-domain / proxy read)  
- 현재 watch 리스트 (dashboard용)
- Response: `id`, `challenge_slug`, `status`, `scope`, `last_evaluated_summary`, `updated_at`

**`PATCH /api/watches/{id}`** (app-domain mutation)  
- 기존 watch pause/resume/retire
- Primary caller: `/dashboard`
- Request: `{ "action": "pause" | "resume" | "retire" }`
- **`create` 액션 없음.** challenge 컨텍스트 없이 새 watch 활성화 불가.

#### 7.4.5 Live Alert Routes

**`GET /api/alerts`** (orchestrated read)  
- live `alert` 리스트 (dashboard + terminal drilldown)
- Status: target. Migration upstream: `GET /api/cogochi/alerts`
- Response: `id`, `watch_id?`, `challenge_slug`, `symbol`, `timeframe`, `detected_at`, `manual_verdict_state`, `auto_verdict_state`, `drilldown_context`
- canonical live alert route 존재 후 브라우저는 raw `cogochi/alerts` 직접 소비 중단.

**`GET /api/alerts/{id}`** (app-domain read)  
- 단일 alert + full drilldown context

**`POST /api/alerts/{id}/verdict`** (app-domain / proxy mutation)  
- alert 수동 피드백 영속
- Primary caller: `/dashboard`
- Request:
```json
{ "label": "agree", "note": "optional" }
```
- Response:
```json
{
  "ok": true,
  "alert": { "id": "alert_123", "manual_verdict_state": "agree" },
  "verdict": { "source": "manual", "label": "agree" }
}
```
- manual verdict record 또는 audit-safe 이력 생성 필수. auto outcome 데이터 덮어쓰지 않는다.

#### 7.4.6 Ledger Routes

**`GET /api/ledger/summary`** (engine-facing summary / app proxy)  
- challenge, watch, alert 성과 요약 집계
- Status: target
- Query 예: `challengeSlug=<slug>`, `watchId=<id>`, `symbol=<symbol>`

**`GET /api/ledger/entries`** (engine-facing detail / app proxy)  
- ledger 증거 행
- **summary는 집계해도 되지만 entries는 derived metric이 아니라 durable row를 노출한다.**

### 7.5 Existing Route Mapping

| Current Route | Current Meaning | Canonical Role | Migration Note |
|---|---|---|---|
| `/api/terminal/pattern-captures` | 저장된 pattern capture 영속 | keep | Day-1 `Save Setup` route 유지 |
| `/api/terminal/pattern-captures/similar` | similar capture preview | keep | helper route 유지 |
| `/api/wizard` | explicit query → challenge composer | keep as helper | secondary path only |
| `/api/terminal/watchlist` | 로컬 watchlist continuity | **transitional** | canonical `watch` 객체로 취급 금지 |
| `/api/terminal/alerts` | 로컬 alert-rule 영속 | **transitional** | live signal alert로 취급 금지 |
| `/api/cogochi/alerts` | raw engine alert 피드 | **transitional upstream** | canonical `/api/alerts`로 수렴 |
| `/api/engine/captures` | engine canonical capture store | keep internal | 브라우저는 app orchestration route 선호 |
| `/api/patterns/{slug}/evaluate` | pattern-engine evaluate | internal/secondary | adapter 계층 없이 primary lab route로 노출 금지 |
| `/api/patterns/{slug}/stats` | ledger stats for pattern engine | internal/secondary | 향후 ledger summary view 백엔드 가능 |

### 7.6 Error Envelope

모든 browser-facing core-loop route는 다음을 반환:

```json
{
  "ok": false,
  "error": "stable_code",
  "reason": "human-readable explanation"
}
```

Optional: `issues`, `upstream`, `retryable`.

### 7.7 Day-1 Prohibited Route Behavior

1. `Save Setup` 실패 시 challenge 생성으로 fallback
2. dashboard가 로컬-only mutation으로 직접 모니터링 활성화
3. 브라우저 surface가 raw engine alert 피드를 읽고 manual verdict state를 client-side에서 생성
4. 한 route가 로컬 alert-rule 설정과 live signal alert 판정을 혼합

### 7.8 Cross-Surface Handoff Contract

#### Terminal → Lab
**Trigger:** capture 저장 후 evaluation 요청  
**Payload:** source capture identity, symbol + timeframe 컨텍스트, 선택 range metadata, optional note/hint  
**Rule:** lab은 이 입력에서 challenge를 project할 수 있지만 terminal이 source-of-review 컨텍스트.

#### Lab → Dashboard
**Trigger:** 유저가 모니터링 활성화 accept  
**Payload:** challenge/watch identity, activation status, monitoring scope, last evaluation summary  
**Rule:** dashboard는 watch 의미를 client-side에서 발명하지 않는다.

#### Dashboard → Terminal
**Trigger:** 유저가 live alert 또는 judged case를 검사 차원에서 open  
**Payload:** alert identity, linked watch/challenge, symbol + timeframe + timestamp, 알려진 regime/phase 요약 (있을 때)  
**Rule:** terminal은 blank query 모드가 아니라 **inspect 모드**로 열린다.


---

## 8. Surface Wireframes

**Scope:** 구조 와이어프레임. 비주얼 디자인 시스템 아님.

### 8.1 Global Rules

1. 모든 surface는 **primary job을 above-the-fold**에 하나 노출한다.
2. primary CTA는 helper 액션보다 시각적으로 우위.
3. empty / loading / degraded / error 상태는 와이어프레임의 일부다. afterthought 아님.
4. surface-local analytics depth가 루프의 next valid action을 대체하면 안 된다.

### 8.2 `/terminal` Desktop

**Primary job:** 차트 컨텍스트 리뷰 + 정확한 setup 증거 저장.

**Above-the-fold priority:**
1. 차트 + replay 컨텍스트
2. saveable range 상태
3. core evidence strip
4. next-step actions

**Layout:**
```text
+-----------------------------------------------------------------------------------+
| Top nav / route tabs / market strip                                               |
+-----------------------------------------------------------------------------------+
| Context bar: symbol | timeframe | replay source | candidate/alert badge | fresh   |
+-----------------------------------------------------------------------------------+
| Command bar / query / chips                                                       |
+-----------------------------------------------------------------------------------+
| Left rail            | Main chart board                             | Right rail   |
| - watchlist          | - hero chart + 선택 range                     | - Summary    |
| - candidates         | - indicators overlay/below                    | - Entry      |
| - recent captures    | - range handles / replay marker               | - Risk       |
|                      | - evidence strip under chart                  | - Catalysts  |
|                      |                                               | - Metrics    |
+-----------------------------------------------------------------------------------+
| Bottom dock: event tape | save status | similar capture preview | next actions    |
+-----------------------------------------------------------------------------------+
```

**Primary CTA cluster (우선순위 순):**
1. `Save Setup`
2. `Open in Lab`
3. `View Similar`
4. `Run Query` / `Analyze` (helper)

**Component rules:**
- `Save Setup`은 리뷰 차트 컨텍스트 근처 고정 가시 위치에 상주.
- 선택 range는 right rail이 변해도 계속 가시.
- note 입력은 save flow 인접 (modal 뒤가 아니라 **inline SaveStrip**).
- similar capture preview는 hero가 아니라 save 컨텍스트 **옆/뒤**.

**Drag range selection wireframe:**
```text
+-----------------------------------------------------------------------------------+
| Main chart board                                                                   |
| - hero chart (lightweight-charts)                                                  |
|                                                                                    |
|   [drag area — mousedown → blue rect live → mouseup]                              |
|   ████████████████████████████████████                                            |
|   ▌ anchorA                        anchorB ▐                                      |
+-----------------------------------------------------------------------------------+
| SaveStrip (drag 완료 후 표시, anchorA + anchorB set):                              |
| ⊡ Apr21 14:00→16:00 · 4H (8봉)  [EMA · BB · CVD · OI]  H:84,200 L:81,900 +2.8%  |
| [메모 입력......................]  [취소]  [저장]  [Save & Open in Lab →]          |
+-----------------------------------------------------------------------------------+
```

**SaveStrip content contract:**
1. Range label: `시작 → 끝 · TF · N봉`
2. 수집된 indicator pills: 선택 range에서 active한 indicator 리스트
3. Range stats: H/L/change%
4. Inline note textarea (단일 라인, 확장 가능)
5. Action buttons: `취소` · `저장` · `Save & Open in Lab`

**Drag interaction rules:**
- `SELECT RANGE` 버튼 클릭 → range mode 진입 → 커서 crosshair
- `mousedown` on chart → anchorA 설정, drag 시작
- `mousemove` (버튼 hold) → `adjustAnchor('B', t)`, RangePrimitive 라이브 재렌더
- `mouseup` → anchorB 확정, SaveStrip 표시
- `Escape` → exitRangeMode, SaveStrip dismiss
- Range mode OFF: 정상 pan/zoom/crosshair 유지

**Disabled-state rules:**
- 명시적 range 없음 → `Save Setup` / `SELECT RANGE` disabled
- durable capture 또는 challenge projection 없음 → `Open in Lab` disabled

**상태별 동작:**
- **loading:** chart skeleton, right-rail placeholder, CTA cluster disabled
- **empty:** symbol open 또는 reviewed setup replay 프롬프트
- **degraded:** stale data 배지 + 차트 + 선택 range 보존
- **error:** chart error + retry, query/saved-context 링크는 계속 가시

**Success state:**
- 유저는 **무엇이 저장됐는지** 정확히 본다
- similar capture 존재 여부를 본다
- next valid action이 보인다 (`open in lab`, `already watching`, `saved only`)

**Failure state:**
- save 실패가 선택 range나 note를 **discard하지 않는다**
- 중복/near-duplicate는 경고. silent merge 금지.

### 8.3 `/terminal` Mobile

**Primary job:** 데스크톱 압축 없이 review + save flow 보존.

**Modes:**
```text
Mode 1: Workspace
+----------------------------------+
| Context bar                      |
| Hero chart                       |
| Range controls                   |
| Save Setup CTA                   |
| Similar preview teaser           |
+----------------------------------+

Mode 2: Command
+----------------------------------+
| Query input                      |
| chips / presets                  |
| parse feedback                   |
| helper CTA                       |
+----------------------------------+

Mode 3: Detail Sheet
+----------------------------------+
| Summary / Entry / Risk / ...     |
| Bias / Action / Invalidation     |
+----------------------------------+
```

**Mobile rules:**
- `Save Setup`은 detail sheet 열지 않고 도달 가능.
- range selection feedback은 workspace 모드에서 계속 가시.
- primary CTA를 bottom sheet 안에만 두지 않는다.

### 8.4 `/lab` Desktop

**Primary job:** 저장된 setup이 monitor할 만큼 일반화되는지 결정.

**Above-the-fold priority:**
1. 선택된 setup identity + source capture 요약
2. evaluation trigger + 최신 결과
3. instance table + replay 링크
4. monitoring activation 게이트

**Layout:**
```text
+-----------------------------------------------------------------------------------+
| Top nav / route tabs                                                              |
+-----------------------------------------------------------------------------------+
| Page header: selected setup | source capture summary | status badge               |
+-----------------------------------------------------------------------------------+
| Setup list / filter rail | Main evaluation pane                                   |
| - setup rows             | - evaluate controls                                    |
| - search/filter          | - streamed run log                                     |
| - recent score/status    | - summary scorecard                                    |
|                          | - refinement panel                                     |
|                          | - instance table                                       |
|                          | - activation card                                      |
+-----------------------------------------------------------------------------------+
```

**Primary CTA cluster:**
1. `Run Evaluate`
2. `Activate Monitoring`
3. `Open Instance in Terminal`
4. `Refine Scope`

**Component rules:**
- activation card는 evaluated 요약 **아래/옆**. raw run state 위에 두지 않는다.
- source capture 요약은 선택 setup identity 옆에 pinned.
- instance table은 core region. expandable afterthought 아님.

**Disabled-state rules:**
- `Activate Monitoring`은 valid evaluated state까지 disabled.
- `Run Evaluate`는 setup 미선택 또는 run 진행 중일 때만 disabled.

**상태별 동작:**
- **loading:** 선택 setup shell + summary placeholder
- **empty:** terminal capture로부터 project 프롬프트
- **degraded:** partial log / summary parse warning, 선택 유지
- **error:** run failure 인라인 + retry

**Success state:** 무엇이 작동했고 무엇이 실패했고 이제 무엇이 모니터링되는지 이해.  
**Failure state:** evaluation 실패는 로그 + 선택 setup 컨텍스트 보존. low-sample은 false precision이 아니라 `not enough evidence`로 degrade.

### 8.5 `/lab` Mobile

**Primary job:** stacked 섹션으로 evaluate → inspect → activate 보존.

```text
+----------------------------------+
| Setup picker                     |
| Setup header + capture summary   |
| Run Evaluate CTA                 |
| Stream / summary accordion       |
| Refinement section               |
| Instance list                    |
| Activate Monitoring CTA          |
+----------------------------------+
```

**Mobile rules:**
- `Run Evaluate`와 `Activate Monitoring`은 overflow 메뉴에 숨길 수 없다.
- instance replay 버튼은 terminal 직접 open.

### 8.6 `/dashboard` Desktop

**Primary job:** pending alert 판정 처리 + 모니터링 continuity 관리.

**Above-the-fold priority:**
1. feedback-pending signal alert
2. active watch
3. saved setup / challenge 요약
4. adapter placeholder

**Layout:**
```text
+-----------------------------------------------------------------------------------+
| Top nav / route tabs                                                              |
+-----------------------------------------------------------------------------------+
| Header: inbox summary | filters | notification status                             |
+-----------------------------------------------------------------------------------+
| Section 1: Signal Alerts (항상 첫 번째, 최대 시각 비중)                            |
| - pending alert 리스트                                                            |
| - agree / disagree                                                                |
| - open chart                                                                      |
+-----------------------------------------------------------------------------------+
| Section 2: Watching                                                               |
| - live / paused watches                                                           |
| - pause / resume / open                                                           |
+-----------------------------------------------------------------------------------+
| Section 3: Saved Setups                                                           |
| - recent evaluated setups                                                         |
| - open in lab                                                                     |
+-----------------------------------------------------------------------------------+
| Section 4: My Adapters                                                            |
| - 명시적 placeholder                                                              |
+-----------------------------------------------------------------------------------+
```

**Primary CTA cluster:**
1. `Open Alert`
2. `Agree`
3. `Disagree`
4. `Pause/Resume Watch`
5. `Open Setup in Lab`

**Component rules:**
- pending alert는 가장 강한 시각 강조.
- judged alert는 기본적으로 축소 또는 pending 아래로 이동.
- saved setup은 **요약 카드**. full analytics 패널 아님.

**Naming rule:** 내부 데이터 소스는 `challenge`를 유지해도 되지만, 유저 노출 라벨은 `saved setup` / `setup`으로 bias한다. 이게 유저가 실제로 이해하는 루프.

**상태별 동작:**
- **loading:** 섹션별 독립 skeleton
- **empty alerts:** lab 활성화 이후 alert가 나타난다 설명
- **degraded:** 한 섹션 실패가 페이지 blank 만들지 않음
- **error:** 섹션 로컬 retry

### 8.7 `/dashboard` Mobile

**Primary job:** 최소 탭 수로 alert 피드백 처리.

```text
+----------------------------------+
| Header / filters                 |
| Signal Alerts stack              |
| Watching stack                   |
| Saved Setups stack               |
| My Adapters placeholder          |
+----------------------------------+
```

**Mobile rules:**
- `Agree`와 `Disagree`는 alert 카드 위에 직접.
- alert에서 terminal open은 보조 detail 페이지 경유 금지.

### 8.8 CTA Hierarchy Summary

| Surface | Primary | Secondary | Tertiary |
|---|---|---|---|
| terminal | `Save Setup` | `Open in Lab` | `Run Query`, `Analyze`, `View Similar` |
| lab | state에 따라 `Run Evaluate` 또는 `Activate Monitoring` | `Open Instance in Terminal` | `Refine Scope` |
| dashboard | `Open Alert`, `Agree`, `Disagree` | `Pause/Resume Watch` | `Open Setup in Lab` |

### 8.9 Micro-Interaction Rules

1. Save confirmation은 **무슨 symbol, timeframe, range**가 저장됐는지 식별한다.
2. Save confirmation은 **어떤 indicator가 수집됐는지** 리스트한다.
3. Evaluation 완료는 score, instance count, next valid action을 식별한다.
4. Alert 판정은 즉시 업데이트하되 **silent toggle drift** 없이 explicit follow-up으로만 reversible.
5. Paused watch 상태는 live 상태와 **시각적으로 구별**.
6. Drag range selection은 drag 중 **실시간 시각 피드백** (live blue rectangle). mouseup 후가 아니다.
7. Range mode 커서는 default 커서와 명확히 구분.

### 8.10 Accessibility and Clarity

1. 모든 primary action은 명시적 텍스트. icon-only 의존 금지.
2. Disabled 버튼 옆에 가시적 이유 표시.
3. Section header는 색 의존 없이 readable.
4. Reduced-motion 모드는 state feedback을 제거하지 않고 애니메이션 강도만 줄인다.

---

## 9. Action-State Contract

| Action | Preconditions | Effects | Post-state |
|---|---|---|---|
| **Save Setup** | symbol + timeframe 해결, 선택 range 존재 | capture 생성, note 영속 (있을 때), similar capture preview fetch (선택) | `saved` |
| **Project to Challenge** | saved capture 존재 | challenge projection 생성/업데이트 | `ready_for_evaluate` |
| **Run Evaluate** | 선택 challenge 존재 | deterministic evaluation 실행, progress stream, summary/instance 영속 | `evaluated` |
| **Activate Monitoring** | evaluated challenge 존재, 유저 explicit accept | live watch 생성/업데이트 | `watch_live` |
| **Agree / Disagree** | feedback-capable alert 존재 | manual verdict 영속, source attribution 유지 | `judged_manual` |
| **Auto Outcome** | alert/instance가 outcome 윈도우 도달 | auto verdict 영속, ledger 업데이트 | `judged_auto` |

---

## 10. Three AutoResearch Layers

레이어는 **경쟁 관계가 아니라 쌓이는 구조**다.

### Layer 1. Feature Vector Similarity

- **용도:** broad, cheap retrieval
- **Loop 위치:** scan-time prefilter, lab-time 비교
- **장점:** 지금 당장 실용적. 저렴.
- **한계:** 시간 순서와 차트 "느낌"을 압축 손실.

### Layer 2. Event Sequence Matching

- **용도:** symbol이 5-phase 시퀀스를 얼마나 따르는지 비교
- **Loop 위치:** phase tracking, candidate scoring
- **장점:** 레퍼런스 패턴 정확 반영.
- **한계:** phase semantics와 상태 추적이 먼저 정리돼야 함.

### Layer 3. LLM Chart Interpretation

- **용도:** 차트 이미지 + 수치 컨텍스트를 구조화된 언어/태그로
- **Loop 위치:** terminal inspection, refinement 지원, 데이터셋 enrichment (나중)
- **장점:** 가장 강한 표현력.
- **한계:** 비용 최고. 출력 구조 엄격 관리 필요.

**적층 원칙:**
1. feature vector가 넓게 거른다
2. event sequence가 시간 구조를 이해한다
3. LLM chart interpretation이 상위 문법을 해석한다

---

## 11. Day-1 vs Later Phases

### Day-1 Must Have

- pattern definition
- watch activation
- scan cycle
- phase tracking
- candidate surfacing
- chart inspection
- save setup
- outcome recording
- manual 또는 auto verdict
- lab + dashboard 가시성

### Later Phases Add

- 강한 alert policy (shadow/visible/ranked/gated)
- training registry
- KTO / ORPO / LoRA rollout
- user-specific deployed adapter

---

## 12. Agent Execution Split

한 에이전트 1인이 이 문서만 보고 해당 레인 작업을 시작할 수 있어야 한다.

### 12.1 App Agent

**Ship order:**
1. terminal capture UX + save state
2. lab evaluate + activation shell
3. dashboard alert 인박스 + watch 컨트롤

**Deliverables:** 컴포넌트, route, loading/error state, contract-safe request 와이어링.

### 12.2 Engine Agent

**Ship order:**
1. canonical capture endpoint + 영속
2. evaluated challenge/instance endpoint
3. watch, alert, verdict, ledger endpoint

**Deliverables:** route, 영속, deterministic evaluation/judgment semantics.

### 12.3 Contract Agent

**Ship order:**
1. 객체 스키마 정의
2. route payload 호환성 체크
3. deep-link / replay 계약

**Deliverables:** 타입 경계, migration 노트, 계약 테스트.

### 12.4 Research Agent

**Ship order:**
1. similar-capture retrieval baseline
2. ranking + refinement summary
3. threshold 개선을 위한 피드백 aggregation 정책

**Deliverables:** 재현 가능한 검색/랭킹 방법, 평가 노트, 측정된 개선 기준.

### 12.5 Recommended Implementation Slices

1. **Capture foundation** — canonical capture payload, terminal 선택 range save, duplicate/error state
2. **Evaluation handoff** — capture→challenge projection, lab challenge 선택 + evaluate flow, instance replay to terminal
3. **Monitoring activation** — lab activation 액션, watch 영속, dashboard watch 렌더
4. **Judgment inbox** — signal alert 섹션, agree/disagree 액션, auto outcome + ledger 연결
5. **Research reinforcement** — similar capture preview, refinement 설명, ranked threshold 개선 입력

---

## 13. 원본 간 충돌 / 해결

통합 과정에서 발견된 원본 문서 간 불일치와 채택 결정. 후속 작업에서 동일 불일치가 다시 생기지 않게 기록.

### 13.1 `capture` 필드 집합 불일치

- **`core-loop-system-spec.md` Stage 7** (runtime-facing 필드): `chart_context_ref`, `ohlcv_slice_ref`, `indicator_slice_ref`, `pattern_context_ref`, `user_note`, `source_surface`, `capture_mode`
- **`core-loop-object-contracts.md`** (계약 필드): `range_kind`, `source_ref`, `ohlcv_slice`, `indicator_slice`, `note`, `similarity_seed`, `status`

**해결:** Day-1 외부 계약은 **object-contracts를 정본**으로 채택 (§5.3). system-spec의 `capture_mode` 의미 (`pattern_candidate` / `manual_pattern_seed` / `challenge_seed`)는 §5.3 "Two save paths"로 흡수. `ref` 접미사는 optional (immutable 참조 구현 시 사용).

### 13.2 `watch`의 주 링크 필드

- **system-spec:** `pattern_slug` 중심
- **object-contracts:** `challenge_slug` required, `pattern_id` optional

**해결:** Day-1은 **capture-first** 원칙이므로 challenge가 먼저 존재하고 pattern은 runtime 개념. **object-contracts 채택** (§5.6). pattern은 정해진 challenge에서 파생하는 나중 단계 런타임 객체.

### 13.3 Watch 활성화 권한

- **system-spec Stage 2:** "`/lab` for creating or activating from evaluated context, `/dashboard` for pausing/resuming"
- **object-contracts + state-matrix:** "Day-1에서 terminal이나 dashboard에서 새 watch 활성화 **금지**. `activation_source: lab_evaluate_accept` 만"

**해결:** **후자 채택.** system-spec의 "dashboard for pausing/resuming" 부분은 유효, 그러나 "creating/activating"은 lab 전용. §5.6 + §6.5에 반영.

### 13.4 `ledger` vs `ledger_entry` 명명

- **agent-execution-blueprint:** `ledger` 객체로 언급
- **object-contracts + state-matrix:** `ledger_entry` 레코드로 언급

**해결:** `ledger_entry`를 **durable 레코드 이름**으로, `ledger`는 집합/집계 개념 (routes `/api/ledger/summary`, `/api/ledger/entries`의 의미)으로 구분. §5.9 + §7.4.6 반영.

### 13.5 Current Repository Mapping의 자체 모순

`core-loop.md`의 "Missing" 표가 자기 안에서 모순: 5개 항목 중 4개가 ✅ 완료로 표시됨 ("canonical Pattern Object module ✅", "Result Ledger ✅" 등).

**해결:** "Implementation Status (2026-04-21)" 섹션이 실제 현재 상태. 원본 "Missing" 표는 W-0088 완료 이전 작성본. **v1 통합에서는 현재 상태만 §11 Day-1 Must Have / Later Phases로 재표기**하고 historical "Missing vs Implemented" 표는 삭제.

### 13.6 Scan Cycle / Signal Snapshot / Pattern State / Candidate Event의 Day-1 외부 노출

- **system-spec:** Stage 3~5에서 상세 필드 정의
- **object-contracts:** 이 객체들은 포함 안 됨 (capture/challenge/pattern/watch/alert/verdict/ledger_entry 7개만)

**해결:** Day-1 외부 객체 계약은 7개만. 나머지는 엔진 내부 런타임 객체로 취급 → §5.12 "보조 엔티티"로 참조 링크만 유지. 필드 계약은 Layer C (엔진 스펙)가 소유.

### 13.7 DAG 방향 — Scanner/Alert Pipeline 위치

- **system-spec:** scanner → phase tracking → candidate → terminal inspection → capture
- **agent-execution-blueprint:** alert는 `scanner and alert pipeline`에서 produced, `/dashboard`와 `/terminal` drilldown에서 consumed
- **state-matrix:** `emit alert` owner가 `scanner/alerts`

**해결:** 일관. scanner가 phase transition을 일으키고, actionable phase의 transition이 candidate event가 되며, delivery policy를 통과하면 `alert`로 emit됨. §6.2 action 매트릭스에 반영.

### 13.8 "Terminal 알림 inspection" vs "Dashboard 알림 inbox"

- `/terminal`은 candidate/alert **drilldown 대상**
- `/dashboard`는 alert **inbox + 판정 소유**

혼동 가능한데 **candidate = 서페이싱된 시그널**, **alert = emit된 라이브 이벤트 + 판정 대기 객체**. Terminal은 검사, Dashboard는 판정. §4.3 + §5.7 + §8.6에 반영.

### 13.9 `core-loop.md` UI Integrity 항목

"차트 렌더링 버그 → `tick()` 이후 DOM 업데이트 대기" 같은 구현 지침이 철학 문서에 섞여있음.

**해결:** 구체 구현 지침은 **v1에서 제거**. "chart 렌더가 끊기면 core loop도 끊긴다"는 원칙만 §8.2 Component rules로 흡수 (구현 지침은 Layer C).

### 13.10 패턴 라이브러리 16개 구체 리스트

`core-loop.md` 끝부분의 "패턴 라이브러리 현황 (16개)" — `tradoor-oi-reversal-v1` 등 slug 리스트.

**해결:** **v1에서 제거.** 이건 Layer C (엔진 상태) 또는 Layer A (제품 현황) 소속. v1은 계약/구조 문서라서 변동하는 인벤토리를 품으면 금방 drift.

---

## 14. Done Criteria

이 문서 하나로 다음이 가능해야 한다.

- 새 에이전트가 파일만 보고도 **유저 대면 루프와 내부 객체 모델을 식별**
- 각 surface가 **하나의 primary job + 하나의 clear next action**을 노출
- alert 피드백과 ledger 축적이 **first-class 시스템 동작**으로 기술됨
- app / engine / contract / research 작업이 **새 제품 semantics 발명 없이** 분리 가능

---

## 15. Change Policy

1. 새 제품 사고가 **core loop 자체**를 바꾸면 이 문서를 직접 편집.
2. 새 객체/route/state 추가는 §5~§7에 편집. 병렬 문서 생성 금지.
3. 인벤토리/구현 진행률은 이 문서에 쓰지 않는다 (drift 원인). Layer A 또는 Layer C가 소유.
4. Layer A (PRD)의 surface 정의가 바뀌면 §4.3 + §8이 함께 갱신.
5. Layer C (엔진 스펙)의 런타임 객체가 바뀌면 §5.12가 함께 갱신.
