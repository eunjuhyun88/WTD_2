---
description: 세션 시작 — Agent ID 발번 + memkraft brief + state + P0/P1 + 직전 handoff
---

`./tools/start.sh`를 실행하세요. 이 도구가 자동으로 다음을 수행합니다:

1. `state/`를 git/gh CLI로부터 갱신 (main SHA, open PRs, worktrees)
2. memory/sessions/agents/ 기준 다음 Agent ID 발번 (자동, 가변)
3. **memkraft 통합 출력**:
   - `memkraft open-loops --dry-run` — 미해결 항목
   - `memkraft dream --dry-run` — 메모리 건강
4. 활성 file-domain locks (`spec/CONTRACTS.md`)
5. P0/P1/P2 우선순위 (`spec/PRIORITIES.md`)
6. 최근 5개 에이전트 + 직전 handoff

## 실행 후 안내

다음 슬래시 커맨드 사용법 안내:
- `/claim "engine/X, app/Y"` — 작업 영역 lock
- `/save "다음에 할 일"` — 세션 중간 체크포인트 (memkraft log 자동)
- `/end "shipped" "handoff" [lesson]` — 세션 종료 + memkraft retro
- `/agent-status` — 현재 상태 한눈에

내 Agent ID와 직전 에이전트의 handoff를 명확히 표시하세요.
