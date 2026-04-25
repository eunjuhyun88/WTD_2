# Cogochi Alpha AI Agent — 최종 설계

> Work Item: **W-0116 Cogochi Alpha Agent**
> Depends on: W-0115 (Alpha data pipeline — merged 1ed5470)
> Status: 설계 확정 · 미구현

---

## Context

### 문제

W-0115에서 Alpha Universe 데이터 파이프라인을 완성했다 (DexScreener, BSCScan holder, alpha-presurge-v1 패턴, 37개 워치리스트, 38 tests pass). 하지만 파이프라인만으로는 Cogochi 유저에게 쓸모가 없다:

- **백그라운드 미작동**: Alpha 심볼이 어떤 universe에도 등록 안 됨 → 스캐너가 돌리지 않음
- **DEX/chain 피처 미연결**: `compute_features_table()`이 dex/chain 파라미터 모름 → alpha-presurge 블록들이 항상 기본값으로 평가
- **에이전트 루프 없음**: 유저가 물어봐야만 DOUNI가 도구로 실시간 fetch (reactive only)
- **화면 뿌리기 없음**: 페이즈 상태, 이상 신호, 진입 파라미터가 차트/UI에 노출 안 됨

### 왜 지금 하는가

Alpha (Binance Alpha → Futures 상장 펌프) 전략은 시간 의존적이다. SQUEEZE_TRIGGER는 수 시간 안에 전개되고 유저가 묻기 전에 감지해야 한다. 기존 DOUNI의 reactive + MAX_TOOL_ROUNDS=3 모델로는 지속 추적이 불가능하다.

### 설계 원칙 (AI 리서쳐 관점)

1. **관측(WHEN)과 추론(WHY) 분리**
   - 관측 = LLM 없음, 결정론적, 4h/30min/realtime 3-tier
   - 추론 = LLM, 관측된 World Model을 읽고 설명/예측
2. **새 테이블 금지** — 기존 `pattern_states` + `phase_transitions` + `PatternOutcome` 재사용
3. **새 에이전트 런타임 금지** — DOUNI 확장, 같은 SSE/LLM 인프라 사용
4. **World Model은 뷰이지 테이블이 아님** — 기존 상태 테이블 조회로 재구성
5. **스코프 분리**:
   - **Phase 1 (이번 W-0116)**: Observation + Reasoning + 자연어 조건 필터
   - **Phase 1.5 (이번 W-0116 확장)**: 텔레그램 레퍼런스 quick-win 블록 4개 (VWAP, RS vs BTC, OI acceleration, 5m momentum — 단, 5m은 bar 파이프라인 필요 시 제외)
   - **Phase 2 (W-0117+, 별도 문서)**: Realtime tier, Cross-exchange, Meta-classifier, 신규 데이터 소스 — `/Users/ej/.claude/plans/alpha-expansion-w0117plus.md` 참조

---

## 핵심 아키텍처

```
┌────────────────────────────────────────────────────────────┐
│  L5  COGOCHI UI                                            │
│       Alpha 탭 · Realtime 뱃지 · 차트 오버레이             │
└───────────────────────────┬────────────────────────────────┘
                            │ SSE + Supabase Realtime
┌───────────────────────────▼────────────────────────────────┐
│  L4  REASONING AGENT  (DOUNI 확장, LLM, on-demand)         │
│       Alpha 컨텍스트 자동 주입 · MAX_TOOL_ROUNDS 완화      │
│       도구 4개: World Model 조회, 상세, 이상 조사, watch   │
│       자연어 조건 필터 (find_tokens) ← Phase 1 포함        │
└───────────────────────────┬────────────────────────────────┘
                            │ 읽기 전용
┌───────────────────────────▼────────────────────────────────┐
│  L3  WORLD MODEL  (기존 테이블 뷰)                         │
│       pattern_states (symbol+slug+tf)                      │
│       phase_transitions (append-only, evidence 포함)       │
│       PatternOutcome (entry/exit 지속)                     │
│       + 신규: alpha_user_watches · alpha_anomalies         │
└───────────────────────────▲────────────────────────────────┘
                            │ 쓰기
┌───────────────────────────┴────────────────────────────────┐
│  L2  OBSERVATION ENGINE  (Python, 3-tier cadence)          │
│                                                            │
│  COLD (4h)   │ 전체 37개 Alpha 심볼                         │
│              │ DexScreener/BSCScan refresh                 │
│              │ full 페이즈 평가 + 이상 감지                │
│                                                            │
│  WARM (30min)│ pattern_states.phase ∈ {ACCUM, SQUEEZE}     │
│              │ klines+perp refresh (DEX 캐시 재사용)       │
│              │ 페이즈 재평가                               │
│                                                            │
│  HOT (realtime, Phase 2) │ SQUEEZE 심볼 websocket          │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│  L1  DATA SOURCES (W-0115에서 완성)                        │
│       Binance spot+perp · DexScreener · BSCScan            │
└────────────────────────────────────────────────────────────┘
```

