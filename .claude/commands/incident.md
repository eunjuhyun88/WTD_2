---
description: 사고/장애 기록 — memory/incidents/에 저장
argument-hint: "title" "symptom1" ["symptom2"...]
---

`engine/memory/mk.py`의 `incident_record()` 사용 또는 직접 file 생성.

## Python (권장)

```python
from memory.mk import mk

mk.incident_record(
    title="$1",
    symptoms=["$2", "$3"],  # 쉼표로 구분된 인자들
    severity="medium",       # high/medium/low
)
```

## CLI 빠르게

```bash
memkraft log \
  --event "incident: $1" \
  --tags "incident,severity-medium" \
  --importance high
```

이후 사용자에게 `memory/incidents/inc-{date}-{slug}.md`에 정식 incident 파일 작성 안내.

인자가 부족하면 title + symptom 1개씩 질문.
