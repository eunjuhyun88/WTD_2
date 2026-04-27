# W-0272 — W-0269 운영 안착 + F-7 ①②③ 완성

> Wave: Meta / Tooling  | Priority: **P0**  | Effort: **S (1일)**
> Charter: ✅ governance / multi-agent coordination
> Status: 🟡 Design Draft
> Created: 2026-04-28 by Agent A066
> Depends on: W-0269 머지 (PR #513 ✅)
> Issue: #521

---

## Goal (1줄)

W-0269로 설치된 issue lifecycle 인프라를 실제 동작하게 만들고, F-7 ①②③ 잔여 메타 자동화를 완성한다.

## Scope

### 포함
- `tools/backfill_work_issue_map.sh` 1회 실행 (W-0001~W-0268 매핑 채움)
- `git config core.hooksPath .githooks` 설치 가이드 (README 또는 tools/install_hooks.sh)
- F-7 ① post-merge hook: main push → CURRENT.md SHA 자동 업데이트
- F-7 ② worktree cron: 10개 초과 시 경고 (tools/check_worktree_count.sh)
- F-7 ③ spec/PRIORITIES.md D/Q 미확정 항목 출력 (tools/check_open_dq.sh)
- state/work-issue-map.jsonl 에 W-0272 등록

### 파일/모듈
- `tools/backfill_work_issue_map.sh` (기존, 실행만)
- `tools/install_hooks.sh` (신규, 1줄 git config)
- `tools/check_worktree_count.sh` (신규, ~20줄)
- `tools/check_open_dq.sh` (신규, ~20줄)
- `.githooks/post-merge` (신규 또는 기존 확장)

## Non-Goals

- ❌ 기존 좀비 이슈 일괄 close (sweep --apply 는 사용자 수동)
- ❌ 새 GitHub Actions workflow 추가 (W-0269에서 충분)

## CTO 관점 (Engineering)

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| backfill 177회 gh API → rate limit | 낮 | 낮 | gh CLI는 토큰 충분, 오류 시 재실행 가능 |
| post-merge hook이 main-only agent 흐름 막음 | 낮 | 중 | hook은 read+write CURRENT.md만, 실패 시 non-blocking |

### Dependencies
- 선행: W-0269 PR #513 머지 (✅ 완료)
- 선행: W-0244 F-7 ①② 확인 (겹치면 W-0244 우선)

### Rollback Plan
- hooks 제거: `git config --unset core.hooksPath`
- backfill: state/work-issue-map.jsonl 라인 수 감사 후 이상 시 삭제 재실행

### Files Touched (예상)
- `tools/install_hooks.sh`: 신규 ~5줄
- `tools/check_worktree_count.sh`: 신규 ~20줄
- `tools/check_open_dq.sh`: 신규 ~20줄
- `.githooks/post-merge`: 신규 ~15줄
- `state/work-issue-map.jsonl`: backfill 후 100~177 라인 추가

## AI Researcher 관점 (Data/Model)

### Data Impact
- 라벨/스키마 변경: ❌ 없음
- LightGBM/Layer-C 영향: ❌ 없음

### Statistical Validation
- 측정: `wc -l state/work-issue-map.jsonl` → 100+ 라인 목표 (80%+ 매핑률)

### Failure Modes
- backfill 결과 0건: gh auth 만료 → `gh auth status` 확인

## Decisions

- **[D-W0272-1]** F-7 ①은 post-merge hook (`.githooks/post-merge`) — W-0244와 중복 시 W-0244 우선
- **[D-W0272-2]** backfill 실행 후 map 라인 수 기록 → 다음 에이전트 인수인계에 포함

## Implementation Plan

1. `tools/backfill_work_issue_map.sh` 실행 (foreground, 3분 예상)
2. `tools/install_hooks.sh` 신규 생성 (git config core.hooksPath .githooks)
3. `.githooks/post-merge` 신규 — main push 감지 → CURRENT.md SHA 한 줄 업데이트
4. `tools/check_worktree_count.sh` — worktree list | wc -l > 10 시 경고
5. `tools/check_open_dq.sh` — PRIORITIES.md에서 `[ ]` D/Q 라인 출력

## Exit Criteria

- [ ] AC1: `tools/work_issue_map.sh list | wc -l` → 100+
- [ ] AC2: feat/W-0272 push → pre-push: W-0272가 map에 있어 통과
- [ ] AC3: post-merge hook으로 CURRENT.md SHA 자동 갱신 (수동 테스트)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## References

- W-0269 PR #513 (선행)
- spec/PRIORITIES.md §F-7 ①②③
- W-0244 F-7 (중복 가능성 확인 필수)
- Issue #521