---

## Scope 분리

### Phase 1 (이번 W-0116) — 반드시 동작

| 기능 | 달성 방법 |
|------|-----------|
| 알려진 패턴 (alpha-presurge-v1) 백그라운드 추적 | L2 Observation Engine COLD+WARM |
| 유저가 "IN 어때?" 물으면 근거와 함께 설명 | L4 Reasoning Agent (World Model 주입) |
| SQUEEZE_TRIGGER 발사 시 Cogochi 뱃지 푸시 | Supabase Realtime |
| 차트에 페이즈 마커 + DEX 오버레이 | chart_action SSE 확장 |
| **"세력매집 조건 + 음수펀딩 + LS 1.1 이상인 애들 지금 찾아줘"** | **find_tokens 도구** — 유저가 말한 조건을 기존 블록에 매핑해서 즉시 필터 |
| 이상 감지 (기존 패턴 미매치 + 강한 신호) | L2 anomaly 모듈 → alpha_anomalies 큐 |
| 유저별 watch 등록 | alpha_user_watches 테이블 |

### Phase 1.5 (이번 W-0116 확장) — 텔레그램 레퍼런스 quick-win 블록

> 배경: `tmp/telegram_refs/` 4개 HTML(ALPHA TERMINAL v3/v4, ALPHA HUNTER, 바이낸스 시그널 레이더) 분석 결과, 엔진 블록으로 즉시 래핑 가능한 3개 시그널이 누락되어 있음. feature_calc 레벨에서는 계산되고 있지만 block_evaluator에 등록 안 됨.

| 신규 블록 | 파일 | LOC | 의미 |
|-----------|------|-----|------|
| **`vwap_break`** | `building_blocks/confirmations/vwap_break.py` | ~25 | 가격이 12-bar VWAP을 돌파/이탈 (세력 평단가 기준). `feature_calc.py:_vwap_ratio` 재사용 |
| **`relative_strength_btc`** | `building_blocks/confirmations/relative_strength_btc.py` | ~30 | symbol 12h return − BTC 12h return. RS > +5% → "BTC 대비 초강세". 기존 `alt_btc_accel_ratio`는 가속도이고 이건 순수 return spread |
| **`oi_acceleration`** | `building_blocks/confirmations/oi_acceleration.py` | ~35 | 1H OI 변화 × 가격 변화 사분면 분류 (long-in / short-in / short-squeeze / long-panic). 기존 `oi_change`, `oi_expansion_confirm`과 구분되는 가속도 블록 |

각 블록은 `building_blocks/confirmations/__init__.py` 에 등록 + 테스트 3개씩.

**제외**:
- **5-min momentum composite** — 현재 1h/4h/1d만 지원. 5m 바 파이프라인 확장은 큰 작업(>300줄)이라 W-0117 HOT tier에서 묶어서 처리.

**Phase 1.5는 Phase 1 ①~⑭ 완료 후 별도 스프린트.** Alpha 블록 인벤토리 확장이 주 목적이고 alpha-presurge-v1 패턴에 직접 주입하지는 않음 (유저가 `find_tokens`로 자연어 조합할 수 있게만).

---

### Phase 2 (W-0117~W-0120, 별도 문서) — 설계만 포함, 구현 제외

상세 설계는 `/Users/ej/.claude/plans/alpha-expansion-w0117plus.md` 참조. 요약:

