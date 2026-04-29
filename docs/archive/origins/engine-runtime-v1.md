# Cogochi Engine Runtime v1 — 단일 구현 명세

> **Layer C 정본.** Pattern Engine 런타임, 데이터 파이프라인, 6 Plane 아키텍처, 현재 구현 상태, 갭을 통합한 엔지니어/에이전트 기준 명세.
>
> **Supersedes:** `PATTERN_ENGINE_DESIGN.md` (업로드), `pattern-engine-runtime.md`, `cogochi_pattern_engine_docx.md`, `engine-pipeline.md`. 참조: `architecture.md`.
>
> **상위 문서:** [Layer B — `core-loop-v1.md`](./core-loop-v1.md) (객체 계약/상태 매트릭스/라우트 정본).  
> **하위 문서:** 코드 (`engine/*`).
>
> **규칙:**
> - Layer B의 §5 객체 계약(capture/challenge/pattern/watch/alert/verdict/ledger_entry)은 **외부 계약**. Layer C는 이를 만족하는 내부 구현을 소유한다.
> - Layer B §5.12 보조 엔티티 (Scan Cycle / Signal Snapshot / Pattern State / Phase Transition Event / Candidate Event / Outcome Record)의 **필드 정본은 이 문서**.
> - 변동 데이터(구현률, 패턴 개수, 블록 개수, 테스트 수)는 이 문서 소유. 다른 문서는 참조만.

---

## 0. 읽는 순서

| 작업 | 진입 섹션 |
|---|---|
| 전체 그림 | §1 Thesis, §2 Plane Architecture |
| 새 Phase / 블록 추가 | §4 Pattern Definition, §5 Building Blocks |
| 런타임 동작 변경 | §6 State Machine, §7 Scanner |
| Ledger 레코드 변경 | §8 Ledger Planes |
| ML 관련 | §9 Pattern ML |
| Alert 노출 정책 | §10 Alert Policy |
| **자연어 → 유사 사례 검색** | **§16 Retrieval Plane** |
| **Parser / QueryTransformer 추가** | **§16.2, §16.8** |
| **Signal vocabulary 변경** | **§16.5 + §18.6 Change Policy** |
| 현재 상태 확인 | §12 Implementation Status |
| 빌드 순서 | §13 Migration Order (+ §16.19 Slice 7) |
| Layer B 매핑 | §14 Layer B Cross-Reference |
| 충돌 이력 | §15 원본 간 충돌 / 해결 |

---

## 1. Engine Thesis

엔진의 제품 가치는 AI 모델이 아니라 **누적되는 판정 원장(judgment ledger)**에 있다. 모델은 교환 가능하지만 유저의 레이블링, 페이즈 전이 기록, hit/miss 증거, 개인화된 임계값은 복제 불가하다.

엔진은 네 가지를 한다:

1. **Pattern Definition** — 트레이더 인사이트를 재사용 가능한 다단계 phase 시퀀스로 구조화
2. **Real-time Phase Tracking** — 전 유니버스에서 각 심볼의 phase를 실시간 추적
3. **Outcome Verification** — 탐지된 setup이 실제로 작동했는지 확인
4. **Refinement** — 누적된 판정을 임계값/모델 개선으로 피드백

### 1.1 Core Design Rules

1. **Rule-first source of truth.** Phase semantics는 규칙이 소유한다. ML은 committed entry를 scoring할 뿐 phase 의미를 결정하지 않는다.
2. **Engine-owned pattern truth.** 앱은 pattern 의미를 API 경계에서 재해석하지 않는다. 앱은 렌더만 한다.
3. **Durability before ML power.** 런타임 상태가 durable하기 전에 ML을 고도화하지 않는다.
4. **Save Setup = canonical capture event.** UI 편의가 아니라 판정 원장의 입력 레일이다.
5. **App contracts thin and lossless.** 필드 fabricating 금지. `since` 같은 필드를 앱이 만들지 않는다.

### 1.2 Engine이 아닌 것 (Non-Goals)

- 자동 매매 실행 / bot 통합
- 검증 이력 없는 signal service
- 범용 AI chart 분석 (commodity, 차별화 없음)
- 소셜/카피 트레이딩
- 뉴스 집계 / 센티먼트 분석 단독 제품

---

## 2. Plane Architecture — 7 Plane

엔진은 6개의 독립 plane으로 구성. 각 plane은 단일 책임을 가지며 내부 계약으로만 소통한다.

```text
┌─────────────────────────────────────────────────┐
│  1. Pattern Definition Plane                     │
│     PatternObject + PhaseCondition + Registry   │
└──────────────────────┬──────────────────────────┘
                       ↓ loads
┌─────────────────────────────────────────────────┐
│  2. Pattern Runtime Plane                        │
│     StateMachine + DurableStateStore            │
│     → phase 추적, transition event 생성         │
└──────────────────────┬──────────────────────────┘
                       ↓ emits
┌─────────────────────────────────────────────────┐
│  3. Pattern Ledger Plane                         │
│     entry / score / outcome / verdict records   │
│     → 성과 누적, 증거 축적                       │
└──────────────────────┬──────────────────────────┘
                       ↓ feeds
┌─────────────────────────────────────────────────┐
│  4. Pattern ML Plane                             │
│     pattern-keyed model key, scoring, training  │
│     → entry를 scoring (phase 판정은 아님)       │
└──────────────────────┬──────────────────────────┘
                       ↓ informs
┌─────────────────────────────────────────────────┐
│  5. Alert Policy Plane                           │
│     shadow / visible_ungated / ranked / gated   │
│     → 후보 노출/랭킹 결정                        │
└──────────────────────┬──────────────────────────┘
                       ↓ exposes
┌─────────────────────────────────────────────────┐
│  6. App Presentation Plane                       │
│     thin proxy, lossless contract               │
│     → 엔진 truth 노출, 의미 재해석 금지         │
└─────────────────────────────────────────────────┘

        (cross-cutting, consumed by Plane 1/2/6)
┌─────────────────────────────────────────────────┐
│  7. Retrieval Plane                              │
│     Parser + QueryTransformer + Candidate Gen   │
│     + Sequence Matcher + Reranker + Judge       │
│     → 자연어/capture → 유사 사례 검색           │
└─────────────────────────────────────────────────┘
```

**Plane 7 위치 설명:** Plane 1~6이 **"감지(detect) → 기록(log)" 축**이라면, Plane 7은 **"찾기(retrieve) → 비교(compare)" 축**이다. 같은 데이터 기반 위에서 직교한다. Plane 2 (Runtime)가 "지금 전 종목 어디 phase냐"에 답한다면, Plane 7은 "내가 저장한 이 패턴이랑 비슷한 과거/다른 종목 사례 찾아줘"에 답한다. 두 축이 **제품의 양축**. 상세는 §18.

### 2.1 Plane별 소유와 금지

| Plane | Owns | Must Not Own |
|---|---|---|
| **1. Definition** | PatternObject, PhaseCondition, pattern version, built-in + user-defined registry | 런타임 상태, ML 로직 |
| **2. Runtime** | symbol evaluation, phase 전이, transition event, 현재 state | model training, app semantics |
| **3. Ledger** | entry / score / outcome / verdict / training-run 레코드 | phase 판정, UI 표현 |
| **4. ML** | entry scoring, dataset 생성, training readiness, calibration, promotion candidate | phase semantics, UI 노출 결정 |
| **5. Alert Policy** | entry가 stored / surfaced / ranked / gated 중 어디로 가는지, rollout state, threshold policy version | model artifact 소유, app presentation |
| **6. Presentation** | chart review, candidate inspection, Save Setup UI, stats 렌더 | pattern 의미 재해석, API 경계에서 필드 생성 |
| **7. Retrieval** | PatternDraft/SearchQuerySpec 스키마, signal vocabulary, SIGNAL_TO_RULES 매핑, candidate generation, sequence matching, reranker, optional LLM judge | phase 자체 판정, scoring/verdict truth, UI 렌더 결정 |

### 2.2 Runtime Lanes (Layer B §4.2와 정합)

| Lane | Plane 소유 | 배포 |
|---|---|---|
| `app-web` | Plane 6 (Presentation) | Public browser origin. proxy + 얇은 orchestration. |
| `engine-api` | Plane 1/2/3/4/5/7 | canonical compute. scheduler는 public Cloud Run에서 disabled. Plane 7 retrieval도 engine-api. |
| `worker-control` | scheduler, training trigger, queue consumer, report generation, **Plane 7 async indexing/backfill** | internal-only |

### 2.3 State Role

| Store | 용도 | 실제 구현 |
|---|---|---|
| Redis | shared cache, distributed rate limit, ephemeral coordination, in-flight dedupe, kline 5분 prefetch | `engine/cache/` |
| Postgres (Supabase) | durable user/domain state, outbox, reports, jobs, audit persistence | `app` 주 사용 |
| Engine local files / JSON | 개발용 ledger 초기본 | `engine/ledger/store.py`의 JSON. 프로덕션 truth 아님 |
| 프로세스 메모리 | **현재 state machine.** 재시작 시 날아감. Gap 1 대상 | `engine/patterns/state_machine.py` |

---

## 3. Reference Pattern — TRADOOR/PTB OI Reversal

Phase 번호는 **Layer B와 정합해 1부터 시작** (§15.1 충돌 해결 참조).

### 3.1 Trade Diary → Phase 매핑

| Phase | Name | Diary 관찰 | 구조화된 의미 |
|---|---|---|---|
| 1 | `FAKE_DUMP` | -5% 급락 + 숏 펀딩 극단 + OI 거의 안 움직임 | 마켓메이커가 가격 누르려 숏 여는 것 (진입 금지) |
| 2 | `ARCH_ZONE` | 와이드 아치 + OI 천천히 감소 | 저점 재테스트 가능성 (대기) |
| 3 | `REAL_DUMP` | 두 번째 덤프 -8% + **거래량 폭발** + **OI 급등** | 마켓메이커의 실제 포지셔닝 (구조적 앵커) |
| 4 | `ACCUMULATION` | 저점 상승 + 펀딩 음→양 전환 + OI 유지 | 숏 stop-loss가 엔트리 (**actionable entry**) |
| 5 | `BREAKOUT` | OI 다시 급등 + 가격 돌파 + 거래량 폭발 | 마켓메이커 롱 플립 (보통 늦음) |

### 3.2 Phase 1 vs Phase 3 — 핵심 구분

두 phase 모두 차트에서는 급락처럼 보인다. 차이는 전적으로 **파생 데이터**에 있다.

| Metric | Phase 1 (Fake) | Phase 3 (Real) |
|---|---|---|
| Price drop | 유사 (≥5%) | 유사 (≥5%) |
| OI change | 작음 (<5%) | **큼 (>15%)** |
| Volume | 평균 이하 | **3x+ 폭발** |
| Funding | 음수 | **극단 음수** |
| 의미 | 리테일 패닉, 실제 포지셔닝 없음 | **마켓메이커의 무거운 숏 진입** |
| 다음 | Arch zone, 추가 하락 가능 | Accumulation → 반전 |

**왜 순수 price-action 도구로 복제 불가:** 시그널이 candlestick 모양이 아니라 **파생 레이어 (OI + funding + volume confluence)**에 있다.

### 3.3 Phase Timeout

stall된 패턴은 자동 만료.

| Phase | Timeout (on 1h TF) | On Expiry |
|---|---|---|
| `FAKE_DUMP` | 24 candles (24h) | idle reset |
| `ARCH_ZONE` | 48 candles | idle reset |
| `REAL_DUMP` | 24 candles | idle reset |
| `ACCUMULATION` | 72 candles | EXPIRED 로깅 (MISS 아님) |
| `BREAKOUT` | 12 candles | 결과 기록 (hit or miss) |

