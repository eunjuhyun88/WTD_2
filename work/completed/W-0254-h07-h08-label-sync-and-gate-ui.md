# W-0254 — H-07 F-60 Gate + H-08 Accuracy: F-02-fix 라벨 동기화 + App GateBar UI

**Owner:** engine + app
**Status:** Ready (F-02-fix 완료 후 즉시 착수)
**Type:** Bugfix + New UI component
**Depends on:** W-0253 F-02-fix (missed→near_miss, unclear→too_early 완료 필수)
**Estimated effort:** engine 0.5일 + app 1.5일 = 2일
**Parallel-safe:** ❌ F-02-fix 완료 후 순차

---

## Goal

F-02-fix 레이블 변경(`missed→near_miss`, `unclear→too_early`) 이후 H-07/H-08 로직이
정합하게 동작하도록 라벨 상수를 업데이트하고, App에 `F60GateBar` UI 컴포넌트를 추가한다.

---

## Owner

engine (label sync) + app (F60GateBar)

---

## Facts (현재 코드 실측)

### H-07: F-60 Gate (engine)

```
engine/api/routes/patterns.py:611  GET /{slug}/f60-status → ✅ BUILT, 등록됨
engine/stats/engine.py:40          F60_WIN_LABELS = {"valid"}  ← OK (변경 없음)
engine/stats/engine.py:41          F60_DENOM_LABELS = {"valid", "invalid", "missed", "too_late"}
                                   ↑ "missed" → "near_miss" 변경 필요 (F-02-fix 후)
engine/stats/engine.py:141         _compute_gate_status()  ← 집계 로직, 레이블 상수 참조
```

### H-08: Per-user Accuracy (engine)

```
engine/api/routes/users.py:11      GET /{user_id}/verdict-accuracy → ✅ BUILT, 등록됨
engine/stats/user_accuracy.py:33   _HARD_LABELS = {"valid", "missed"}
                                   ↑ "missed" → "near_miss" 변경 필요
engine/stats/user_accuracy.py:37   _SOFT_LABELS = {"too_late", "unclear"}
                                   ↑ "unclear" → "too_early" 변경 필요
engine/api/routes/users.py:16      auth: request.state.user_id 체크 있으나 requireAuth() 미사용
                                   → Depends(require_auth) 추가 필요
```

### App (없음)

```
app/src/lib/components/F60GateBar.svelte  ← 미존재
app/src/lib/components/PatternCard.svelte ← 기존 카드, F60GateBar 통합 대상
```

---

## Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/stats/engine.py:41` | bugfix | `F60_DENOM_LABELS` `"missed"` → `"near_miss"` |
| `engine/stats/user_accuracy.py:33` | bugfix | `_HARD_LABELS` `"missed"` → `"near_miss"` |
| `engine/stats/user_accuracy.py:37` | bugfix | `_SOFT_LABELS` `"unclear"` → `"too_early"` |
| `engine/api/routes/users.py` | security fix | `Depends(require_auth)` 추가 |
| `app/src/lib/components/F60GateBar.svelte` | new | F-60 게이트 진행 바 UI |
| `app/src/lib/components/PatternCard.svelte` | modify | F60GateBar 통합 |

---

## Non-Goals

- ❌ F-60 게이트 로직 변경 (threshold, window count 등)
- ❌ LightGBM 재학습 (별도 V-track)
- ❌ Copy Trading Phase 1+ (Charter §Non-Goals)
- ❌ `engine/stats/engine.py` 리팩터링

---

## Exit Criteria

1. `pytest engine/stats/ -v` — `test_gate_status` + `test_user_accuracy` 모두 PASS
2. `GET /patterns/{slug}/f60-status` — `near_miss` 라벨이 `denom_labels`에 포함
3. `GET /users/{user_id}/verdict-accuracy` — `near_miss` 정확도 집계 반영
4. 미인증 요청 → 401 반환
5. App: `F60GateBar` verdict 50개 패턴에서 progress 시각 확인

---

## Assumptions

- **F-02-fix 완료** (W-0253): DB migration 022 실행됨, `missed/unclear` 레코드 없음
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 환경변수 설정됨
- `require_auth` Depends는 `engine/api/middleware/auth.py` 에 존재 (`requireAuth` 패턴)

---

## Canonical Files

```
engine/stats/engine.py
engine/stats/user_accuracy.py
engine/api/routes/users.py
engine/api/routes/patterns.py        (검증용 — 수정 불필요)
app/src/lib/components/F60GateBar.svelte  (신규)
app/src/lib/components/PatternCard.svelte
```

---

## Performance / Security Checklist (CTO)

- **N+1**: 없음 — `user_accuracy.py` 이미 2-query batch 패턴
- **Auth**: `Depends(require_auth)` 추가 (현재 누락)
- **RLS**: `pattern_ledger_records` — user_id column RLS 필요 (Supabase policy 확인)
- **Cache**: `_CACHE_TTL_SECONDS = 300` (5분) 유지 — 충분
- **Rollback**: label 상수만 변경, DB migration 없음 — 즉시 롤백 가능