| Work Item | 주제 | 핵심 |
|-----------|------|------|
| **W-0117** | Realtime HOT tier + 5m 바 인프라 | Binance websocket (forceOrder, miniTicker, aggTrade, depth5) · 5m klines 파이프라인 · 5m momentum composite |
| **W-0118** | Cross-exchange intelligence | MEXC + Bitget FR/volume · "MEXC 선행" 시그널 · 3-exchange consensus |
| **W-0119** | Setup-tag meta-classifier | 3-stage pipeline (conflict → conditional → synergy) · PRE_PUMP(6-trigger)/PRE_DUMP(7-warning) compound · sector 2-pass averaging |
| **W-0120** | 신규 데이터 소스 확장 | Mempool pending Tx · BTC avg_tx_value whale flow · Binance Alpha token list 자동 동기화 |
| **W-01XX** | Pattern Author Agent | 유저 자연어 → PatternObject 컴파일 · 백테스트 · 차트 매치 히스토리 · `user_patterns` 테이블 (별도 work item) |

---

## Phase 1 구현 목록 (14개 + 1개)

파일 경로와 추정 LOC.

### L2 — Observation Engine

**① `engine/scanner/feature_calc.py`** (수정, +15줄)
- `compute_features_table(…, dex=None, chain=None)` 파라미터 추가
- 기존 macro/onchain `_align_bundle` 패턴 그대로 복제
- `DEX_SOURCES`, `dex_defaults()`, `CHAIN_SOURCES`, `chain_defaults()` 재사용

**② `engine/universe/loader.py`** (수정, +5줄)
- `load_universe_async("alpha")` 케이스 추가
- `data_cache.fetch_alpha_universe.get_watchlist_symbols()` 호출 (grade filter 없음 → 37개)

**③ `engine/scanner/jobs/alpha_observer.py`** (신규, ~100줄)
- COLD tier, 4h APScheduler 잡
- 각 심볼마다:
  - `load_klines`, `load_perp`, `load_dex_bundle(refresh=True)`, `load_chain_bundle(refresh=True)`
  - `compute_features_table(dex=…, chain=…)`
  - `evaluate_blocks()` → triggered 리스트
  - `compute_phase_confidence()` 호출
  - 패턴 state machine 진입 (기존 `patterns/scanner.py:evaluate_symbol_for_patterns` 재사용)
  - `detect_anomalies()` 호출 → `alpha_anomalies` INSERT
- 스케줄러 등록은 `engine/scanner/scheduler.py`에 추가

**④ `engine/scanner/jobs/alpha_warm.py`** (신규, ~60줄)
- WARM tier, 30min APScheduler 잡
- `pattern_states.current_phase ∈ {ACCUMULATION_ZONE, SQUEEZE_TRIGGER}` AND `pattern_slug = 'alpha-presurge-v1'`인 심볼만
- klines + perp만 fresh fetch, DEX/chain은 cache에서 로드
- 페이즈 state machine 재평가
- 전환 감지 시 알림 트리거

**⑥ `engine/patterns/confidence.py`** (신규, ~40줄)
- `compute_phase_confidence(phase: PhaseCondition, blocks_fired: set[str]) -> float`
- 공식:
  - disqualifier 발동 → 0.0
  - base = (required_fired + required_any_groups_fired) / (len(required) + len(groups))
  - bonus = (optional_fired / max(len(optional), 1)) × 0.20
  - return min(base + bonus, 1.0)
- `patterns/state_store.py`의 PhaseTransition 생성 시 `confidence=` 에 주입

**⑦ `engine/data_cache/freshness.py`** (신규, ~40줄)
```python
@dataclass
class DataFreshness:
    symbol: str
    klines_last_ts: datetime | None
    dex_cache_mtime: datetime | None
    chain_cache_mtime: datetime | None
    dex_age_hours: float
    chain_age_hours: float
    is_fresh: bool  # 모든 소스가 기대 주기 내
```
Observation Engine이 매 관측마다 계산 → `pattern_states.data_quality_json`에 기록.

**⑧ `engine/patterns/anomaly.py`** (신규, ~70줄)
- `detect_anomalies(symbol, features_df, lookback_days=30) -> list[Anomaly]`
- 대상 피처: `dex_buy_pct`, `funding_rate`, `taker_buy_ratio_1h`, `long_short_ratio`, `holder_top10_pct`, `volume_zscore_20`
- 단일 피처 |z| > 2.5 → medium, > 3.5 → high
- 조합 이상: 알려진 패턴 미매치 + 블록 3+ 발화 → `investigation_required`
- `alpha_anomalies` 테이블 INSERT

