# W-0089 — Live Pattern Detection Loop

## Goal

패턴 엔진을 실시간으로 돌려서 ACCUMULATION 진입 신호가 발생하면 즉시 감지한다.
수동 스크립트(`/tmp/live_phase_scan.py`)를 정식 모듈로 승격하고, 스케줄된 스캔 + 구조화된 결과 출력을 제공한다.

## Context

- W-0086/W-0088 완료 후 첫 번째 실시간 응용
- 2026-04-18 수동 스캔에서 **KOMAUSDT ACCUMULATION** 확인 (fwd_peak=+10.7%)
- 일반화 스캔 결과: 패턴은 선택적 (OI >50% 캐스케이드만 트리거) → false positive 낮음
- 캐노니컬 팩 (PTB+TRADOOR+KOMA+DYM): `promote_candidate` via `trading_edge` (2026-04-18)

## Scope

### Phase 1 — 엔진 모듈 (이번 W)
- [ ] `research/live_monitor.py` 신규 모듈
  - `scan_universe_live(universe, timeframe, window_bars, staleness_hours)` → `list[LiveScanResult]`
  - `LiveScanResult`: symbol, phase, path, entry_hit, fwd_peak_pct, realistic_pct, scanned_at
  - 결과를 `experiment_log.jsonl`에 자동 기록
- [ ] 유닛 테스트 3개 이상

### Phase 2 — 스케줄 (추후)
- [ ] cron / scheduled task로 매 4h 자동 실행
- [ ] ACCUMULATION 진입 시 알림 (콘솔 출력 또는 훅)

## Non-Goals

- 실제 주문 실행 (별도 트레이딩 레이어)
- UI 연동 (User Overlay = W-0092)
- 복수 패턴 지원 (W-0091)

## Exit Criteria

- [ ] `scan_universe_live()` 함수가 30개 심볼에 대해 < 60초 내 결과 반환
- [ ] ACCUMULATION 심볼이 있으면 stdout에 명확히 표시
- [ ] 결과가 `experiment_log.jsonl`에 구조화 기록
- [ ] 74개 기존 패턴 테스트 전부 통과 유지

## Live Signal Log

| 날짜 | 심볼 | 단계 | fwd_peak | realistic | 비고 |
|---|---|---|---|---|---|
| 2026-04-18 14:06 UTC | KOMAUSDT | ACCUMULATION | +10.7% | +10.5% | 첫 라이브 신호 |
| 2026-04-18 | TIAUSDT | FAKE_DUMP | - | - | 주시 |
| 2026-04-18 | KAITOUSDT | FAKE_DUMP | - | - | 주시 |
