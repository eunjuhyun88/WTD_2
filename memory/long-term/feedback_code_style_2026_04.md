---
name: 코드 스타일 및 협업 피드백
description: 코드 작성 방식, PR 전략, 검토 방식에 대한 사용자 피드백
type: feedback
---

선택적 커밋: UI 파일 등 이번 세션과 무관한 기존 unstaged 변경사항은 포함하지 않고 관련 파일만 골라서 커밋.

**Why:** main에 여러 unstaged 변경이 섞여 있는 경우가 많음. 내가 변경한 파일만 정확히 골라야 함.

**How to apply:** `git add` 시 항상 파일 목록을 확인하고 이번 작업과 관련 없는 파일은 제외.
