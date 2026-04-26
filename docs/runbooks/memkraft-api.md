# MemKraft API 참조

> 이 파일은 참조용. 일상 작업에서는 `./tools/mk.sh`로 충분.
> 필요할 때만 읽는다.

```python
from memory.mk import mk
```

검증: `cd engine && uv run python ../scripts/validate_memkraft_protocol.py`

---

## 핵심 API

### evidence_first — 작업 시작 전 필수

```python
mk.evidence_first("관련 키워드")
# decisions + incidents + entities 통합 조회
```

### log_event — PR 머지·완료 후 필수

```python
mk.log_event(
    "PR #NNN merged: {한줄요약}",
    tags=["pr", "merge", "w-xxxx"],
    importance="high",
)
# 실행 후 CURRENT.md main SHA 업데이트 필수
```

### decision_record — 아키텍처 결정 시

```python
mk.decision_record(
    what="결정 내용",
    why="이유",
    how="구현 방법",
    tags=["domain", "w-xxxx"],
)
```

### incident_record — CI 실패·프로덕션 장애 시

```python
mk.incident_record(
    title="무엇이 깨졌는가",
    symptoms=["증상1", "증상2"],
    severity="medium",  # low | medium | high | critical
)
```

### tier_set — 메모리 중요도 설정

```python
mk.tier_set("entity-slug", tier="core")
# core | recall | archival  ('critical' 사용 금지)
```

### search

```python
mk.search("키워드")           # hybrid: exact + IDF + fuzzy
mk.evidence_first("키워드")   # decisions + incidents + memory 통합
```

---

## Gotchas

- `decision_record(tags=...)` — 문자열 아닌 **리스트** (`["ci", "w-0163"]`)
- `log_event` 후 **CURRENT.md main SHA 업데이트** 함께
- 과거 기억 조회 시 `grep` 전에 `mk.search()` 먼저
- `work/active/AGENT-HANDOFF-*.md` 금지 — 과거 스냅샷은 `docs/archive/agent-handoffs/`
- MemKraft CLI는 **반드시 `./tools/mk.sh`** — 전역 `memkraft` 또는 `cd memory && memkraft` 금지
