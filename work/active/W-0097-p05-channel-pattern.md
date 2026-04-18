# W-0097 P0.5 — 채널 패턴 → PatternLibrary 등록

## Goal

텔레그램 채널 분석에서 도출한 3-phase 패턴을 `engine/patterns/library.py` 에 공식 `PatternObject` 로 등록해 `PatternStateMachine` 이 탐지할 수 있게 한다.

## Owner

research / engine

## Why

온체인 빌딩블록(`coinbase_premium_positive`, `smart_money_accumulation`, `total_oi_spike`, `oi_exchange_divergence`)은 모두 등록됐지만, 이 블록들을 **순서 있게 묶은 패턴** 이 없어 state machine 이 탐지 단위로 다룰 수 없었다. P0.5 는 블록 → 패턴 전환 단계다.

## Scope (Slice 1 — 본 커밋)

### 등록된 패턴: `whale-accumulation-reversal-v1`

```
PHASE 1 — WHALE_ACCUMULATION (관망)
  required: oi_spike_with_dump + smart_money_accumulation + funding_extreme_short
  해석: 세력이 숏 쌓으면서 개인 롱 청산 유도 (강제 청산 cascade)

PHASE 2 — BOTTOM_CONFIRM (entry_phase)
  required: higher_lows_sequence + ls_ratio_recovery
  disqualifier: oi_spike_with_dump  (신규 덤프면 매집 무효화)
  soft: smart_money_accumulation, volume_dryup, bollinger_squeeze
  phase_score_threshold: 0.70, anchor ← WHALE_ACCUMULATION
  해석: 하락 멈춤 + 저점 상승 구조 + 숏 축소

PHASE 3 — ENTRY_CONFIRM (target_phase)
  required: coinbase_premium_positive + total_oi_spike
  optional: oi_exchange_divergence
  해석: 미국 기관 매수 + 전 거래소 동반 OI 상승 = 진짜 반등
```

### 변경된 파일

- `engine/patterns/library.py` — `WHALE_ACCUMULATION_REVERSAL` 정의 + `PATTERN_LIBRARY` 등록
- `engine/research/live_monitor.py` — `PHASE_ORDER` 에 새 phase 추가 (non-breaking)
- `engine/tests/test_whale_accumulation_reversal.py` — 19개 단위 테스트 (신규)

## Non-Goals (본 슬라이스 범위 외)

- `PROMOTED_PATTERNS` 등록 — 벤치마크 통과 후 별도 슬라이스
- Benchmark pack 구성 + `pattern_search` backtest — Slice 2
- `promote_candidate` 트리거 — Slice 3
- 채널 코인 사례 수집(BTC/FARTCOIN 등) — Slice 2 입력

## Facts

- 블록 3개(`smart_money_accumulation`, `coinbase_premium_positive`, `total_oi_spike`)는 2026-04-19 on-chain signal expansion 에서 이미 merge (PR #85/#88).
- `funding_extreme_short` alias 는 FFR 패턴에서 이미 등록됨.
- `oi_exchange_divergence` 기본값 `mode="low_concentration"` 가 bullish 케이스와 일치해 alias 불필요.

## Test Evidence

- `pytest tests/test_whale_accumulation_reversal.py` — 19 passed
- `pytest tests/test_funding_flip_reversal.py tests/test_patterns_state_machine.py tests/test_pattern_search.py tests/test_patterns_scanner.py tests/test_whale_accumulation_reversal.py` — 137 passed (regression green)
- 전체: **846 passed, 4 skipped** (main 기준 815 → +19 신규 + 기타 Phase 2 infrastructure 테스트)

## Exit Criteria

- [x] `WHALE_ACCUMULATION_REVERSAL` 가 `PATTERN_LIBRARY` 에 등록됨
- [x] 3-phase 순서 + entry/target phase 계약 고정
- [x] 패턴이 참조하는 모든 블록이 `block_evaluator._BLOCKS` 에 등록되어 있음(회귀 가드)
- [x] 전체 테스트 green

## Next Steps (후속 슬라이스)

1. **Slice 2 — Benchmark Pack 구성**
   - 채널에서 거론된 코인 사례 수집(BTC, FARTCOIN 등 OI cascade + smart money 매집 → 반등 사례)
   - `research/benchmarks/whale_accumulation/*.json` 생성
2. **Slice 3 — `pattern_search` backtest + promote_candidate**
   - `reference_score` 측정 (TRADOOR 대비)
   - 통과 시 `PROMOTED_PATTERNS` 에 등록 + `scan_all_patterns_live` 에 포함
