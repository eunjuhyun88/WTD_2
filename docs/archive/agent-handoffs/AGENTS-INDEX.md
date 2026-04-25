# Agent 세션 인덱스

> 에이전트 번호는 가변적 — 새 세션이 시작될 때마다 순서대로 번호 부여.
> 각 에이전트는 세션 종료 시 `AGENT{N}-SESSION-{YYYYMMDD}.md` 파일 작성.

---

## 네이밍 규칙

```
docs/archive/agent-handoffs/AGENT{N}-SESSION-{YYYYMMDD}.md
```

- `N` = 해당 날짜 기준 세션 번호 (1부터 시작, 같은 날 여러 에이전트 가능)
- 날짜가 다르면 번호 리셋 필요 없음 — 날짜+번호 조합이 유니크

---

## 세션 기록

| 에이전트 | 날짜 | main SHA (종료) | 주요 작업 | 파일 |
|---|---|---|---|---|
| Agent 3 | 2026-04-26 | `ff5282a2` | Cloud Scheduler 5 jobs + GCP 1024MiB + _primary_cache_dir fix + App CI 수리 | [AGENT3-SESSION-20260426.md](AGENT3-SESSION-20260426.md) |

---

## 다음 에이전트가 할 것

> 항상 `work/active/CURRENT.md` → `work/active/W-next-design-YYYYMMDD.md` 순으로 읽는다.

현재 설계 문서: `work/active/W-next-design-20260426.md`

**P0: W-0132 Copy Trading Phase 1**
```bash
git checkout -b feat/w-0132-copy-trading-phase1 origin/main
```

**P1: W-0145 Search Corpus 40+차원**
```bash
git checkout -b feat/w-0145-search-corpus-40dim origin/main
```

---

## 에이전트 작성 가이드

세션 종료 시:

```markdown
# Agent {N} 세션 기록 — {YYYY-MM-DD}

## 시작 SHA / 종료 SHA
## 완료 항목 (PR 번호 포함)
## 발견한 이슈 / 디버깅 기록
## 다음 에이전트에게
```