---

## 4. Pattern Definition Plane

### 4.1 PatternObject 구조

```text
PatternObject
  ├─ pattern_slug: str              # "tradoor-oi-reversal-v1"
  ├─ version: int                   # schema + logic version
  ├─ name: str                      # 유저 노출 라벨
  ├─ description: str
  ├─ direction: "long" | "short" | "both"
  ├─ timeframe: str                 # "1h", "4h", etc.
  ├─ universe_scope: str            # "binance_usdtm_perp_active"
  ├─ phases: PhaseCondition[]       # 순서 있음
  ├─ entry_phase_index: int         # Day-1 기준: ACCUMULATION index
  ├─ target_phase_index: int        # Day-1 기준: BREAKOUT index
  ├─ feature_schema_version: int    # 92-feature layout version
  ├─ label_policy_version: int      # HIT/MISS 정의 버전
  ├─ source_review_ref: object      # trade diary 또는 capture 링크
  └─ metadata: object               # author, created_at, changelog
```

### 4.2 PhaseCondition 구조

```text
PhaseCondition
  ├─ phase_index: int               # 1..5
  ├─ name: str                      # "FAKE_DUMP" 등
  ├─ required_blocks: BlockRef[]    # 모두 true여야 진입
  ├─ disqualifier_blocks: BlockRef[]# 하나라도 true면 진입 금지
  ├─ optional_blocks: BlockRef[]    # 가중치용, 진입 조건 아님
  ├─ min_bars_in_phase: int         # 최소 유지 봉 수
  ├─ timeout_bars: int              # 만료 기준
  ├─ timeout_action: "reset" | "log_expired" | "log_result"
  └─ block_params_override: object  # phase 레벨 파라미터

BlockRef
  ├─ block_name: str                # "oi_spike_with_dump"
  └─ params: object                 # {price_threshold: -0.05, oi_threshold: 0.10}
```

### 4.3 Registry (Gap 2)

**현재:** 패턴이 Python 코드에만 존재 (`engine/patterns/library.py`). 새 패턴 추가 = 코드 수정 + 배포.

**타겟:** Definition registry를 **runtime state와 분리**한다.
- built-in 코드 패턴은 registry를 seeding (boot-time).
- 모든 영속 패턴은 명시적 `version`과 `source` 메타데이터 필수.
- 유저/팀이 코드 수정 없이 새 패턴 추가 가능.

**파일:** `engine/patterns/registry/{pattern_slug}.json` (예정). 현재는 `engine/patterns/library.py` 하드코딩.

---

## 5. Building Blocks

Phase 조건은 **블록 함수로 평가**된다. 블록은 pre-computed feature matrix를 받아 boolean series를 반환하는 순수 함수다. 데이터 fetch를 직접 하지 않는다 (테스트 가능성 + 성능).

### 5.1 Context API (정본)

```python
class Context:
    features: pd.DataFrame    # 92 columns, 1 row per candle
    klines: pd.DataFrame      # OHLCV DataFrame
    params: dict              # block-specific thresholds

# 블록 시그니처
def my_block(ctx: Context) -> pd.Series:  # boolean series aligned to features
    ...
```

**주의:** 과거 설계 문서의 `SignalContext.df`, `ctx.perp`는 **실제 API가 아니었다** (§15.3 충돌 해결 참조).

### 5.2 블록 분류

블록은 4 카테고리로 분류되고 `engine/building_blocks/{category}/`에 위치.

| Category | 역할 | 예 |
|---|---|---|
| `triggers/` | phase 진입 초기 신호 | price drop, volume spike |
| `confirmations/` | 진입 확정 조건 | `oi_spike_with_dump`, `higher_lows_sequence` |
| `disqualifiers/` | 진입 차단 조건 | overextended move, regime mismatch |
| `entries/` | 실제 entry event 생성 | entry trigger 조합 |

### 5.3 핵심 신규 블록 5개 (Phase 1~5 지원용)

| Block | Logic | Required Features |
|---|---|---|
| `oi_spike_with_dump` | `price_change_1h < threshold AND oi_change_1h > oi_threshold AND volume_ratio_1h > vol_threshold`, 같은 또는 2봉 이내 | `price_change_1h`, `oi_change_1h`, `volume_ratio_1h` |
| `higher_lows_sequence` | 연속 N개의 swing low가 이전보다 높음. swing low = lookback window 내 로컬 minimum | lookback 기간의 close price (default 20봉) |
| `funding_flip` | 이전 N봉 `funding_rate < 0`, 현재봉 `> 0`. lookback 설정 가능 (default 8) | `funding_rate` 시계열 |
| `oi_hold_after_spike` | OI spike 이벤트가 최근 N봉 안에 있고, 현재 OI가 spike level의 `spike_retention%` 이상 | `oi_change_1h` 히스토리, 현재 OI |
| `sideways_compression` | window 동안 price range < threshold% AND BB bandwidth 감소. 번지/아치 감지 | `high`, `low`, `bb_width` over window |

**구현 예 (`oi_spike_with_dump`):**

```python
def oi_spike_with_dump(ctx: Context) -> pd.Series:
    price_drop = ctx.features['price_change_1h'] < ctx.params.get('price_threshold', -0.05)
    oi_spike   = ctx.features['oi_change_1h']     > ctx.params.get('oi_threshold', 0.10)
    vol_surge  = ctx.features['volume_ratio_1h']  > ctx.params.get('vol_threshold', 3.0)
    return price_drop & oi_spike & vol_surge
```

### 5.4 현재 블록 수

| Category | 현재 수 |
|---|---:|
| triggers | [see §12] |
| confirmations | [see §12] |
| disqualifiers | [see §12] |
| entries | [see §12] |
| **총** | **29** (2026-04-21) |

설계 의도는 "기존 26 + 신규 5 = 31"이었으나 실제는 29. 일부 블록이 통합/리네임되었을 가능성 [assumption].

---

## 6. Pattern Runtime Plane

### 6.1 Runtime Loop

매 scan cycle (default: 15분, tier별 다름):

```text
for each symbol in dynamic_universe (~300 symbols):
  features = feature_calc(symbol, timeframe)

  for each active_pattern:
    current_phase = state_store[symbol][pattern_slug]
    next_phase_cond = pattern.phases[current_phase.index + 1]

    if all(eval(b, features) for b in next_phase_cond.required_blocks):
      if not any(eval(b, features) for b in next_phase_cond.disqualifier_blocks):
        transition(symbol, pattern, current_phase → next_phase)
        fire_callback(...)   # emit PhaseTransitionEvent, maybe CandidateEvent

    if current_phase.bars_in_phase > current_phase.timeout_bars:
      expire(symbol, pattern)   # reset 또는 log_expired
```

### 6.2 Pattern State (보조 엔티티, Layer B §5.12 참조)

**목적:** 1 symbol × 1 pattern의 **현재 phase**. Layer B `pattern` 객체와 별개 — 이건 per-symbol 런타임 상태다.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `symbol` | `string` | yes | Binance perp symbol |
| `pattern_slug` | `string` | yes | 추적 중인 PatternObject |
| `current_phase_index` | `integer` | yes | 1..5 또는 0 (idle) |
| `current_phase_name` | `string` | yes | 표시용 (`FAKE_DUMP` 등) |
| `entered_at` | `datetime` | yes | 현재 phase 진입 시각 (UTC) |
| `bars_in_phase` | `integer` | yes | 현재 phase 체류 봉 수 |
| `last_transition_at` | `datetime` | yes | 마지막 전이 시각 |
| `block_coverage` | `object` | no | 현재 phase의 블록 충족 상태 요약 |
| `latest_feature_snapshot_ref` | `string` | no | feature snapshot 저장 위치 |
| `timeframe` | `string` | yes | 추적 TF |
| `universe_tier` | `string` | yes | core / active / watchlist |

**Composite key:** `(symbol, pattern_slug, timeframe)`

### 6.3 Phase Transition Event (append-only)

**목적:** phase 전이 이벤트. 불변 append-only.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `transition_id` | `string` | yes | stable UUID |
| `pattern_slug` | `string` | yes | |
| `symbol` | `string` | yes | |
| `timeframe` | `string` | yes | |
| `from_phase_index` | `integer` | yes | 0이면 idle에서 시작 |
| `to_phase_index` | `integer` | yes | |
| `from_phase_name` | `string` | yes | |
| `to_phase_name` | `string` | yes | |
| `transitioned_at` | `datetime` | yes | UTC |
| `reason` | `enum` | yes | `conditions_met`, `timeout_reset`, `timeout_expired`, `disqualified`, `manual_override` |
| `feature_snapshot` | `object` | yes | 전이 시점 92 feature full snapshot |
| `block_coverage` | `object` | yes | required/disqualifier/optional 블록별 true/false |
| `bars_in_previous_phase` | `integer` | yes | |
| `scan_cycle_id` | `string` | yes | `Scan Cycle.scan_id`로 연결 |

**Rules:**
- 한 번 쓰이면 mutate 불가.
- Layer B `capture.source_ref.transition_id`로 링크 가능.

### 6.4 Durable State Plane (Gap 1)

**현재 상태:** state machine이 in-process singleton. 재시작 → 전 phase state 분실. 멀티 인스턴스 런타임은 즉시 발산.

**타겟 구조:**
- durable store: `(symbol, pattern_slug, timeframe)` → full `Pattern State` 레코드
- 로컬 폴백: SQLite 또는 파일 (`engine/patterns/state_store.db`)
- 프로덕션 타겟: Postgres 또는 공유 hot-state (Redis + Postgres)
- scan cycle 시작 시 state restore
- 모든 phase transition에 persist

**Idempotency rule:** 같은 `(scan_cycle_id, symbol, pattern_slug)`로 재평가해도 동일 결과여야 한다.

### 6.5 Observation at First Sight

**문제:** 심볼이 이미 `ACCUMULATION`에 있을 때 프로세스가 earlier phase를 목격하지 못했다면 **불가시**가 된다.

**Day-1 해결:** cold start 시 모든 심볼에 대해 최근 N봉(예: 200)을 replay하여 backfill. scan 시작 전 1회 실행.

---

## 7. Pattern Scanner

### 7.1 Dynamic Universe (Tier)

전 Binance USDT-M perp 유니버스. 고정 watchlist 아님 (TRADOOR, PTB 같은 mid/small-cap에서 actionable한 패턴이 발생하므로).

| Tier | Criteria | Scan 주기 | 심볼 수 (est.) |
|---|---|---|---:|
| Core | Top 30 by market cap | 15분마다 | ~30 |
| Active | 24h volume > $5M | 30분마다 | ~100 |
| Watchlist | 24h volume > $1M | 1시간마다 | ~200 |
| Cold | < $1M volume | scan 안 함 | ~100+ |

일일 유니버스 갱신: Binance FAPI `/fapi/v1/exchangeInfo` + 24h ticker.

### 7.2 Three AutoResearch Layers

Layer B §10과 정합. 엔진 관점의 구체 배치:

| Layer | 구현 위치 | 역할 |
|---|---|---|
| **A. Feature Vector Similarity** | `engine/challenge/scanner.py` (cosine similarity on normalized 92-feature vector) | scan-time prefilter, lab-time 비교 |
| **B. Event Sequence Matching** | `engine/patterns/state_machine.py` + scanner | phase 시퀀스 진행 비교, candidate scoring |
| **C. LLM Chart Interpretation** | 미구현 | 향후 대량 이동 이벤트 시 구조화 태그/설명 자동 생성 |

