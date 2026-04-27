# W-0236 — F-2: Search Result List UX

> Wave 4 P0 | Owner: app | Branch: `feat/F2-search-result-ux`
> **병렬 Stream B — W-0234(F-3)와 동시 진행 가능**

---

## Goal

패턴 검색 결과를 Top 10~20 카드 리스트로 표시 + similarity score + 차트 미리보기 + 1-click Watch.
현재 `/patterns/search` 페이지가 있지만 score 노출 없고 Watch 버튼 없음.

## Owner

app

## Primary Change Type

feature (UI)

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/routes/patterns/search/+page.svelte` | 변경 — similarity score 표시 + Watch 버튼 추가 |
| `app/src/lib/components/search/SearchResultCard.svelte` | 신규 — 결과 카드 컴포넌트 |
| `app/src/lib/components/search/SearchResultList.svelte` | 신규 — 리스트 wrapper (pagination 포함) |
| `app/src/routes/api/search/[...path]/+server.ts` | 변경 — score 필드 반환 확인 |

## Non-Goals

- LambdaRank reranker 통합 (W-0235 별도)
- 차트 full-render (thumbnail만)
- 필터/정렬 고도화

## Exit Criteria

- [ ] 검색 결과 Top 20 카드 리스트 렌더링
- [ ] 각 카드에 similarity score (0.0~1.0) 표시
- [ ] 1-click Watch 버튼 → `PATCH /api/captures/{id}/watch` 연결
- [ ] 차트 미니 프리뷰 (기존 ChartMiniPreview 재사용 or 신규 XS)
- [ ] App CI ✅

## Facts

1. `app/src/routes/patterns/search/+page.svelte` — 기존 검색 페이지 존재.
2. `app/src/routes/api/search/[...path]/+server.ts` — engine `/search/similar` proxy.
3. `app/src/routes/api/captures/[id]/watch/+server.ts` — Watch PATCH 이미 존재 (D-03-app PR #383).
4. engine `/search/similar` — score 필드 반환 여부 확인 필요.

## Assumptions

1. engine search 응답에 `score` 또는 `similarity` 필드 포함됨.
2. 기존 Watch API (`PATCH /api/captures/{id}/watch`) 사용 가능.

## Canonical Files

- `app/src/routes/patterns/search/+page.svelte`
- `app/src/lib/components/search/SearchResultCard.svelte` (신규)
- `app/src/lib/components/search/SearchResultList.svelte` (신규)
- `app/src/routes/api/search/[...path]/+server.ts`

## Decisions

- **카드 레이아웃**: pattern_slug + symbol + score + mini chart + Watch CTA
- **페이지네이션**: 20개 단위, infinite scroll 불가 (단순 페이지)
- **score 표시**: 0-100% 형식

## Next Steps

1. engine search 응답 스키마 확인 (score 필드)
2. SearchResultCard 신규 작성
3. 기존 search page에 통합
4. Watch 버튼 연결 테스트

## Handoff Checklist

- [ ] `app/src/routes/patterns/search/+page.svelte` 현재 상태 파악
- [ ] engine `/search/similar` 응답 스키마 확인
- [ ] `app/src/routes/api/captures/[id]/watch/+server.ts` Watch API 파악
