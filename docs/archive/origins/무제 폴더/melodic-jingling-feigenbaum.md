# memento-kit v2: 최적 구조 설계

## Context

memento-kit v1은 9,300줄(63 scripts)인데, Claude Code가 이미 내장한 기능을 bash로 재구현한 부분이 대부분이다.

**버려야 할 것 (Claude Code가 이미 가진 것):**
- 메모리 시스템 → Claude Code `memdir/` (4-type taxonomy, MEMORY.md index, Sonnet 기반 relevance selection)
- 세션 복원 → Claude Code `/resume` + session memory
- 컨텍스트 압축 → Claude Code autocompact + microcompact
- 문서 검색 → Claude Code grep/glob + memory scan
- 에이전트 스폰 → Claude Code Agent tool + coordinator mode
- 권한 관리 → Claude Code permission system
- git hooks → Claude Code hook system (27 events, 4 types)

**살려야 할 것 (Claude Code에 없는 것):**
- 작업 상태 추적 (누가 뭘 하고 있고, 다음에 뭘 해야 하는지)
- 에이전트 간 조율 (경로 소유권, 충돌 방지)
- 자동 핸드오프 (세션 끝날 때 자동으로 "다음 할 일" 기록)

## 목표

1. **컨텍스트 최적화**: 에이전트가 레포 진입 시 즉시 파악
2. **능동적 에이전트 협업**: 에이전트끼리 일 나누고 상태 공유
3. **자동 작업 연속성**: "다음에 뭘 해야 하는지" 항상 자동 기록

## 설계: ~500줄로 줄인 구조

### 전체 파일 구조

```
.claude/
├── settings.json              # hooks 등록 (핵심 자동화)
├── agents/
│   ├── planner.md             # 태스크 분해 + 할당
│   ├── implementer.md         # 구현 전담
│   ├── reviewer.md            # 리뷰 전담
│   └── orchestrator.md        # 전체 조율 (coordinator mode용)
├── commands/
│   ├── handoff.md             # /handoff — 수동 핸드오프 생성
│   ├── status.md              # /status — 현재 작업 상태 확인
│   └── next.md                # /next — 마지막 핸드오프에서 이어하기
├── hooks/
│   ├── auto-handoff.sh        # SessionEnd → workstate.json 자동 업데이트
│   └── session-boot.sh        # SessionStart → 마지막 핸드오프 주입
└── memory/
    └── MEMORY.md              # Claude Code 네이티브 메모리 (자동 관리)

project root/
├── CLAUDE.md                  # 에이전트 진입점 (최소한의 라우팅 맵)
└── .workstate.json            # 작업 상태 (태스크, 할당, 다음 액션)
```

총 파일: ~15개. 코드: ~500줄.

---

### 핵심 컴포넌트 상세

#### 1. `.workstate.json` — 단일 진실 소스 (~50줄 JSON)

memento-kit v1의 tasks.jsonl + claims/ + checkpoints/ + briefs/ + handoffs/를 **하나의 파일**로 대체.

```json
{
  "project": "my-project",
  "updated": "2026-04-05T14:30:00Z",
  "currentWork": {
    "id": "W-042",
    "objective": "인증 시스템 리팩토링",
    "surface": "auth",
    "branch": "feat/auth-refactor",
    "agent": "implementer",
    "ownedPaths": ["src/auth/", "src/middleware/auth.ts"],
    "decisions": [
      "JWT → session 기반으로 전환",
      "Redis session store 사용"
    ],
    "blockers": [],
    "startedAt": "2026-04-05T10:00:00Z"
  },
  "nextActions": [
    "session middleware 구현",
    "기존 JWT 토큰 마이그레이션 스크립트 작성",
    "통합 테스트 추가"
  ],
  "backlog": [
    {"id": "W-043", "objective": "rate limiting 추가", "priority": "medium"},
    {"id": "W-044", "objective": "OAuth2 provider 연동", "priority": "low"}
  ],
  "lastHandoff": {
    "from": "implementer",
    "at": "2026-04-05T14:30:00Z",
    "summary": "session store 기본 구조 완성. Redis 연결 설정 남음.",
    "filesChanged": ["src/auth/session.ts", "src/config/redis.ts"],
    "openQuestions": ["Redis cluster vs standalone?"]
  }
}
```