### L3 — World Model / API

**⑨ `engine/migrations/alpha_tables.sql`** (신규)
```sql
CREATE TABLE alpha_user_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  symbol text NOT NULL,
  target_phase text NOT NULL,
  min_confidence float DEFAULT 0.70,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days',
  triggered_at timestamptz,
  notify_channels text[] DEFAULT array['cogochi']
);

CREATE TABLE alpha_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  feature text NOT NULL,
  z_score float,
  severity text,         -- 'medium' | 'high' | 'investigation_required'
  description text,
  evidence jsonb,
  observed_at timestamptz DEFAULT now(),
  investigated bool DEFAULT false,
  investigation_result text
);
```

**⑩ `engine/api/routes/alpha.py`** (신규, ~120줄)
- `GET /alpha/world-model` — 37 심볼 × 현재 페이즈 + confidence + evidence 요약
  - Data source: `pattern_states` JOIN `phase_transitions`(최신)
- `GET /alpha/token/{symbol}` — 상세 (evidence, 최근 전환 이력, 최신 피처 스냅샷)
- `GET /alpha/token/{symbol}/history?since=…` — `phase_transitions` 조회
- `GET /alpha/anomalies?investigated=false` — 이상 신호 큐
- `POST /alpha/watch` — `alpha_user_watches` INSERT
- `POST /alpha/find` — **자연어 조건 필터 (Phase 1 핵심)**
  - body: `{conditions: [{block_name, params}, ...], min_match: N}`
  - 응답: 매치된 심볼 리스트 + 각각의 evidence

### L4 — Reasoning Agent (DOUNI 확장)

**⑪ `app/src/lib/server/douni/contextBuilder.ts`** (수정, ~60줄)
- `profile: 'alpha' | ...` 모드 추가
- Alpha 모드에서:
  - `GET /alpha/world-model` 호출 → 시스템 프롬프트에 현재 상태 테이블 주입
  - `GET /alpha/anomalies?investigated=false` → 이상 큐 요약 주입
  - 최근 24h 전환 요약 (`phase_transitions` last 24h) 주입
  - STATIC (mission, tool docs) → Anthropic prompt cache
  - DYNAMIC (state table) → 4h 주기 캐시
- `MAX_TOOL_ROUNDS` → Alpha 컨텍스트는 6으로 완화 (`scan_market` 대신 `find_tokens` 쓰기 때문에 빈번한 루프 없음)

**⑫ `app/src/lib/server/douni/tools.ts`** (수정, +4 도구)
```typescript
get_alpha_world_model(grade?: "A"|"B"|"all")
  → { phases: { [symbol]: PhaseSummary }, anomalies: [...] }

get_alpha_token_detail(symbol: string)
  → { evidence, phase_history[], freshness, phase_confidence }

find_tokens(conditions: Array<{
  block?: string,          // 기존 69 블록 중 이름
  feature?: string,        // 피처 직접 비교
  op?: "gte" | "lte" | "eq" | "neg" | "pos",
  value?: number,
  persist_bars?: number    // 최소 지속 바
}>, universe?: "alpha" | "all")
  → { matches: Array<{ symbol, evidence, score }> }
```
- `find_tokens`는 `/alpha/find` 호출, 내부에서 `evaluate_block_masks()` 재사용하여 즉시 필터
- `set_watch(symbol, target_phase, min_confidence?)` — `/alpha/watch` POST

**⑬ `app/src/components/terminal/.../ChartBoard.svelte`** (수정, ~80줄)
- 새 chart_action 핸들러:
  - `add_phase_marker(symbol, timestamp, phase, label, color)` — LightweightCharts `createPriceLine` or `setMarkers`
  - `add_level_line(price, label, kind: "entry"|"target"|"stop")` — 수평선
  - `add_subpane(indicator: "dex_buy_pct"|"funding_rate"|"ls_ratio", color)` — 하단 패널
- 차트 전환 시 이전 Alpha 오버레이 자동 제거