**Layer C 트리거 시나리오 (향후):**
1. 심볼이 4h 내 ≥10% 이동
2. 48h feature timeline + 차트 이미지 캡처
3. LLM이 구조화된 pattern description 출력
4. description → 블록 조건으로 변환
5. 히스토리컬 데이터에서 유사 시퀀스 검색
6. hit rate > threshold면 신규 pattern template 제안

**전제:** Ledger에 수동 레이블링된 충분한 패턴 (validation 기준).

### 7.3 Scan Cycle (보조 엔티티)

**목적:** 한 번의 scan run 메타데이터. 운영 레코드.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `scan_id` | `string` | yes | stable UUID |
| `started_at` | `datetime` | yes | UTC |
| `completed_at` | `datetime` | no | 진행 중엔 null |
| `universe_version` | `string` | yes | 유니버스 스냅샷 id |
| `universe_tier` | `string` | yes | core / active / watchlist |
| `symbols_scanned` | `integer` | yes | 실제 처리된 심볼 수 |
| `symbols_failed` | `integer` | yes | 데이터 결함으로 스킵된 수 |
| `patterns_evaluated` | `string[]` | yes | active pattern_slug 목록 |
| `transitions_emitted` | `integer` | yes | 이번 cycle의 PhaseTransitionEvent 수 |
| `candidates_emitted` | `integer` | yes | 이번 cycle의 CandidateEvent 수 |
| `data_quality` | `object` | yes | kline 신선도, OI 커버리지, funding 가용성 |
| `timeframe` | `string` | yes | |

**Rules:**
- 작업은 idempotent. 같은 `scan_id` 재실행 시 같은 출력.
- 실패한 심볼은 다음 cycle에서 재시도. 블록 안 함.

### 7.4 Signal Snapshot (보조 엔티티)

**목적:** 한 시점의 시장 증거. `Pattern State.latest_feature_snapshot_ref`와 PhaseTransitionEvent `feature_snapshot`이 참조.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `snapshot_id` | `string` | yes | stable id |
| `symbol` | `string` | yes | |
| `timeframe` | `string` | yes | |
| `timestamp` | `datetime` | yes | snapshot 시점 (UTC, 봉 close 기준) |
| `feature_vector` | `float[]` | yes | 92 dim, normalized or raw (둘 다 저장 가능) |
| `feature_schema_version` | `integer` | yes | |
| `layer_summary` | `object` | no | feature 카테고리별 요약 |
| `alpha_score` | `number` | no | market 컨텍스트 (예: 알파 컨플루언스 지표) |
| `regime_tag` | `string` | no | `uptrend` / `sideways` / `downtrend` |

### 7.5 Data Pipeline — Binance → Feature

| Source | Endpoint | 데이터 | 주기 |
|---|---|---|---|
| Binance FAPI | `/fapi/v1/klines` | OHLCV | scan cycle마다 |
| Binance FAPI | `/fapi/v1/openInterestHist` | 히스토리컬 OI | scan cycle마다 |
| Binance FAPI | `/fapi/v1/fundingRate` | Funding rate 히스토리 | 8시간마다 |
| Binance FAPI | `/fapi/v1/exchangeInfo` | 심볼 유니버스 | 일일 |
| Binance FAPI | `/fapi/v1/ticker/24hr` | 유니버스 tier용 볼륨 | 일일 |

**kline 캐시:** Redis 5분 prefetch + Binance WS fallback (`engine/cache/`).

**왜 TradingView 데이터 불필요:** TradingView는 indicator를 내부 계산하고 API로 노출 안 함. 그러나 양쪽 다 같은 Binance FAPI를 사용하므로 **RSI(14) 등 표준 지표는 계산 결과가 동일**.

### 7.6 Feature Calculation — 92 Columns

`engine/scanner/feature_calc.py`에서 **92 columns per candle per symbol**을 계산. 모든 블록/패턴/challenge의 공통 substrate.

| Category | Feature 수 | 예 |
|---|---:|---|
| Price action | 18 | close, high, low, `price_change_1h/4h/24h`, atr, range |
| Moving averages | 10 | sma5, sma20, sma60, sma150, sma200, ema12, ema26 |
| Momentum | 12 | rsi14, macd, macd_signal, macd_histogram, stoch_k, stoch_d |
| Volatility | 8 | bb_upper, bb_lower, bb_width, bb_pctb, atr_pct, keltner |
| Volume | 10 | volume, volume_sma, `volume_ratio`, obv, vwap, mfi |
| Derivatives | 16 | oi, `oi_change_1h/4h/24h`, `funding_rate`, funding_ma, long_short_ratio |
| Trend | 8 | adx, di_plus, di_minus, aroon_up, aroon_down, supertrend |
| Cross-asset | 10 | btc_correlation, btc_trend, eth_dominance, total_market_oi |
| **Total** | **92** | |

`feature_schema_version`으로 추적. 스키마 변경은 bump.

---

## 8. Pattern Ledger Plane

Ledger는 엔진의 **가장 중요한 장기 자산**. 탐지된 각 패턴 이후 무엇이 일어났는지 기록, 복제 불가한 증거 베이스.

### 8.1 Split Ledger Record Families (Gap 3)

**현재 상태:** 하나의 JSON 레코드 패밀리가 여러 책임을 짐. `engine/ledger/store.py`.

**타겟:** 논리적으로 분리된 독립 plane 6개.

| Record Family | 역할 | Layer B 매핑 |
|---|---|---|
| `entry_record` | phase 진입 이벤트 (보통 ACCUMULATION) | — |
| `score_record` | ML 점수 (committed entry 기준) | — |
| `outcome_record` | phase 진입 이후 실제 결과 | Layer B §5.12 `Outcome Record` |
| `verdict_record` | 자동 + 수동 판정 | Layer B §5.8 `verdict` 계약 |
| `model_record` | 사용된 모델 버전 | — |
| `training_run_record` | 학습 실행 기록 | — |

**Rules:**
- 모든 record는 append-friendly. 파괴적 mutate 금지.
- re-aggregation은 새 aggregate 출력을 만들지, 과거 원본을 덮어쓰지 않는다.
- JSON 파일 저장은 로컬 개발용으로만 허용. production truth 아님.

### 8.2 Entry Record

Phase 진입 시점 기록. 보통 `ACCUMULATION` 진입이 entry event.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `entry_id` | `string` | yes | stable UUID |
| `pattern_slug` | `string` | yes | |
| `symbol` | `string` | yes | |
| `timeframe` | `string` | yes | |
| `entry_phase_index` | `integer` | yes | 보통 4 (ACCUMULATION) |
| `entry_phase_name` | `string` | yes | |
| `entry_timestamp` | `datetime` | yes | phase 진입 시각 (UTC) |
| `entry_price` | `number` | yes | 진입 시점 가격 |
| `transition_id` | `string` | yes | 생성한 PhaseTransitionEvent 링크 |
| `feature_snapshot_id` | `string` | yes | Signal Snapshot 참조 |
| `scan_cycle_id` | `string` | yes | |
| `btc_regime_at_entry` | `enum` | yes | `uptrend` / `sideways` / `downtrend` |
| `created_at` | `datetime` | yes | |

### 8.3 Outcome Record

Entry 이후 결과. 자동 평가 윈도우 종료 시 생성.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `outcome_id` | `string` | yes | stable UUID |
| `entry_id` | `string` | yes | Entry 링크 |
| `evaluation_window_hours` | `integer` | yes | default: ACCUMULATION 이후 72h |
| `peak_price` | `number` | yes | 윈도우 내 최고가 |
| `peak_return_pct` | `number` | yes | maximum favorable excursion |
| `exit_price` | `number` | yes | 윈도우 close 가격 |
| `exit_return_pct` | `number` | yes | 윈도우 close 수익률 |
| `breakout_at` | `datetime` | no | BREAKOUT phase 진입 시각 (달성 시) |
| `invalidated_at` | `datetime` | no | stop 판정 시각 |
| `auto_outcome` | `enum` | yes | `HIT`, `MISS`, `EXPIRED` |
| `final_outcome` | `enum` | yes | user override 반영 최종값 |
| `label_policy_version` | `integer` | yes | 어떤 HIT/MISS 정의를 썼는지 |
| `created_at` | `datetime` | yes | |

**Auto verdict 기준 (default `label_policy_version = 1`):**
- `HIT`: `peak_return_pct >= +15%`
- `MISS`: `exit_return_pct <= -10%`
- `EXPIRED`: 둘 다 미충족

**Rules:**
- `auto_outcome`은 자동 계산. mutate 금지.
- `final_outcome`은 user verdict와 결합된 최종값. `verdict_record`가 있으면 그걸 반영.

### 8.4 Verdict Record (Layer B §5.8 계약 충족)

Layer B `verdict` 객체 계약을 엔진 내부에서 구현.

| Engine Field | Layer B Field | Notes |
|---|---|---|
| `verdict_id` | `id` | |
| `subject_kind` | `subject_kind` | Day-1 엔진 컨텍스트: `alert`, `entry`, `outcome`, `challenge_outcome` |
| `subject_id` | `subject_id` | |
| `source` | `source` | `manual` / `auto` |
| `label` | `label` | `agree` / `disagree` / `hit` / `miss` / `void` |
| `confidence` | `confidence` | optional, auto verdict용 |
| `note` | `note` | optional |
| `recorded_at` | `recorded_at` | |
| `recorded_by` | `recorded_by` | `user:<id>` / `system:auto` |

**Rules:**
- append-only. 히스토리 덮어쓰기 금지.
- 한 subject에 manual + auto verdict 공존 허용.

### 8.5 Aggregate Statistics

Ledger는 패턴별 rolling 통계 자동 계산.

| Metric | 공식 | 용도 |
|---|---|---|
| Hit rate | `count(HIT) / count(HIT + MISS)` | 핵심 신뢰도 |
| Avg return | HIT 레코드의 `mean(exit_return_pct)` | 엔트리당 기대 수익 |
| Avg loss | MISS 레코드의 `mean(exit_return_pct)` | 엔트리당 리스크 |
| Expected value | `hit_rate * avg_return + miss_rate * avg_loss` | +EV 판정 |
| BTC-conditional hit rate | btc_regime 필터링 hit rate | 레짐 의존성 |
| Decay analysis | rolling 30일 hit rate | 엣지 감쇠 |

**Bucket keys (Layer B `ledger_entry.bucket_keys`와 정합):** `symbol`, `timeframe`, `btc_regime`, `pattern_family`, `user_scope`.

### 8.6 Save Setup → Ledger 연결 (Gap 5)

**Layer B `capture`와 Layer C ledger의 관계:**

```text
Layer B `capture` (user-saved setup)
  └─ source_ref.transition_id ──────→ Layer C PhaseTransitionEvent
  └─ source_ref.candidate_id  ──────→ Layer C CandidateEvent
  └─ (추후) outcome이 닫히면    ──────→ Layer C Outcome Record
                                    └─ ledger_entry로 승격
```

**Two save paths (Layer B §5.3와 정합):**
1. `manual_pattern_seed` — 차트 세그먼트 수동 마킹. capture만 저장, Outcome은 나중.
2. `pattern_candidate` — 서페이싱된 candidate에서 저장. transition_id + candidate_id 링크.

---

## 9. Pattern ML Plane

### 9.1 Pattern-Keyed Model Identity (Gap 4)

