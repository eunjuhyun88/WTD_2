---
name: design-first-always
description: 비자명한 작업은 항상 설계 문서 먼저 작성·검토 후 구현 시작. 코드/파일 변경 전에 design doc.
type: feedback
---

설계부터 하고 개발한다. 항상.

**Why:** 사용자가 명시 (2026-04-26). AGENTS.md "Design-First Loop"의 강제 적용. 설계 없이 코드부터 만들면 (1) 사용자 의도 어긋남 발견을 PR 단계에서 함, (2) 충돌·롤백 비용↑, (3) PR #360 rollback 같은 사고 재발. 이번 세션에서 PRIORITIES.md를 바로 수정하려다 멈춤받음.

**How to apply:**
- 비자명한 작업 = 3+ 파일 수정, 새 시스템, 정책 변경, 인프라 변경, work item 신규
- 받자마자 도구 부르지 말고, 먼저 설계 문서 작성:
  - 위치: `work/active/W-####.md` 또는 `docs/design/<topic>.md`
  - 필수: Goal, Scope, Non-Goals, Decisions, Open Questions, Next Steps, Exit Criteria
- 사용자 검토 받고 → 그 다음 코드/파일 변경
- "추진해줘" / "다 해줘" 같은 강한 위임도 **설계 문서 우선** 원칙은 유지
- 단순 작업(파일 1개 수정, 정해진 명령 실행)은 설계 생략 가능
