---
description: 세션 중간 체크포인트 — 한 일 + 다음 일을 memkraft에 세트로 기록
argument-hint: "다음에 할 일 한 줄"
---

`./tools/save.sh "$ARGUMENTS"`를 실행. 자동 동작:

1. 최근 3시간 commit 수집 → "지금까지 한 일"
2. `$ARGUMENTS` → "다음에 할 일"
3. **memkraft log** ×2:
   - `done: <commits>` (tags: checkpoint,done,A###)
   - `next: <ARGUMENTS>` (tags: checkpoint,next,A###)
4. **per-agent jsonl** append: `memory/sessions/agents/{내 ID}.jsonl`
5. 결과 표시: 한 일, 다음 일, 기록 위치

`/end`와 다른 점:
- `/save`: 세션 계속 (lock 유지)
- `/end`: 세션 종료 (lock 해제 + retro)

인자 비어있으면 사용자에게 한 줄로 질문:
> "다음에 할 일을 한 줄로 입력하세요. 예: 'PR #N 머지 후 W-XXXX 시작'"
