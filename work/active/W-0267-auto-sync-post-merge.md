# W-0267 — Auto Sync (post-merge hooks)

> Wave: Meta / Tooling | Priority: **P0** | Effort: **M (2-3d)**
> Charter: ✅ governance / runbook
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-28
> Parent: W-0264 §C

---

## Goal (1줄)

PR 머지 시 PR body의 work item ID를 추출하여 `spec/PRIORITIES.md` 갭 카운트 / `work/active/CURRENT.md` SHA / `work/active/W-####.md` → `work/completed/` 이동을 자동 동기화하여 사용자가 매번 atomic chore PR을 만들지 않게 한다.

## Scope

### 포함

- `.githooks/post-merge` enhance — PR body에서 work item ID 추출 → 다음 3개 자동 sync
- `tools/sync-priorities.mjs` 신규 — work item priority 라벨 (frontmatter `priority:`) 기반으로 PRIORITIES.md 갭 카운트 자동 update
- `tools/sync-current-md.mjs` 신규 — main SHA → `CURRENT.md` 자동 update (W-0244 F-7 통합)
- `tools/move-completed.mjs` 신규 — work item Exit Criteria 모두 ✅ 시 `work/active/` → `work/completed/` 자동 이동
- 머지된 PR body 파싱 표준 (work item ID + Closes #issue 추출)

### Non-Scope

- ❌ memkraft event 자동 기록 (별도 work item)
- ❌ Issue close 자동 (gh가 PR `Closes #N`로 처리)
- ❌ 새 PRIORITIES.md 라벨 발명 (P0/P1/P2/P3 기존 유지)

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| post-merge hook이 잘못된 work item을 close 처리 → drift 반대 방향 | 중 | 상 | hook은 work item state 검증 (Exit Criteria 모두 ✅ 시만 move) |
| hook이 PR body 파싱 실패 시 silent skip | 높음 | 중 | 실패 시 stderr + 다음 `/start`에서 알림 |
| sync-priorities.mjs가 PRIORITIES.md 형식 변경 시 깨짐 | 중 | 상 | 정확한 anchor (`<!-- AUTO-GAP-COUNT -->` 같은 마커) 사용 |
| 여러 PR 동시 머지 시 race | 낮 | 중 | hook은 sequential, file lock |

### Dependencies

- 선행: PR #487 worktree registry SSOT (work_item state 매핑)
- 선행: PR #491 isolation rule (multi-agent merge 호환)
- 차단 해제: 모든 후속 work item은 manual chore PR 없이 머지

### Files Touched

- `.githooks/post-merge` (existing, enhance ~50줄 추가)
- `tools/sync-priorities.mjs` (신규, ~150줄)
- `tools/sync-current-md.mjs` (신규, ~80줄, W-0244 F-7 통합)
- `tools/move-completed.mjs` (신규, ~100줄)
- `spec/PRIORITIES.md` (anchor 마커 추가, 1회성)
- `work/active/CURRENT.md` (anchor 마커 추가, 1회성)

### Hook Workflow

```
git merge / gh pr merge
   ↓
.githooks/post-merge 실행
   ↓
[1] 머지된 PR body 파싱 (gh pr view <merged-PR>)
   ↓
[2] work item ID 추출 (W-#### regex)
   ↓
[3] tools/sync-current-md.mjs <new-main-SHA>
   → CURRENT.md의 SHA 마커 update
   ↓
[4] tools/sync-priorities.mjs <work-item-IDs>
   → 각 work item frontmatter `priority: P0/P1/P2/P3` 읽음
   → PRIORITIES.md `열린 갭: N개` 라인 자동 감산
   → 해당 §P0 표 행에 ✅ + PR 번호 추가
   ↓
[5] tools/move-completed.mjs <work-item-IDs>
   → 각 work item의 §Exit Criteria 모두 ✅ 시 work/active → work/completed
```

### Rollback Plan

- hook 실패 시 stderr + main 머지는 그대로 (sync 실패 ≠ 머지 실패)
- 단일 commit revert로 hook 자체 disable 가능

---

## AI Researcher 관점

### Failure Modes

1. **Type-1 (잘못 close)**: Exit Criteria 미완료인데 work item move
   - 완화: AC checkbox 파싱 (`- [x]` 모두) 검증
2. **Type-2 (move 누락)**: 모든 AC 완료인데 move 안 됨
   - 완화: `/start` 시 stale active work item (PR 머지됐으나 work/active 잔존) 검출 알림
3. **Anchor 깨짐**: 사용자가 PRIORITIES.md anchor 마커 수동 편집 시
   - 완화: 마커 명시 (`<!-- AUTO-GAP-COUNT:start -->` ~ `<!-- AUTO-GAP-COUNT:end -->`), 외부 편집 금지

### KPI

- post-merge hook 자동 sync 성공률 (목표 ≥ 95%)
- manual chore PR 횟수 (목표 0/주)
- PRIORITIES.md drift 발생률 (목표 0)

### Falsifiable

- F2: hook이 갭 카운트 ±2 drift → disable + incident
- F3: AC 미완 work item을 move → 즉시 revert + AC parser 수정

---

## Decisions

| ID | 결정 | 거절 |
|---|---|---|
| D1 | hook은 client-side `.githooks/post-merge` (기존) | server-side GitHub Actions (✗ local merge 시 작동 안 함) |
| D2 | work item state는 §Exit Criteria checkbox 기반 | 별도 state machine DB (✗ overengineering) |
| D3 | PRIORITIES.md anchor 마커 (machine-readable) | 자유 형식 파싱 (✗ regex 깨지기 쉬움) |
| D4 | hook 실패는 머지 막지 않음 | 머지 막음 (✗ 사용자 경험 저하) |

## Open Questions

- [ ] Q1: priority 라벨이 work item frontmatter에 없으면 어떻게 처리? (default = P2?)
- [ ] Q2: `/병렬` 머지 시 N개 work item 동시 close → race?
- [ ] Q3: anchor 마커 위치 (PRIORITIES.md §0 vs §4 표 안)?

## Implementation Plan

1. `spec/PRIORITIES.md` + `CURRENT.md`에 anchor 마커 추가 (1회성 PR)
2. `tools/sync-current-md.mjs` 작성 (W-0244 F-7과 통합)
3. `tools/sync-priorities.mjs` 작성
4. `tools/move-completed.mjs` 작성
5. `.githooks/post-merge` enhance (call 위 3 tool)
6. dry-run 검증: 최근 머지 PR (#478, #489) 시뮬레이션
7. PR open

## Exit Criteria

- [ ] AC1: `.githooks/post-merge` 머지된 PR의 work item ID 추출
- [ ] AC2: `CURRENT.md` SHA 자동 update (main 머지 후)
- [ ] AC3: `PRIORITIES.md` 갭 카운트 자동 감산 (priority 라벨 기반)
- [ ] AC4: AC 모두 완료된 work item → work/completed 자동 이동
- [ ] AC5: hook 실패 시 머지는 그대로, stderr 출력
- [ ] AC6: 회귀 0 (기존 hook 동작 유지)

## References

- 부모: W-0264 §C
- 선행: PR #487, PR #491, W-0244 F-7 (CURRENT.md SHA hook)
- 사고 사례: PR #465, PR #482 (manual chore PR — 본 hook으로 차단)
