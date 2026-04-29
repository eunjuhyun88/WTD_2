# W-0308 — F-14: Pattern Lifecycle Promote UI (Draft → Candidate → Object)

> Wave: 4 | Priority: P1 | Effort: S
> Charter: In-Scope L0 (pattern library curation)
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Issue: #636

## Goal

Jin이 `/patterns/candidates` 페이지에서 후보 패턴을 검토 후 한 번의 클릭으로 Draft → Candidate → Object(active) 상태 전환을 실행하면 패턴이 production 검색·alert 대상에 즉시(≤ 5초) 반영된다.

## Owner

engine + app

## Scope

### 포함

**Engine (이미 존재 — 신규 status PATCH 필요)**:
- `engine/api/routes/patterns.py:872` — `POST /{slug}/promote-model` 모델 promote 존재
- **추가 필요**: `PATCH /api/patterns/{slug}/status` — pattern lifecycle 상태 전환 (status: 'draft'|'candidate'|'object'|'archived')
  - body: `{ status: 'candidate'|'object', reason?: string }`
  - validation: 전환 가능한 상태 graph (draft→candidate, candidate→object, *→archived)
- 기존 `engine/patterns/active_variant_registry.py` 활용 가능
- W-0245 (`work/active/W-0245-f14-pattern-lifecycle.md`) 존재 — 본 문서가 UI 부분 후속 (확인 필요)

**App (UI 전부 신규)**:
- `app/src/routes/patterns/candidates/+page.svelte` (신규 또는 확장)
- `app/src/lib/components/patterns/PatternLifecycleCard.svelte` (신규)
  - status badge (draft/candidate/object 색상 구분)
  - Promote 버튼 + Archive 버튼
  - 미리보기: phases 요약 + 최근 hit_rate (있는 경우)
- `app/src/lib/components/patterns/PromoteConfirmModal.svelte` (신규)
  - confirm dialog: "wyckoff-spring-v1을 OBJECT로 승급합니다. production scanner가 즉시 사용합니다. (취소 가능: archive)"
  - reason input (감사 로그)
- `app/src/lib/api/patterns.ts` 확장 — `patchPatternStatus(slug, status, reason)`

**상태 전환 그래프**:
```
draft → candidate → object
                 ↘ archived
                   ↑
draft → archived
```

### Non-Goals

- **자동 promotion**: F-14는 사용자 수동 검토 단계. 자동화는 F-16 Layer C 학습 후 별도 W-item.
- **Object → Candidate 강등**: 일방향. 강등 필요 시 archive 후 새 candidate 등록.
- **bulk operation**: 단일 패턴 promote만. M0 단계 패턴 수가 적어 ROI 낮음.
- **권한 분리**: M0는 모든 인증 사용자가 promote 가능 (운영자 1인). admin role은 후속.
- **A/B 테스트 (canary rollout)**: object 전환 = 즉시 production 반영. canary는 W-0247 search-recall-verify 후 도입.

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 사용자가 부적격 패턴을 object로 승급 → false alert 폭증 | M | H | confirm modal + 7일 monitoring metric (hit_rate < 0.4 시 자동 archive 알림) |
| 동시 PATCH 요청 → race condition (status flip-flop) | L | M | DB row-level lock (`SELECT FOR UPDATE`) + last_modified_at compare |
| active_variant_registry 캐시 stale → object 전환 후에도 검색 미반영 | M | M | PATCH 성공 시 registry invalidate + ≤ 5초 SLA |
| invalid 전환 (e.g. archived → object) → 데이터 무결성 문제 | M | M | API 레벨 transition validation + 422 반환 |
| reason 누락 → 감사 추적 불가 | L | L | reason optional but recommended (UI에서 prompt) |

### Dependencies
- 선행: `engine/api/routes/patterns.py` ✅
- 선행: `active_variant_registry.py` ✅
- 선행 (선택): W-0245 F-14 design — 본 문서가 UI 후속이라면 정합성 확인 필요
- 후행: F-16 Layer C 학습 — object 패턴만 학습 대상 진입

### Rollback Plan
- `PATCH /api/patterns/{slug}/status` endpoint disable (feature flag `PATTERN_LIFECYCLE_API=false`)
- 또는 status='draft'로 일괄 reset (운영자 SQL)
- UI: `/patterns/candidates` 페이지 redirect to `/patterns` (기존 페이지 유지)

### Files Touched
- `engine/api/routes/patterns.py` (수정 — PATCH endpoint 추가)
- `engine/patterns/active_variant_registry.py` (수정 — invalidate hook)
- `engine/tests/api/test_patterns_lifecycle.py` (신규)
- `app/src/routes/patterns/candidates/+page.svelte` (신규/확장)
- `app/src/lib/components/patterns/PatternLifecycleCard.svelte` (신규)
- `app/src/lib/components/patterns/PromoteConfirmModal.svelte` (신규)
- `app/src/lib/api/patterns.ts` (수정)
- `app/src/lib/components/patterns/__tests__/W0308_lifecycle.test.ts` (신규)

## AI Researcher 관점

### Data Impact
- promote 이벤트 audit trail: `pattern_lifecycle_events` 테이블 (slug, from_status, to_status, reason, ts, user_id)
- F-16 Layer C 학습 cohort 정의: `status='object'` AND `created_at < 7d ago` AND `hit_rate >= 0.5`
- candidate cohort: `status='candidate'` AND verdicts >= 30 → object 전환 가능 (가설)

### Statistical Validation
- 사용자 수동 검토 → 통계 검증 안 함. 다만 promote 후 7일 monitoring metric은 자동:
  - hit_rate가 baseline (e.g. 0.5) 미달 시 archive 알림 (PRIORITIES.md 기준 hit_rate ≥ 0.55)
