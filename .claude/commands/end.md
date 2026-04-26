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

## 실행 후

다음을 사용자에게 표시:
- ✓ 세션 닫힘 (Agent ID)
- shipped, handoff, lesson 요약
- 다음 에이전트가 `/start`로 시작하면 내 handoff를 자동으로 보게 됨

인자가 없거나 부족하면 사용자에게 질문:
- "shipped: 머지된 PR 번호 또는 'in-branch'"
- "handoff: 다음 에이전트가 실행할 정확한 명령"
- "lesson (선택): 함정/주의사항 1줄"
