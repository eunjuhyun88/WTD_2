---
name: W-0097 + W-0099 완료 (2026-04-19)
description: absorption_signal / alt_btc_accel_ratio + Pattern Discovery Agent 구현 완료 (main 04e45fd)
type: project
---

W-0097 + W-0099 구현 완료 (2026-04-19, main 04e45fd)

**Why:** W-0091 funding-flip-reversal-v1 패턴 강화 + 패턴 발굴 자동화.

**How to apply:** 다음 세션에서 W-0099 BenchmarkPackBuilder로 신규 케이스 추가 → benchmark-search ≥0.85 달성 시도.

## W-0097 결과

- `absorption_signal`: ALPHA TERMINAL 흡수 개념. COMPRESSION + ENTRY_ZONE soft_block.
  - 조건: rolling tbv_ratio ≥ 0.55 AND 가격변화 < 0.5% (cvd_window=5)
  - 11 unit tests pass
- `alt_btc_accel_ratio`: 골든 신호 조건 D (알트 ÷ BTC ≥ 1.2). BTC lru_cache offline load.
  - 6 unit tests pass
- benchmark-search: overall=0.816 (변동 없음, promote_candidate ✅)
  - soft_block은 라이브 스코어링에만 영향. ≥0.85는 신규 케이스 추가 필요.

## W-0099 결과

Pattern Discovery Agent 구현 완료:
- `engine/research/event_tracker/detector.py` — ExtremeEventDetector (funding_extreme, compression)
- `engine/research/event_tracker/tracker.py` — OutcomeTracker (JSONL log, 24/48/72h outcomes)
- `engine/research/event_tracker/pack_builder.py` — BenchmarkPackBuilder (auto JSON 생성)
- `engine/research/pattern_discovery_agent.py` — CLI
- 18 unit tests pass, 832 total tests pass

사용법:
```bash
cd engine
python -m research.pattern_discovery_agent \
  --event-type funding_extreme \
  --pattern-slug funding-flip-reversal-v1 \
  --save-pack
```

## 다음 세션 우선순위

1. W-0099로 ANIME/PEPE 사이클 결과 수집 → 신규 케이스 → benchmark-search ≥0.85
2. ANIME squeeze 발화 여부 확인 (Apr 17 데이터 컷오프 이후)
3. PEPE funding 플립 → FFR 진입 여부 확인