- N < 100 verdicts 패턴은 promote 불가 (frontend disable)

### Failure Modes
- 사용자가 reason 없이 promote → 향후 추적 불가. mitigation: UI에서 reason 입력 권장 (필수 X, M0 단계).
- registry invalidate 실패 → object 전환됐는데 scanner 미반영. mitigation: scanner는 매 cycle DB 조회 (cache 짧게) + 명시적 reload endpoint

## Decisions

- [D-0308-1] **PATCH `/api/patterns/{slug}/status` 신규 endpoint**, `promote-model` 재사용 거절.
  - 거절 이유: `promote-model`은 model lifecycle (M-001 → M-002 등). pattern status는 다른 axis. 의미 분리.
- [D-0308-2] **상태 전환 graph 강제 (draft→candidate→object 일방향)**.
  - 거절 옵션 (자유 전환): 데이터 무결성 + 사용자 실수 방지.
- [D-0308-3] **confirm modal 필수**, 즉시 반영 거절.
  - 거절 이유: object 전환은 production scanner 즉시 영향. confirm 없이 클릭 위험.
- [D-0308-4] **reason 입력은 optional**, 강제 거절.
  - 거절 옵션 (강제): M0 단계 운영자 1인 (사용자 본인) — friction 최소화.

## Open Questions

- [ ] [Q-0308-1] W-0245 (`W-0245-f14-pattern-lifecycle.md`)와의 관계 — backend 부분이 거기 정의되어 있는가? 본 문서가 UI 후속인가, 또는 통합인가?
- [ ] [Q-0308-2] `pattern_lifecycle_events` 테이블 신설 vs 기존 `decision_memory` 활용 — audit log 위치
- [ ] [Q-0308-3] tier-gate 적용 — Pro 전용 기능? (W-0248과 연동) — 운영자 1인이면 Pro 보장됨
- [ ] [Q-0308-4] hit_rate 기반 자동 archive alert는 본 W-item 범위? 또는 별도?

## Implementation Plan

1. **W-0245 정합성 확인** — backend 설계 충돌 검토 (Q-0308-1)
2. **migration 030** — `pattern_lifecycle_events` 테이블 (Q-0308-2 결정 후)
3. **engine PATCH endpoint** — `/api/patterns/{slug}/status` + transition validator
4. **active_variant_registry invalidate** — PATCH 성공 후 hook 호출
5. **app api wrapper** — `patchPatternStatus()`
6. **UI 컴포넌트** — Card + ConfirmModal
7. **`/patterns/candidates` 페이지** — 후보 리스트 + 마운트
8. **테스트**:
   - pytest: status transition validator (legal/illegal transitions)
   - pytest: registry invalidate 후 ≤ 5초 내 scanner 반영
   - vitest: PromoteConfirmModal interaction
9. PR 머지 + CURRENT.md SHA 업데이트

## Exit Criteria

- [ ] **AC1**: `/patterns/candidates`에서 candidate 패턴 approve 클릭 → 상태 'object' 전환 ≤ 5초 (DB + registry)
- [ ] **AC2**: archived → object 전환 시도 → HTTP 422 + transition error
- [ ] **AC3**: confirm modal 표시 + reason input + cancel 가능
- [ ] **AC4**: object 전환 후 scanner 다음 cycle에서 패턴 사용 (e2e — engine pytest)
- [ ] **AC5**: PATCH 응답에 updated row 포함 (`{ slug, status, updated_at, version }`)
- [ ] **AC6**: audit log 기록 (`pattern_lifecycle_events`) — slug, from, to, reason, user_id, ts
- [ ] CI green (pytest + vitest)
- [ ] PR merged + CURRENT.md SHA 업데이트

## Facts

(grep 실측 결과 — 2026-04-29)
1. `engine/api/routes/patterns.py:872` — `POST /{slug}/promote-model` (model promote, status promote 아님)
2. `engine/patterns/active_variant_registry.py` 존재 (사용자 컨텍스트)
3. `work/active/W-0245-f14-pattern-lifecycle.md` 존재 — 정합성 확인 필요
4. UI에 promote 버튼 0건 (gap)
5. `app/src/routes/patterns/` 디렉토리 존재 여부 미확인 (실측 필요)

## Assumptions

- pattern status 컬럼이 DB에 존재하거나 추가 가능 (확인 필요 — schema)
- active_variant_registry가 status field 인지 (또는 추가 필요)
- M0 단계 운영자 1인 (사용자 본인) 가정
- PATCH는 인증 사용자만 호출 가능 (이미 JWT 미들웨어)

## Canonical Files

- 코드 truth: `engine/api/routes/patterns.py`, `engine/patterns/active_variant_registry.py`
- UI: `app/src/lib/components/patterns/`, `app/src/routes/patterns/candidates/`
- 도메인 doc: `docs/domains/patterns.md` (있는 경우 갱신)
- 결정: `docs/decisions/D-0308-pattern-lifecycle-ui.md`

## Next Steps

1. W-0245와의 관계 정리 (Q-0308-1) — 통합 또는 분리
2. DB schema 확인 (status 컬럼 존재?)
3. UI mockup → 사용자 검토 → implementation

## Handoff Checklist

- [ ] W-0245 정합성 검증 결과 첨부
- [ ] DB schema diff (status 컬럼 추가 migration 필요 시)
- [ ] active_variant_registry invalidate latency 측정
- [ ] confirm modal UX 검증 (실수 방지 효과)
- [ ] audit log 조회 endpoint (선택, M0 후속)
