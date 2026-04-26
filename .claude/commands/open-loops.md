---
description: 미해결 항목 한눈에 — memkraft open-loops
---

```bash
memkraft open-loops --dry-run
```

memory 전반에서 다음을 추출:
- decisions의 미해결 outcome
- live-notes의 todo 항목 ([ ] markdown checkbox)
- session events의 unresolved tag

## 정식 저장

`--dry-run` 빼면 `memory/open-loops.md` hub 파일에 정식 저장:

```bash
memkraft open-loops
```

## 활용

- `/start` 출력에 자동 포함됨 (dry-run)
- 세션 시작 시 가장 큰 open loop을 P0 후보로 검토