**현재 문제:** `engine/patterns/entry_scorer.py`가 generic `get_engine(user_id)` 사용. "유저 모델"이지 "패턴 모델" 아님.

**타겟 model key:**
```text
{pattern_slug}__{timeframe}__{target_name}__f{feature_schema_version}__lp{label_policy_version}
```

예:
- `tradoor-oi-reversal-v1__1h__breakout__f1__lp1`
- `funding-flip-reversal-v1__4h__breakout__f1__lp1`

**Rules:**
- Pattern runtime (Plane 2)은 rule-first. ML (Plane 4)은 committed entry를 score할 뿐 phase 의미를 판정하지 않는다.
- Model artifact는 `engine/models/{model_key}.pkl` 같은 위치에 key-addressable 저장.
- feature_schema_version 또는 label_policy_version bump = 새 model key (기존 모델과 분리).

### 9.2 Score Record

| Field | Type | Required | Notes |
|---|---|---:|---|
| `score_id` | `string` | yes | |
| `entry_id` | `string` | yes | |
| `model_key` | `string` | yes | |
| `model_version` | `string` | yes | |
| `score` | `number` | yes | 0..1 확률 또는 logit |
| `calibration_applied` | `bool` | yes | |
| `scored_at` | `datetime` | yes | |
| `feature_snapshot_id` | `string` | yes | |

### 9.3 Training Run Record

| Field | Type | Required | Notes |
|---|---|---:|---|
| `training_run_id` | `string` | yes | |
| `model_key` | `string` | yes | |
| `training_method` | `enum` | yes | `lightgbm`, `kto`, `orpo`, `dpo`, `lora_sft` |
| `started_at` | `datetime` | yes | |
| `completed_at` | `datetime` | no | |
| `dataset_ref` | `object` | yes | 학습/검증 데이터셋 스냅샷 참조 |
| `train_size` | `integer` | yes | |
| `val_size` | `integer` | yes | |
| `metrics` | `object` | yes | precision/recall/AUC/hit_rate_delta 등 |
| `artifact_ref` | `object` | yes | 모델 artifact 위치 |
| `status` | `enum` | yes | `running` / `succeeded` / `failed` |

### 9.4 Maturity Phases

Layer B §11 "Later phases add"에 정합.

1. **Hill climbing / threshold tuning** — block threshold 자동 탐색 (first)
2. **KTO or preference fine-tuning** — good/bad 단독 라벨로 LoRA 학습
3. **ORPO/DPO style pair optimization** — chosen/rejected pair 학습
4. **Per-user LoRA / adapter deployment** — 유저별 adapter hot-swap

**Design rule:** Train/Deploy은 judged 증거의 **하류**다. raw signal runtime의 일부가 아니다.

### 9.5 User Refinement (Personalized Variants)

**현재 상태:** Ledger에 verdict 레코드는 있으나 refinement lifecycle 미완.

**Flow (타겟):**
1. 유저가 base pattern을 2주 이상 운용
2. Verdict UI로 VALID/INVALID 판정 기록
3. 10+ 판정 누적 시 시스템이 분포 분석
4. 임계값 변경 제안: "VALID 히트의 평균 OI spike가 18%. threshold를 10% → 15%로?"
5. 수락 시 personal variant 생성: `{pattern_slug}__{user_id}`
6. Personal variant는 별도 ledger, global 통계와 분리

**Refinement Data Structure 예:**
```json
{
  "base_pattern_slug": "tradoor-oi-reversal-v1",
  "user_id": "trader_alpha",
  "variant_slug": "tradoor-oi-reversal-v1__trader_alpha",
  "overrides": {
    "phase_3": {
      "oi_spike_with_dump": { "oi_threshold": 0.18 }
    },
    "phase_4": {
      "higher_lows_sequence": { "min_count": 4 }
    }
  },
  "judgments_count": 14,
  "personal_hit_rate": 0.71,
  "created_at": "2026-04-13T00:00:00Z"
}
```

---

## 10. Alert Policy Plane (Gap 7)

**현재 상태:** entry candidate가 곧바로 UI 가시성으로 흐름. ML shadow metric 존재하나 명시적 정책 미참여.

**타겟:** runtime과 분리된 명시적 정책 상태 머신.

### 10.1 Alert Policy States

| State | 의미 |
|---|---|
| `shadow` | 추적만, UI 노출 없음. 모델/정책 실험용 |
| `visible_ungated` | PatternStatusBar에 표시 (기본 Day-1 동작) |
| `ranked` | 상위 N개만 노출 (score 기반 정렬) |
| `gated` | 특정 조건 충족 시에만 노출 (예: score > threshold) |
| `paused` | 일시 중단 |

### 10.2 Candidate Event (보조 엔티티)

Pattern Runtime이 actionable phase(보통 ACCUMULATION)에 진입한 심볼을 **후보**로 승격시킬 때 emit.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `candidate_id` | `string` | yes | stable UUID |
| `pattern_slug` | `string` | yes | |
| `symbol` | `string` | yes | |
| `timeframe` | `string` | yes | |
| `phase_index` | `integer` | yes | 보통 4 (ACCUMULATION) |
| `phase_name` | `string` | yes | |
| `transition_id` | `string` | yes | 생성한 PhaseTransitionEvent 링크 |
| `candidate_score` | `number` | no | ML Plane이 채움 (shadow 상태에서도 저장) |
| `delivery_policy_state` | `enum` | yes | `shadow` / `visible_ungated` / `ranked` / `gated` / `paused` |
| `candidate_created_at` | `datetime` | yes | |
| `watch_id` | `string` | no | Watch 컨텍스트에서 왔을 때 링크 |

**Design rule:**
- Candidate 생성은 Pattern Runtime 소속
- 노출/랭킹 결정은 Alert Policy Plane 소속
- **이 두 결정을 같은 모듈이 하지 않는다**

### 10.3 Candidate → Alert 승격

Alert Policy가 candidate를 `visible_ungated`, `ranked`, `gated` 중 하나로 판정하면 **Layer B `alert` 객체가 emit**된다. Layer B §5.7 필드 계약 충족:

| Engine Source | Layer B `alert` Field |
|---|---|
| `candidate_id` | `drilldown_context.candidate_id` |
| `watch_id` (있으면) | `watch_id` |
| `pattern_slug` → runtime `pattern_id` | `pattern_id` (있을 때) |
| 관련 `challenge_slug` | `challenge_slug` (required) |
| `symbol`, `timeframe`, `candidate_created_at` | `symbol`, `timeframe`, `detected_at` |
| `phase_name` | `phase_summary` |
| `candidate_score + label_policy` | `score_summary` |
| deterministic dedup hash of `(pattern_slug, symbol, phase_index, window_bucket)` | `dedup_key` |

---

## 11. App Presentation Plane — 계약 경계 (Gap 6)

**원칙:** 엔진이 pattern truth 소유. 앱은 **얇게** 렌더.

### 11.1 현재 문제

- `app/src/routes/api/patterns/+server.ts`가 entry phase semantics 하드코딩, `since` 필드 fabricate
- `app/src/routes/api/patterns/states/+server.ts`가 엔진 데이터를 뒤집거나 이름 바꾸어 의미 손실
- chart 데이터를 app orchestration으로 Binance에서 직접 fetch (표시용은 OK, canonical engine truth는 아님)
- 현재 `Save Setup` 경로가 canonical pattern-capture 경로와 연결 안 됨

### 11.2 타겟 규칙

1. **App은 canonical engine envelope을 최소 shaping으로 프록시.** UI view model이 필요하면 컴포넌트 내부 또는 typed adapter layer에서 파생. **API 경계에서 mutate 금지.**
2. **엔진이 field를 제공하지 않으면 앱은 만들지 않는다.** `since`, `phase_pretty_name` 같은 것을 앱이 synthesize 금지.
3. **Chart data fetch**는 display용으로 app orchestration 허용. 단, pattern 의미에 쓰일 수 없음.
4. **Save Setup POST**는 Layer B §7.4.1의 canonical route (`POST /api/terminal/pattern-captures`)로만. challenge fallback 금지.

### 11.3 Route Ownership (Layer B §7과 정합)

Engine이 소유:
- `POST /api/engine/captures` (engine-internal canonical capture store)
- `POST /api/engine/verdict`
- `POST /api/patterns/{slug}/evaluate`
- `GET /api/patterns/{slug}/stats`

App 프록시:
- `POST /api/terminal/pattern-captures` → engine captures
- `GET /api/alerts` → engine alert feed (migration중 `/api/cogochi/alerts` upstream)

### 11.4 Terminal UI 참조 (Layer B §8.2와 정합)

터미널 4-panel 차트:

| Panel | 내용 | Data Source |
|---|---|---|
| Main | Candlestick + SMA 5/20/60/150/200 | Binance klines + feature_calc |
| Sub 1 | Volume bars (direction 색) | Binance klines |
| Sub 2 | RSI 14 + 30/70 bands | feature_calc |
| Sub 3 | Open Interest (절대값 + % 변화) | Binance OI history |
| Sub 4 | Funding Rate timeline | Binance funding rate |

**PatternStatusBar** (Layer B §8.2 evidence strip 일부):
- Phase 3 (ACCUMULATION) 이상 심볼 라이브 표시
- 예: `PTBUSDT  OI-Reversal  ACCUMULATION  3h ago  higher_lows: 4  ✓`


---

## 12. Implementation Status (2026-04-21)

**이 섹션의 소유자: Layer C.** 변동 데이터는 여기에만 쓰고 다른 문서는 참조.

### 12.1 Pattern Library — 16 패턴

| # | Slug | 방향 | 상태 |
|---|---|---|---|
| 1 | `tradoor-oi-reversal-v1` | LONG | **PROMOTED** |
| 2 | `funding-flip-reversal-v1` | LONG | **PROMOTED** |
| 3 | `whale-accumulation-reversal-v1` | LONG | **PROMOTED** |
| 4 | `wyckoff-spring-reversal-v1` | LONG | **PROMOTED** |
| 5 | `volume-absorption-reversal-v1` | LONG | candidate |
| 6 | `compression-breakout-reversal-v1` | LONG | candidate |
| 7 | `funding-flip-short-v1` | SHORT | candidate |
| 8 | `funding-flip-reversal-short-v1` | SHORT | candidate |
| 9 | `gap-fade-short-v1` | SHORT | candidate |
| 10 | `volatility-squeeze-breakout-v1` | LONG | candidate |
| 11 | `alpha-confluence-v1` | LONG | candidate |
| 12 | `radar-golden-entry-v1` | LONG | candidate |
| 13 | `institutional-distribution-v1` | SHORT | candidate |
| 14 | `liquidity-sweep-reversal-v1` | LONG | candidate |
| 15 | `oi-presurge-long-v1` (딸깍형) | LONG | candidate |
| 16 | `alpha-presurge-v1` | LONG | candidate |

Five-phase Model (FAKE_DUMP ~ BREAKOUT)은 TRADOOR 레퍼런스 패턴. 다른 패턴은 각자 phase 시퀀스를 가지며 공통 구조는 `PatternObject + PhaseCondition[] + StateMachine`.

### 12.2 Building Blocks — 29개

| Category | Path | 비고 |
|---|---|---|
| triggers | `engine/building_blocks/triggers/` | |
| confirmations | `engine/building_blocks/confirmations/` | 신규 5개 포함 |
| disqualifiers | `engine/building_blocks/disqualifiers/` | |
| entries | `engine/building_blocks/entries/` | |

Progressive Gates 프레임워크 적용 (W-0105).

### 12.3 컴포넌트 상태

**✅ Implemented (rule-first runtime):**

