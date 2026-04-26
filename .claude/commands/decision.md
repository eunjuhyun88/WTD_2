---
description: 아키텍처 결정 기록 — memory/decisions/에 저장
argument-hint: "what" "why" "how"
---

새 아키텍처 결정을 `memory/decisions/`에 기록. `engine/memory/mk.py`의 `decision_record()` 사용.

## 사용

```python
from memory.mk import mk

mk.decision_record(
    what="$1",   # 무엇을 결정했나
    why="$2",    # 왜 그렇게 했나
    how="$3",    # 어떻게 구현하나
    tags="architecture,W-XXXX",
)
```

CLI 형태로 빠르게:
```bash
cd memory && memkraft log \
  --event "decision: $1" \
  --decision "$1" \
  --tags "architecture,decision" \
  --importance high
```

후속:
- `memkraft distill-decisions` — 최근 events에서 decision 후보 자동 추출 안내
- `memory/decisions/dec-{date}-{slug}.md` 파일 생성 (frontmatter + What/Why/How/Outcome)

인자가 부족하면 사용자에게 What/Why/How 각각 한 줄씩 질문.
