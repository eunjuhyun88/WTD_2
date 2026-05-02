# W-0370 — Strategy Library Live Signals

> Wave: 5 | Priority: P1 | Effort: M (5-7d)
> Charter: In-Scope (L3 Pattern Object, signal visibility)
> Status: 🟡 Design Draft
> Issue: #819
> Created: 2026-05-01

## Goal

전략 카드에 "마지막 신호: 2시간 전 / ETHUSDT" 배지 + 드릴다운 패널에 최근 N개 신호 목록(심볼/방향/진입가/경과시간/결과)을 표시한다. 백테스트 수치만 있던 W-0369 카드가 **지금 살아있는 패턴**임을 보여준다.

## Context

- **scan_signal_events** (migration 037, W-0367): 패턴 발화 시 `fired_at + symbol + pattern + entry_price + component_scores` 기록
- **scan_signal_outcomes**: 1h/4h/24h/72h forward P&L 추적 (`triple_barrier_outcome`)
- **signal_event_store.py**: `fetch_resolved_outcomes(lookback_days, pattern_slug)` 이미 존재
- **W-0369** `/strategies`: 드릴다운 패널 있음, 신호 목록 섹션만 추가하면 됨

## Scope

### Phase 1 — Engine API (engine-only)

- `engine/research/signal_event_store.py` — `fetch_recent_signals(slug, days, limit)` 추가
- `engine/api/routes/patterns.py` — `GET /patterns/{slug}/signals` 신규 (최근 signals + outcomes join)
- `engine/tests/test_pattern_signal_api.py` — ≥ 5 tests

### Phase 2 — Frontend (app-only)

- `app/src/lib/api/strategyBackend.ts` — `fetchPatternSignals(slug, days)` 추가
- `app/src/routes/strategies/+page.svelte` — 드릴다운 패널 신호 목록 섹션 추가
- `app/src/lib/strategy/PatternStrategyCard.svelte` — "last signal X ago" 배지 추가
- `app/src/lib/strategy/SignalFeed.svelte` — 신규 (신호 목록 컴포넌트)

## Non-Goals

- 실시간 WebSocket push — polling (30s) 로 충분
- 신호 수동 편집 UI — read-only 피드만
- 알림(Telegram/Push) — F-36으로 분리

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| scan_signal_events가 비어있음 (ENABLE_SIGNAL_EVENTS=false) | 높 | 중 | empty state "신호 없음 (ENABLE_SIGNAL_EVENTS 비활성)" |
| Supabase join 쿼리 느림 | 중 | 낮 | 30일 이내 + limit 20, sse_pattern_fired 인덱스 존재 |
| 동시 52패턴 카드 신호 조회 | 중 | 중 | 카드 hover 시 lazy fetch — 카드 목록 로드 시 일괄 조회 안 함 |

### Dependencies

- W-0367 migration 037 ✅ (scan_signal_events 존재)
- W-0369 `/strategies` 드릴다운 패널 ✅ (섹션 삽입 위치 있음)
- `signal_event_store.fetch_resolved_outcomes` ✅ (재사용 가능)

### Files Touched (실측)

```
engine/research/signal_event_store.py    # fetch_recent_signals 추가
engine/api/routes/patterns.py            # GET /patterns/{slug}/signals
engine/tests/test_pattern_signal_api.py  # 신규
app/src/lib/api/strategyBackend.ts       # fetchPatternSignals
app/src/lib/strategy/SignalFeed.svelte   # 신규
app/src/lib/strategy/PatternStrategyCard.svelte  # last signal 배지
app/src/routes/strategies/+page.svelte  # 드릴다운 확장
```

## AI Researcher 관점

### Data Impact

- `triple_barrier_outcome` 결과 분포: profit_take / stop_loss / timeout / null(미해결)
- 신호 수 < 3이면 "분석 중" 상태 — 수치 숨김
- 해결된 신호 win% = profit_take / (profit_take + stop_loss) = 실제 전략 효율

### Failure Modes

- `ENABLE_SIGNAL_EVENTS=false` → scan_signal_events 비어있음 → empty state 처리
- 신호 있지만 outcomes 미해결(< 72h) → `outcome: pending` 표시
- API 500 → 카드에 배지만 숨김 (graceful degrade)

## Decisions

- [D-0370-1] **Lazy fetch per card** (hover/click 시 조회) vs 전체 일괄: Lazy. 52개 동시 조회는 Supabase 부하. ✅ Lazy 채택
- [D-0370-2] **신호 기간**: 30일 (lookback). 7일은 너무 짧아 빈 카드 많음. ✅ 30일
- [D-0370-3] **결과 표시**: `profit_take` → ✅ 녹색 / `stop_loss` → ❌ 빨간색 / `timeout` / `null` → 회색. ✅

