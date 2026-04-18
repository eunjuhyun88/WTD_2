# W-0091 — Second Pattern: Funding Capitulation Reversal

## Goal

두 번째 패턴을 발굴해서 시스템이 단일 패턴(TRADOOR)에 의존하지 않음을 증명한다.
`funding-flip-reversal-v1`: 펀딩 극단 마이너스(숏 과적재) → 압축 → 펀딩 플립 → 숏 스퀴즈 진입 구간.

## Owner

research

## Why This Pattern

- TRADOOR = OI 급등 + 이중 급락 시퀀스 (dump-driven)
- 이 패턴 = 펀딩 rate 극단 → 플립 (funding-driven) — 완전히 다른 메커니즘
- KOMA/DYM이 TRADOOR 완성 실패에도 수익 (+15%/+7%) → 이 패턴이 더 맞을 가능성 높음
- 빌딩블록 전부 존재: `funding_extreme`, `funding_flip`, `positive_funding_bias`, `oi_expansion_confirm`, `sideways_compression`, `volume_dryup`

## Five-Phase Structure

| Phase | Name | Key Blocks | Trading Meaning |
|---|---|---|---|
| 1 | `SHORT_OVERHEAT` | `funding_extreme(short_overheat)` | 숏 과적재 확인. 관망 |
| 2 | `COMPRESSION` | `sideways_compression` or `bollinger_squeeze` + `volume_dryup` | 숏 추가 멈춤. 에너지 축적 |
| 3 | `FLIP_SIGNAL` | `funding_flip` + `oi_expansion_confirm` | 숏 청산 시작. 진입 준비 |
| 4 | `ENTRY_ZONE` | `positive_funding_bias` + `higher_lows_sequence` | 핵심 진입 구간. 숏 스퀴즈 초기 |
| 5 | `SQUEEZE` | `breakout_above_high` or `oi_expansion_confirm` | 스퀴즈 확인. 종종 늦음 |

## Scope

### Slice 1 — 패턴 정의 (engine, pattern library)
- `patterns/library.py`에 `FUNDING_FLIP_REVERSAL` PatternObject 추가
- 5-phase PhaseCondition 정의 (SHORT_OVERHEAT → COMPRESSION → FLIP_SIGNAL → ENTRY_ZONE → SQUEEZE)
- `patterns/library.py` PATTERN_LIBRARY dict에 등록
- 기존 TRADOOR 패턴 회귀 없음 확인

### Slice 2 — 벤치마크 팩 구성 (research)
- 후보 케이스 수동 식별: 펀딩 극단 마이너스 이후 강한 반등한 코인/구간
- 후보: KOMA (2026-04 ACCUMULATION 이전 구간), DYM, JUP, SUI 검토
- `benchmark_cases.py` 스크립트로 케이스 데이터 검증
- 최소 2개 케이스 확보 (PTB + TRADOOR 모델처럼)

### Slice 3 — 패턴 서치 + 프로모션 (research)
- `scan_and_promote.py`로 H6 벤치마크 팩 실행
- `trading_edge_pass` 조건 충족 시 variant 프로모션
- `live_monitor.py` DEFAULT_UNIVERSE에 second pattern 추가

## Non-Goals

- 새 빌딩블록 구현 (기존 블록만 사용)
- UI 변경 (W-0092 완료됨)
- ML 학습 (별도 슬라이스)

## Canonical Files

- `engine/patterns/library.py` — PatternObject 추가
- `engine/patterns/types.py` — PhaseCondition 구조 확인
- `engine/research/pattern_search.py` — benchmark pack / variant search
- `engine/research/live_monitor.py` — DEFAULT_UNIVERSE, variant_slug 파라미터

## Facts

- `funding_extreme(short_overheat)` = funding_rate < -threshold (기본 0.001)
- `funding_flip` = 직전 lookback 바 전부 음수 → 현재 양수
- `positive_funding_bias` = 최근 N바 평균 펀딩 양수
- `oi_expansion_confirm` 존재 확인 필요 (confirmations/)
- TRADOOR 패턴에서 KOMA/DYM이 ENTRY_ZONE만 도달 → trading_edge path로 프로모션됨

## Assumptions

- 1h 타임프레임 기준 (TRADOOR와 동일)
- Binance perp funding data는 data_cache에 이미 캐시됨 (live_monitor 검증됨)
- 케이스 최소 2개면 benchmark pack으로 충분 (TRADOOR도 PTB+TRADOOR 2케이스였음)

## Open Questions

- `oi_expansion_confirm` 블록 시그니처 확인 필요
- COMPRESSION phase: `sideways_compression` OR `bollinger_squeeze`? → required_any_groups 패턴으로

## Decisions

- entry_phase = "ENTRY_ZONE", target_phase = "SQUEEZE" (TRADOOR와 동일 구조)
- slug = "funding-flip-reversal-v1"

## Next Steps

1. Slice 1: `patterns/library.py` 패턴 정의
2. Slice 2: 벤치마크 케이스 수동 탐색 (스크립트로 펀딩 극단 구간 찾기)
3. Slice 3: 패턴 서치 → 프로모션

## Exit Criteria

- [x] `funding-flip-reversal-v1` 패턴이 PATTERN_LIBRARY에 등록됨
- [x] 최소 2개 benchmark case 확보 + 데이터 검증 완료 (DYM+ORDI+STRK+KOMA = 4케이스)
- [x] `pattern_search` 실행 결과에서 1개 이상 variant가 `promote_candidate` 도달
      variant: `funding-flip-reversal-v1__canonical__dur-long`
      reference=0.820, holdout=0.807
- [x] 기존 TRADOOR 테스트 전부 통과 (762 tests green)
- [x] `live_monitor` 프로모티드 variant 반영 완료

## Completed (2026-04-19)

텔레그램 분석 결과 반영:
- cvd_buying block (ALPHA TERMINAL S1 CVD alignment 개념)
- KOMA holdout 케이스 (funding extreme Mar23 → +21.5%)
- benchmark-search promote_candidate 달성
- branch: claude/w-0091-funding-flip