**왜 이게 나은가:**
- v1: 6개 디렉토리, 10+ 파일, 별도 스크립트로 읽기/쓰기 → 아무도 안 씀
- v2: 1개 JSON 파일 → 에이전트가 직접 읽고 쓸 수 있음 (Tool 불필요)
- git으로 버전 관리됨, diff로 변경 추적 가능

#### 2. `CLAUDE.md` — 최소 라우팅 맵 (~30줄)

```markdown
# Project Name

## What This Is
한줄 설명.

## Architecture
- `src/auth/` — 인증 시스템
- `src/api/` — API 라우트
- `src/db/` — 데이터베이스 레이어

## Current Work
See `.workstate.json` for live task state.

## Agent Protocol
1. 세션 시작 → `.workstate.json` 읽기
2. 작업 시작 → `currentWork` 업데이트
3. 작업 중 → `nextActions` 실시간 갱신
4. 세션 종료 → `lastHandoff` 자동 기록 (hook)
```

**왜 이게 나은가:**
- v1 AGENTS.md: 200줄+ 규칙집 → 에이전트가 안 읽음
- v2 CLAUDE.md: 30줄 → Claude Code가 자동으로 매 세션 로드

#### 3. `.claude/hooks/auto-handoff.sh` — 자동 핸드오프 (~80줄)

**트리거**: `SessionEnd` hook

```bash
#!/bin/bash
# SessionEnd hook: 자동으로 workstate.json의 lastHandoff 업데이트
# stdin으로 세션 transcript 요약이 들어옴

WORKSTATE=".workstate.json"
if [ ! -f "$WORKSTATE" ]; then exit 0; fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
CHANGED_FILES=$(git diff --name-only HEAD~1 2>/dev/null | head -10 | jq -R . | jq -s .)

# workstate.json 업데이트
jq --arg ts "$TIMESTAMP" \
   --arg branch "$BRANCH" \
   --argjson files "$CHANGED_FILES" \
   '.lastHandoff.at = $ts | .lastHandoff.filesChanged = $files' \
   "$WORKSTATE" > "${WORKSTATE}.tmp" && mv "${WORKSTATE}.tmp" "$WORKSTATE"
```

**왜 이게 나은가:**
- v1: checkpoint를 수동으로 찍어야 함 → 아무도 안 찍음 → 빈 껍데기
- v2: SessionEnd에 자동 실행 → 무조건 기록됨

#### 4. `.claude/hooks/session-boot.sh` — 세션 부트 (~40줄)

**트리거**: `SessionStart` hook

```bash
#!/bin/bash
# SessionStart hook: workstate.json 내용을 에이전트에 주입

WORKSTATE=".workstate.json"
if [ ! -f "$WORKSTATE" ]; then exit 0; fi

echo "=== WORK STATE ==="
cat "$WORKSTATE"
echo "=== END WORK STATE ==="
```

hook output이 세션 컨텍스트에 자동 주입됨.

#### 5. `.claude/settings.json` — hook 등록 (~30줄)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "bash .claude/hooks/session-boot.sh",
        "timeout": 5000
      }
    ],
    "SessionEnd": [
      {
        "type": "command",
        "command": "bash .claude/hooks/auto-handoff.sh",
        "timeout": 5000
      }
    ],
    "PreToolUse": [
      {
        "type": "command",
        "command": "bash .claude/hooks/check-ownership.sh",
        "if": "Edit(*) || Write(*)",
        "timeout": 3000
      }
    ]
  }
}
```

#### 6. `.claude/hooks/check-ownership.sh` — 경로 소유권 체크 (~60줄)

**트리거**: `PreToolUse` (Edit, Write)

```bash
#!/bin/bash
# 다른 에이전트가 소유한 경로에 쓰려고 하면 경고
# stdin: {"tool":"Edit","input":{"file_path":"src/auth/session.ts",...}}

