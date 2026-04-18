# W-0099 — Pattern Discovery Agent

## Goal

펀딩 극단 이벤트를 자동 탐지하고, 48-72h 결과를 추적해, 유효한 이벤트를 benchmark pack으로 자동 변환하고, pattern-benchmark-search를 실행해, 검증된 발견을 리포트하는 AI Research Agent를 구축한다.

현재 병목: "hypothesis → benchmark pack" 단계가 수동이다. 연구자가 텔레그램 채널을 분석하고, 케이스를 직접 식별하고, JSON을 손으로 작성한다. 이 모든 과정을 자동화한다.

## Owner

research / engine

## Why

W-0091에서 funding-flip-reversal-v1 패턴을 발굴하기까지:
1. 텔레그램 11,661 메시지 수동 분석
2. KOMA/DYM/ORDI/STRK 수동 식별
3. benchmark pack JSON 수동 작성
4. live_monitor에서 ANIME/PEPE 수동 추적

이 과정이 반복 가능한 루프라면 자동화할 수 있다.
자동화하면: 월 1-2 패턴 발굴 → 주 1-2 패턴 발굴로 속도 10x.

## Core Loop (자동화 대상)

```
                        ┌─────────────────────────────────────┐
                        │         UNIVERSE (전체 상장 심볼)        │
                        └──────────────┬──────────────────────┘
                                       │ 매 8h 스캔
                                       ▼
                        ┌─────────────────────────────────────┐
                        │   detect_extreme_events()            │
                        │   - funding_rate < -threshold        │
                        │   - oi_spike > 2σ                    │
                        │   - volume_dryup + sideways          │
                        └──────────────┬──────────────────────┘
                                       │ 이벤트 태깅
                                       ▼
                        ┌─────────────────────────────────────┐
                        │   tag_outcomes()                     │
                        │   - T+24h, T+48h, T+72h 가격 기록   │
                        │   - 최대 수익, 드로우다운             │
                        │   - 상승/하락 방향                   │
                        └──────────────┬──────────────────────┘
                                       │ 72h 후 필터
                                       ▼
                        ┌─────────────────────────────────────┐
                        │   filter_predictive_events()         │
                        │   - min_return ≥ 10%                 │
                        │   - direction 일관성 ≥ 70%           │
                        │   - false_positive_rate < 30%        │
                        └──────────────┬──────────────────────┘
                                       │ 유효 이벤트
                                       ▼
                        ┌─────────────────────────────────────┐
                        │   auto_build_benchmark_pack()        │
                        │   - reference 케이스 (최고 수익)      │
                        │   - holdout 케이스 (다른 심볼/구간)   │
                        │   - JSON 자동 생성                   │
                        └──────────────┬──────────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────────┐
                        │   run_benchmark_search()             │
                        │   - 기존 CLI 호출                    │
                        │   - promote_candidate 판정           │
                        └──────────────┬──────────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────────┐
                        │   report_to_human()                  │
                        │   - 새 promote_candidate만 리포트    │
                        │   - 실증 케이스 + 수익 포함          │
                        └─────────────────────────────────────┘
```

## Human-in-the-Loop 분리

| 자동 | 수동 |
|------|------|
| 극단 이벤트 탐지 | 전략 방향 결정 ("어떤 이벤트를 볼 것인가") |
| 72h 결과 추적 | 새 building block 코딩 |
| benchmark pack 생성 | 직관적 타당성 검증 |
| pattern-search 실행 | 리스크 정책 결정 |
| 결과 리포트 | promote 최종 승인 |

## Scope

### Slice 1 — Event Tracker (백엔드)

파일: `engine/research/event_tracker/`

```python
# event_tracker/detector.py
class ExtremeEventDetector:
    def scan_universe(self, universe: list[str]) -> list[ExtremeEvent]
    # 조건: funding_rate < -0.001 OR oi_zscore > 2.0 OR (sideways + dryup)

# event_tracker/models.py
@dataclass
class ExtremeEvent:
    symbol: str
    timeframe: str
    event_type: str        # "funding_extreme" | "oi_spike" | "compression"
    detected_at: datetime
    trigger_value: float   # e.g. funding_rate = -0.00338
    outcome_24h: float | None = None
    outcome_48h: float | None = None
    outcome_72h: float | None = None
    is_predictive: bool | None = None  # 72h 후 판정

# event_tracker/tracker.py
class OutcomeTracker:
    def tag_event(self, event: ExtremeEvent) -> None
    def update_outcomes(self) -> None   # 스케줄러가 8h마다 호출
    def get_predictive_events(self, min_return: float = 0.10) -> list[ExtremeEvent]
```

