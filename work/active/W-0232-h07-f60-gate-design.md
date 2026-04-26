# W-0232 — H-07 F-60 Gate Design (API + UI)

> **Design-first**. PR scope = 설계만. 실제 구현은 별도 PR로 분리.

## Goal

F-60 카피시그널 marketplace 게이트: 사용자별 verdict 개수 + accuracy를 추적하고 **200 verdict + 0.55 accuracy** threshold 달성 시 카피시그널 발행 권한 unlock.

## Owner

contract (설계) → engine + app (구현, 별도 PR)

## Primary Change Type

Engine logic + Product surface (multi-PR)

## Background

PRD v2.2 §F-60: "검증된 PatternObject (verdict accuracy ≥X% × 200+ verdicts) → KOL-style 캡션 자동 생성 → 카피시그널 알림 구독 marketplace".

- Q2 lock-in: F-60 accuracy threshold = **0.55** 시작 (90일 운영 후 조정)
- D8 + Q1: 5-cat verdict 즉시 P0 (PR #370 머지 + F-02-app PR #381 머지)
- 카피시그널 marketplace = N-05 (별도 W-0233+, frozen 회색지대 — 사용자 confirm 필요)

## Scope (본 PR — 설계만)

| # | 파일 | 용도 |
|---|---|---|
| 1 | `work/active/W-0232-h07-f60-gate-design.md` (this) | 설계 |
| 2 | `docs/live/W-0220-status-checklist.md` | H-07 항목 정밀화 |

**구현 PR (별도)**:
- H-07-eng (`feat/H07-eng-f60-gate-api`) — engine endpoint
- H-07-app (`feat/H07-app-f60-progress-ui`) — UI progress bar

## Non-Goals

- N-05 Marketplace UI (별도 W-0233+, charter 회색지대)
- Per-pattern accuracy (전체 user accuracy만 우선)
- F-60 unlock 후 카피시그널 발행 워크플로 (Phase 3+)
- KOL caption 자동 생성 연동 (이미 `engine/branding/kol_style_engine.py` 존재)

## Canonical Files

- `work/active/W-0232-h07-f60-gate-design.md` (this)
- `engine/api/routes/users.py` 또는 `engine/api/routes/stats.py` (NEW endpoint)
- `engine/stats/engine.py` (확장 — per-user accuracy 추가)
- `app/src/routes/api/users/[user_id]/f60-status/+server.ts` (NEW proxy)
- `app/src/components/dashboard/F60GateBar.svelte` (NEW)

## Facts

1. main = `d7587a39` (Wave 2 4개 PR 모두 머지 완료).
2. F-02 engine + UI 5-cat verdict 작동 (PR #370/#381).
3. `engine/stats/engine.py` 5-min TTL 작동 (PatternStats Engine BUILT).
4. Q1 lock-in: missed/too_late/unclear는 학습 라벨 제외 (W-0223 §F-02).
5. PRD §1.4 핵심 해자: verdict ledger = 복제 불가 자산.

## Assumptions

1. Q2 권고 0.55 accuracy threshold 유지 (사용자 confirm 시 변경 가능).
2. accuracy = `valid / (valid + invalid)` — missed/too_late/unclear 제외.
3. 200 verdict 기준은 **valid + invalid 합계** (학습 가능 라벨만).
4. F-60 unlock은 **사용자 단위** (per-pattern은 후속).
5. UI는 dashboard / profile에 progress bar 노출.

## Open Questions

1. **Per-user vs per-pattern threshold**: 사용자 전체 accuracy vs 특정 PatternObject별?
   - 권고: **사용자 전체 우선** (단순), per-pattern은 follow-up.
2. **Stale unlock**: unlock 후 accuracy 떨어지면 lock 유지 vs revoke?
   - 권고: **유지** (revoke는 신뢰도 손상). 단, 30-day rolling accuracy 표시.
3. **N-05 Marketplace 회색지대**: charter Frozen Copy Trading과 모순.
   - 결정 보류 (사용자 confirm 후 W-0233+).

## Decisions

- **D-W-0232-1**: 본 PR = 설계만. 구현은 H-07-eng + H-07-app 2 PR.
- **D-W-0232-2**: accuracy = `valid / (valid + invalid)` (missed/too_late/unclear 제외).
- **D-W-0232-3**: threshold = 200 (valid + invalid) + 0.55 accuracy (Q2 권고).
- **D-W-0232-4**: per-user 우선, per-pattern은 follow-up.
- **D-W-0232-5**: unlock 후 revoke 안 함 (30-day rolling 표시만).
- **D-W-0232-6**: N-05 Marketplace는 별도 PR + charter confirm.

## Next Steps

1. ✅ 본 설계 작성
2. 사용자 검토 + 승인
3. PR 머지 (설계만)
4. H-07-eng 구현 PR 별도
5. H-07-app 구현 PR 별도

## Exit Criteria

- [ ] 본 설계 사용자 승인
- [ ] PR 머지 + main SHA 갱신
- [ ] 체크리스트 H-07 정밀화

## Handoff Checklist

- 본 PR 머지 후 H-07-eng + H-07-app 2 PR 분리
- F-60 unlock 후 N-05 Marketplace는 charter 위반 회색지대 — 별도 confirm

---

# §H-07 API Spec (engine)

## Endpoint

```
GET /users/{user_id}/f60-status
```

## Response

```json
{
  "user_id": "u_abc123",
  "verdict_count": 142,
  "verdict_count_target": 200,
  "valid_count": 78,
  "invalid_count": 41,
  "accuracy": 0.6555,
  "accuracy_target": 0.55,
  "f60_unlocked": false,
  "progress_pct": 0.71,
  "lock_reason": "verdict_count_below_target",
  "calculated_at": "2026-04-27T01:23:45Z"
}
```

## Logic

```python
def compute_f60_status(user_id: str) -> F60Status:
    # Verdict count: valid + invalid only (학습 가능 라벨)
    verdicts = ledger.list_verdicts_by_user(user_id)
    learnable = [v for v in verdicts if v.user_verdict in ("valid", "invalid")]
    valid = sum(1 for v in learnable if v.user_verdict == "valid")
    invalid = sum(1 for v in learnable if v.user_verdict == "invalid")
    count = valid + invalid

    accuracy = (valid / count) if count > 0 else 0.0

    count_pct = min(count / 200, 1.0)
    acc_pct = min(accuracy / 0.55, 1.0) if count > 0 else 0.0
    progress_pct = min(count_pct, acc_pct)  # 둘 중 작은 게 bottleneck

    unlocked = count >= 200 and accuracy >= 0.55

    lock_reason = None
    if not unlocked:
        if count < 200:
            lock_reason = "verdict_count_below_target"
        elif accuracy < 0.55:
            lock_reason = "accuracy_below_target"

    return F60Status(
        user_id=user_id,
        verdict_count=count,
        verdict_count_target=200,
        valid_count=valid,
        invalid_count=invalid,
        accuracy=accuracy,
        accuracy_target=0.55,
        f60_unlocked=unlocked,
        progress_pct=progress_pct,
        lock_reason=lock_reason,
        calculated_at=datetime.utcnow().isoformat() + "Z",
    )
```

## Cache

`engine/stats/engine.py`의 5-min TTL 패턴 따름. 사용자 verdict 제출 시 invalidate.

## Edge cases

- Verdict 0: progress_pct = 0, unlocked = False
- accuracy 1.0 + count 199: unlocked = False (count gate)
- accuracy 0.5 + count 1000: unlocked = False (accuracy gate)
- both target 달성: unlocked = True (영구, 본 PR scope 내 revoke X)

---

# §H-07 UI Spec (app)

## Component

`app/src/components/dashboard/F60GateBar.svelte` (NEW)

## Visual

```
┌────────────────────────────────────────────────┐
│ F-60 Marketplace Gate                           │
│                                                 │
│ Verdicts: 142 / 200    ████████░░░░ 71%         │
│ Accuracy: 65.5% (target 55%)                    │
│                                                 │
│ Status: 🔒 Locked — 58 more verdicts needed     │
└────────────────────────────────────────────────┘
```

Unlocked 상태:
```
┌────────────────────────────────────────────────┐
│ F-60 Marketplace Gate                  ✅       │
│                                                 │
│ Verdicts: 234 / 200    ████████████ ✓           │
│ Accuracy: 72.3% (target 55%)                    │
│                                                 │
│ Status: 🟢 Unlocked — Marketplace 진입 가능       │
└────────────────────────────────────────────────┘
```

## Visual tokens (LIS palette)

| State | Color |
|---|---|
| Progress fill (locked) | `--lis-accent` (#db9a9f) |
| Progress fill (≥80%) | `--sc-yellow-400` |
| Progress fill (unlocked) | `--lis-positive` (#4ade80) |
| Progress bg | `--sc-grey-3` |
| Lock icon | `--sc-grey-7` |
| Unlock icon | `--lis-positive` |

## Placement

- Dashboard top section
- Profile page sidebar
- (Phase 2) Verdict Inbox header (작은 mini-bar)

---

# §H-07 Files Touched (구현 시)

## H-07-eng

| 파일 | 변경 |
|---|---|
| `engine/api/routes/users.py` (or stats.py) | `GET /users/{user_id}/f60-status` 라우트 |
| `engine/stats/engine.py` | `compute_f60_status(user_id)` 메서드 추가 |
| `engine/ledger/store.py` | `list_verdicts_by_user(user_id)` 헬퍼 (없으면 추가) |
| `engine/tests/test_f60_gate.py` (NEW) | unit test (count gate, accuracy gate, both unlock) |

## H-07-app

| 파일 | 변경 |
|---|---|
| `app/src/components/dashboard/F60GateBar.svelte` (NEW) | progress bar UI |
| `app/src/lib/api/terminalApi.ts` | `getF60Status(userId)` 메서드 |
| `app/src/routes/api/users/[user_id]/f60-status/+server.ts` (NEW) | engine proxy |
| `app/src/components/dashboard/__tests__/F60GateBar.test.ts` (NEW) | vitest |

---

# §AC

## H-07-eng

- [ ] GET /users/{user_id}/f60-status → 200 + JSON 정확
- [ ] verdict 0 → progress_pct=0, unlocked=false
- [ ] count 199 + acc 1.0 → unlocked=false, lock_reason="verdict_count_below_target"
- [ ] count 1000 + acc 0.5 → unlocked=false, lock_reason="accuracy_below_target"
- [ ] count 200 + acc 0.55 → unlocked=true, lock_reason=null
- [ ] missed/too_late/unclear는 카운트 제외 (Q1 lock-in)
- [ ] 5-min TTL 캐시 작동

## H-07-app

- [ ] F60GateBar 컴포넌트 dashboard 노출
- [ ] Progress bar fill % 정확 (count_pct vs acc_pct 중 작은 값)
- [ ] Lock/unlock icon + reason 표시
- [ ] LIS palette 토큰 사용 (하드코딩 X)

---

# §Risks

| 위험 | 완화 |
|---|---|
| accuracy threshold 0.55가 너무 낮거나 높음 | Q2 권고로 90일 운영 후 조정 |
| missed/too_late를 사용자가 "성과"로 오해 | UI에서 "학습 가능 verdicts only" 명시 |
| F-60 unlock 후 N-05 Marketplace charter 회색지대 | 별도 confirm 단계 (W-0233+) |
| Per-user accuracy = aggregate gaming 가능 | per-pattern은 follow-up (gaming 어렵게) |
| Verdict count 늘리려고 무분별 라벨링 | unclear 사용 권장 (학습 제외) |
