# W-0355 — Extreme events 카드 (funding/OI/price divergence)

> Wave: 5 | Priority: P2 | Effort: S
> Charter: In-Scope (기존 opportunity-scan 데이터 활용 — 신규 데이터 수집 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: TBD

## Goal
IntelPanel에서 funding rate extreme, OI spike, price divergence 이벤트를 카드로 받고, dismiss하면 24h 동안 재노출 안 된다.

## Scope
- 포함:
  - `ExtremeEventsCard.svelte` 신규 — funding_extreme / OI spike / price_divergence 이벤트 렌더
  - dismiss 시 localStorage `dismissed_extreme_events`에 `{event_id, dismissed_at}` 저장 — 24h 지나면 재노출
  - IntelPanel 최상단에 mount (condition: active events ≥ 1)
  - engine: `GET /research/extreme-events` 신규 endpoint 또는 기존 opportunity-scan 응답에 `extreme_events` 배열 additive 추가
- 파일:
  - `app/src/lib/components/intel/ExtremeEventsCard.svelte` (신규)
  - `app/src/lib/components/intel/IntelPanel.svelte` (mount 추가)
  - `engine/api/routes/research.py` (extreme-events endpoint 추가)
  - `app/src/lib/components/intel/ExtremeEventsCard.test.ts` (신규)
  - `engine/tests/api/test_extreme_events.py` (신규)
- API:
  - `GET /research/extreme-events` → `{ events: ExtremeEvent[] }`
  - ExtremeEvent fields: `event_id` (str), `event_type` (funding_extreme|oi_spike|price_divergence), `symbol`, `severity` (low|mid|high), `value`, `threshold`, `detected_at` (ISO8601)

## Non-Goals
- push notification / Telegram alert — 별도 W-item
- 이벤트 히스토리 페이지 — 현재 live snapshot만
- 커스텀 threshold 설정 UI — 서버사이드 상수 유지

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| localStorage 키 충돌 | 저 | 저 | 네임스페이스: `wtd_dismissed_extreme_events` |
| 24h 만료 로직 버그 (timezone mismatch) | 중 | 중 | UTC ISO8601 저장, `Date.now()` 비교 |
| IntelPanel 최상단 카드 레이아웃 밀림 | 중 | 저 | 카드 height 고정 (max-h 없이 auto), collapsible 아님 |
| extreme-events endpoint 응답 지연 | 중 | 중 | client-side TTL=30s cache, 로딩 중 카드 미노출 |

### Dependencies / Rollback / Files Touched
- **Dependencies**: opportunity-scan 또는 별도 extreme event 컴퓨트 (기존 scanner.py에서 파생 가능)
- **Rollback**: IntelPanel에서 ExtremeEventsCard import 제거 1줄; engine endpoint는 additive (기존 endpoint 영향 없음)
- **Files Touched**:
  - 수정: `IntelPanel.svelte`, `engine/api/routes/research.py`
  - 신규: `ExtremeEventsCard.svelte`, `ExtremeEventsCard.test.ts`, `test_extreme_events.py`

## AI Researcher 관점

### Data Impact
- 신규 state: localStorage `wtd_dismissed_extreme_events` (client-only, 서버 미전송)
- engine: 기존 scanner.py에서 funding/OI/price_divergence 임계값 초과 rows 필터링

### Statistical Validation
- threshold 정의: funding_extreme = |funding_rate| > 0.05%, OI spike = OI 1h delta > 15%, price_divergence = spot vs. perp > 0.3%
- 이벤트 발생 빈도 sanity: 정상 시장에서 24h당 0~5건 예상

### Failure Modes
- F1: events 없음 → 카드 미노출 (DOM에 카드 element 자체 없음)
- F2: localStorage 읽기 실패 (private browsing) → graceful fallback (dismiss 저장 불가, 매번 표시)
- F3: engine endpoint 500 → 카드 미노출, 콘솔 warn만

## Decisions
- [D-0355-01] dismiss 만료: `dismissed_at + 86400000ms` (24h in ms) UTC 기준
- [D-0355-02] extreme-events는 별도 `GET /research/extreme-events` 신규 endpoint (opportunity-scan payload 오염 방지)
- [D-0355-03] severity 3-tier: high=red-500, mid=amber-500, low=yellow-400 (Tailwind)

## Open Questions
- [ ] [Q-0355-01] funding_extreme threshold 0.05%가 맞는지 — 현재 scanner.py 임계값 확인 필요
- [ ] [Q-0355-02] dismiss는 event_id 기준인가, event_type+symbol 기준인가?
- [ ] [Q-0355-03] 복수 이벤트 시 카드 1개 (리스트)인가, 카드 N개인가?

## Implementation Plan
1. `engine/api/routes/research.py`에 `GET /research/extreme-events` endpoint 추가 (scanner output 필터링)
2. `ExtremeEvent` pydantic 스키마 정의
3. `ExtremeEventsCard.svelte` 구현: fetch → dismiss filter → 렌더, dismiss handler (localStorage write)
4. 24h 만료 체크 유틸 함수 (`isExpired(dismissed_at: string): boolean`)
5. `IntelPanel.svelte`에 ExtremeEventsCard mount (최상단, `events.length > 0` 조건)
6. vitest: dismiss + 24h 만료 로직, events=0 시 미노출, severity 색상
7. pytest: endpoint 응답 스키마 검증

## Exit Criteria
- [ ] AC1: funding_extreme 이벤트 카드 렌더 (funding_rate > threshold 시) — vitest mock 기반
- [ ] AC2: dismiss 후 동일 event_id 24h 내 재노출 안 됨 — vitest localStorage mock
- [ ] AC3: events 없으면 카드 DOM element 미노출
- [ ] AC4: vitest ≥ 3 PASS (신규 테스트 기준)
- [ ] CI green (engine pytest + app vitest + svelte-check)
- [ ] PR merged + CURRENT.md SHA 업데이트
