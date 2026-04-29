# W-0317 — Validation Pipeline Production Wiring

> Wave: 4 | Priority: P1 | Effort: M
> Status: 🟡 Design Draft
> Issue: #689
> Created: 2026-04-30
> Unblocks: W-0316 (discovery agent의 `validate_pattern` tool)

## Goal

`engine/research/validation/`의 12개 모듈(~3,200 LOC)이 현재 프로덕션에서 0회 호출된다. 이 W는 단일 진입점 `validate_and_gate()`를 통해 모든 모듈을 실제 discovery 경로에 연결하고, 가설 중복 추적·DSR trial count·BH-FDR 분모 관리를 포함한 프로덕션 등급 안전장치를 완성한다.

```
W-0316 discovery_agent
  → validate_pattern tool
  → facade.validate_and_gate(slug, pack, as_of)
  → run_validation_pipeline() [V-08, 12 modules]
  → evaluate_gate_v2()        [G1~G8]
  → HypothesisRegistryStore   [jsonl + flock]
  → TrialCounter              [per-family DSR n_trials]
  → GatedValidationResult     [overall_pass + grade + cost]
```

## Scope

### engine/research/validation/facade.py (신규, ~280 LOC)

```python
@dataclass(frozen=True)
class GatedValidationResult:
    slug: str
    overall_pass: bool          # G1 AND G2 mandatory + ≥4/8 gates pass
    gate_result: GateV2Result
    validation_report: ValidationReport
    hypothesis_id: str          # UUID, registry에 저장됨
    dsr_n_trials: int           # 해당 family의 누적 trial count
    stage: Literal["shadow", "soft", "strict"]
    computed_at: datetime

def validate_and_gate(
    slug: str,
    pack: ReplayBenchmarkPack,
    as_of: datetime | None = None,
    family: str = "default",
    existing_promotion_pass: bool = False,
) -> GatedValidationResult:
    """단일 진입점. 실패 시에도 GatedValidationResult 반환 (overall_pass=False).
    예외 절대 전파 안 함 — fail-closed."""
```

**핵심 로직**:
1. `VALIDATION_STAGE` env → stage 결정 (shadow/soft/strict, 기본 shadow)
2. `TrialCounter.increment(family)` → DSR n_trials 갱신
3. `run_validation_pipeline(pack=pack, ...)` 호출
4. `evaluate_gate_v2(validation_report, existing_promotion_pass)` 호출
5. `HypothesisRegistryStore.register(slug, result)` 적재
6. stage별 결과 조정: shadow → overall_pass 항상 True (관찰만)
7. 예외 catch-all → `GatedValidationResult(overall_pass=False, ...)`

### engine/research/validation/hypothesis_registry_store.py (신규, ~180 LOC)

**D-0317-2 결정: jsonl + fcntl.flock** (SQLite 불사용)

```python
class HypothesisRegistryStore:
    """append-only JSONL + flock. 동시 쓰기 안전."""
    
    def register(self, slug: str, result: GatedValidationResult) -> str:
        """hypothesis_id(UUID) 반환. 중복 slug = 재검증 기록."""
    
    def get_n_trials(self, family: str) -> int:
        """family 내 unique slug 수 반환 (DSR 분모)."""
    
    def list_active(self, exclude_older_than_days: int = 365) -> list[dict]:
        """BH-FDR 분모에 포함할 활성 가설 목록."""
    
    def archive_expired(self, older_than_days: int = 365) -> int:
        """365일 초과 항목 → _hypotheses_archive.jsonl 이동. BH 분모 제외."""
```

저장 위치: `state/hypothesis_registry.jsonl`
아카이브: `state/_hypotheses_archive.jsonl`

### engine/research/validation/trial_counter.py (신규, ~120 LOC)

**D-0317-Q2 결정: per-family n_trials** (DSR 정확도 최대화)

```python
class TrialCounter:
    """family별 독립 trial count. jsonl 기반."""
    
    def increment(self, family: str) -> int:
        """family 내 trial 수 +1 후 반환."""
    
    def get(self, family: str) -> int:
        """현재 family trial count."""
    
    def reset(self, family: str) -> None:
        """테스트 전용."""
```

family 예시: `"btcusdt_4h"`, `"ethusdt_1d"`, `"default"`

### engine/api/routes/research.py (수정 또는 신규, ~150 LOC 추가)

```python
POST /research/validate
# body: { slug, symbol, timeframe, family?, as_of? }
# response: GatedValidationResult.to_dict()
# rate limit: 20/day (validation은 비용 있음)
# 503 if VALIDATION_PIPELINE_ENABLED=false
```

기존 W-0316 `/research/discover` 파일과 동일 파일 확장 (있으면) 또는 신규.

### 파일 목록