WORKSTATE=".workstate.json"
if [ ! -f "$WORKSTATE" ]; then
  echo '{"decision":"approve"}'
  exit 0
fi

FILE_PATH=$(cat /dev/stdin | jq -r '.input.file_path // .input.filePath // ""')
OWNED_PATHS=$(jq -r '.currentWork.ownedPaths[]?' "$WORKSTATE" 2>/dev/null)

# 소유 경로 내면 approve, 아니면 경고
for owned in $OWNED_PATHS; do
  if [[ "$FILE_PATH" == "$owned"* ]]; then
    echo '{"decision":"approve"}'
    exit 0
  fi
done

echo '{"decision":"ask","message":"이 파일은 현재 작업 범위 밖입니다. 계속하시겠습니까?"}'
```

#### 7. 에이전트 정의 (각 ~40줄)

`.claude/agents/orchestrator.md`:
```markdown
---
name: orchestrator
description: 태스크를 분해하고 에이전트에 할당. workstate.json을 관리.
model: opus
tools: Agent, Read, Write, Glob, Grep, Bash
---

You are the orchestrator agent. Your job:
1. Read .workstate.json to understand current state
2. Break objectives into tasks
3. Assign tasks to planner/implementer/reviewer agents
4. Update .workstate.json with assignments and progress
5. After each agent completes, update nextActions

Always update .workstate.json before and after delegating work.
```

`.claude/agents/implementer.md`:
```markdown
---
name: implementer
description: 코드 구현 전담. workstate의 currentWork를 실행.
tools: Read, Write, Edit, Bash, Glob, Grep
---

You are the implementer agent.
1. Read .workstate.json → currentWork
2. Execute the first item in nextActions
3. After completing, update nextActions (remove done, add new if discovered)
4. If blocked, add to blockers array
```

#### 8. 커맨드 (각 ~20줄)

`.claude/commands/status.md`:
```markdown
Read .workstate.json and give me a concise status report:
- Current work: what's being done
- Next actions: what's queued
- Last handoff: when and what was handed off
- Blockers: anything stuck
```

`.claude/commands/next.md`:
```markdown
Read .workstate.json, pick the first item from nextActions,
update currentWork, and start working on it.
If nextActions is empty, check backlog.
```

`.claude/commands/handoff.md`:
```markdown
Create a handoff by updating .workstate.json:
1. Summarize what was done this session
2. List files changed
3. Update nextActions with remaining work
4. Set lastHandoff with summary and open questions
Then show me the updated state.
```

---

### v1 → v2 매핑: 뭘 버리고 뭘 남기나

| v1 (9,300줄) | v2 | 이유 |
|---|---|---|
| `setup.sh` (772줄) | 삭제 | Claude Code가 .claude/ 구조 자동 인식 |
| `setup-memory.sh` | 삭제 | Claude Code 네이티브 메모리 사용 |
| `setup-runtime.sh` | 삭제 | hooks로 대체 |
| `setup-orchestrator.sh` | 삭제 | orchestrator agent로 대체 |
| `.agent-context/` (6 dirs) | `.workstate.json` (1 file) | 단일 파일이 6개 디렉토리보다 낫다 |
| `coordination-lib.mjs` (313줄) | `check-ownership.sh` (60줄) | PreToolUse hook으로 단순화 |
| `context-retrieval-lib.mjs` (327줄) | 삭제 | Claude Code 내장 grep/glob + memory |
| `context-checkpoint.sh` (221줄) | `auto-handoff.sh` (80줄) | 수동→자동, 메타데이터 최소화 |
| `context-restore.sh` (167줄) | `session-boot.sh` (40줄) | SessionStart hook 자동 주입 |
| `context-compact.sh` (416줄) | 삭제 | Claude Code autocompact 사용 |
| `run-orchestrator-once.mjs` | `orchestrator.md` agent | Agent tool이 실행 엔진 |
| 63 scripts, 40+ npm commands | 4 hooks + 3 commands + 4 agents | 15개 파일로 충분 |

### 데이터 흐름

```
세션 시작
  ↓
