# W-0257 — MM Hunter Augment Priority B1: D2 Forward Return Horizon Parametrization

> Wave: MM Hunter Track 2 | Priority: **P1** (M3 출시 전) | Effort: **S-M (1.5d)**
> Charter: ✅ In-Scope L5 Search
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-27 by Agent A045
> Depends on: W-0256 augment 머지 (PromotionGatePolicy 신규 필드 추가 후)

---

## Goal (1줄)

W-0252 audit에서 식별된 🟡 갭 D2 (forward return horizon이 48 bars 하드코딩)를 **augment-only**로 해소하여 V-02 phase_eval (#440)이 4h primary horizon을 명시적으로 사용할 수 있게 한다.

## Scope

### 포함
- `PromotionGatePolicy`에 `horizon_label: str = "default"` 필드 추가 (값: `"default" | "1h" | "4h" | "24h"`)
- timeframe → bars 매핑 함수 추가 (`engine/research/pattern_search.py` 또는 신규 utility)
- `evaluate_variant_on_case`에서 horizon_label이 명시되면 4h primary로 변환
- backward-compatible: default="default"이면 기존 48 bars 유지

### Non-Scope
- ❌ V-02 phase_eval 모듈 자체 수정 (별도 PR — A1 wrapper에서 호출)
- ❌ Multi-horizon 동시 측정 (1h+4h+24h 동시 — 별도 work item)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 4h horizon 변환 시 timeframe 별 bars 계산 오류 | 중 | 중 | unit test로 1h/4h/24h × {15m, 1h, 4h} timeframe 매트릭스 검증 |
| W-0256 머지 전에 본 작업 시작 → conflict | 중 | 낮 | dependency 명시, W-0256 머지 후 시작 |

### Dependencies
- 선행: W-0256 (PromotionGatePolicy에 cost 필드 추가 후 진행, conflict 회피)
- 차단 해제: V-02 phase_eval (#440)이 4h primary 명시적 측정 가능

### Files Touched (예상)
- `engine/research/pattern_search.py`: PromotionGatePolicy + 1 field, _measure_forward_peak_return + 1 인자
- `engine/tests/test_w0257_d2_horizon.py` (신규)

## AI Researcher 관점

### Statistical Validation
- 4h horizon 측정 시 52 PatternObject의 forward_peak_return_pct 평균값이 48-bars 측정과 비교해 변동 확인
- threshold: drift이 50% 이상이면 horizon 정의 오류 의심

### Failure Modes
1. **Type-1**: `horizon_label="4h"`일 때 변환된 bars가 48보다 작음 (예: 4h timeframe에서 4h horizon = 1 bar) → 의미 없는 측정
   - 완화: `min_horizon_bars=4` guard 추가 (1 bar 이하 시 skip)

## Decisions

| ID | 결정 |
|---|---|
| D-W0257-1 | horizon_label = string ("default", "1h", "4h", "24h") | enum class (✗ over-engineering); Literal 타입 (✓ Python 3.10+ 지원하나 enum 변환 부담) |
| D-W0257-2 | bars 매핑 함수 = pattern_search.py 내부 utility | 별도 모듈 (✗ 현재 사용 1곳, over-modularization) |

## Open Questions

- [ ] Q1: `horizon_label="default"` 시 기존 48 bars 유지 vs `entry_profit_horizon_bars` 인자 우선?
- [ ] Q2: 4h horizon이 timeframe별 bars로 변환될 때, bars=1 같은 의미 없는 값 발생 시 fallback 동작?

## Exit Criteria

- [ ] AC1: PromotionGatePolicy에 `horizon_label` 필드 추가
- [ ] AC2: timeframe → bars 매핑 함수 + 단위 테스트 9 cases (3 horizons × 3 timeframes)
- [ ] AC3: backward-compatible — default 동작 시 기존 통과율 동일
- [ ] AC4: PR diff `pattern_search.py` 함수 signature 변경 0건 (필드 + 인자만 추가)

## References

- 본 설계 선행: W-0252 audit (`docs/live/W-0252-v00-audit-report.md`) §3 D2
- W-0256 augment (선행 머지 필수): `work/active/W-0256-mm-hunter-augment-priority-a.md`
- W-0214 D2 lock-in: `memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md`
