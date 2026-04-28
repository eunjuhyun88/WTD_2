# W-0283 — F-11 Dashboard WATCHING 풀 구현 + PatternCandidate Review UI

> Wave: Wave4/C | Priority: P1 | Effort: M
> Charter: In-Scope L5 (Search) + L7 (Refinement)
> Status: 🟡 Design Ready (Q-001/Q-002 해소 — 구현 가능)
> Created: 2026-04-28 by Agent A073 | Updated: 2026-04-29 by A081
> Issue: #547

## Goal (1줄)
Dashboard WATCHING 섹션에 실시간 P&L 색상 + 자동갱신을 추가하고, `/patterns/candidates` 페이지를 신규 구현해 프로모션 후보 패턴을 검토·승인할 수 있다.

## Scope
- 포함:
  - `app/src/routes/dashboard/+page.svelte`: watcher-card에 pnl_pct 색상 로직 + 30초 자동갱신
  - `app/src/routes/patterns/candidates/+page.svelte` (신규): 후보 패턴 리스트 + approve/reject
  - `app/src/routes/patterns/candidates/+page.ts` (신규): load function
  - `app/src/routes/api/patterns/candidates/+server.ts` (신규): engine proxy
- 파일/모듈: `app/src/routes/dashboard/`, `app/src/routes/patterns/candidates/`
- API surface: `GET /patterns/candidates` (engine 기존 존재), `PATCH /patterns/{slug}/status` (**신규 구현**)
- `engine/patterns/candidate_review_store.py` (신규 ~60줄)
- `engine/api/routes/patterns.py` — PATCH endpoint 추가 (~30줄)
- `engine/tests/patterns/test_candidate_review.py` (신규 ≥3 tests)

## Non-Goals
- 실시간 WebSocket 업데이트 없음 (polling으로 충분)
- 모바일 최적화 별도 (기존 반응형 그대로)
- 복잡한 approve flow 없음 (1-click approve/reject)
- Supabase 별도 테이블 신규 생성 없음 (in-memory store + JSON 파일 persist)

## CTO 관점 (Engineering)

### 현재 상태 분석
- Dashboard watcher-card: 이미 동적 (`/api/captures?watching=true&limit=8` 로드)
- `pnl_pct` 필드: 이미 있음 (`{#if cap.pnl_pct != null}` 렌더링)
- 부족한 것: pnl_pct 색상 클래스 + 자동갱신 interval
- `/patterns/candidates` 라우트: 존재하지 않음 (engine API만 존재)

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| engine `GET /patterns/candidates` API 응답 스키마 불명 | 중 | 중 | 실제 호출로 스키마 확인 후 타입 정의 |
| `PATCH /patterns/{slug}/status` API 미존재 | 중 | 높 | 구현 전 확인 (Open Question) |
| pnl_pct 없는 watching capture 다수 | 중 | 저 | null guard 이미 존재 |
| TS 에러 | 중 | 중 | strict type 적용 |

### Dependencies
- 선행: 없음
- 차단: `PATCH /patterns/{slug}/status` engine endpoint 존재 여부 확인 필요

### Rollback Plan
- `/patterns/candidates/` 디렉토리 삭제
- dashboard 변경 revert (pnl_pct 색상만 변경이므로 안전)

### Files Touched (예상)
- `app/src/routes/dashboard/+page.svelte` (~20줄 변경)
- `app/src/routes/patterns/candidates/+page.svelte` (신규 ~150줄)
- `app/src/routes/patterns/candidates/+page.ts` (신규 ~20줄)
- `app/src/routes/api/patterns/candidates/+server.ts` (신규 ~30줄)

## AI Researcher 관점 (Data/Model)

### Data Impact
- PatternCandidate approve/reject → 훈련 라벨 데이터 영향 가능
- approve: 패턴을 active → 향후 LightGBM positive signal
- reject: 패턴을 rejected → negative signal 또는 dropout

### Statistical Validation
- 측정: candidates 검토 완료율 (approve/reject 비율)
- 목표: 검토 대기 candidates 0개 유지 (WVPL flywheel)

### Failure Modes
- PATCH status API 없으면 approve/reject 불가 → read-only 모드로 fallback

## Decisions

- [D-001] pnl_pct 색상: `pnl_pct > 0 → "pnl-positive"`, `< 0 → "pnl-negative"`, `== 0 → ""` CSS 클래스
- [D-002] 자동갱신: 30초 setInterval (WebSocket 대신)
- [D-003] candidates 페이지: `/patterns/candidates` (engine OpenAPI 기존 route 기준)
- [D-004] approve/reject: 각 카드에 2버튼 → `PATCH /patterns/{slug}/status` 호출
  - 거절: confirm dialog 추가 → 마찰 과다