저장소: `engine/data_cache/event_log/events.jsonl` (append-only)

### Slice 2 — Benchmark Pack Builder

파일: `engine/research/event_tracker/pack_builder.py`

```python
class BenchmarkPackBuilder:
    def build_from_events(
        self,
        pattern_slug: str,
        events: list[ExtremeEvent],
        n_reference: int = 1,
        n_holdout: int = 3,
    ) -> BenchmarkPack

    def _select_reference(self, events: list[ExtremeEvent]) -> ExtremeEvent
    # 기준: 최고 outcome_72h + 캐시에 1h + perp 데이터 있는 심볼

    def _select_holdout(self, events: list[ExtremeEvent], reference: ExtremeEvent) -> list[ExtremeEvent]
    # 기준: reference와 다른 심볼, 다른 시점, 데이터 존재 확인
```

### Slice 3 — Discovery Runner CLI

파일: `engine/research/pattern_discovery_agent.py`

```bash
# 사용법
python -m engine.research.pattern_discovery_agent \
  --event-type funding_extreme \
  --lookback-days 30 \
  --min-return 0.10 \
  --pattern-slug funding-flip-reversal-v1
```

출력:
```
[2026-04-19] Scanned 120 events → 12 predictive (avg +34%)
[2026-04-19] Built benchmark pack: 1 reference + 4 holdout
[2026-04-19] Running benchmark-search...
[2026-04-19] RESULT: promote_candidate=True, overall=0.847
[2026-04-19] New variant: funding-flip-reversal-v1__auto-apr26__dur-long
```

### Slice 4 — Scheduled Background Run

파일: `engine/research/event_tracker/scheduler.py`

- 8h마다 `scan_universe()` → 신규 이벤트 저장
- 72h 후 자동으로 `update_outcomes()` → `is_predictive` 판정
- 매주 `run_discovery()` → 새 promote_candidate 있으면 리포트

## Non-Goals

- 실시간 거래 실행 (별도 시스템)
- L2 오더북 데이터 (별도 API 연동)
- UI 대시보드 (W-0098 또는 별도)
- 자동 promote 승인 (human gate 필수)

## Canonical Files

```
engine/research/event_tracker/
  __init__.py
  detector.py       # ExtremeEventDetector
  models.py         # ExtremeEvent dataclass
  tracker.py        # OutcomeTracker
  pack_builder.py   # BenchmarkPackBuilder
  scheduler.py      # 8h background runner

engine/research/pattern_discovery_agent.py   # CLI entry point
engine/data_cache/event_log/events.jsonl     # append-only event log
```

## Facts

- funding-flip-reversal-v1 benchmark pack: 4케이스 (DYM, ORDI, STRK, KOMA) → 전부 수동 구성
- ORDI Apr14-17: COMPRESSION 탐지 → +318% (3일 사이클) ← 이 사이클을 자동 탐지해야 함
- 캐시 조건: `engine/data_cache/cache/SYMBOL_1h.csv` + `SYMBOL_perp.csv` 둘 다 있어야 replay 가능
- 기존 `detect_extreme_events` 개념: W-0091 live_monitor에서 수동으로 하던 것

## Open Questions

- 이벤트 로그를 SQLite vs JSONL로 관리? → JSONL이 단순, 추후 이관 용이
- 72h 아웃컴 기준가: 이벤트 탐지 시점의 close? 또는 다음 봉 open?
- 패턴 slug 자동 지정 vs 수동 지정? → Slice 3에서 `--pattern-slug` 수동

## Relation to W-0097

W-0097 (absorption_signal + alt_btc_accel_ratio)은 **빌딩블록 구현**이고,
W-0099는 **그 빌딩블록을 평가할 benchmark pack을 자동 생성하는 인프라**다.

실행 순서: W-0097 Slice 1 (absorption_signal 구현) → W-0099 Slice 1-3 (탐지 + 팩 빌더) → W-0097 Slice 3 (re-run benchmark)

## Exit Criteria

- [ ] `ExtremeEventDetector.scan_universe()` — funding_extreme 이벤트 탐지 + JSONL 저장
- [ ] `OutcomeTracker.update_outcomes()` — T+24/48/72h 가격 자동 기록
- [ ] `BenchmarkPackBuilder.build_from_events()` — JSON 팩 자동 생성 + 캐시 존재 검증
- [ ] CLI `pattern_discovery_agent.py` — 기존 benchmark-search 연동
- [ ] 단위 테스트 ≥ 20개
- [ ] 기존 테스트 회귀 없음
