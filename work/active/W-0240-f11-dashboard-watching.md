# W-0240 — F-11: Dashboard WATCHING 섹션 + PatternCandidate Review UI

> Wave 4 P1 | Owner: app | Branch: `feat/F11-dashboard-watching`
> **병렬 Stream C — W-0239(F-13)와 동시 진행 가능**

---

## Goal

Dashboard에 WATCHING 섹션 추가 — 유저가 Watch 중인 패턴 캡처를 카드로 표시.
PatternCandidate Review UI — AI Parser / Chart Drag로 만든 Draft를 실제 PatternObject로 승격하는 검토 UI.

## Owner

app

---

## CTO 설계

### Part A: Dashboard WATCHING 섹션

**현재**: Dashboard에 WATCHING 진입점 없음. `watchlist` API는 존재 (`/api/terminal/watchlist`).

**설계**:

```
Dashboard 구조:
├── Header (마켓 요약)
├── WATCHING (신규) ← 이번 작업
│   ├── WatchingCard × N (최대 5개)
│   └── "전체 보기" → /patterns/watchlist
├── SCREENER
└── VERDICT INBOX
```

**WatchingCard 데이터**:
```typescript
interface WatchingCard {
  capture_id: string;
  pattern_slug: string;
  symbol: string;
  phase: string;           // ACCUMULATION | BREAKOUT | ...
  watched_at: string;      // ISO timestamp
  entry_p_win?: number;    // ML score
  capture_kind: string;    // drag | parser | scan
  last_scan_result?: {
    status: "active" | "expired" | "triggered";
    checked_at: string;
  };
}
```

**API**:
```
GET /api/terminal/watchlist?limit=5&sort=watched_at_desc
  → requireAuth()
  → {items: WatchingCard[], total: number}
```

### Part B: PatternCandidate Review UI

**현재**: AI Parser / Chart Drag → PatternDraft 생성되지만 UI 없음. Draft가 어디로 가는지 불명.

**PatternObject 라이프사이클**:
```
Draft (AI Parser / Chart Drag)
  ↓ "검토" 버튼 클릭
Candidate Review UI (이번 작업)
  ↓ 수동 수정 + "승격" 클릭
PatternObject 라이브러리에 저장
```

**Candidate Review 화면 구성**:
```
┌─────────────────────────────────┐
│ Draft 검토 — BTCUSDT Accumulation│
├──────────┬──────────────────────┤
│ 차트 미리 │ Draft 필드 편집       │
│ 보기      │ - pattern_slug       │
│          │ - phase_path         │
│          │ - building_blocks    │
│          │ - threshold          │
├──────────┴──────────────────────┤
│ [취소]           [PatternObject로 승격] │
└─────────────────────────────────┘
```

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/lib/components/dashboard/WatchingSection.svelte` | 신규 — WATCHING 섹션 |
| `app/src/lib/components/dashboard/WatchingCard.svelte` | 신규 — 개별 Watch 카드 |
| `app/src/routes/(dashboard)/+page.svelte` | 변경 — WatchingSection 삽입 |
| `app/src/lib/components/patterns/CandidateReviewModal.svelte` | 신규 — Draft → Object 승격 UI |
| `app/src/routes/api/terminal/watchlist/+server.ts` | 변경 — limit/sort 파라미터 추가 |
| `app/src/routes/api/patterns/draft/promote/+server.ts` | 신규 — Draft → PatternObject 승격 |

## Non-Goals

- WATCHING 실시간 상태 업데이트 (60초 polling으로 충분)
- Draft 자동 승격 (수동 검토 필수)
- PatternObject 편집 고도화 (기본 필드만)

## Exit Criteria

- [ ] Dashboard에 WATCHING 섹션 렌더링 (최대 5개 카드)
- [ ] Watch 중인 캡처 없을 때 "Watch 중인 패턴 없음" 빈 상태 표시
- [ ] CandidateReviewModal 열림 → 필드 수정 → 승격 버튼 작동
- [ ] 승격 후 `/api/patterns/draft/promote` 호출 → engine PatternObject 등록
- [ ] App CI ✅

## Facts

1. `app/src/routes/api/terminal/watchlist/+server.ts` — 기존 watchlist API 존재.
2. D-03-app (PR #383) — Watch PATCH API 완성. `capture_records.is_watching` 컬럼 존재.
3. A-03-app (PR #390) — AI Parser Modal. Draft 생성 → 저장 어디? 확인 필요.
4. A-04-app (PR #386) — Chart Drag. 동일하게 Draft 저장 경로 확인 필요.
5. `engine/api/routes/patterns.py` — PatternObject CRUD 확인 필요.

## Assumptions

1. `capture_records.is_watching = TRUE` 인 레코드를 WATCHING 섹션 데이터로 사용.
2. PatternDraft는 별도 `pattern_drafts` 테이블 or `capture_records.draft_payload` JSONB 저장.
3. 승격 = engine `POST /patterns/from-draft` or 유사 endpoint (실제 경로 확인 필요).

## Canonical Files

- `app/src/lib/components/dashboard/WatchingSection.svelte`
- `app/src/lib/components/dashboard/WatchingCard.svelte`
- `app/src/lib/components/patterns/CandidateReviewModal.svelte`
- `app/src/routes/api/terminal/watchlist/+server.ts`
- `app/src/routes/api/patterns/draft/promote/+server.ts`

## Decisions

- **WATCHING 위치**: Dashboard 상단 (Screener 위) — 진행 중 패턴이 가장 중요
- **카드 수**: 최대 5개 (Dashboard 공간 제한), 더 많으면 "전체 보기" 링크
- **Draft 저장**: 확인 후 결정 — A-03/A-04-app에서 Draft 저장 위치 파악 선행
- **승격 API**: engine 기존 `POST /patterns/{slug}` 재사용 or Draft 전용 route (확인 후 결정)

## Open Questions

1. AI Parser / Chart Drag Draft가 현재 어디에 저장되는가? (`pattern_drafts` 테이블 있는가?)
2. PatternObject 승격 시 engine route가 존재하는가? (`POST /patterns/from-draft`)

## Next Steps

1. A-03-app / A-04-app Draft 저장 경로 grep 확인
2. engine `patterns.py` CRUD 파악
3. WatchingSection + Card 컴포넌트 작성
4. CandidateReviewModal 작성
5. Dashboard 통합

## Handoff Checklist

- [ ] `app/src/routes/api/terminal/watchlist/+server.ts` 현재 응답 스키마 파악
- [ ] A-03-app (PR #390) Draft 저장 위치 확인
- [ ] `engine/api/routes/patterns.py` PatternObject 생성 API 확인
- [ ] Dashboard 현재 레이아웃 파악 (WatchingSection 삽입 위치)
