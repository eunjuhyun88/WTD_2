---
description: memkraft 메모리 검색 — entity, decision, incident, session 전부
argument-hint: "검색어"
---

```bash
memkraft search --fuzzy "$ARGUMENTS"
```

memkraft가 다음을 검색:
- entities (live-notes/, entities/)
- decisions (decisions/dec-*.md)
- incidents (incidents/inc-*.md)
- session events (sessions/*.jsonl)

## 응용

- 특정 W-번호 찾기: `/search "W-0145"`
- 에이전트 이력: `/search "A007"` 또는 `memkraft lookup A007`
- 결정 추적: `/search "RS256"`

상세 entity 조회:
```bash
memkraft lookup --brain-first "$ARGUMENTS"
memkraft links "<entity-name>"  # backlinks
```

검색어 없으면 사용자에게 질문.