### L5 — Cogochi UI

**⑭ `app/src/routes/terminal/+page.svelte` + `ScanGrid.svelte`** (수정)
- 상단에 Alpha 탭 추가 (`ALL | ALPHA ▲ | SHORT ↓`)
- ALPHA 탭 활성화 시:
  - `ScanGrid`가 `pattern_slug = 'alpha-presurge-v1'` 로 필터링
  - Supabase Realtime 구독 (`pattern_states` 변경 or `engine_alerts` WHERE universe='alpha')
  - 뱃지 뱃지 (SQUEEZE_TRIGGER 진입 시 빨간 점)
- 심볼 클릭 → 기존 분석 flow + DOUNI에 `profile: 'alpha'` 전달

---

## Key Design Decisions

### 왜 새 테이블을 최소화하나

기존 인프라에 이미 있는 것:

| 요구 | 기존 테이블 |
|------|-------------|
| 심볼별 현재 페이즈 + confidence | `pattern_states` (PK: symbol+pattern_slug+tf) |
| 전환 이력 + evidence + block_scores | `phase_transitions` (append-only) |
| 진입/청산/피크 가격 지속 | `PatternOutcome` (entry_price, peak_price, ...) |
| 알림 정책 + 모드 + ML 게이팅 | `PatternAlertPolicy` (shadow/visible/gated) |
| 엔트리 점수 (p_win) | `entry_scorer.py` + `ModelRegistry` |

**신규 테이블은 2개만**: `alpha_user_watches` (유저별 알림), `alpha_anomalies` (이상 신호 큐).

### 왜 DOUNI를 확장하나, 새 에이전트를 만들지 않나

DOUNI가 이미 제공:
- SSE 스트리밍 프로토콜 (text_delta, tool_call, chart_action, done)
- 멀티 프로바이더 LLM 폴백 (llmService.ts)
- 컨텍스트 압축 (contextBuilder.ts)
- 8개 도구 실행기 (toolExecutor.ts)
- 가드레일 + 감사 로그

Alpha Agent는 **프로필 모드 추가 + 도구 4개 + 컨텍스트 주입 변경**이면 된다. 새 엔드포인트 `/agents/alpha/chat` 만들 이유 없음.

### 왜 WORLD MODEL은 뷰인가, 테이블이 아닌가

모든 정보가 이미 `pattern_states` + `phase_transitions`에 있다. 매 조회마다 JOIN하면 되고, materialized view도 필요 없다 (37개 × 15개 패턴 = 최대 555 row).

### 왜 Phase 1에서 find_tokens만 넣나

유저의 3가지 확장 요청 중:

| 요청 | Phase |
|------|-------|
| "조건 찾아줘" (즉시 필터) | 1 — `find_tokens` |
| "패턴으로 저장" | 2 — `user_patterns` 테이블 필요 |
| "과거 승률" (백테스트) | 2 — `backtest/user_pattern.py` 필요 |
| "맞은 케이스 차트로" | 2 — chart history API 필요 |

Phase 2는 Phase 1 위에 얹는다. Phase 1만 있어도 "조건 찾아줘"는 자연스럽게 동작한다.

---

## Critical Files to Read (구현자 참조)

재사용 + 확장 대상:
- `engine/scanner/feature_calc.py:1227` — `compute_features_table()` 시그니처 (dex/chain 추가 지점)
- `engine/scanner/feature_calc.py:1548` — `_align_bundle()` 패턴 (DEX/chain 복제 대상)
- `engine/universe/loader.py` — `load_universe_async()` (alpha 케이스 추가)
- `engine/patterns/scanner.py:evaluate_symbol_for_patterns` — 재사용
- `engine/patterns/state_store.py` — `pattern_states`, `phase_transitions` 스키마
- `engine/patterns/types.py` — PhaseCondition, PatternObject
- `engine/patterns/alert_policy.py` — `evaluate_alert_policy()`, AlertPolicyMode
- `engine/data_cache/registry.py` — `DEX_SOURCES`, `CHAIN_SOURCES`, `dex_defaults()`, `chain_defaults()` (W-0115에서 추가됨)
- `engine/data_cache/loader.py` — `load_dex_bundle`, `load_chain_bundle` (W-0115)
- `engine/data_cache/fetch_alpha_universe.py` — `get_watchlist_symbols()` (W-0115)
- `engine/scoring/block_evaluator.py` — `evaluate_blocks`, `evaluate_block_masks` (find_tokens 핵심)
- `engine/patterns/library.py:1083` — `ALPHA_PRESURGE` (W-0115)
- `app/src/lib/server/douni/contextBuilder.ts` — `buildContext()`
- `app/src/lib/server/douni/tools.ts` — ToolDefinition 추가 지점
- `app/src/lib/server/douni/toolExecutor.ts` — 도구 실행 패턴
- `app/src/routes/api/cogochi/terminal/message/+server.ts` — SSE 스트리밍, MAX_TOOL_ROUNDS
- `app/src/components/terminal/` — ChartBoard, ScanGrid, terminal/+page.svelte

