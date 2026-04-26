# MemKraft 전체 도입 — Repo-Wide Memory & Context

**Status**: PROPOSED (2026-04-26, A007)
**Owner**: A007+
**Goal**: wtd-v2 전체 디렉토리에서 컨텍스트 / 메모리 / 협업이 추적되고 활용되도록 도입

---

## 핵심 원칙

| 원칙 | 의미 |
|---|---|
| **Single source** | `memory/`가 모든 entity / decision / incident / session의 single source |
| **Single CLI wrapper** | memkraft 명령은 항상 `./tools/mk.sh <cmd>`. 전역 `memkraft`와 `cd memory && memkraft` 직접 호출 금지 |
| **Auto-track** | 코드 변경 / PR 머지 / 결정 / 사고 → 자동 memkraft log |
| **Cross-link** | W-번호, agent ID, file domain → entity로 등록되어 backlink 탐색 가능 |

---

## Phase A: memkraft scope 확장 (지금 PR)

### 1. memory/.memkraft 인덱스 + .gitignore

```gitignore
# memkraft 자동 생성 — repo에 commit 안 함
memory/.memkraft/
```

`.memkraft/index.json`은 cache 성격 — 매 세션 `memkraft index` 재생성.

### 2. tools/*.sh 확정

- `tools/mk.sh`: MemKraft v2.0.0 고정 + `MEMKRAFT_DIR=$repo/memory`
- `tools/start.sh`: `./tools/mk.sh open-loops --dry-run` + `dream --dry-run`
- `tools/save.sh`: `./tools/mk.sh log --event "checkpoint ..."` (×2)
- `tools/end.sh`: `./tools/mk.sh log --event "session ended ..."` + `retro --dry-run` 미리보기
- 모든 호출은 wrapper 강제 — `memory/memory/` 잘못 생성 방지

### 3. `tools/track_repo.sh` (NEW)

repo entity 자동 등록:
```bash
#!/bin/bash
MK=./tools/mk.sh

# W-번호 backlog → topic entity
for w in $(ls ../work/active/W-*.md 2>/dev/null | xargs -n1 basename | sed 's/.md$//'); do
  "$MK" track "$w" --type concept --source "work/active/${w}.md" 2>/dev/null || true
done

# Agent IDs → person entity
for f in memory/sessions/agents/A*.jsonl; do
  aid=$(basename "$f" .jsonl)
  "$MK" track "$aid" --type person --source "memory/sessions/agents/${aid}.jsonl" 2>/dev/null || true
done

# Major modules → topic entity
for mod in engine/copy_trading engine/search engine/features engine/patterns engine/memory; do
  "$MK" track "$(basename $mod)" --type topic --source "$mod/" 2>/dev/null || true
done

"$MK" index
```

세션 시작 시 한 번만 실행 (idempotent — 이미 있으면 skip).

---

## Phase B: 슬래시 커맨드 풀세트

| 커맨드 | 동작 | memkraft mapping |
|---|---|---|
| `/start` | 세션 시작 + Agent ID | `dream --dry-run` + `open-loops --dry-run` |
| `/save "next"` | 세션 중간 체크포인트 | `log --event "..." --tags "checkpoint"` ×2 |
| `/end "shipped" "handoff"` | 세션 종료 | `log --event "..." --tags "session,end"` + `retro --dry-run` |
| `/claim "domain"` | file-domain lock | `spec/CONTRACTS.md` (memkraft 외부) |
| `/agent-status` | 현재 상태 | read-only — 여러 파일 합본 |
| `/retro [--save]` | 일일 회고 | `retro` |
| `/decision "what" "why" "how"` | 결정 기록 | `log --decision "..." --tags "architecture"` |
| `/incident "title" "symptoms"` | 사고 기록 | manual incident_record (mk.py) |
| `/open-loops` | 미해결 항목 보기 | `open-loops` |
| `/search "query"` | 메모리 검색 | `search --fuzzy` |
| `/lookup "name"` | entity 조회 | `lookup --brain-first` |

---

## Phase C: 자동 흐름 (다음 PR)

### PR 머지 hook
PR 머지 시 자동으로:
1. `./tools/mk.sh log --event "PR #N merged: <title>" --tags "pr,merge"`
2. `./tools/mk.sh distill-decisions` 실행 → 후보 알림

### Daily cron
하루 1회 (idle 시):
1. `./tools/mk.sh dream` — 메모리 정리, 약한 entity 강화
2. `./tools/mk.sh retro --save` — 어제 events 기반 자동 회고
3. `./tools/mk.sh index` — 인덱스 재생성

### Pre-commit hook
변경된 파일에서 새 entity 자동 감지:
1. `./tools/mk.sh detect "$(git diff --cached)"` → 새 person/company/concept 발견
2. 추가 등록 안내 (자동 등록은 dry-run, 사용자 확인 후 적용)

---

## Phase D: AGENTS.md 갱신

기존 Bootstrap 섹션을 확장:

```markdown
## Bootstrap (Multi-Agent OS v2 + MemKraft)

Every session starts with `/start` (or `./tools/start.sh`).

### MemKraft 일일 사용
- 결정: `./tools/mk.sh log --decision "..."` 또는 `/decision`
- 사고: `mk.incident_record(...)` 또는 `/incident`
- 진척: `/save "다음에 할 일"` (자동 memkraft log + per-agent jsonl)
- 회고: 세션 끝 `/retro --save`
- 검색: `./tools/mk.sh search "query"` 또는 `/search`

### MemKraft 작동 원칙
- 모든 memkraft 명령은 `./tools/mk.sh` 후 실행 (`MEMKRAFT_DIR` 고정)
- `.memkraft/index.json`은 cache — gitignore
- `memory/RESOLVER.md` 결정 트리 — 새 정보 저장 전 참조
```

---

## Phase E: 검증

### Smoke test
```bash
# 1. start
./tools/start.sh
# Agent A### 자동 발번 + memkraft open-loops 표시

# 2. claim
./tools/claim.sh "engine/test/"
# spec/CONTRACTS.md에 lock 추가

# 3. save (memkraft log)
./tools/save.sh "test next"
# memory/sessions/{date}.jsonl + agents/A###.jsonl 동시 append

# 4. end (memkraft log + retro)
./tools/end.sh "in-branch" "test handoff"
# spec/CONTRACTS.md lock 해제 + memkraft retro 미리보기
```

### Self-check
- `./tools/mk.sh index` — 모든 .md 파일 인덱싱
- `./tools/mk.sh list` — 등록된 entity 목록
- `./tools/mk.sh search "Agent"` — A### 검색되는지

---

## Phase F: 다음 단계 (별도 PR)

- design/current/ + invariants.yml + verify_design.sh
- .gitattributes hook 정책
- PR 머지 시 자동 memkraft log webhook
- Daily cron (dream + retro --save + index)
