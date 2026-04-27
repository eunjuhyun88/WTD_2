---
description: 일일 회고 — memkraft retro로 Well/Bad/Next 자동 추출
argument-hint: [--save 정식 저장 / 기본 dry-run]
---

`memkraft retro`를 실행해 오늘 세션 이벤트로부터 Well/Bad/Next를 자동 추출.

## 동작

```bash
cd memory
memkraft retro $ARGUMENTS
```

기본은 dry-run (미리보기). `--save`로 호출하면 정식 저장.

## 출력 예시

```
🔄 Daily Retrospective — 2026-04-26

✅ Well (went well):
  • PR #327 머지 — Multi-Agent OS Phase 0-2
  • PR #329 머지 — per-agent jsonl

⚠️ Bad (issues):
  • memory-sync hook이 working tree 5회 덮어씀

➡️ Next (action items):
  • Phase 3-4: design/invariants.yml + verify_design.sh
  • W-0145 corpus 40+차원
```

## 응용

세션 끝에 `/retro --save`로 정식 회고 저장하면, 다음 에이전트의 `/start` 출력에 표시됨.