| 컴포넌트 | 파일 | 비고 |
|---|---|---|
| 새 블록 5개 | `engine/building_blocks/confirmations/` | OI-Reversal 지원 |
| 동적 유니버스 (~300) | `engine/universe/dynamic.py` | tier 4개 |
| Pattern Object / Library | `engine/patterns/types.py`, `library.py` | 16 패턴 하드코딩 |
| State Machine (메모리) | `engine/patterns/state_machine.py` | **in-process singleton** |
| Pattern Scanner | `engine/patterns/scanner.py` | |
| Ledger (JSON) | `engine/ledger/store.py`, `types.py`, `dataset.py` | capture/outcome/verdict/stats |
| API 엔드포인트 | `engine/api/routes/patterns.py` | |
| ChartBoard | `app/src/components/terminal/workspace/ChartBoard.svelte` | 4-panel |
| PatternStatusBar | `app/src/components/terminal/workspace/PatternStatusBar.svelte` | |
| 터미널 통합 | `app/src/routes/terminal/+page.svelte` | |
| kline cache | `engine/cache/` | Redis 5분 prefetch + WS fallback (W-0096) |
| Scanner (feature/alerts/realtime/scheduler) | `engine/scanner/` | |
| Scoring (block eval + verdict + entry scorer) | `engine/scoring/` | |
| Autoresearch ML | `engine/autoresearch_ml.py` | Paradigm Framework, 5-methodology scoring |

**⚠️ Partial:**

| 항목 | 현황 | 부족 |
|---|---|---|
| Save Setup → Capture Plane | 플라이휠 4축 완료 (W-0088) — capture store, outcome resolver, verdict capture, refinement trigger | Verdict Inbox UI (dashboard) 미구현 |
| User refinement loop | verdict route + shadow scoring 존재 | lifecycle 전체 닫히지 않음 |
| ML shadow scoring | committed entry event에 대해 작동 | alert policy와 명시적 연결 없음 |
| App pattern contracts | route 존재 | 여전히 lossy (synthetic `since` 등) |
| Scan observability | scan 실행은 됨 | universe snapshot 레코드 없음, reproducibility thin |

**❌ Missing:**

| 항목 | Gap | 우선순위 |
|---|---|---|
| Durable Pattern State Plane | Gap 1 | 최우선 |
| Registry-backed Pattern Definitions | Gap 2 | 중 |
| Logical split of ledger record families | Gap 3 | 중 |
| Pattern-keyed model identity | Gap 4 | 중 |
| Canonical Save-Setup → Ledger → Refinement closure | Gap 5 (UI 부분) | 중 |
| App contract discipline | Gap 6 | 높 (다른 slice 막힘) |
| Explicit Alert Policy Plane | Gap 7 | 하 (rule 안정화 후) |
| Productionized LLM Chart Interpretation | Layer C of AutoResearch | 낮 |
| **Retrieval Plane 전체** (Parser, QueryTransformer, Sequence Matcher, Reranker) | **Gap 8** | **최우선** — 제품의 "검색" 축. §18 참조 |
| Signal vocabulary + SIGNAL_TO_RULES 매핑 테이블 | Gap 8 하위 | 최우선 |
| User judgment → reranker 학습 파이프라인 | Gap 8 하위 | 중 (데이터 누적 후) |

### 12.4 기타

- **Social blocks:** `engine/social/blocks.py`, `twitter_client.py` (Twitter API 토큰 필요)
- **테스트:** 1193 passed (2026-04-21)
- **Social 블록 개수/커버리지는 상세 미기록** [unknown]

---

## 13. Migration Order — 6 Slices

Gap을 메꿔 엔진을 장난감에서 프로덕션으로 승격하는 **순서**. 각 slice는 이전 slice가 닫혀야 의미가 있다.

### Slice 1 — App Contract Cleanup (Gap 6)

**왜 먼저:** 다른 모든 변경이 app contract drift로 막힘.

**할 일:**
- app route가 `since` 같은 합성 필드 만드는 것 중단
- engine-rich state + candidate을 안정적 app-side type으로 노출
- UI-only reshaping을 typed adapter로 이동

**완료 기준:** Layer B §7.5의 "transitional" 마킹된 route가 canonical route로 수렴. app이 engine 의미를 재해석하는 지점 0.

### Slice 2 — Durable State Plane (Gap 1)

**왜 두 번째:** in-memory state가 현재 가장 큰 정확성 홀.

**할 일:**
- `(symbol, pattern_slug, timeframe) → Pattern State` durable store
- 재시작 시 state restore
- scan cycle이 저장된 state 기준 idempotent

**완료 기준:** 프로세스 재시작 후 phase state가 보존됨. 멀티 인스턴스에서 같은 상태 공유.

### Slice 3 — Save Setup Capture Plane (Gap 5)

**왜 세 번째:** 인간 레이블링의 절반 해자가 여기서 닫힘.

**할 일:**
- `Save Setup`이 canonical capture record emit
- capture를 pattern candidate + transition_id + 이후 outcome + verdict와 링크 가능하게

**완료 기준:** Layer B §5.3의 `capture` 객체 계약을 만족하는 영속. `source_ref.transition_id`로 PhaseTransitionEvent까지 추적 가능.

### Slice 4 — Split Ledger Records (Gap 3)

**왜 네 번째:** 현재 JSON baseline을 당장 버리지 않고 깨끗한 ML/refinement 작업 unlock.

**할 일:**
- entry / score / outcome / verdict / training-run 레코드를 논리적 plane으로 분리
- 공용 aggregate view를 파생 레이어로

**완료 기준:** §8.1 Record Families 6개 독립. 새 record 추가가 다른 것에 영향 없음.

### Slice 5 — Pattern Registry (Gap 2)

**왜 다섯 번째:** 현재 하드코딩 라이브러리는 contract + state가 불안정한 동안은 허용 가능.

**할 일:**
- 하드코딩 built-in 패턴을 registry-backed 정의로 승격
- 필요하면 code seeding 유지
- 유저 정의 패턴 경로 열기

**완료 기준:** 코드 수정 없이 새 패턴 배포 가능. 영속 패턴에 `version`과 `source_review_ref` 필수.

### Slice 6 — Pattern-Specific ML Registry + Alert Policy (Gap 4, 7)

**왜 마지막:** rule runtime과 ledger plane이 안정된 뒤에만 착수.

**할 일:**
- generic `get_engine(user_id)` 경로를 pattern-keyed model identity로 교체
- Alert Policy Plane 명시적 상태 머신 도입
- rollout / policy version 컨트롤

**완료 기준:** model_key로 모델 주소 지정. Candidate → Alert 승격이 명시적 정책 상태를 거침.

---

## 14. Layer B Cross-Reference

Layer C가 Layer B 계약을 어떻게 만족하는지 매핑. **Layer B 용어가 정본**, Layer C는 구현.

### 14.1 Object Mapping

| Layer B 객체 | Layer C 구현 | 위치 |
|---|---|---|
| `capture` (§5.3) | Capture record, capture store | `engine/ledger/store.py` (현재), Save Setup Capture Plane (타겟) |
| `challenge` (§5.4) | ChallengeRecord, feature vector | `engine/challenge/` |
| `pattern` (§5.5) | PatternObject + runtime state | Plane 1 + Plane 2 |
| `watch` (§5.6) | (Day-1 미활성화 lane) | engine 내부 없음 — app orchestration 통해 |
| `alert` (§5.7) | Candidate → Alert 승격 | Plane 5 Alert Policy |
| `verdict` (§5.8) | Verdict Record | §8.4 |
| `ledger_entry` (§5.9) | 집계 뷰, bucket_keys | §8.5 |

### 14.2 보조 엔티티 필드 정본 (Layer B §5.12가 여기 참조)

| Layer B 언급 | Layer C 정의 섹션 |
|---|---|
| `Scan Cycle` | §7.3 |
| `Signal Snapshot` | §7.4 |
| `Pattern State` | §6.2 |
| `Phase Transition Event` | §6.3 |
| `Candidate Event` | §10.2 |
| `Outcome Record` | §8.3 |
| `Refinement Proposal` | §9.5 Refinement Data Structure |
| `Training Run` | §9.3 |
| `Deployment Record` | (Day-1 미정의. Slice 6에서 정의) |

### 14.3 Route Mapping (Layer B §7.5 참고)

Layer C가 노출하는 engine-internal route:

| Engine Route | App 프록시 | 비고 |
|---|---|---|
| `POST /api/engine/captures` | `POST /api/terminal/pattern-captures` | Save Setup |
| `POST /api/engine/verdict` | (프록시 또는 `/api/alerts/{id}/verdict`) | verdict ingestion |
| `POST /api/patterns/{slug}/evaluate` | `POST /api/lab/challenges/{slug}/evaluate` | deterministic eval |
| `GET /api/patterns/{slug}/stats` | `GET /api/ledger/summary` upstream | pattern 통계 |
| `POST /api/engine/retrieval/parse` | `POST /api/terminal/retrieval/parse` | 자연어 → PatternDraft (§18.2) |
| `POST /api/engine/retrieval/search` | `POST /api/terminal/retrieval/search` | PatternDraft 또는 capture_id → 유사 사례 (§18.7) |
| `POST /api/engine/retrieval/rerank` | (내부) | top-K에 대한 reranker/judge 호출 (§18.9) |

### 14.4 Retrieval 객체 매핑 (Plane 7)

Plane 7은 Day-1에 Layer B 외부 객체 계약을 새로 만들지 않는다. 대신 내부 객체 두 개를 운용하고, 검색 결과는 Layer B 기존 객체에 링크된다.

| Layer C 객체 | 역할 | Layer B 링크 |
|---|---|---|
| `PatternDraft` (§18.3) | 자연어 메모를 AI Parser가 구조화한 초안 JSON | `capture.similarity_seed`로 저장 가능 |
| `SearchQuerySpec` (§18.4) | PatternDraft를 feature rule 집합으로 변환한 검색 조건 | (ephemeral, 검색 호출 payload) |
| `RetrievalHit` (§18.10) | 검색 결과 단건 | `capture.id` 또는 `(symbol, timeframe, window)` 역참조 |

### 14.5 State Machine vs State Matrix

| Layer B (§6) State | Layer C Runtime |
|---|---|
| `capture.draft → saved` | (UI-level, 엔진은 `saved` 이후부터 소유) |
| `challenge.projected → evaluated → accepted` | `engine/challenge/` lifecycle |
| `watch.live → paused → retired` | (Day-1 app-orchestrated) |
| `alert.pending → judged_manual/auto` | Plane 5 + Plane 3 verdict ingest |
| `verdict` append-only | §8.4 append-only 보장 |
| `ledger_entry.recorded` | §8.5 aggregate generation |

---

## 15. 원본 간 충돌 / 해결

Layer C 통합 중 발견한 원본 문서 간 불일치와 채택 결정.

### 15.1 Phase 번호 체계

- **PATTERN_ENGINE_DESIGN** (upload): Phase `1~5` (FAKE_DUMP=1, BREAKOUT=5)
- **cogochi_pattern_engine_docx**: Phase `0~4` (FAKE_DUMP=0, BREAKOUT=4)
- **Layer B `core-loop-v1.md` §3**: Phase `1~5`

**해결:** **Layer B 정본 = 1~5 체계 채택.** docx의 Phase 0~4 번호는 레거시. 설명 시 "Phase 1 (FAKE_DUMP)" 형식으로 **번호 + 이름 병기**해서 혼동 방지. `phase_index` 필드는 1부터.

### 15.2 블록 개수