SessionStart hook → .workstate.json 읽어서 컨텍스트 주입
  ↓
CLAUDE.md 자동 로드 (Claude Code 내장)
  ↓
memory/MEMORY.md 자동 로드 (Claude Code 내장)
  ↓
에이전트 작업 중
  ├── /status → 현재 상태 확인
  ├── /next → 다음 작업 시작
  ├── orchestrator agent → 태스크 분배
  ├── implementer/reviewer agent → 실제 작업
  └── PreToolUse hook → 소유권 체크
  ↓
작업 중 .workstate.json 실시간 갱신 (에이전트가 직접)
  ↓
세션 종료
  ↓
SessionEnd hook → lastHandoff 자동 기록
  ↓
다음 세션 → SessionStart hook → 이전 handoff 자동 복원
```

### 멀티 에이전트 협업 흐름

```
사용자: "인증 시스템 리팩토링해줘"
  ↓
orchestrator agent 호출
  ├── .workstate.json 읽기
  ├── 태스크 분해: [session store, migration, tests]
  ├── .workstate.json 업데이트 (currentWork, nextActions)
  ├── implementer agent 스폰 → session store 구현
  │     └── 완료 → nextActions에서 제거
  ├── implementer agent 스폰 → migration 구현
  │     └── 완료 → nextActions에서 제거
  └── reviewer agent 스폰 → 전체 리뷰
        └── 이슈 발견 → nextActions에 추가
  ↓
orchestrator → .workstate.json 최종 업데이트
  ↓
사용자에게 결과 보고
```

---

## 구현 순서

### Step 1: 프로젝트 루트에 기반 파일 생성
- `.workstate.json` (초기 상태)
- `CLAUDE.md` (최소 라우팅 맵)

### Step 2: hooks 구현
- `.claude/hooks/session-boot.sh`
- `.claude/hooks/auto-handoff.sh`
- `.claude/hooks/check-ownership.sh`
- `.claude/settings.json`에 hook 등록

### Step 3: 에이전트 정의
- `.claude/agents/orchestrator.md`
- `.claude/agents/planner.md`
- `.claude/agents/implementer.md`
- `.claude/agents/reviewer.md`

### Step 4: 커맨드 정의
- `.claude/commands/status.md`
- `.claude/commands/next.md`
- `.claude/commands/handoff.md`

### Step 5: 검증
- 새 세션 시작 → session-boot hook이 workstate 주입하는지 확인
- /status 명령 → 현재 상태 표시되는지 확인
- /next 명령 → 작업 시작 + workstate 갱신되는지 확인
- 세션 종료 → auto-handoff가 lastHandoff 업데이트하는지 확인
- 다시 세션 시작 → 이전 handoff가 주입되는지 확인

### 적용 대상
- memento-kit 레포 자체가 아닌, memento-kit을 **사용할 타겟 프로젝트**에 설치
- 또는 memento-kit 레포를 이 구조로 재작성하여 `setup.sh` 하나로 위 파일들을 타겟에 복사

### 라인 수 추정
| 파일 | 줄 |
|---|---|
| .workstate.json | ~40 |
| CLAUDE.md | ~30 |
| session-boot.sh | ~40 |
| auto-handoff.sh | ~80 |
| check-ownership.sh | ~60 |
| settings.json (hooks) | ~30 |
| 4 agents (각 40줄) | ~160 |
| 3 commands (각 20줄) | ~60 |
| **총** | **~500줄** |

v1 대비 **18배 축소** (9,300 → 500), 기능은 더 실용적.
