# Pattern Engine — 코어 설계 문서

> **한 줄 요약**: 트레이더가 수동으로 발견한 OI 반전 패턴을 바이낸스 전 종목에서 자동 감시하고, 진입 기회를 알리고, 결과를 누적해 스스로 학습하는 엔진.

---

## 1. 왜 만드는가 (배경)

TRADOOR, PTB를 직접 매매하면서 패턴을 발견했다. 세력이 숏을 체결시키며 가격을 누르고 (OI 급등 + 거래량 폭발), 이후 포지션을 롱으로 전환하면서 급등하는 구조. 지금은 이걸 손으로 차트를 보며 찾는다. 목표는 이 탐지를 자동화하고, 결과를 누적해 데이터 해자로 만드는 것이다.

---

## 2. 패턴 정의 — 5단계 State Machine

```
FAKE_DUMP → ARCH_ZONE → REAL_DUMP → ACCUMULATION ★ → BREAKOUT
```

| Phase | 이름 | 핵심 조건 | 판단 |
|---|---|---|---|
| 1 | `FAKE_DUMP` | 급락 + OI 소폭↑ + 거래량 적음 | 진입 금지 |
| 2 | `ARCH_ZONE` | 포물선 횡보 (번지대) | 저갱 대기 |
| 3 | `REAL_DUMP` | 급락 + **OI 대폭↑** + **거래량 폭발** | 세력 숏 진입 확인 |
| 4 | `ACCUMULATION` | 저점↑ + 펀딩비 음→양 전환 | ★ **진입 구간** |
| 5 | `BREAKOUT` | OI↑ + 가격 급등 | 이미 늦음 |

**Phase 1 vs Phase 3 구분 핵심**: OI 변화량 크기 + 거래량 폭발 여부.  
REAL_DUMP에서 OI가 크게 뛰지 않으면 이후에도 저점 갱신(-30%+) 가능. OI 급등이 동반된 하락은 보통 저점을 크게 갱신하지 않는다.

---

## 3. 빌딩 블록 — 새로 추가된 5개

기존 26개 블록에 추가. 모두 `ctx: Context`, `ctx.features[...]` 기준으로 구현.

### `oi_spike_with_dump`
```python
# 급락 + OI 급등 + 거래량 폭발 동시 감지 (Phase 3 핵심)
price_change_1h <= -threshold       # 예: -0.05
AND oi_change_1h >= oi_threshold    # 예: +0.10
AND vol_zscore >= vol_threshold     # 예: 2.0
```

### `higher_lows_sequence`
```python
# 저점이 연속으로 높아지는 구조 (Phase 4 조건)
rolling_min(low, window) > rolling_min(low, window).shift(window)
```

### `funding_flip`
```python
# 펀딩비 음수→양수 전환 (세력 롱스위칭 신호)
funding_rate[lookback bars ago] < 0 AND funding_rate[now] > 0
```

### `oi_hold_after_spike`
```python
# OI 급등 후 유지 — 포지션이 안 풀렸다는 확인
rolling_max(oi_change_1h, window) >= spike_threshold
AND oi_change_24h >= -collapse_threshold
```

### `sideways_compression`
```python
# 번지대(아치) 횡보 감지 (Phase 2 조건)
(rolling_high - rolling_low) / rolling_mid <= max_range_pct
```

---

## 4. 코어 루프 — 4개 레이어

```
Pattern Object
    ↓
State Machine  →  [ACCUMULATION 진입]  →  알림 발송
    ↓
Result Ledger  →  [BREAKOUT 도달?]  →  성공/실패 기록
    ↓
User Refinement  →  [valid/invalid 판정]  →  임계값 자동 조정
    ↑_______________________________________↑
           판정 10개 쌓이면 피드백 루프
```

### 4-1. Pattern Object
- TRADOOR 패턴 = 5단계 Phase 시퀀스로 구조화
- 각 Phase = 블록 조건 묶음 (required + disqualifier)
- 코드 하드코딩 라이브러리 (`engine/patterns/library.py`)

### 4-2. State Machine
- 전 종목 (~300개) 실시간 Phase 추적
- `symbol + pattern_slug + current_phase + entered_at + bars_in_phase` 추적
- ACCUMULATION 진입 시 알림 발송
- **현재 문제**: 메모리 singleton → 프로세스 재시작 시 상태 날아감

### 4-3. Result Ledger
- ACCUMULATION 이후 실제로 BREAKOUT 갔는지 자동 기록
- `entry record / outcome record / stats` 집계
- 성공률 / BTC 방향별 성과 / 평균 수익

### 4-4. User Refinement
- 유저가 valid/invalid 판정 10개 쌓이면
  - "OI threshold 15%로 올릴까요?" 자동 제안
  - 개인화된 버전 생성 → 개인 ledger 시작
- LightGBM per-user refinement (일부 `engine/scoring/trainer.py` 존재)

---

## 5. 오토리서치 3가지 레이어

세 방법은 대체가 아니라 **레이어로 쌓는 구조**다.