- **PATTERN_ENGINE_DESIGN**: "기존 26 + 신규 5 = **31**"
- **cogochi_pattern_engine_docx**: "**31** blocks per symbol per scan cycle"
- **engine-pipeline.md (2026-04-21)**: "**29**개"

**해결:** **29가 실제 현재 값.** 31이 설계 의도였으나 일부 블록이 통합/리네임됐을 가능성 [assumption]. §5.4 + §12.2는 29 기준. 상세 분류별 수는 [unknown] — 필요 시 코드 검증.

### 15.3 Context API 시그니처

- **과거 설계 문서**: `ctx: SignalContext`, `ctx.df`, `ctx.perp` 사용
- **실제 코드 + PATTERN_ENGINE_DESIGN의 §11**: `ctx: Context`, `ctx.features[...]`, `ctx.klines`, 반환 `pd.Series`

**해결:** **실제 API 채택** (§5.1). 과거 설계 문서의 `SignalContext.df`, `ctx.perp`는 구현과 달라 혼동 원인이었음. 이는 PATTERN_ENGINE_DESIGN §11에서 이미 수정 기록되어있었음. v1에서는 처음부터 `Context` 정본만 기술.

### 15.4 구현 상태 — "Save Setup" DONE vs NOT STARTED

- **cogochi_pattern_engine_docx §11.1**: "Save Setup UI + flow: **NOT STARTED**", "Result Ledger UI: NOT STARTED", "User Refinement engine: NOT STARTED"
- **Layer B `core-loop.md` 현재 상태**: "플라이휠 4축 완료 (W-0088)" — capture store + outcome resolver + verdict capture + refinement trigger 모두 ✅
- **engine-pipeline.md (2026-04-21)**: 패턴/ledger/scoring 모두 DONE 표시

**해결:** **2026-04-21 기준 Layer B + engine-pipeline이 최신.** docx §11은 오래된 스냅샷. v1 §12에 반영된 "Partial" 상태가 정확함:
- Save Setup 백엔드: DONE (플라이휠 4축)
- Verdict Inbox **UI (dashboard)**: 미구현
- Refinement lifecycle 완전 닫힘: Partial (shadow scoring은 있음, alert policy와 명시 연결 미)

### 15.5 Plane 개수와 이름

- **PATTERN_ENGINE_DESIGN**: "6개 Plane" = Pattern Definition / Pattern Runtime / Pattern Ledger / Pattern ML / Alert Policy / App Presentation
- **pattern-engine-runtime "Optimal Target Structure"**: 같은 6개. 순서/이름 동일.

**해결:** **불일치 없음.** 두 문서가 독립적으로 같은 6 Plane에 수렴. §2 Plane Architecture에 그대로 채택.

### 15.6 Pattern-Model Identity Key 포맷

- **PATTERN_ENGINE_DESIGN**: `pattern_slug + timeframe + target_name + feature_schema_version + label_policy_version`
- **pattern-engine-runtime**: 동일한 표현. 포맷 같음.

**해결:** **불일치 없음.** 구체 직렬화는 `__` 구분자로 정함: `{slug}__{tf}__{target}__f{schema}__lp{policy}` (§9.1).

### 15.7 Verdict 기준 수치

- **docx §6.2**: `HIT: peak_return_pct >= +15%`, `MISS: exit_return_pct <= -10%`, 윈도우 72h
- **다른 문서들**: 구체 수치 미기재

**해결:** **docx 수치 채택** (§8.3 auto outcome rules). `label_policy_version = 1`로 세팅하고, 향후 조정 시 version bump + 신규 model_key.

### 15.8 설계 문서가 소스코드를 과소평가한 흔적

PATTERN_ENGINE_DESIGN §11은 명시: "설계 문서가 기존 코드베이스를 과소평가했음. `autoresearch_ml.py`, `ChallengeRecord`, LightGBM trainer 등이 이미 있었음."

**해결:** Layer C v1은 **실제 코드 현황 (§12) 기준으로 기술**. 이미 있는 것은 "missing"으로 쓰지 않는다. Gap 목록(§12 Missing)은 "코드에 진짜 없는 것"만.

### 15.9 State store 기술 선택

- **PATTERN_ENGINE_DESIGN Gap 1**: "로컬: SQLite (JSONL → 이후 마이그레이션 가능)"
- **pattern-engine-runtime Gap 1**: "local fallback can remain file-backed or SQLite. production target should move to DB or shared hot-state"
- **architecture.md**: "Postgres durable state, Redis hot state"

**해결:** 층위화. **개발/로컬 = SQLite 또는 파일**, **프로덕션 = Postgres (+ Redis hot layer)** (§2.3, §6.4). 중간 단계로 SQLite 시작 허용.

### 15.10 "challenge" vs "pattern" 용어 혼선

docx §9.2 "Save Setup Flow"는 `POST /api/engine/challenge/create`를 Save Setup의 엔드포인트로 기술. 그러나 Layer B에서 `capture`와 `challenge`는 다른 객체 (capture가 먼저, challenge는 capture 투영).

**해결:** **Layer B 용어 준수.** Save Setup = `capture` 생성 (`POST /api/terminal/pattern-captures` → engine `captures`). Challenge는 lab에서 projection 단계. docx의 `challenge/create` endpoint는 레거시 경로 — migration 대상.

### 15.11 Feature 개수 — 28 vs 92

- **Layer B 원본의 일부 (이전 설계)**: "28 features"
- **cogochi_pattern_engine_docx + PATTERN_ENGINE_DESIGN**: "**92 columns**"

**해결:** **92가 정본** (§7.6). 28은 이전 subset이었거나 다른 스키마. `feature_schema_version`으로 구분.

### 15.12 "플라이휠 4축" 용어

- **Layer B `core-loop.md` 구현 상태**: "플라이휠 4축 완료 (W-0088)" — Capture store / Outcome resolver / Verdict capture + API / Refinement trigger
- **Layer C 6 Plane + pattern-engine-runtime Split Ledger Planes 6개**와 다른 축 수

**해결:** 플라이휠 4축은 **Save Setup 닫힘 완성도** 관점의 milestone 묶음. Plane 6개는 아키텍처 관점. 서로 다른 단면 → 충돌 아님. §12.3에서 "4축 완료"로 기록 유지.

### 15.13 Retrieval 유사도 가중치

첨부 설계 노트 안에서 두 가지 다른 가중치 공식이 제시됨:

- **"final_similarity" 함수**: `feature * 0.45 + sequence * 0.45 + text * 0.10` (3요소)
- **"포인트 2. 유사도는 하나가 아니다"**: `feature * 0.35 + sequence * 0.40 + outcome_context * 0.15 + text/chart * 0.10` (4요소)

**해결:** **4요소 공식 채택** (§18.9). 이유:
1. `outcome_context_similarity`는 ledger가 있는 우리 제품 구조에서 진짜 차별화 요소 ("비슷한 사례 + 실제로 돈 됐는지")
2. 3요소 공식은 ledger 없는 단순 검색 엔진용 축약본
3. 초기 가중치는 이 값을 기본으로 시작하고, user judgment 누적 후 learned weight로 교체 (Slice 7, §18.14)

### 15.14 docx `challenge/create`를 Save Setup endpoint로 쓴 기술

- **cogochi_pattern_engine_docx §9.2**: Save Setup flow가 `POST /api/engine/challenge/create`로 끝남
- **Layer B §5 + §15.10에서 이미 해결**: Save Setup = `capture` 생성, `challenge`는 lab projection 단계

**Retrieval 관점 추가 해결:** docx가 "capture/challenge 단일화"로 간주한 건 **검색 씨앗(retrieval seed)으로서의 역할은 같아서** 생긴 혼동. §18.3에서 명확히 분리:
- `capture`: 저장된 차트 증거 (Layer B §5.3)
- `challenge`: evaluated hypothesis (Layer B §5.4)
- `PatternDraft`: Parser 출력, capture의 `similarity_seed` 필드에 저장 가능 (Layer C §18.3)
- **검색 씨앗은 셋 중 어느 것이든 될 수 있지만, 객체 정체는 다르다.**

---

## 16. Retrieval Plane — 자연어 → 유사 사례 검색

> **Plane 7 상세.** 제품의 "검색(retrieve) / 비교(compare)" 축. Plane 2 (Runtime)가 전 종목의 현재 phase를 추적한다면, Plane 7은 저장된 패턴/자연어 질의와 유사한 과거·현재 사례를 전 종목 × 전 구간에서 찾는다.
>
> **왜 별도 Plane인가:** Plane 1~6은 "지금 이 심볼이 어느 phase인가"를 실시간 감지. Plane 7은 "내가 저장한 이 setup이랑 비슷한 걸 찾아줘"에 응답. 둘은 **같은 feature store 위에서 직교**한다.

### 16.1 Retrieval 4단 파이프라인

```text
자연어 메모 (또는 capture_id)
  ├─ [Parser]             LLM function calling → PatternDraft JSON
  ├─ [QueryTransformer]   PatternDraft → SearchQuerySpec (signal → feature rule)
  ├─ [Candidate Gen]      SQL hard filter on feature_windows (top 100~500)
  ├─ [Sequence Matcher]   phase_path alignment (top 20~50)
  ├─ [Reranker]           LightGBM + final_similarity (top 5~10)
  └─ [LLM Judge] (선택)   chart+features를 받아 최종 검증 (top 3~5)

출력: RetrievalHit[]
```

**핵심 원칙 (첨부 기준):**
- LLM은 **전체 검색자가 아니라 파서 + 심판**. top-K 구간만 호출해서 비용 제어.
- **시퀀스 매칭이 핵심 경쟁력.** 단순 feature vector similarity만 쓰면 "지금 순간만 비슷한" false positive 대량 발생.
- **Negative set 필수.** Reranker가 진짜 강해지려면 "비슷해 보이지만 실패한 케이스"가 학습 라벨로 들어가야 함.

### 16.2 AI Parser — 자연어 → PatternDraft

**역할:** 트레이더의 자유 서술을 고정 스키마 JSON으로 구조화.

**입력 예:**
> "OI 급등 후 한 번 더 가격 급락, 15분봉 우상향 횡보 후 급등"

**출력:** §16.3 PatternDraft JSON

**필수 엔지니어링 (첨부 강조):**
1. **Structured output 강제.** LLM function calling / JSON schema / strict validation. 자유 텍스트 출력 금지.
2. **Vocabulary 제한.** 허용된 signal 24개(§16.5) 외 단어 사용 금지. 새 signal 이름 만들기 금지.
3. **Few-shot 설계.** 실제 트레이더 문장 20~50개 예시 + 잘못된 예시도 포함.
4. **Retry + validation loop.** JSON parse 실패 시 재요청. 잘못된 signal → reject.
5. **추정 금지.** 숫자가 명시되지 않으면 threshold 추정 없이 비워둠. 애매한 부분은 `ambiguities[]`에 기록.

**Parser 시스템 프롬프트 규칙 (고정):**
```text
주어진 트레이더 메모를 pattern parser로 해석하라.
반드시 지정된 JSON schema로만 출력하라.
signals는 허용된 vocabulary만 사용하라.
새로운 signal 이름을 만들지 마라.
애매한 부분은 ambiguities에 기록하라.
자유 서술 문장은 source_text와 evidence_text 외에는 금지한다.
```

### 16.3 `PatternDraft` 스키마

