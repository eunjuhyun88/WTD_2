# W-0302 — git stash 92개 정리 + git 위생 복원

> Wave: MM (Maintenance) | Priority: P1 | Effort: XS (15분)
> Charter: In-Scope (기존 tooling 정리, 신규 시스템 아님)
> Status: 🟡 Ready to Execute
> Created: 2026-04-29

---

## Goal

stash 92개 누적으로 발생하는 git 상태 혼란(rebase/checkout 시 silent conflict, 사용자가 "파일이 되돌아간다" 경험)을 제거한다.

---

## Owner

tooling

---

## Scope

- `git stash drop stash@{1}` × 91 (stash@{0}는 내용 확인 후 유지/삭제)
- `.gitconfig` 또는 `tools/` 에 stash 누적 방지 lint 추가 (선택)
- Files: 없음 (git object 정리)

## Non-Goals

- stash@{0} 자동 삭제 (내용 확인 후 수동)
- 미래 stash 완전 금지 (작업 중 임시 stash는 정상 사용)

---

## Facts

- 총 92개, 26개는 auto-sync/pre-close 패턴 (구 session hook 잔여물)
- 가장 오래된 것: `feat/multi-agent-os-foundation` 브랜치 (삭제된 브랜치)
- 현재 start.sh / end.sh 는 auto-stash 없음 — 신규 누적 없음
- stash@{0}: "WIP on main: e2443fa5 Merge remote-tracking branch" — 이번 세션 rebase 시 생성

---

## Exit Criteria

- [ ] `git stash list | wc -l` ≤ 2
- [ ] `git stash list` 에 `auto-sync` 패턴 없음
- [ ] `git status` 정상 (no stash side-effects)

---

## Assumptions

- stash@{0}는 이번 세션 rebase 시 생성된 것으로, 내용 확인 후 삭제 가능
- stash@{1} 이후는 전부 구 세션 잔여물 — 현재 작업에 불필요

## Open Questions

- [ ] stash@{0} 내용이 복원 필요한 변경인가? (`git stash show stash@{0}` 확인)

## Decisions

- **D-0302-1**: git stash clear보다 stash@{0} 확인 후 선택적 drop 권장
- **D-0302-2**: 완료 후 stash list 점검을 /시작 체크리스트에 추가하지 않음 (현재 start.sh가 stash 없음 확인됨)

## Next Steps

1. `git stash show stash@{0}` — 내용 확인
2. `git stash list | awk -F: '{print $1}' | tail -n +2 | while read s; do git stash drop "$s"; done`
3. `git stash list | wc -l` ≤ 2 확인

## Handoff Checklist

- [ ] stash@{0} 내용 확인
- [ ] stash@{1} 이후 전부 drop
- [ ] `git stash list | wc -l` ≤ 2

---

## 실행 명령

```bash
# stash@{0} 내용 확인
git stash show stash@{0}

# stash@{1} 이후 전부 삭제 (역순으로)
git stash list | awk -F: '{print $1}' | tail -n +2 | while read s; do git stash drop "$s"; done

# 또는 전부 clear (stash@{0} 포함)
# git stash clear
```

---

## Canonical Files

없음 — git object 조작만.
