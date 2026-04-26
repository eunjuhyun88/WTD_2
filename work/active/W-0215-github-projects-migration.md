# W-0215 — GitHub Projects v2 Migration (Phase 1)

## Goal

멀티에이전트 협업의 진행상태/완료체크/lock을 GitHub Projects v2로 이전. CURRENT.md, CONTRACTS.md, state/ 의 수동 추적을 GitHub native 기능으로 대체. MemKraft는 knowledge layer(decisions/incidents/lessons)에 한정.

## Owner

contract

## Primary Change Type

Process / coordination change (코드 영향 최소)

## Scope (Phase 1 only)

본 PR이 다루는 것:
1. GitHub Project v2 1개 생성 (`WTD_2 — Active Work`)
2. 활성 work item 2개를 Issue로 변환 (W-0132, W-0145)
3. Workflow 1개: PR merge → linked issue status=Done
4. CURRENT.md mirror 스크립트 (Project → markdown render)
5. 본 work item 자체 (W-0215)

## Non-Goals (Phase 1 제외)

- 60+ archived work item 일괄 이전 (필요시 case-by-case)
- CURRENT.md / CONTRACTS.md / state/ 폐기 (mirror로 유지)
- tools/start.sh, end.sh, claim.sh 변경 (Phase 2)
- MemKraft 호출 invariant hook (Phase 3)
- Linear 등 외부 도구 비교
- Project board UX customization (color, view 등)

## Canonical Files

- `work/active/W-0215-github-projects-migration.md` (this)
- `work/active/CURRENT.md`
- `.github/workflows/project-board-sync.yml` (NEW)
- `scripts/render_current_md.py` (NEW) — Project → CURRENT.md
- (Phase 1에서 코드 변경 거의 없음)

## Facts

1. Repo는 `eunjuhyun88/WTD_2` (personal account, private). org 아님.
2. `gh` CLI 로그인 OK이나 token scope에 `read:project`, `project` 없음 → 사용자가 `gh auth refresh -s project` 1회 실행 필요.
3. 활성 work item 2개: W-0132 copy trading, W-0145 search corpus. 둘 다 not started.
4. GitHub Projects v2는 무료, custom field/workflow 무제한.
5. PR/Issue events는 GitHub이 영구 보관 → jsonl 손실 사고 재발 X.

## Assumptions

1. 개인 계정 Project로 충분 (org 이전 불필요).
2. CURRENT.md는 **인간이 읽기 좋게** 자동 생성 — 단일 source는 Project.
3. Issue 번호와 W-#### 번호는 별개로 유지 (Issue title에 "W-0132 — ..." 형식).

## Open Questions

1. Project visibility: private (default) — 본인만 보임. 향후 협업자 추가 시 변경.
2. Custom field "Agent" 형식: free text vs single-select. 일단 free text(A001~)로 시작.
3. Mirror 스크립트 실행 트리거: post-merge GitHub Action vs cron vs manual. 기본 GitHub Action on push:main.

## Decisions

- D1: First PR scope = "활성 2개만 + workflow 1개 + mirror 1개". 광범위 리팩터 X.
- D2: Branch = current `claude/intelligent-austin` worktree. 사용자 승인.
- D3: CURRENT.md / CONTRACTS.md / state/ 유지 + mirror 자동화.
- D4: Project name = `WTD_2 — Active Work`. Status options = `Backlog / Next / In Progress / Review / Done`.
- D5: Custom fields = Status, Agent (text), Work ID (text), Branch (text), Owner (single-select: engine/app/contract/research).

## Next Steps

1. **(사용자)** `gh auth refresh -s project` 실행해서 scope 추가
2. `gh project create --owner eunjuhyun88 --title "WTD_2 — Active Work"` → PROJECT_NUMBER 기록
3. Custom fields 추가 (gh project field-create x4)
4. Issue 생성: W-0132, W-0145 (이미 있는 work/active/*.md 본문 그대로 body로)
5. `gh project item-add` 로 Project에 등록 + 필드 값 채우기
6. `.github/workflows/project-board-sync.yml` 작성: PR merge & `Closes #N` → Done
7. `scripts/render_current_md.py` 작성: Project items → CURRENT.md 활성 표
8. CURRENT.md 상단에 "🤖 auto-generated from Project #N" 표기 + 수동 편집 금지 안내
9. 검증: 더미 Issue 만들어서 PR open/merge → status 자동 전이 확인
10. PR 1개로 묶어서 머지

## Exit Criteria

- [ ] Project 생성 + 5 custom fields 설정 완료
- [ ] W-0132, W-0145 Issue 화 + Project 등록
- [ ] Workflow가 dummy PR merge에서 status=Done 자동 전이 확인됨
- [ ] CURRENT.md mirror 스크립트가 Project 데이터로 활성 표 재생성됨
- [ ] PR 머지 + main SHA 갱신
- [ ] mk.log_event 기록

## Handoff Checklist

다음 에이전트(Phase 2)가 이어받을 때 필요한 것:
- Project URL / number
- 5 custom field IDs (gh project field-list 결과)
- Issue numbers for W-0132, W-0145
- mirror 스크립트 동작 검증 로그
- 다음 phase 후보:
  - Phase 2: tools/start.sh를 `gh issue list --assignee @me`로 단순화
  - Phase 3: pre-commit hook (agent ID = unknown 차단)
  - Phase 4: CONTRACTS.md → Project assignee/Agent field로 흡수
