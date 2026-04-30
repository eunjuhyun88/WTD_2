# W-0345 — Watch UI Surface (pending_outcome + watch-hit notification)

> Wave: 5 | Priority: P1 | Effort: S
> Charter: In-Scope (기존 watch infra 노출, 신규 데이터 수집 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: #736

## Goal
Jin이 watch를 켠 심볼이 트리거되면 즉시 토스트로 알고, VerdictInboxPanel에서 "결과 대기 중" 섹션으로 진행 상황을 추적한다.

## Scope
- 포함:
  - `VerdictInboxPanel.svelte`에 3-section 분리: `pending_outcome` (watch-hit 발화 + outcome 미정), `outcome_ready` (기존), `recent_verdicts`
  - watch-hit 이벤트 → 앱 알림 (뱃지 카운트 + 토스트)
  - SSE 또는 30s polling endpoint로 watch-hit feed
- 파일:
  - `app/src/components/terminal/peek/VerdictInboxPanel.svelte` (수정)
  - `app/src/components/terminal/peek/__tests__/VerdictInboxPanel.test.ts` (확장)
  - `app/src/components/terminal/WatchToggle.svelte` (no change)
  - 신규: `app/src/lib/stores/watchHitFeed.ts`
  - 신규: `app/src/components/terminal/WatchHitToast.svelte`
- API:
  - 신규: `GET /api/terminal/watch-hits/pending` (pending_outcome 목록)
  - 신규: `GET /api/terminal/watch-hits/stream` (SSE) 또는 30s polling

## Non-Goals
- Push notification (브라우저/모바일 OS)
- Watch capture 생성 UI 재설계

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| SSE 연결 누수 | 중 | 중 | 30s polling fallback, useEffect cleanup 강제 |
| Toast 폭주 (10+ hits/min) | 중 | 저 | per-symbol 5min dedup, 큐잉 (max 3 visible) |
| pending_outcome 무한 증가 | 저 | 중 | 24h TTL 후 자동 archived, UI에서 숨김 |

### Dependencies
- W-0335 watch→capture 파이프라인 — merged ✅
- 독립: A/C/D와 병렬 가능

### Rollback
- `watchHitFeed` store만 비활성 → VerdictInboxPanel은 outcome_ready만 표시 (기존 동작)

### Files Touched
- 수정: `VerdictInboxPanel.svelte`, `VerdictInboxPanel.test.ts`
- 신규: `watchHitFeed.ts`, `WatchHitToast.svelte`, API route 2개

## AI Researcher 관점

### Data Impact
- 추가 telemetry: `watch_hit_acknowledged_at` (Jin이 토스트 클릭 timestamp)
- pending → outcome 전환 latency 측정 가능 → outcome_resolver 성능 KPI 입력

### Statistical Validation
- A/B 없음 (UI surface). watch_hit→verdict_submitted 전환율 30d 측정 → 베이스라인 후 W-0346과 비교

### Failure Modes
- F1: pending_outcome 카운트와 outcome_resolver 큐 길이 mismatch → 헬스체크 알림
- F2: stale watch (24h+ pending) UI 누적 → 자동 archive

## Decisions
- [D-0345-01] SSE 우선, 폴링은 fallback (Vercel edge timeout 25s 고려해 keep-alive 20s ping)
- [D-0345-02] Toast dedup key = `(symbol, pattern_id)` 5min window

## Open Questions
- [ ] [Q-0345-01] pending_outcome 24h TTL이 적절한가? (1d patterns은 OK, 4h patterns는 짧을 수도)
- [ ] [Q-0345-02] Toast click → VerdictInboxPanel scroll-to vs Modal open?

## Implementation Plan
1. `GET /api/terminal/watch-hits/pending` — pending_outcome captures where research_context.source="watch_scan" AND created_at > now()-24h
2. `watchHitFeed.ts` Svelte store — SSE 구독 + 30s polling fallback
3. `VerdictInboxPanel.svelte` 3-section 리팩터, pending 섹션 신규
4. `WatchHitToast.svelte` + dedup queue
5. 단위 테스트: pending 섹션 렌더, dedup 동작, SSE→polling fallback

## Exit Criteria
- [ ] AC1: watch-hit 발화 후 ≤30s 내 pending 섹션에 표시 (테스트 fake clock)
- [ ] AC2: 동일 (symbol, pattern_id) 5min 내 토스트 1회만 표시
- [ ] AC3: VerdictInboxPanel.test.ts에 pending/ready/recent 3-section 분리 검증 ≥6 assertions
- [ ] AC4: pending_outcome 24h+ 항목은 UI에서 숨김 (server-side filter)
- [ ] CI green (vitest + svelte-check)
- [ ] PR merged + CURRENT.md SHA 업데이트