**신규**:
- `engine/research/validation/facade.py`
- `engine/research/validation/hypothesis_registry_store.py`
- `engine/research/validation/trial_counter.py`
- `engine/tests/validation/test_facade.py`
- `engine/tests/validation/test_hypothesis_registry_store.py`
- `engine/tests/validation/test_trial_counter.py`

**수정**:
- `engine/api/routes/research.py` — POST /research/validate 추가
- `engine/research/validation/__init__.py` — facade export 추가
- `state/hypothesis_registry.jsonl` — (런타임 생성, gitignore)

**W-0316 연결 (수정)**:
- `engine/research/discovery_tools.py` — `validate_pattern` tool이 `facade.validate_and_gate()` 호출하도록

## Non-Goals

- SQLite/Postgres 스키마 변경 (jsonl로 충분, Charter 준수)
- 가설 UI (inbox MD 레벨로 충분, 별도 W)
- BH-FDR 재계산 스케줄러 (D+30 이후 별도 W)
- G1~G8 임계값 변경 (D-0316 §gates 그대로)
- 실거래 자동 트리거 (advisory only)
- 로컬 LLM용 validation (judge=API only 규칙 유지)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| run_validation_pipeline 레이턴시 (>5min) | Med | Med | async, timeout 300s, top_k=30 제한 |
| jsonl 동시쓰기 corruption | Low | High | fcntl.flock exclusive write, atomic tmp→rename |
| DSR trial count 과소 계산 | Med | High | per-family count + registry audit endpoint |
| shadow→strict 잘못된 gate 통과 | Low | High | stage별 결과 분리 저장 + brier calibration |
| facade exception 누출 | Med | High | catch-all → overall_pass=False, never raises |
| Lookahead bias (W-0313 동일) | Med | CRIT | `as_of` strict pass-through to run_validation_pipeline |

### Dependencies

- 의존 (read-only): `engine/research/validation/pipeline.py` `run_validation_pipeline()`
- 의존 (read-only): `engine/research/validation/gates.py` `evaluate_gate_v2()`
- 의존 (read-only): `engine/research/pattern_search.py` `ReplayBenchmarkPack`
- 신규 연결: `engine/research/discovery_tools.py` (W-0316) → facade
- 신규 연결: `engine/api/routes/research.py` → POST /research/validate

### Rollback

- `VALIDATION_PIPELINE_ENABLED=false` → facade 즉시 `overall_pass=False` 반환, API 503
- `VALIDATION_STAGE=shadow` → gate 결과 관찰만, 발견 block 없음
- jsonl 파일은 drop-safe (리셋 후 재적재 가능)
- 코드 revert 시 W-0316 discovery_tools fallback: `overall_pass=True` (no-op)

## AI Researcher 관점

### Stage 전환 전략 (D-0317-7 최적화)

**결정**: shadow 7d → soft 21d → strict 45d (가속 스케줄)

| Stage | 기간 | 동작 | `VALIDATION_STAGE` env |
|---|---|---|---|
| shadow | D+0~7 | overall_pass 항상 True, 결과만 기록 | `shadow` (기본) |
| soft | D+7~21 | gate fail → warning + 발견 score -0.3, block 안 함 | `soft` |
| strict | D+21+ | gate fail → 발견 완전 block, BH-FDR 적용 | `strict` |

**전환 방법**: ops가 `.env`의 `VALIDATION_STAGE` 변경 1줄 — 코드 배포 불필요. 런타임 매 호출마다 env 읽음.

가속 이유: 비용최적화 구조에서 shadow 기간이 길수록 낮은 품질 발견이 inbox에 도달. 7일 calibration으로 충분 (매일 1~5 findings × 7일 = 35~105 samples).

### Per-Family n_trials (D-0317-Q2 최적화)

DSR = Sharpe × √[(T-1)/(T)] × [(1 - γ₃×SR + γ₄/4×SR²)] / σ(SR_n)

σ(SR_n) depends on n_trials (number of strategies tried in same family).

**결정**: `family = f"{symbol}_{timeframe}"` (e.g., `"btcusdt_4h"`)

근거:
- BTCUSDT 4h의 50번째 패턴은 ETHUSDT 1d의 1번째 패턴과 독립적 trial
- Per-family가 DSR 분모를 가장 정확하게 추정
- `default` family = fallback (family 미지정 시)

### Horizon Bands (Q-0317-1 최적화)

**결정**: `[1, 4, 24, 72, 168]` hours (1h / 4h / 1d / 3d / 7d)

크립토 퍼프 표준:
- 1h: scalp / momentum burst
- 4h: swing setup
- 24h: 단기 트렌드
- 72h: 중기 구조
- 168h: 주간 bias

BH-FDR 분모 = 5 horizons × n_active_hypotheses. 5 horizons 이상은 correction이 지나치게 보수적.

### Hypothesis Archive (Q-0317-9 최적화)