```python
@dataclass
class PhaseDraft:
    phase_id: str                          # "real_dump" 등 (§3.1 phase 이름 lowercase)
    label: str                             # 유저 노출 라벨
    sequence_order: int                    # 1..N
    description: str
    signals_required: list[str] = []       # §16.5 vocabulary만
    signals_preferred: list[str] = []
    signals_forbidden: list[str] = []
    directional_belief: str | None = None  # avoid_entry / event_confirmed / entry_zone / late_or_confirmed
    evidence_text: str | None = None       # 원문 발췌 인용 (자유 서술 허용)
    time_hint: str | None = None           # pre-event / event / post-event / confirmation
    importance: str | None = None          # high / critical / medium

@dataclass
class PatternDraft:
    pattern_family: str                    # oi_reversal, funding_squeeze_reversal 등
    pattern_label: str                     # 유저 명명
    source_type: str                       # manual_note / telegram_post / chart_annotation / voice_memo
    source_text: str                       # 원문 전체
    symbol_candidates: list[str]           # 문장에 나온 종목들
    timeframe: str | None                  # 명시되면 저장
    thesis: list[str]                      # 핵심 주장 1~4개
    phases: list[PhaseDraft]
    trade_plan: dict                       # §16.6 참조
    search_hints: dict                     # §16.7 참조
    confidence: float                      # 0.0~1.0
    ambiguities: list[str]                 # "arch_zone duration not explicit" 등
```

**용도:**
- Parser 출력 + 사람 편집 가능
- `capture.similarity_seed` 필드에 저장해서 재사용
- QueryTransformer 입력

### 16.4 `SearchQuerySpec` 스키마

QueryTransformer의 출력. 검색 엔진이 바로 읽는 포맷.

```python
@dataclass
class NumericConstraint:
    feature: str                 # "oi_zscore", "price_dump_pct" 등 (§7.6 92 feature)
    op: str                      # >, >=, <, <=, ==, between
    value: float | None = None
    value2: float | None = None  # op=between일 때 상한
    weight: float = 1.0          # 검색 점수 기여도

@dataclass
class BooleanConstraint:
    feature: str                 # "oi_spike_flag", "funding_flip_flag" 등
    expected: bool               # True 또는 False
    weight: float = 1.0

@dataclass
class PhaseQuery:
    phase_id: str
    required_numeric: list[NumericConstraint] = []
    required_boolean: list[BooleanConstraint] = []
    preferred_numeric: list[NumericConstraint] = []
    preferred_boolean: list[BooleanConstraint] = []
    forbidden_boolean: list[BooleanConstraint] = []

@dataclass
class SearchQuerySpec:
    pattern_family: str
    timeframe: str
    phase_path: list[str]               # ["fake_dump", "real_dump", "accumulation", "breakout"]
    phase_queries: list[PhaseQuery]
    must_have_signals: list[str]        # short-circuit hard filter용
    preferred_timeframes: list[str]
    exclude_patterns: list[str]         # negative exclusion
    similarity_focus: list[str]         # "sequence" / "oi_behavior" / "funding_transition"
    symbol_scope: list[str] = []        # 빈 리스트 = 전 유니버스
```

### 16.5 Signal Vocabulary (고정 24개)

**Parser 출력은 이 리스트 밖 단어 쓰면 reject.** 새 signal은 Change Policy (§17)를 따라야 추가 가능.

| Category | Signal | 의미 |
|---|---|---|
| **Price/Structure** | `price_dump` | 가격 급락 |
| | `price_spike` | 가격 급등 |
| | `fresh_low_break` | 새 저점 깨짐 |
| | `higher_lows_sequence` | 저점 연속 상승 |
| | `higher_highs_sequence` | 고점 연속 상승 |
| | `sideways` | 횡보 |
| | `upward_sideways` | 우상향 횡보 |
| | `arch_zone` | 아치/번지대 |
| | `bungee_zone` | (arch_zone 별칭) |
| | `breakout` | 돌파 |
| | `range_high_break` | 레인지 고점 돌파 |
| **OI** | `oi_spike` | OI 급등 |
| | `oi_small_uptick` | OI 소폭 증가 (0~3%) |
| | `oi_hold_after_spike` | 급등 후 OI 유지 |
| | `oi_reexpansion` | OI 재확장 |
| | `oi_unwind` | OI 급감 |
| **Funding** | `funding_extreme_short` | 펀딩 극단 음수 |
| | `funding_positive` | 펀딩 양수 |
| | `funding_flip_negative_to_positive` | 펀딩 음→양 전환 |
| **Volume** | `low_volume` | 평균 이하 거래량 |
| | `volume_spike` | 거래량 폭발 |
| | `volume_dryup` | 거래량 고갈 |
| **Flow/Positioning** | `short_build_up` | 숏 축적 |
| | `long_build_up` | 롱 축적 |
| | `short_to_long_switch` | 숏→롱 스위칭 |

### 16.6 `trade_plan` 구조

```python
@dataclass
class TradePlan:
    entry_phase: str                        # 보통 "accumulation"
    entry_trigger: list[str]                # signal vocabulary
    stop_rule: str                          # "break_last_higher_low" 등
    target_rule: str                        # "beam_50_100_pct" 등
    avoid_conditions: list[str]
    late_conditions: list[str]
```

### 16.7 `search_hints` 구조

```python
@dataclass
class SearchHints:
    must_have_signals: list[str]            # short-circuit filter
    nice_to_have_signals: list[str]
    phase_path: list[str]                   # 기대 phase 순서
    preferred_timeframes: list[str]         # ["15m", "1h"]
    exclude_patterns: list[str]             # negative
    similarity_focus: list[str]             # 어느 차원을 더 보라 ("sequence", "oi_behavior", "funding_transition")
```

### 16.8 `QueryTransformer` — SIGNAL_TO_RULES 매핑

PatternDraft의 signal을 실제 feature constraint로 변환. **이게 검색 엔진의 실제 심장.**

**SIGNAL_TO_RULES 테이블 (초기값, Slice 7에서 학습된 값으로 교체):**

| Signal | Constraint |
|---|---|
| `price_dump` | `price_dump_pct <= -0.05` (w=1.0) |
| `price_spike` | `price_pump_pct >= 0.05` (w=1.0) |
| `oi_spike` | `oi_spike_flag == True` (w=1.0) AND `oi_zscore >= 2.0` (w=0.8) |
| `oi_small_uptick` | `oi_change_pct between [0.0, 0.03]` (w=1.0) |
| `oi_hold_after_spike` | `oi_hold_flag == True` (w=1.0) |
| `oi_reexpansion` | `oi_reexpansion_flag == True` (w=1.0) |
| `oi_unwind` | `oi_change_pct <= -0.05` (w=1.0) |
| `funding_extreme_short` | `funding_extreme_short_flag == True` (w=1.0) AND `funding_rate_zscore <= -2.0` (w=0.8) |
| `funding_positive` | `funding_positive_flag == True` (w=1.0) |
| `funding_flip_negative_to_positive` | `funding_flip_flag == True` (w=1.0) |
| `low_volume` | `volume_zscore <= 1.0` (w=1.0) |
| `volume_spike` | `volume_spike_flag == True` (w=1.0) AND `volume_zscore >= 2.0` (w=0.8) |
| `volume_dryup` | `volume_dryup_flag == True` (w=1.0) |
| `higher_lows_sequence` | `higher_low_count >= 2` (w=1.0) |
| `higher_highs_sequence` | `higher_high_count >= 1` (w=1.0) |
| `upward_sideways` | `range_width_pct <= 0.08` (w=0.5) AND `higher_low_count >= 2` (w=1.0) |
| `sideways` | `range_width_pct <= 0.08` (w=1.0) |
| `arch_zone` / `bungee_zone` | `compression_ratio >= 0.5` (w=1.0) AND `volume_dryup_flag == True` (w=0.6) |
| `range_high_break` | `breakout_strength >= 0.01` (w=1.0) |
| `breakout` | `breakout_strength >= 0.01` (w=1.0) |
| `fresh_low_break` | `price_dump_pct <= -0.03` (w=0.8) |
| `short_build_up` / `long_build_up` / `short_to_long_switch` | 복합 규칙, Slice 7에서 정의 |

**변환 의사코드:**

```python
def transform_phase(phase: PhaseDraft) -> PhaseQuery:
    q = PhaseQuery(phase_id=phase.phase_id)
    for signal in phase.signals_required:
        for rule in SIGNAL_TO_RULES.get(signal, []):
            if isinstance(rule, NumericConstraint):
                q.required_numeric.append(rule)
            elif isinstance(rule, BooleanConstraint):
                q.required_boolean.append(rule)
    for signal in phase.signals_preferred:
        # 같은 규칙을 preferred 슬롯에 추가
        ...
    for signal in phase.signals_forbidden:
        # boolean rule만 forbidden_boolean으로 (numeric forbidden은 별도 처리)
        ...
    return q
```

**threshold는 고정 진리가 아님.** 초기값일 뿐이고, user judgment + ledger outcome으로 Slice 7에서 재학습.

### 16.9 Candidate Generation (Layer 1)

**목적:** 전 종목 × 전 과거 구간에서 "대충 이 패턴 가능성 있는 윈도우" 100~500개 추출.

**기술 선택 (첨부 권장):**
- Postgres / ClickHouse의 **SQL hard filter**
- feature_windows 테이블에 인덱스 (`symbol`, `timeframe`, `oi_spike_flag`, `price_dump_pct`, `btc_regime` 등)
- **pgvector ANN은 보조용.** 초기엔 SQL hard filter가 더 정확.

**SQL 예시 (SearchQuerySpec의 `must_have_signals` 기반 short-circuit):**
```sql
SELECT window_id, symbol, timeframe, window_start, window_end
FROM feature_windows
WHERE timeframe IN ('15m', '1h')
  AND oi_spike_flag = TRUE
  AND higher_low_count >= 2
  AND window_start >= NOW() - INTERVAL '2 years'
LIMIT 500;
```

**설계 원칙:**
- **빠른 필터 우선.** 정확도는 sequence matcher/reranker가 올린다.
- `exclude_patterns`에 대한 제외도 여기서.

### 16.10 Sequence Matcher (Layer 2, 핵심)

**목적:** candidate window들 각각이 `SearchQuerySpec.phase_path`를 얼마나 따르는지 점수화.

**왜 핵심인가:** feature similarity만으로는 "지금 순간 비슷"을 잡을 뿐. 패턴은 **시간 순서**가 본질.

**기술:**
- Phase path에 대한 **edit distance 또는 DTW-lite**
- Hidden Markov Model은 Day-1 과함
- 각 candidate window에 대해 사전 계산된 `phase_path` (Plane 2가 생산한 `Pattern State` 히스토리 활용)

**점수 요소:**

| 요소 | 가중치 (초기값) | 의미 |
|---|---:|---|
| phase path 일치 | +0.40 | 전이 순서 정확 |
| phase order 보존 | +0.20 | 건너뛰기 없음 |
| phase duration 유사 | +0.10 | 각 phase 체류 봉 수 비슷 |
| missing phase 패널티 | -0.20 | query에 있는데 candidate에 없음 |
| forbidden transition 패널티 | -0.20 | `signals_forbidden` 위반 |

**의사코드:**
```python
def sequence_similarity(
    query_phase_path: list[str],
    candidate_phase_path: list[str],
    query_phase_queries: list[PhaseQuery],
    candidate_windows: list[FeatureWindow],
) -> float:
    score = 0.0
    # phase path alignment
    overlap = sum(
        1 for i, phase in enumerate(query_phase_path)
        if i < len(candidate_phase_path) and candidate_phase_path[i] == phase
    )
    path_score = overlap / max(len(query_phase_path), len(candidate_phase_path))
    score += 0.40 * path_score

    # forbidden 위반 체크
    for phase_q, cand_win in zip(query_phase_queries, candidate_windows):
        for forbidden in phase_q.forbidden_boolean:
            if cand_win.features[forbidden.feature] == forbidden.expected:
                score -= 0.20

    # ... duration, order 등
    return max(0.0, score)
```