### 방법 1 — Feature Vector 유사도 (지금 동작)
- 92개 수치 벡터 비교
- 구현 쉬움. 단점: "느낌"을 못 잡을 수 있음

### 방법 2 — Event Sequence Matching (2주)
- 5단계 Phase 순서가 비슷한 종목 탐색
- 이 패턴에 최적화됨

### 방법 3 — LLM Chart Interpretation (목표, 가장 강력)
- 급등/급락 발생 시 차트 이미지 + 수치를 LLM에 넘겨서 패턴을 언어로 설명
- 그걸 구조화된 태그로 변환
- LLM 비용 있지만 진짜 해자가 됨

**핵심 철학**: 지금 수동으로 저장하는 패턴 데이터 = 나중에 LLM이 학습할 ground truth.  
`Save Setup`이 단순 UI가 아닌 이유.

---

## 6. 전체 데이터 흐름

```
트레이더 매매 복기 (언어)
    ↓
수치 정의 → 블록 31개
    ↓
바이낸스 ~300개 종목 → 블록 평가 (15분마다)
    ↓
State Machine Phase 추적
    ↓
ACCUMULATION 진입 → 알림
    ↓
차트 확인 → Save Setup → Challenge 저장 (ground truth 축적)
    ↓
BREAKOUT 도달 → Ledger 기록
    ↓
성공 데이터 누적 → LLM 훈련 재료
```

---

## 7. 현재 구현 상태

| 컴포넌트 | 파일 | 상태 |
|---|---|---|
| 새 블록 5개 | `engine/building_blocks/confirmations/` | ✅ 완료 |
| 동적 유니버스 (~300개) | `engine/universe/dynamic.py` | ✅ 완료 |
| Pattern Object / Library | `engine/patterns/types.py`, `library.py` | ✅ 완료 |
| State Machine (메모리) | `engine/patterns/state_machine.py` | ✅ 완료 |
| Scanner | `engine/patterns/scanner.py` | ✅ 완료 |
| Ledger (JSON) | `engine/ledger/store.py`, `types.py` | ✅ 완료 |
| API 엔드포인트 8개 | `engine/api/routes/patterns.py` | ✅ 완료 |
| ChartBoard (4패널) | `app/.../ChartBoard.svelte` | ✅ 완료 |
| PatternStatusBar | `app/.../PatternStatusBar.svelte` | ✅ 완료 |
| 터미널 통합 | `app/src/routes/terminal/+page.svelte` | ✅ 완료 |
| **Durable State (영속화)** | `engine/patterns/state_store.py` | ❌ **미구현** |
| **Save Setup → Capture** | capture plane 연결 | ❌ **미구현** |
| **Ledger Record Family** | entry/score/outcome 분리 | ⚠️ 부분 |
| **Pattern-specific ML** | pattern_slug 기준 모델 key | ❌ **미구현** |
| **Alert Policy** | shadow/visible/ranked/gated | ❌ **미구현** |
| **App Contract** | lossless proxy | ⚠️ 진행중 |

---

## 8. 빈 설계 — 7개 공백

### 8-1. Durable Pattern State Plane ❌ 최우선
**문제**: `state_machine.py` 상태가 프로세스 메모리에만 존재.  
재시작/멀티 인스턴스에서 어떤 종목이 ARCH_ZONE이었는지 날아감.

**해야 할 것**:
```python
# engine/patterns/state_store.py (신규)
# 저장 필드: symbol, pattern_slug, current_phase,
#            entered_at, bars_in_phase, last_transition_at
# 로컬: SQLite (JSONL → 이후 마이그레이션 가능)
# 스캔 시작 시 state restore
# phase transition 시마다 persist
```

### 8-2. Save Setup → Canonical Capture Plane ❌
**문제**: 지금 Save Setup은 UI 액션. pattern ledger/refinement와 완전히 안 묶임.

**저장해야 하는 것**:
```
symbol, pattern_slug, phase, timeframe,
chart snapshot context, user note,
candidate transition id or entry event id
```

이게 있어야:
- 결과와 연결 가능
- 유저 판정과 연결 가능
- LLM/ML 학습 데이터가 됨

### 8-3. Ledger Record Family 분리 ⚠️
지금 ledger가 너무 많은 책임을 짐.

```
entry_record     — 진입 이벤트
score_record     — ML 점수
outcome_record   — 결과 (BREAKOUT 도달 여부)
verdict_record   — 유저 판정
model_record     — 사용된 모델 버전
training_record  — 학습 실행 기록
```

처음부터 DB 불필요. JSON 구조만 논리적으로 분리해도 다음 단계가 쉬워짐.

### 8-4. Pattern-specific ML Identity ❌
**문제**: `entry_scorer.py`가 아직 generic `get_engine(user_id)` 사용.  
"유저 모델"이지 "패턴 모델"이 아님.

**모델 key 구조**:
```
pattern_slug + timeframe + target_name +
feature_schema_version + label_policy_version
```

예:
- `tradoor_oi_reversal_15m_breakout_v1_lp1`
- `btc_dominance_flip_1h_dump_v1_lp1`

