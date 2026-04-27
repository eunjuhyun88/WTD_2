# W-0245 — F-14: PatternObject Lifecycle (Draft → Candidate → Object)

> Wave 4 P1 | Owner: app | Branch: `feat/F14-pattern-lifecycle`
> **선행: W-0241 A-03-eng + W-0242 A-04-eng 완료 후 (Draft 생성 경로 필요)**

---

## Goal

AI Parser / Chart Drag로 생성된 PatternDraft를 검토 → Candidate 큐 → PatternObject 라이브러리 승격. W-0240(F-11)의 CandidateReviewModal과 연동.

## Owner

app

---

## CTO 설계

### 라이프사이클

```
PatternDraft (A-03/A-04 engine 생성)
  ↓ 유저 "검토" 클릭
Candidate 큐 (GET /patterns/candidates)  ← API 이미 있음
  ↓ CandidateReviewModal (W-0240에서 구현)
  ↓ 유저 필드 수정 + "승격" 클릭
PatternObject 라이브러리 (POST /patterns/register)  ← API 이미 있음
```

### 현재 상태

- `GET /patterns/candidates` — API ✅ BUILT
- `POST /patterns/register` — API ✅ BUILT
- Draft → Candidate 승격 UI — ❌ 없음
- Candidate review queue UI — ❌ 없음
- CandidateReviewModal — W-0240에서 구현 예정

### API 계약

```
POST /patterns/draft/promote
  → require_auth()
  → body: { draft_id, overrides?: PatternDraftBody }
  ← { pattern_object_id, slug }
```

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/routes/patterns/candidates/+page.svelte` | 신규 — Candidate 큐 페이지 |
| `app/src/lib/components/patterns/DraftPromoteButton.svelte` | 신규 — 승격 CTA |
| `app/src/routes/api/patterns/draft/promote/+server.ts` | 신규 — promote proxy (W-0240 연동) |
| `engine/api/routes/patterns.py` | 변경 — `POST /patterns/draft/promote` 라우트 |

## Non-Goals

- 자동 승격 (수동 검토 필수)
- PatternObject 편집 고도화

## Exit Criteria

- [ ] `/patterns/candidates` 페이지에서 Draft 목록 표시
- [ ] 승격 버튼 → engine `/patterns/register` 호출 → 라이브러리 등록
- [ ] 승격 후 candidate 큐에서 제거
- [ ] App CI ✅

## Facts

1. `GET /patterns/candidates` (`engine/api/routes/patterns.py:149`) — 이미 있음.
2. `POST /patterns/register` — 이미 있음.
3. W-0240 CandidateReviewModal — 동일 승격 UI 구현 예정. 컴포넌트 재사용.

## Canonical Files

- `app/src/routes/patterns/candidates/+page.svelte`
- `engine/api/routes/patterns.py`