**결정**: 365일 초과 → `_hypotheses_archive.jsonl`, BH 분모 제외

근거: 1년 이상 된 패턴은 시장 구조 변화로 독립 시험으로 볼 수 없음. BH 분모에서 제외해야 false negative 방지. `nightly_archive_expired()` cron 추가.

### Failure Modes

| Mode | 감지 | 대응 |
|---|---|---|
| run_validation_pipeline 예외 | try/except | overall_pass=False, error_msg 기록 |
| ReplayBenchmarkPack n=0 | n_samples<10 | confidence="insufficient", pass=False |
| jsonl flock timeout (>5s) | asyncio.timeout | skip registration, log warning |
| DSR trial count 폭주 (>500) | counter > 500 | cap at 500, log alert |
| VALIDATION_STAGE 잘못된 값 | enum validation | fallback to "shadow", log error |

## Decisions

- **[D-0317-1]** 진입점: **단일 `validate_and_gate()`** facade — 모든 모듈 조합 이 함수 1개로 진입
- **[D-0317-2]** 저장: **jsonl + fcntl.flock** (SQLite 불사용 — Charter, 비용 0, 마이그레이션 없음)
- **[D-0317-3]** fail-closed: **facade exception → overall_pass=False** (절대 raises 안 함)
- **[D-0317-4]** W-0316 연결: **`validate_pattern` tool이 facade 직접 호출** (중간 레이어 없음)
- **[D-0317-5]** Lookahead: **`as_of` strict pass-through** (W-0313 방어 재사용)
- **[D-0317-6]** Gate: **G1 AND G2 mandatory, + ≥4/8 pass** (기존 GateV2Config 그대로)
- **[D-0317-7]** Stage 전환: **shadow 7d → soft 21d → strict 45d** (가속, env 변경으로 전환)
- **[D-0317-8]** Family: **`{symbol}_{timeframe}`** per-family DSR trial count
- **[D-0317-9]** Horizon bands: **[1, 4, 24, 72, 168] hours** (크립토 퍼프 5-band 표준)
- **[D-0317-10]** Archive: **365일 → _hypotheses_archive.jsonl**, BH 분모 제외

## Open Questions

모든 Q가 위 Decisions에서 확정됨.

## Implementation Plan

1. **(0.5d)** `trial_counter.py` — per-family jsonl 기반 카운터, flock
2. **(1.0d)** `hypothesis_registry_store.py` — register/list_active/archive_expired, flock
3. **(1.5d)** `facade.py` — validate_and_gate(), stage 로직, fail-closed catch-all
4. **(0.5d)** `discovery_tools.py` (W-0316) — validate_pattern tool → facade 연결
5. **(0.5d)** `engine/api/routes/research.py` — POST /research/validate + 503 flag
6. **(1.0d)** `test_facade.py` — 10 assertions (shadow pass-through, strict gate, fail-closed, lookahead)
7. **(0.5d)** `test_hypothesis_registry_store.py` — 8 assertions (register, n_trials, archive, flock)
8. **(0.5d)** `test_trial_counter.py` — 5 assertions (per-family isolation, increment, reset)

**총 ~6.0d (Effort M)**

## Exit Criteria

- [ ] AC1: `VALIDATION_STAGE=strict` + G1 fail 패턴 → `overall_pass=False`, inlet 도달 전 block
- [ ] AC2: `VALIDATION_STAGE=shadow` + G1 fail 패턴 → `overall_pass=True` (shadow pass-through)
- [ ] AC3: facade 내부 예외(run_validation_pipeline crash) → `overall_pass=False` 반환, 예외 전파 없음
- [ ] AC4: 동일 slug 2회 등록 → hypothesis_registry에 2줄 (덮어쓰기 아님), n_trials=2
- [ ] AC5: family="btcusdt_4h" 50회 increment → DSR n_trials=50, family="ethusdt_1d" n_trials=0 (격리)
- [ ] AC6: 366일 된 항목 → `archive_expired()` 호출 후 BH 분모 미포함
- [ ] AC7: `POST /research/validate` → GatedValidationResult JSON 반환, schema 검증 PASS
- [ ] AC8: `VALIDATION_PIPELINE_ENABLED=false` → API 503, discovery_tools fallback overall_pass=True
- [ ] AC9: as_of=now → all entry_timestamps < as_of (Lookahead bias 방지, 1ms 후 inject 테스트)
- [ ] AC10: horizon_bands=[1,4,24,72,168] → ValidationReport에 5개 HorizonReport 존재
- [ ] AC11: jsonl 동시 10 writer → 데이터 손상 0건 (flock stress test)
- [ ] AC12: pytest 23+ assertions PASS (mock run_validation_pipeline, 실제 API 호출 없음)
- [ ] AC13: 기존 `engine/tests/validation/` 테스트 전부 GREEN (regression 없음)
