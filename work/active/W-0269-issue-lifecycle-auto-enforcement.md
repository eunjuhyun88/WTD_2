# W-0269 — Issue Lifecycle Auto-Enforcement (설계→PR→Close 자동화)

> Wave: Meta / Tooling  | Priority: **P0**  | Effort: **M (2-3d)**
> Charter: ✅ governance / multi-agent coordination (CLAUDE.md §GitHub Issue mutex)
> Status: 🟡 Design Approved — Phase 1 in progress
> Created: 2026-04-28 by Agent A066
> Parent: W-0265 §lifecycle / Issue #442 §F-7 메타 자동화 (extends)
> Issue: #506

---

## Goal (1줄)

`/설계` 단계에서 GitHub Issue 자동 생성 + work item ↔ Issue 양방향 매핑 + PR `Closes #N` CI gate로 **좀비 이슈 0건 유지**. (#460 같은 사고 재발 차단)

## Scope

### 포함
- `.claude/commands/설계.md` Step 4 — issue 생성 **atomic 강제** (실패 시 work item 저장도 롤백)
- `state/work-issue-map.jsonl` — `{ts, w_id, issue, pr, status}` append-only SSOT 매핑
- work item frontmatter — `Issue: N` 필드 추가 (인간 가독성)
- `.githooks/pre-push` — `Closes #N` 또는 `Fixes #N` 누락 시 차단 (`chore/`, `docs/` 면제)
- `.github/workflows/issue-pr-link.yml` — PR body 검증 CI gate (server-side 우회 차단)
- `tools/sweep_zombie_issues.sh` — work/completed/W-*.md ↔ open issue 비교 → close 후보 보고
- `/검증` Step 6 통합 — zombie sweep 자동 실행 (drift report)

### 파일/모듈
- `.claude/commands/설계.md`, `.claude/commands/검증.md`
- `.githooks/pre-push`
- `.github/workflows/issue-pr-link.yml` (신규)
- `state/work-issue-map.jsonl` (신규)
- `tools/sweep_zombie_issues.sh` (신규)
- `tools/work_issue_map.sh` (신규 헬퍼)

## Non-Goals

- ❌ 기존 60+개 좀비 이슈 일괄 close (sweep dry-run 보고 후 별도 의사결정)
- ❌ Issue → work item 역방향 자동생성 (외부 issue가 work item 안 만드는 케이스 다수)
- ❌ memkraft decision 강제 (선택 옵션 유지)

## CTO 관점 (Engineering)

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `gh issue create` 실패 시 work item만 살아남아 분기 | 중 | 상 | atomic: issue 성공 → 파일 저장 → map 등록 (3-단계 try/rollback) |
| pre-push가 hotfix/긴급 차단 | 낮 | 중 | `chore/`, `docs/` prefix 면제 + `--no-verify` override 가능 |
| state/work-issue-map.jsonl merge conflict | 낮 | 낮 | append-only JSONL → conflict 시 양쪽 라인 보존만 하면 됨 |
| GitHub API rate limit | 낮 | 낮 | gh CLI는 토큰 사용, 일반 한도 충분 |
| 기존 좀비 60+개 sweep 시 false-close | 낮 | 중 | dry-run 기본, `--apply` 명시 시만 실제 close |

### Dependencies
- 선행: 없음 (독립 메타 작업)
- 차단 해소: Issue #442 F-7 메타 자동화의 ② "PRIORITIES validation" 부분과 직교 → 동시 진행 가능

### Rollback Plan
- 단계별 PR (4개) 분리. 문제 발생 시 해당 PR만 revert.
- `state/work-issue-map.jsonl` 삭제 시 `/설계`는 계속 동작 (metric 손실만)
- pre-push hook은 `git config --unset core.hooksPath`로 즉시 무효화

### Files Touched (예상)
- `.claude/commands/설계.md`: 152줄 → ~200줄 (Step 4 atomic 로직 + 에러 핸들링)
- `.claude/commands/검증.md`: ~+30줄 (Step 6 zombie sweep)
- `.githooks/pre-push`: 42줄 → ~80줄 (Closes #N check)
- `.github/workflows/issue-pr-link.yml`: 신규 ~50줄
- `state/work-issue-map.jsonl`: 신규 (W-0001~W-0268 backfill 별도 스크립트)
- `tools/sweep_zombie_issues.sh`: 신규 ~80줄
- `tools/work_issue_map.sh`: 신규 ~60줄 (CRUD 헬퍼)

## AI Researcher 관점 (Data/Model)

### Data Impact
- 라벨/스키마 변경: ❌ 없음 (메타 영역, 학습 데이터 무관)
- 마이그레이션: work-issue-map.jsonl 초기 backfill 1회 (work/completed/ + work/active/ 스캔 → gh API 조회 → 매핑 생성)
- LightGBM/Layer-C 영향: ❌ 없음

### Statistical Validation
- 측정 지표:
  - **좀비 이슈 수**: 현재 sweep dry-run 후 측정 → 목표 0개
  - **work item ↔ issue 매핑 누락률**: 목표 < 5% (Q4까지)
  - **PR `Closes #N` 누락률**: PR #479 사례 등 → CI gate 도입 후 0% 강제
- A/B 불필요 (governance, 결정론적)

### Failure Modes
- **메타 데이터 drift**: state/work-issue-map.jsonl 과 GitHub 실제 상태 동기화 실패
  → `/검증` Step 6에서 매번 cross-check + drift 보고
- **새 에이전트가 map 무시**: `/설계` 거치지 않고 직접 `gh issue create` → map 누락
  → daily cron으로 `state/worktrees.json` + `gh issue list` 비교 보강 (Phase 2)

## Decisions (이 설계에서 확정한 것)

- **[D-W0269-1]** Atomic 강제 (옵션 a 자동생성 vs b atomic vs c y/n) → **b**
  이유: 부분 실패가 가장 큰 데이터 무결성 위험 (#460 사고 원인)
- **[D-W0269-2]** 매핑 위치 = frontmatter + state/map JSONL 둘 다
  이유: 파일은 인간 가독성, map은 기계 조회. 단일 SSOT 거부.
- **[D-W0269-3]** PR check = pre-push + GitHub Actions 둘 다
  이유: pre-push 빠른 피드백, Actions가 `--no-verify` 우회 차단
- **[D-W0269-4]** 좀비 정리 = `/검증` Step 6 통합 (별도 스크립트는 제공하되 호출만)
  이유: 검증 루프에서 자연스럽게 sweep, 별도 운영 부담 0
- **[D-W0269-5]** Closes 강제 예외 = `chore/`, `docs/` prefix 면제 (Q-A 결정)
  이유: PRIORITIES sync 같은 메타 PR은 이슈 없이도 정당
- **[D-W0269-6]** map 형식 = JSONL append-only (Q-B 결정)
  이유: merge conflict 거의 발생 안 함, git history 자연 추적
- **[D-W0269-7]** Cleanup 시점 = 이 PR에 backfill만, sweep은 `/검증` 통합으로 자연 처리 (Q-C 결정)
- **[D-W0269-8]** 자동 라벨 = work item frontmatter `Priority`, `Wave` 파싱 → label 매핑 (Q-D 결정)
  이유: 기존 frontmatter 구조 재사용, 추가 학습 부담 없음

## Implementation Plan

**Phase 1 — 매핑 인프라** (PR 1, ~0.5일)
1. `state/work-issue-map.jsonl` 형식 확정 + 빈 파일 생성
2. `tools/work_issue_map.sh` (add/get/list/verify CRUD)
3. work/completed/ + work/active/ 스캔 → gh API 조회 → backfill 스크립트 (1회 실행)

**Phase 2 — `/설계` atomic 강제** (PR 2, ~1일)
1. `.claude/commands/설계.md` Step 4 재작성: try issue → save file → register map (실패 시 cleanup)
2. work item frontmatter `Issue:` 필드 강제
3. memkraft decision 호출 후 보고에 issue URL 포함

**Phase 3 — PR check gate** (PR 3, ~0.5일)
1. `.githooks/pre-push` `Closes #N`/`Fixes #N` 검증 (chore/, docs/ 면제)
2. `.github/workflows/issue-pr-link.yml` PR body 검증 (server-side 우회 차단)

**Phase 4 — `/검증` zombie sweep** (PR 4, ~0.5일)
1. `.claude/commands/검증.md` Step 6에 sweep 추가
2. `tools/sweep_zombie_issues.sh` (work/completed ↔ open issues 비교 → dry-run 기본)
3. `/검증` 실행 시 drift 보고 + `--apply` 옵션

## Exit Criteria

- [ ] AC1: `/설계 W-XXXX` 실행 → state/work-issue-map.jsonl 자동 추가 + work item frontmatter에 `Issue: N` 명시
- [ ] AC2: `Closes #N` 없는 PR push 시 pre-push hook 차단 (`chore/`, `docs/` 면제)
- [ ] AC3: GitHub Actions PR check가 server-side 검증 (`--no-verify` 우회 차단)
- [ ] AC4: `/검증` 실행 시 zombie issue 보고 (work/completed에 W-XXXX 있는데 open issue 잔존 케이스)
- [ ] AC5: backfill 스크립트로 W-0001~W-0268 매핑 80%+ 완성
- [ ] CI green
- [ ] PR 4개 머지 + CURRENT.md SHA 업데이트

## References

- spec/PRIORITIES.md §F-7 메타 자동화
- Issue #442 F-7 (관련, 부분 중첩)
- Issue #460 (사고 사례 — work merged but issue zombie)
- W-0265 slash lifecycle 4-stage (parent)
- CLAUDE.md §Multi-Agent Orchestration §GitHub Issue mutex
- 기존 PR/Issue: #479 (W-0254 머지인데 #460 미close 사례)
