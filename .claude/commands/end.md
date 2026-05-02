---
description: 세션 종료 — shipped + handoff + lesson 기록 + lock 해제
argument-hint: "shipped" "handoff" [lesson]
---

`./tools/end.sh`를 호출해서 세션을 정식 종료합니다.

## 인자

`$ARGUMENTS` 형식: `"PR #N or 'in-branch'" "다음 에이전트 명령어" "선택: lesson"`

예시:
- `/end "PR #321" "git checkout -b feat/w-0146"`
- `/end "PR #308 #314" "merge PR #322" "memory-sync hook이 working tree 덮어씀"`

## 동작

`./tools/end.sh "$1" "$2" "$3"`을 실행. 자동으로:
1. `memory/sessions/{date}.jsonl` append (timeline)
2. `memory/sessions/agents/{내 ID}.jsonl` append (per-agent)
3. `spec/CONTRACTS.md`에서 자기 lock 제거
4. lesson이 있으면 별도 항목으로 추가 기록
5. `state/state.json` 갱신
6. **`tools/sweep_session_artifacts.sh`** — 세션 아티팩트 archive + docs/live 중복 삭제
7. **`tools/check_drift.sh`** — main SHA / W-#### 충돌 / 활성표 모순 / origin 차이 보고

## 머지된 work item 정리는 `/닫기` 사용 권장

`/end`는 세션 단위 종료만 한다. 이번 세션에 PR이 머지됐다면 `/닫기`로 종료하는 게 좋다 — `/닫기`가 머지된 W-XXXX를 식별해서 `tools/complete_work_item.sh`로 자동 정리한다.

또는 수동:
```
bash tools/complete_work_item.sh W-XXXX
```

## 로그 append (필수 — 자동 또는 수동)

`work/log/$(date +%Y-%m-%d).md` 파일에 아래 형식으로 **맨 아래에 append**:

```
## HH:MM | {worktree-slug} | {W-XXXX 또는 작업명}
- **완료**: {한 일 1줄}
- **PR**: #{N} {merged/open} → SHA `{SHA}`
- **락 해제**: {파일 목록 또는 "없음"}
- **다음 에이전트에게**: {인계 사항}
```

**규칙**: 기존 entry 수정·삭제 금지. append만.

---

## 실행 후

다음을 사용자에게 표시:
- ✓ 세션 닫힘 (Agent ID)
- shipped, handoff, lesson 요약
- 다음 에이전트가 `/start`로 시작하면 내 handoff를 자동으로 보게 됨

인자가 없거나 부족하면 사용자에게 질문:
- "shipped: 머지된 PR 번호 또는 'in-branch'"
- "handoff: 다음 에이전트가 실행할 정확한 명령"
- "lesson (선택): 함정/주의사항 1줄"