## PATCH /patterns/{slug}/status — 신규 엔드포인트 설계 (Q-001 해소)

> 2026-04-29 코드 실측으로 확인: 해당 endpoint **존재하지 않음** → 신규 구현 필요

### 목적
PatternCandidate Review UI에서 후보 패턴에 대해 사용자가 `approve` (모니터링 확정) / `reject` (무시)를 기록.

### 기존 코드 분석
- `POST /{slug}/verdict` — 거래 *결과* (valid/invalid/missed) 판정 → 다른 목적
- `PatternStateStore` — phase transition 담당 (entry/active/exit 등) → 직접 변경 위험
- `get_all_candidates_sync()` — entry_phase 진입 symbols 반환 (read-only query)
- candidate 자체에 review 상태 필드 없음

### 설계 결정

**방식**: `CandidateReviewStore` (in-memory dict + JSON 파일 persist)

```python
# engine/patterns/candidate_review_store.py
CandidateReviewAction = Literal["approved", "rejected"]

@dataclass
class CandidateReview:
    slug: str
    symbol: str
    action: CandidateReviewAction
    reviewed_at: str  # ISO
    note: str | None = None
```

**저장**: `engine/data_cache/candidate_reviews.json` (append-only, 최신 slug+symbol 기준 dedup)

**Endpoint**:
```
PATCH /patterns/{slug}/status
Body:  { "symbol": str, "action": "approved" | "rejected", "note": str | None }
Returns: { "ok": true, "slug": str, "symbol": str, "action": str }
```

**GET /patterns/candidates 응답 확장** (Q-002 동시 해소):
```json
{
  "entry_candidates": { "slug": ["BTC", "ETH"] },
  "candidate_records": [...],
  "reviews": { "BTC": "approved", "ETH": null }   ← 신규 필드
}
```

### 영향 범위
- 신규: `engine/patterns/candidate_review_store.py` (~60줄)
- 수정: `engine/api/routes/patterns.py` — `PATCH /{slug}/status` 추가 (~30줄)
- 수정: `engine/api/routes/patterns_thread.py` — `get_all_candidates_sync()` reviews 필드 주입
- 신규: `engine/tests/patterns/test_candidate_review.py` (≥3 tests)

### Scope 갱신
원래 Non-Goals에 "백엔드 API 추가 없음"이었으나 → **engine endpoint 구현 포함으로 Scope 확장**

---

## Open Questions

- [x] [Q-001] `PATCH /patterns/{slug}/status` engine endpoint → **설계 완료 (위 섹션)**
- [x] [Q-002] `GET /patterns/candidates` response schema → **실측 완료**: `entry_candidates`, `raw_entry_candidates`, `candidate_records`, `candidate_records_by_pattern`, `total_count`

## Implementation Plan

**Phase 1 — engine (1일)**
1. `engine/patterns/candidate_review_store.py` — CandidateReview dataclass + JSON persist store
2. `engine/api/routes/patterns.py` — `PATCH /{slug}/status` endpoint 추가
3. `engine/api/routes/patterns_thread.py` — `get_all_candidates_sync()` reviews 필드 주입
4. `engine/tests/patterns/test_candidate_review.py` — ≥3 unit tests
5. `pytest engine/tests/patterns/` green 확인

**Phase 2 — app (1일)**
6. Dashboard pnl_pct 색상 클래스 추가 + 30초 자동갱신 (`setInterval`)
7. `GET /patterns/candidates` TypeScript interface 정의 (실측 schema 기반)
8. `/api/patterns/candidates/+server.ts` proxy 작성
9. `/patterns/candidates/+page.svelte` 구현: 리스트 + approve/reject 버튼
10. TS 에러 0건, CI green 확인

## Exit Criteria

- [ ] AC1: `/dashboard` WATCHING 카드 — pnl_pct > 0 → 초록, < 0 → 빨강
- [ ] AC2: 30초마다 WATCHING 목록 자동갱신
- [ ] AC3: `/patterns/candidates` 페이지 로드 → 후보 패턴 목록 표시
- [ ] AC4: approve/reject 버튼 → 상태 변경 성공
- [ ] AC5: 0개일 때 empty state 표시
- [ ] AC6: TS 에러 0건, CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## References

- `app/src/routes/dashboard/+page.svelte:418-430` — watcher-card 현재 구현
- `app/src/routes/dashboard/+page.svelte:430` — pnl_pct 조건 렌더링 존재
- engine OpenAPI: `engine-openapi.d.ts:1585` — WATCHING API
- spec/PRIORITIES.md §F-11: "placeholder BTC/ETH 2-item 정적 코드" + "PatternCandidate Review UI"
- work/completed/W-0240-f11-dashboard-watching.md — 이전 설계 참조