### 8-5. Alert Policy Plane ❌
지금은 후보가 뜨면 거의 바로 UI로 간다.

```
State Machine → 진입 후보 생성
ML          → 점수 부여
Policy      → 보여줄지 결정

정책 상태:
  shadow   — 추적만, UI 노출 없음
  visible  — PatternStatusBar에 표시
  ranked   — 상위 N개만 표시
  gated    — 특정 조건 충족 시만
  paused   — 일시 중단
```

### 8-6. App Contract Discipline ⚠️
**문제**: `app/src/routes/api/patterns/+server.ts`가 엔진 데이터를 납작하게 바꾸고 일부 필드를 직접 만들어냄.

**원칙**:
- 엔진이 pattern truth를 가진다
- 앱은 보여주기만 한다
- 앱이 `phase_name`, `since`, `entry meaning` 등을 직접 만들면 안 됨

### 8-7. Canonical Pattern Registry ❌
지금 PatternObject가 코드 하드코딩으로만 존재.

**목표 구조**:
```
patterns/registry/
  tradoor_oi_reversal.json   ← phase 조건 + 블록 조건 + 임계값
  btc_dominance_flip.json
  ...
```
유저/팀이 새 패턴을 코드 수정 없이 추가 가능하게.

---

## 9. 6개 Plane 최적 구조

```
┌─────────────────────────────────────────────────┐
│  Pattern Definition Plane                        │
│  (PatternObject, PhaseCondition, Registry JSON) │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Pattern Runtime Plane                           │
│  (StateMachine + DurableStateStore)             │
│  → 전 종목 phase 추적, transition 이벤트 생성   │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Pattern Ledger Plane                            │
│  (entry / score / outcome / verdict records)    │
│  → 결과 누적, 성과 통계                         │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Pattern ML Plane                                │
│  (pattern-specific model key, LightGBM)         │
│  → 패턴별 점수 모델, 피드백 루프                │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Alert Policy Plane                              │
│  (shadow / visible / ranked / gated)            │
│  → ML 점수 + rule로 노출 결정                   │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  App Presentation Plane                          │
│  (PatternStatusBar, ChartBoard, /patterns page) │
│  → 엔진 truth를 thin하게 보여주기만             │
└─────────────────────────────────────────────────┘
```

---

## 10. 구현 우선순위

| 순서 | Slice | 이유 |
|---|---|---|
| 1 | **Durable Pattern State** | 이게 없으면 엔진이 장난감 수준. 재시작 = 초기화 |
| 2 | **Save Setup → Capture Plane** | ground truth 축적의 시작점. 없으면 ML도 없음 |
| 3 | **Ledger Record Family 분리** | capture랑 같이 해야 구조가 안 꼬임 |
| 4 | **App Contract Cleanup** | 엔진 확장할수록 앱이 발목 잡힘 |
| 5 | **Pattern-specific ML Registry** | 3번까지 되어야 학습 데이터가 생김 |
| 6 | **Alert Policy + Pattern Registry** | 마지막. 앞 5개가 닫혀야 정책이 의미 있음 |

---

## 11. 검증에서 발견된 오류 (이미 수정됨)

### Context API 불일치 (수정 완료)
```python
# 설계 문서에 쓰여 있던 잘못된 API
def my_block(ctx: SignalContext) -> bool:
    ctx.df     # 존재하지 않음
    ctx.perp   # 존재하지 않음

# 실제 API (이걸로 구현됨)
def my_block(ctx: Context) -> pd.Series:
    ctx.features["oi_change_1h"]
    ctx.features["price_change_1h"]
    ctx.klines  # OHLCV DataFrame
```

### 이미 존재했던 것 (새로 만들 필요 없었음)
- `autoresearch_ml.py`, `autoresearch_real_data.py`
- `ChallengeRecord`, `engine/challenge/` 전체
- LightGBM `engine/scoring/trainer.py`

→ 설계 문서가 기존 코드베이스를 과소평가했음.

### 차트 렌더링 버그 (수정 완료)
```
Before: loading=true → fetch → renderCharts() ← divs 없음! → loading=false
After:  loading=true → fetch → loading=false → tick() → renderCharts()
```
`{#if loading}` 블록이 chart div를 숨긴 상태에서 `renderCharts()`가 먼저 호출되어 즉시 return하던 문제. `tick()`으로 Svelte DOM 업데이트를 기다린 후 초기화하도록 수정.

---

## 12. 핵심 철학

> **지금 필요한 건 "더 똑똑한 탐지"가 아니라 "탐지를 누적 가능하게 만드는 구조"다.**

- 수동 레이블링 → AI 훈련 데이터. Save Setup이 데이터 파이프라인의 시작.
- 패턴 탐지 80%는 자동화 가능. 나머지 20% (시각적 품질 판단, 시장 레짐)는 유저 판단이 필요하고, 이게 오히려 해자가 됨.
- 엔진이 truth를 가진다. 앱은 얇게 유지한다.
- 절대란 없다. OI 급등 후에도 시장이 안 좋으면 저점 갱신 가능. 확률 게임임.
