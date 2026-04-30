---
id: W-0355
title: Extreme events API + IntelPanel section
status: design
wave: 5
priority: P1
effort: M
owner: engine+app
issue: "#765"
created: 2026-04-30
---

# W-0355 — Extreme events API + IntelPanel section

> Wave: 5 | Priority: P1 | Effort: M
> Owner: engine+app
> Status: 🟡 Design Draft
> Created: 2026-04-30

## Goal
Jin이 IntelPanel에서 직전 24시간 funding/OI/price extreme event (예: BTC funding −0.05% 폭발, ETH OI 30% 급증)를 카드 1줄로 보고, 어떤 거시 이벤트가 막 발생했는지 즉시 인지한다.

## Scope
### Files
- `engine/api/routes/extreme_events.py` (신규) — `GET /extreme-events?limit=20&since=24h` 라우트, `ExtremeEventStore` 또는 `tracker.py`에서 최근 이벤트 조회 후 직렬화
- `engine/api/schemas_extreme_event.py` (신규) — `ExtremeEventOut` Pydantic 모델 (symbol, kind, magnitude, detected_at, outcome_24h, outcome_48h, outcome_72h, is_predictive)
- `engine/research/event_tracker/models.py` — 14행 `ExtremeEvent` dataclass에 `to_dict()` 또는 pydantic 어댑터 추가 (이미 `from_dict`만 존재 가능성)
- `engine/research/event_tracker/tracker.py` (existing) — `recent_events(since: timedelta, limit: int)` query helper 노출
- `engine/scanner/jobs/extreme_event_tracker.py` — 이벤트 저장 path 확인 (이미 30분/1h 잡 동작 중)
- `engine/main.py` 또는 `engine/api/__init__.py` — 새 router 등록
- `app/src/lib/server/extremeEvents.ts` (신규) — 서버사이드 fetch 래퍼
- `app/src/components/terminal/IntelPanel.svelte` — 신규 섹션 "Extreme Events (24h)" 추가, 최대 5개 이벤트 표시 (kind + symbol + magnitude + 시간 ago)
- `app/src/components/terminal/__tests__/W0355_extreme_events.test.ts` (신규) — 섹션 렌더 + 빈 상태 + 5개 cap 검증

### API Changes
- 신규: `GET /extreme-events?since=24h&limit=20&kind=funding|oi|price|all` → `{ items: ExtremeEventOut[], generated_at: int }`
- 인증: 기존 비로그인 read-allowed 라우트와 동일 (opportunity와 같은 정책 가정)

### Schema Changes
- DB 변경 없음 (extreme events는 이미 디스크/DB에 저장 중)
- Pydantic 신규 1개 (`ExtremeEventOut`)

## Non-Goals
- extreme event detector 알고리즘 변경 (이미 `ExtremeEventDetector` 가동 중)
- push notification (별도 wave)
- chart annotation overlay (W-0245 lifecycle 별도)
- 신규 메모리 stack 추가 — Charter Frozen 영역, 본 work item에서 절대 건드리지 않음

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| event store 파일 read I/O 부하 (매 IntelPanel 로드) | H | M | engine 측 60s 메모리 cache + ETag/If-None-Match |
| outcome 미체결 이벤트 (24h 미경과) NaN | H | L | nullable 필드 + UI에서 "—" 표시 |
| 권한 누설 (private subscription tier만 노출 의도) | L | H | tier_gate 검토, 본 work item은 free tier 노출 (사용자 확인 필요) |
| router 등록 누락 | M | M | smoke test: `GET /extreme-events` 200 OK 확인 |

### Dependencies
- 없음 (이벤트 생성/저장 흐름은 이미 운영 중)

### Rollback
- 라우터 등록 라인 1줄 + IntelPanel 섹션 한 블록 revert

## AI Researcher 관점

### Data Impact
- 사용자가 extreme event 인지 후 verdict 누르는 행동이 학습 셋에 신호로 들어감
- event → opportunity 연관 분석 가능 (W-0341 hypothesis registry와 결합)

### Statistical Validation
- A/B: extreme event 섹션 노출 그룹의 IntelPanel session duration ≥ +15% (median)
- event-attached coin의 click-through rate vs non-attached 비교 (chi-square)

### Failure Modes
- 동일 symbol 이벤트 중복 (funding+oi 동시) → dedup by (symbol, detected_at_minute)
- 너무 오래된 이벤트 노출 → since=24h 강제 + UI에서도 "Xh ago" 표시
- magnitude 단위 혼동 (% vs raw) → 명시적 단위 표기

## Implementation Plan
1. engine: `ExtremeEventOut` schema + `recent_events` helper + `routes/extreme_events.py` 라우트 + `main.py` 등록
2. engine 단위 테스트: route 200 OK, since 필터, limit cap, empty state — 4 case
3. app: server fetch wrapper + IntelPanel 신규 섹션 5 row 렌더, 빈 상태 placeholder
4. app 단위 테스트: 빈 / 1개 / 5개 / 10개(cap to 5) 4 case
5. perf: GET /extreme-events p95 ≤ 100ms (캐시 hit 기준)

## Exit Criteria
- [ ] AC1: `GET /extreme-events?since=24h` 응답 items 배열 길이 ≤ 20, 모두 detected_at within 24h
- [ ] AC2: IntelPanel "Extreme Events" 섹션이 최대 5개 row 렌더, 빈 상태 placeholder 표시
- [ ] AC3: 동일 symbol+kind 이벤트가 1분 이내 중복 0건 (dedup)
- [ ] AC4: 라우트 p95 latency ≤ 100ms (60s cache hit 기준)
- [ ] AC5: 새 메모리 stack 추가 0개 (Charter Frozen 준수)
- [ ] CI green (pytest + typecheck)
- [ ] PR merged + CURRENT.md SHA 업데이트