---

## Verification

### 테스트 계층

**① 엔진 유닛 테스트** (`engine/tests/`)
- `test_feature_calc_dex_chain.py` — `compute_features_table(dex=…, chain=…)` 컬럼 합쳐짐 확인
- `test_alpha_observer.py` — mock universe로 `scan_alpha_observer_job()` 1회 돌림 → `pattern_states` row 37개
- `test_phase_confidence.py` — 위 공식 여러 케이스 (disqualifier, 부분 충족, 풀 optional)
- `test_anomaly_detection.py` — synthetic z-score 시리즈로 medium/high/investigation 분류
- `test_freshness.py` — cache mtime 고정 후 stale/fresh 판정

**② API 통합 테스트**
- `pytest tests/test_alpha_api.py` — FastAPI TestClient로 `/alpha/world-model`, `/alpha/find` 응답 shape
- `POST /alpha/find` with `{conditions: [{block: "dex_buy_pressure", params: {threshold: 0.6}}]}` → 예상 심볼 리턴

**③ 엔드투엔드** (구현 이후)
```
1. alpha_observer 수동 실행:
   python -m scanner.jobs.alpha_observer
2. pattern_states 확인:
   select symbol, current_phase, phase_confidence 
   from pattern_states where pattern_slug='alpha-presurge-v1';
3. Cogochi 실행:
   pnpm dev
   /terminal 페이지 열고 "Alpha" 탭 클릭
   SSE 스트리밍으로 World Model 테이블 도착 확인
4. 자연어 필터 테스트:
   유저: "DEX 매수 60% 이상이고 펀딩 음수인 토큰"
   → AI가 find_tokens 도구 호출
   → 매치된 심볼 + evidence 응답
5. 차트 오버레이:
   유저가 매치 심볼 클릭 → ChartBoard로 이동
   → dex_buy_pct subpane + 페이즈 마커 렌더링 확인
```

**④ 벤치마크 (선택)**
- `alpha_observer` 1회 실행 시간 (37 심볼 × 4 데이터소스): 목표 <60s
- `find_tokens` 평균 응답 시간: 목표 <500ms (37 심볼 pre-computed features 기반)

---

## Out of Scope (Phase 2로 연기)

- 유저 자연어 → 새 PatternObject 컴파일 저장 (`patterns/dsl.py`)
- 저장된 유저 패턴을 스캐너가 실행 (`scanner/jobs/user_pattern_scan.py`)
- 유저 패턴 백테스트 + 성능 리포트
- "맞은 케이스 차트로 보여줘" — 과거 매치 오버레이
- HOT tier realtime websocket 스트리밍
- Pattern Author의 LLM-driven 블록 생성 (기존 69 블록 밖 새 블록 제안)

Phase 2는 별도 work item (W-01XX)으로 분리, Phase 1 안정화 후 착수.

---

## 구현 순서 제안

```
Week 1:  ①②③⑥⑦          엔진 코어 (COLD observer + freshness + confidence)
Week 2:  ④⑨⑩              WARM tier + Supabase migrations + API 엔드포인트
Week 3:  ⑧⑪⑫              이상 감지 + DOUNI Alpha 컨텍스트 + find_tokens 도구
Week 4:  ⑬⑭                ChartBoard 오버레이 + Cogochi Alpha 탭 + Realtime
```

총 LOC 추정: ~750줄 (엔진 ~400, 앱 ~350).
