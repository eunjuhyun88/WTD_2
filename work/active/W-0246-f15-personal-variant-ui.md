# W-0246 — F-15: PersonalVariant Runtime UI

> Wave 4 P1 | Owner: app | Branch: `feat/F15-personal-variant-ui`

---

## Goal

유저별 threshold override UI — `active_variant_registry.py`(이미 구현) 데이터를 앱에서 노출. 유저가 자신의 패턴 임계값을 직접 조정 + A/B 추적.

## Owner

app

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/routes/settings/variants/+page.svelte` | 신규 — variant 관리 페이지 |
| `app/src/lib/components/patterns/VariantThresholdEditor.svelte` | 신규 — slider UI |
| `app/src/routes/api/patterns/variants/+server.ts` | 신규 — GET/PATCH proxy |

## Exit Criteria

- [ ] 유저별 active variant 목록 표시
- [ ] threshold slider 조정 → `PATCH /patterns/active-variants` 호출
- [ ] variant A/B 비교 (기본값 vs 커스텀) 표시
- [ ] App CI ✅

## Facts

1. `engine/patterns/active_variant_registry.py` (6KB) — per-user threshold override 이미 구현.
2. `GET /patterns/active-variants` — 이미 있음 (`app/src/routes/api/patterns/+server.ts`).

## Canonical Files

- `app/src/routes/settings/variants/+page.svelte`
- `app/src/lib/components/patterns/VariantThresholdEditor.svelte`
