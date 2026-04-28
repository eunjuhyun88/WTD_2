---
name: CURRENT.md 갱신 규칙
description: 에이전트가 PR 완료 후 CURRENT.md를 업데이트하지 않아 main SHA가 수십 커밋 뒤처지는 만성 문제
type: feedback
---

PR 완료 후 반드시 CURRENT.md main SHA를 업데이트해야 한다.

**Why:** 여러 에이전트가 각자 work item만 쓰고 CURRENT.md를 방치한 결과, main SHA가 `e2fba18b`로 기록됐지만 실제 origin/main은 7개 PR 앞서 있었음 (PR #276, #274, #262, #261, #260, #275, #259 누락). 다음 에이전트가 CURRENT.md를 읽고 잘못된 컨텍스트로 작업 시작.

**How to apply:** PR 머지 확인 후:
1. `git log origin/main --oneline -1` 로 최신 SHA 확인
2. `CURRENT.md` 의 `## main SHA` 섹션 업데이트
3. 완료된 PR을 `## 완료` 테이블에 추가
4. MemKraft: `mk.log_event("PR #NNN merged: {요약}", tags="pr,merge", importance="high")`

이 순서를 건너뛰면 다음 에이전트가 stale 컨텍스트로 충돌 작업을 할 수 있다.