### 16.11 Reranker (Layer 3)

**목적:** top 20~50 candidate에서 진짜 비슷한 top 5~10 추출.

**기술 (단계별):**
1. **Day-1:** LightGBM Ranker + rule-based score ensemble
2. **Data 누적 후:** XGBoost Ranker (user judgment을 supervised label로)
3. **Later:** Cross-encoder LLM reranker (top-K만)

**Feature 입력:**
- `feature_similarity_score` (SIGNAL_TO_RULES 매칭 점수)
- `sequence_similarity_score` (§16.10)
- `timeframe_match` (bool)
- `phase_completeness` (query가 요구한 phase 다 있는지)
- `forbidden_violations_count`
- `outcome_similarity_score` (§16.12)
- `regime_match` (btc_regime 일치)

**학습 데이터 (해자 핵심):**
- Positive: user verdict = `valid`
- Negative: user verdict = `invalid` / `near_miss`
- Temporal: user verdict = `too_early` / `too_late`
- Ledger outcome: `HIT` / `MISS` / `EXPIRED`

→ 이게 §1.1 Design Rule 4 ("Save Setup = canonical capture event")가 retrieval 품질로 직결되는 지점.

### 16.12 Final Similarity Score

**4요소 공식 (§15.13 충돌 해결 결과):**

```python
final_similarity = (
    0.35 * feature_similarity +
    0.40 * sequence_similarity +
    0.15 * outcome_context_similarity +
    0.10 * text_chart_similarity
)
```

| 요소 | 계산 위치 | 의미 |
|---|---|---|
| `feature_similarity` | §16.8 SIGNAL_TO_RULES 매칭 | 현재 시점 수치 유사도 |
| `sequence_similarity` | §16.10 | phase path 일치도 |
| `outcome_context_similarity` | ledger 조회 | 유사한 btc_regime / timeframe / pattern_family에서의 실제 성과 일치 |
| `text_chart_similarity` | (선택) LLM judge | 차트 이미지 + 수치 컨텍스트 평가 |

**초기 가중치 근거 (첨부 "포인트 2"):**
- Sequence가 feature보다 높음: "한 순간 비슷"보다 "진행 경로 비슷"이 진짜 유사
- Outcome 15%: ledger 없는 검색엔진과의 차별화
- Text/chart 10%: 비용 높으니 top-K에만

**가중치는 Slice 7에서 user judgment + ledger outcome 기반으로 learned weight로 교체.**

### 16.13 LLM Judge (선택, 최종 검증)

**역할:** top 3~5에 대한 **최종 심판만**. 전체 검색자로 쓰면 비용 + 일관성 붕괴.

**입력 (필수 3종):**
- 차트 이미지 (또는 OHLCV slice)
- `feature_snapshot` (해당 window의 92 feature)
- `phase_path` + `key_signals`

**출력 스키마 (structured):**
```json
{
  "similarity": 0.82,
  "reason": "oi behavior + accumulation match",
  "difference": "breakout timing earlier",
  "verdict": "similar" | "partial" | "not_similar"
}
```

**Design rule:** 차트 스크린샷만 주면 안 됨. **feature + phase_path도 같이 줘야** 정확도 확보.

### 16.14 `RetrievalHit` 출력 스키마

```python
@dataclass
class RetrievalHit:
    hit_id: str
    symbol: str
    timeframe: str
    window_start: datetime
    window_end: datetime
    matched_phase_path: list[str]
    final_similarity: float           # §16.12
    feature_similarity: float
    sequence_similarity: float
    outcome_context_similarity: float
    text_chart_similarity: float | None
    judge_verdict: str | None         # LLM judge 결과 (있을 때)
    judge_reason: str | None
    judge_difference: str | None
    ledger_context: dict              # 이 window 이후 실제 outcome (있을 때)
    capture_link: str | None          # 기존 capture.id (있을 때)
    transition_link: str | None       # PhaseTransitionEvent.id
```

### 16.15 Retrieval Routes

Layer B §14.3에 추가됨. 여기는 payload 상세.

**`POST /api/terminal/retrieval/parse`** (app orchestrated → engine)
- Request: `{ "source_text": "...", "source_type": "manual_note", "timeframe_hint": "15m" }`
- Response: `{ "ok": true, "draft": <PatternDraft> }`
- Error: `{ "ok": false, "error": "vocabulary_violation", "reason": "...", "invalid_signals": ["..."] }`

**`POST /api/terminal/retrieval/search`** (app orchestrated → engine)
- Request (2가지 모드):
  - `{ "mode": "draft", "draft": <PatternDraft>, "top_k": 10 }`
  - `{ "mode": "capture_ref", "capture_id": "cap_123", "top_k": 10 }`
- Response: `{ "ok": true, "hits": <RetrievalHit[]>, "query_spec": <SearchQuerySpec> }`

**`POST /api/engine/retrieval/rerank`** (internal, worker-control용)
- top-K RetrievalHit 리스트를 받아 LightGBM reranker + 선택적 LLM judge 적용

### 16.16 Negative Set — "비슷해 보이지만 실패한 케이스"

**첨부에서 강한 요구:**

> "포인트 3. negative set이 중요하다. 진짜 잘 찾게 하려면 positive만 모으면 안 된다. 비슷해 보이지만 실패한 케이스가 있어야 reranker가 강해진다."

**필수 수집 대상:**
1. `fake_dump`에서 끝난 케이스 (accumulation 진입 실패)
2. `real_dump` 후 추가 하락 (accumulation 없이 계속 밀림)
3. `accumulation`처럼 보였지만 `breakout` 없던 케이스
4. `breakout` 직후 즉시 실패한 케이스

**저장 경로:**
- User verdict `invalid` / `near_miss` / `too_early`
- Ledger `outcome.auto_outcome == MISS`
- 자동 생성: phase timeout으로 `log_expired` 처리된 candidate

**Reranker 학습 시 negative:positive 최소 1:1 (권장 2:1).**

### 16.17 AutoResearch 3 Layer와의 매핑

Layer B §10 "Three AutoResearch Layers" + Layer C §7.2에서 언급된 3 layer가 retrieval 파이프라인의 어디에 대응하는지 명시.

| AutoResearch Layer | Retrieval Pipeline Stage | 구현 위치 |
|---|---|---|
| **Layer A. Feature Vector Similarity** | Candidate Generation + feature_similarity 점수 | §16.9 SQL + §16.8 SIGNAL_TO_RULES |
| **Layer B. Event Sequence Matching** | Sequence Matcher | §16.10 |
| **Layer C. LLM Chart Interpretation** | Optional LLM Judge | §16.13 |

즉 "AutoResearch 3 layer를 쌓는다"는 추상 원칙이 **Plane 7 pipeline의 3단계로 구체화**됨.

### 16.18 Plane 7 Implementation Status

**현재 상태:** 전체 Missing (§12.3 Gap 8).

**Partial로 존재하는 조각:**
- `engine/autoresearch_ml.py` — Paradigm Framework, 5-methodology scoring (feature similarity 기반, §12.3 참조)
- `engine/challenge/scanner.py` — cosine similarity on normalized feature vector (Layer A 원형)

**완전 Missing:**
- Parser (자연어 → PatternDraft)
- QueryTransformer (SIGNAL_TO_RULES 테이블)
- Signal vocabulary enforcement
- Sequence Matcher (phase_path alignment)
- LightGBM Reranker (user judgment 학습)
- LLM Judge (top-K 검증)
- Retrieval routes (`/retrieval/parse`, `/retrieval/search`)

### 16.19 Migration Order — Slice 7

§13 Migration Order에 추가할 Slice:

**Slice 7 — Retrieval Plane (Gap 8)**

**왜 Slice 2 직후 가능, Slice 6 전 권장:**
- Slice 2 (Durable State) 없으면 phase_path가 프로세스 재시작 시 무너져서 sequence matcher가 불안정
- Slice 6 (Alert Policy) 전에 하는 게 좋은 이유: retrieval은 alert와 독립 기능이고, 유저가 바로 가치 체감 가능 ("나 저장한 거 찾기")

**7A. Parser + Vocabulary 고정 (1~2주)**
- SIGNAL_TO_RULES 테이블 정의 (§16.8)
- Parser LLM 프롬프트 + JSON schema + validation loop
- `POST /retrieval/parse` 엔드포인트

**7B. Candidate + Sequence Matcher (2~3주)**
- feature_windows 테이블 + 인덱스
- SQL candidate generation
- Phase path alignment 알고리즘
- `POST /retrieval/search` 엔드포인트 (LightGBM reranker 없이)

**7C. Reranker 학습 데이터 누적 (데이터 의존)**
- User judgment / ledger outcome이 최소 100건 이상 쌓인 후
- LightGBM Ranker 학습 파이프라인
- Negative set 자동 수집 (§16.16)

**7D. LLM Judge (선택)**
- 7C 작동 후 top-K에만 호출
- 비용 모니터링 필수

**완료 기준:** 유저가 저장한 capture 하나에서 `POST /retrieval/search`로 과거 유사 사례 top 10을 90초 이내에 받아볼 수 있고, top-5의 precision이 60% 이상 (human-labeled eval 기준).

---

## 17. Engine Product Rule

우선순위가 헷갈릴 때 이 순서:

1. **Pattern semantics는 engine-owned, rule-first 유지.**
2. **ML을 강화하기 전에 런타임 state를 durable하게.**
3. **Save Setup을 canonical capture event로.** side action 아님.
4. **App 계약은 얇고 lossless.**
5. **Loop가 구조적으로 닫힌 뒤에만 ML이 score/calibrate/refine.**
6. **Retrieval은 "검색"이지 "생성"이 아니다.** Parser는 vocabulary에 가두고, 검색 결과는 반드시 실제 저장된 window/capture로 역추적 가능해야 한다.
7. **Retrieval의 LLM은 파서 + 심판만.** 전체 검색자로 쓰면 비용과 일관성이 무너진다.
8. **Negative set을 수집하지 않는 retrieval은 정확도 상한이 낮다.**

나머지는 전부 2순위.

---

## 18. Change Policy

1. 새 Plane 또는 새 Gap 발견 시 §2 + §12에 편집. 병렬 문서 생성 금지.
2. 새 Phase/Block/보조 엔티티 필드 추가 시 §4~§7 해당 섹션에 편집. Layer B §5.12 "보조 엔티티" 표가 같이 갱신되어야 함.
3. 구현률 변경은 §12만 갱신. 다른 문서는 건드리지 않는다 (drift 원인).
4. Layer B 계약 변경이 Layer C에 영향 시 §14 Cross-Reference 갱신.
5. Migration Order(§13)은 완료 시 "done" 표시만. 역순서 변경은 ADR로 별도 논의.
6. **Signal vocabulary (§16.5) 변경은 breaking change.** 새 signal 추가는 SIGNAL_TO_RULES (§16.8) 매핑도 같이 정의해야 함. 기존 capture의 `similarity_seed`와의 하위호환은 `feature_schema_version` + `vocabulary_version`으로 관리.
7. **Final similarity 가중치 (§16.12) 변경은 learned weight로 넘어간 후에만 자유롭게 조정.** 초기값 교체 전 일괄 변경은 A/B 테스트 + 문서화 필수.

