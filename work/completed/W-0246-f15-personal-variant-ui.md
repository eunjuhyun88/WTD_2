# W-0246 — F-15: PersonalVariant Runtime UI

> Wave 4 P1 | Owner: app | Branch: `feat/F15-personal-variant-ui`
> **선행 조건: F-02-fix(W-0253) 완료 후. 독립 스트림.**

---

## Goal

유저별 패턴 variant 설정을 앱에서 직접 확인·수정할 수 있게 한다.
`active_variant_registry.py`(이미 구현)의 데이터를 노출하고, 유저가 watch_phases를 오버라이드하면 pattern_scan이 그 설정으로 즉시 동작한다.

**사용자 가치**: 트레이더가 자신의 매매 스타일에 맞게 임계값을 직접 조정 → 일반 설정 대비 recall 향상 기대 (PRD §F-15).

---

## Owner

app (UI + BFF proxy) — engine route 이미 존재

---

## Facts (코드 실측 2026-04-27)

### Engine (기존 — 수정 최소)

```
engine/patterns/active_variant_registry.py
  - ActivePatternVariantEntry: pattern_slug, variant_slug, timeframe,
    watch_phases, source_kind, source_ref, research_run_id, updated_at
  - ACTIVE_PATTERN_VARIANT_STORE.list_effective() → list[ActivePatternVariantEntry]
  - JSON-backed durable store (pattern_active_variants/ 디렉토리)
  - source_kind: "seed" | "benchmark_search" | "operator"

engine/api/routes/patterns.py:398
  GET /patterns/active-variants  → ✅ BUILT, 등록됨
  → returns { ok, count, entries: [ActivePatternVariantEntry.to_dict()] }

❌ PATCH /patterns/active-variants/{slug}  → 미존재 (신규 필요)
```

### App (기존)

```
❌ app/src/routes/api/patterns/variants/  → 미존재
❌ app/src/routes/settings/variants/      → 미존재
❌ app/src/lib/components/patterns/VariantCard.svelte  → 미존재
❌ app/src/lib/components/patterns/WatchPhaseToggle.svelte  → 미존재
```

---

## Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/api/routes/patterns.py` | 추가 (~20줄) | `PATCH /patterns/active-variants/{slug}` 신규 |
| `app/src/routes/api/patterns/variants/+server.ts` | 신규 | GET proxy → engine |
| `app/src/routes/api/patterns/variants/[slug]/+server.ts` | 신규 | PATCH proxy → engine |
| `app/src/routes/settings/variants/+page.svelte` | 신규 | variant 관리 페이지 |
| `app/src/lib/components/patterns/VariantCard.svelte` | 신규 | 패턴별 read + edit mode 카드 |
| `app/src/lib/components/patterns/WatchPhaseToggle.svelte` | 신규 | watch_phases 체크박스 그룹 |

---

## Non-Goals

- ❌ threshold 수치 float slider (Phase 2)
- ❌ 신규 variant 생성 (operator/benchmark_search 방식 유지)
- ❌ Copy Trading 연동 (Charter §Non-Goals)
- ❌ 모바일 반응형 (데스크톱 우선)

---

## API 설계

### PATCH /patterns/active-variants/{slug} (engine 신규)

**Request (pydantic)**
```python
class VariantPatchRequest(BaseModel):
    watch_phases: list[str]   # non-empty, allowlist 검증
    source_kind: Literal["operator"] = "operator"
```

**Response 200**
```json
{
  "ok": true,
  "updated": { "pattern_slug": "...", "watch_phases": [...], "updated_at": "..." }
}
```

**Errors**: 404 (slug 없음) / 422 (watch_phases 비어있거나 유효하지 않은 phase 이름)

### App BFF (zod 검증)
```typescript
const patchSchema = z.object({
  watch_phases: z.array(z.string()).min(1),
})
```

---

## Performance (100명+ 동시 기준)

- **읽기**: `list_effective()` = JSON 파일 I/O, 메모리 캐시(`_cache`) 유지 — DB 쿼리 없음
- **쓰기 빈도**: 낮음 (유저 설정 변경). `tempfile + rename` atomic write 이미 구현됨
- **N+1 없음**: 전체 list 한 번 fetch

---

## 보안 (CTO 체크리스트)

- **Auth**: app BFF `requireAuth()` + engine JWT 검증 필수
- **접근 제어**: Phase 1 = 글로벌 설정. 악의적 유저가 watch_phases를 빈 배열로 덮는 것 방지 → `min(1)` 검증 + 변경 이력 `updated_at + source_kind=operator` 로깅
- **입력 검증**: watch_phases allowlist = 해당 패턴 정의의 유효 phase 이름 목록과 교차 검증
- **Rate limit**: PATCH 유저당 10회/분

---

## Exit Criteria

1. `GET /settings/variants` — active variant 목록 렌더링 (패턴명 + variant_slug + watch_phases)
2. watch_phases 토글 → PATCH → engine 파일 갱신 → 다음 pattern_scan(15분) 반영
3. 변경 이력 `updated_at + source_kind=operator` 확인
4. 미인증 접근 → 401
5. 유효하지 않은 phase → 422
6. App CI ✅, Engine Tests ✅

---

## Assumptions

1. `active_variant_registry.py` JSON store는 GCP 단일 인스턴스 로컬 파일 (다중 인스턴스 Phase 2)
2. 글로벌 설정 — Pro 유저만 접근 (tier gate는 W-0248 후 추가)
3. pattern phase 이름 목록은 `engine/patterns/registry.py`에서 런타임 추출 가능

---

## Canonical Files

```
engine/api/routes/patterns.py                                    (+~20줄)
app/src/routes/api/patterns/variants/+server.ts                  (신규)
app/src/routes/api/patterns/variants/[slug]/+server.ts           (신규)
app/src/routes/settings/variants/+page.svelte                    (신규)
app/src/lib/components/patterns/VariantCard.svelte               (신규)
app/src/lib/components/patterns/WatchPhaseToggle.svelte          (신규)
```

---

## Open Questions

- **Q1**: watch_phases allowlist를 runtime에 패턴 정의에서 추출할지, 하드코딩 enum으로 할지?
  → 추천: runtime 추출 (패턴 추가 시 자동 확장)
- **Q2**: 두 유저 동시 PATCH 충돌 → Phase 1: last-write-wins + `updated_at` 반환