## Open Questions

- [ ] [Q-0370-1] 카드 배지 위치: 카드 상단 우측 vs 카드 하단?
- [ ] [Q-0370-2] 신호 없음(30일) 카드: 배지 숨김 vs "No recent signals" 표시?
- [ ] [Q-0370-3] 30일 lookback 파라미터 사용자 노출 (7d/30d/90d 탭)?

## Implementation Plan

### Phase 1 — Engine (독립 PR)

1. `signal_event_store.py`: `fetch_recent_signals(slug, days=30, limit=20) -> list[dict]`
   - scan_signal_events JOIN scan_signal_outcomes (LEFT JOIN, horizon_h=72)
   - `fired_at DESC` 정렬, `pattern=slug` 필터
2. `patterns.py`: `GET /patterns/{slug}/signals?days=30&limit=20`
   - 응답: `{ signals: [{id, symbol, direction, entry_price, fired_at, outcome, pnl_pct}], total_count }`
3. tests: happy path + empty + unknown slug + outcomes join

### Phase 2 — Frontend

1. `strategyBackend.ts`: `fetchPatternSignals(slug, days=30)` → `PatternSignal[]`
2. `SignalFeed.svelte`: 신호 목록 (시간 ago / 심볼 / 방향 / 진입가 / 결과 아이콘)
3. `PatternStrategyCard.svelte`: 드릴다운 열기 시 signals fetch + "2h ago" 배지
4. `/strategies` 드릴다운 패널: stats → signals 탭 전환

## Exit Criteria

- [ ] AC1: `GET /patterns/{slug}/signals` p95 < 500ms (Supabase 인덱스 활용)
- [ ] AC2: pytest ≥ 5 tests PASS
- [ ] AC3: 드릴다운 패널에 최근 신호 목록 렌더링 (ENABLE_SIGNAL_EVENTS=false일 때 empty state 포함)
- [ ] AC4: "last signal X ago" 배지 (신호 있을 때만)
- [ ] AC5: `pnpm check` 0 new errors
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## Owner

engine (Phase 1) + app (Phase 2)

## Canonical Files

```
engine/research/signal_event_store.py
engine/api/routes/patterns.py
engine/tests/test_pattern_signal_api.py
app/src/lib/api/strategyBackend.ts
app/src/lib/strategy/SignalFeed.svelte
app/src/lib/strategy/PatternStrategyCard.svelte
app/src/routes/strategies/+page.svelte
```

## Facts

```
grep -n "fetch_resolved_outcomes" engine/research/signal_event_store.py
# → exists, reuse pattern for fetch_recent_signals

grep -n "scan_signal_events\|scan_signal_outcomes" engine/research/signal_event_store.py
# → tables in use, migration 037 applied

ls app/src/lib/strategy/
# → PatternStrategyCard.svelte exists, SignalFeed.svelte to be created

grep -n "slug.*signals\|/signals" engine/api/routes/patterns.py
# → endpoint not yet present
```

## Assumptions

- `scan_signal_events` 테이블과 `scan_signal_outcomes` 테이블은 migration 037 (W-0367) 로 존재
- `ENABLE_SIGNAL_EVENTS=true` 환경에서만 데이터 있음 — false면 empty state 처리
- Phase 1은 engine-only, Phase 2는 app-only — 독립 PR 2개

## Next Steps

```
Phase 1:
1. engine/research/signal_event_store.py — fetch_recent_signals() 추가
2. engine/api/routes/patterns.py — GET /patterns/{slug}/signals 라우트 추가
3. engine/tests/test_pattern_signal_api.py — ≥ 5 tests 작성
4. PR 생성 + CI green + merge

Phase 2 (Phase 1 merge 후):
1. app/src/lib/api/strategyBackend.ts — fetchPatternSignals() 추가
2. app/src/lib/strategy/SignalFeed.svelte — 신규 신호 목록 컴포넌트
3. app/src/lib/strategy/PatternStrategyCard.svelte — last signal 배지
4. app/src/routes/strategies/+page.svelte — 드릴다운 신호 탭
```

## Handoff Checklist

- [ ] Phase 1 PR merged, engine-openapi.d.ts sync 확인
- [ ] CURRENT.md SHA 업데이트
- [ ] `scan_signal_events` 테이블 실제 데이터 유무 확인 (ENABLE_SIGNAL_EVENTS 환경변수)
- [ ] Phase 2 시작 전 Phase 1 endpoint 로컬 curl 검증
