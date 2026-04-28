# W-0297 — Cursor-grade 코드 정확도 인프라 (LSP + MCP + 도메인 분기)

> Wave: 5 (Productivity) | Priority: P1 | Effort: M (1.5일)
> Charter: In-Scope (코어 갭 작업 효율 향상 — 도구 사용, 빌드 아님)
> Status: 🟡 Design Approved
> Created: 2026-04-29
> Issue: #582

---

## Goal

에이전트가 "이 함수가 어디서 쓰이는지", "GateV2DecisionStore 관련 모든 파일", "이 import 정의 위치" 같은 질의를 수동 grep 없이 1회 호출로 정확하게 답할 수 있게 한다. 코드 탐색 Read tool 호출 수 기준 ≥ 50% 감소.

---

## §Frozen 검토

- ✅ Claude Code 내장 LSP tool **사용** = §Frozen 아님 ("기존 도구 사용 ✅")
- ✅ MCP 서버 **설치** (serena 등) = §Frozen 아님 ("기존 도구 사용 ✅")
- ✅ AGENTS.md 도메인 sub-file 분기 = 기존 파일 분할 (새 시스템 빌드 아님)
- ❌ 250줄+ 신규 벡터 인덱서 직접 빌드 = §Frozen (본 설계 제외)

---

## Scope

### A. LSP Tool 활성화

`.claude/settings.json` allow 목록에 `LSP` 추가:
```json
"Bash(LSP*)" 또는 "LSP(*)"
```

AGENTS.md에 사용 패턴 명시:
```
심볼 정의 탐색: LSP(go-to-definition, file, line, col)
참조 목록: LSP(find-references, symbol)
```

### B. 코드베이스 의미 검색 MCP 설치

`.mcp.json` 등록 옵션 (우선순위 순):
1. **serena** (Zed/Claude Code 통합) — AST + symbol graph
2. **codebase-rag** — 경량 벡터 인덱스
3. **tree-sitter MCP** — AST 파싱 기반

설치 형식 (`.mcp.json`):
```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": ["serena@latest"],
      "env": {"SERENA_PROJECT_ROOT": "."}
    }
  }
}
```

인덱싱 대상: `engine/` + `app/src/` (약 1,300파일, ~200K LOC)

### C. AGENTS.md 도메인 sub-file 분기

| 파일 | 대상 | 로드 조건 |
|---|---|---|
| `agents/engine.md` | engine/ 작업 시 필수 | Python 파일 수정, pytest 실행 |
| `agents/app.md` | app/src/ 작업 시 필수 | Svelte/TS 파일 수정 |
| `agents/coordination.md` | 멀티 에이전트 조율 | worktree/PR/머지 작업 |

CLAUDE.md L1-L20에 도메인 분기 표 추가:
```
| 작업 유형 | 필수 로드 파일 |
|---|---|
| engine/ 수정 | AGENTS.md + agents/engine.md |
| app/src/ 수정 | AGENTS.md + agents/app.md |
| PR/머지 | AGENTS.md + agents/coordination.md |
```

### D. context7 MCP 활성화 패턴

이미 설치됨 (plugin lazy-loaded). 사용 가이드라인 추가:
- 외부 라이브러리 (svelte 5, fastapi, pydantic v2, supabase-py) 문서 lookup 시 호출
- `@library version` → `mcp__plugin_context7_context7__resolve-library-id` → `query-docs`

---

## 파일 목록

| 파일 | 변경 유형 |
|---|---|
| `.claude/settings.json` | 수정 (LSP allow 추가) |
| `.mcp.json` | 신규 (project root — MCP 서버 등록) |
| `CLAUDE.md` | 수정 (도메인 분기 표, L1-L20) |
| `AGENTS.md` | 수정 (도메인 분기 안내 + context7 패턴) |
| `agents/engine.md` | 신규 (engine 작업 컨텍스트) |
| `agents/app.md` | 신규 (app 작업 컨텍스트) |
| `agents/coordination.md` | 신규 (멀티 에이전트 조율 컨텍스트) |

---

## Non-Goals

- ❌ 벡터 인덱서 직접 빌드 (§Frozen)
- ❌ 신규 250줄+ 도구 빌드
- ❌ AGENTS.md 전체 재작성 (W-0291 트리밍과 분리)

---

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| agents/engine.md 분리 후 에이전트가 놓침 | 중 | 중 | CLAUDE.md 도메인 분기 표 의무화 + start.sh 출력 hint |
| MCP 서버 index 시간 (초기) | 중 | 낮 | 백그라운드 인덱싱, 첫 쿼리만 느림 |
| LSP tool 호출 schema 변경 | 낮 | 낮 | deferred tool → ToolSearch로 최신 schema 확인 후 사용 |
| .mcp.json 미설치 환경에서 fallback | 낮 | 낮 | MCP 없으면 기존 grep fallback (기능 저하, 중단 아님) |

### Rollback
- LSP allow: settings.json revert 1줄
- MCP: .mcp.json 삭제 (서버 프로세스 자동 종료)
- sub-file: git revert (CLAUDE.md + AGENTS.md 묶음)

---

## AI Researcher 관점

### 정확도 예상 개선
- 심볼 탐색: grep 기반 오탐 ~30% → LSP 기반 오탐 ~5% (심볼명 충돌 제거)
- 의미 검색: 파일명 기반 → 코드 의미 기반, 관련 파일 회수율 ↑
- 컨텍스트 오염: 무관한 grep 결과 로딩 → 관련 파일만 → 할루시네이션 ↓

### Failure Modes
- MCP 서버 불안정 → `grep` fallback 지속 가능 (degraded mode)
- LSP 정의 점프 실패 (생성된 파일 등) → 수동 Read로 보완
- 인덱싱 범위 초과 (~200K LOC) → serena 성능 검증 필요

---

## 구현 계획

1. **serena MCP 평가** (2h): 설치 + `cogotchi-engine` 루트 인덱싱 + "GateV2DecisionStore" 쿼리 결과 검증
2. **LSP tool allow 추가** (30min): settings.json 수정 + deferred ToolSearch로 스키마 확인
3. **도메인 sub-file 작성** (3h): agents/engine.md, agents/app.md, agents/coordination.md
4. **CLAUDE.md 도메인 표 추가** (30min)
5. **AGENTS.md context7 패턴 섹션** (30min)
6. **검증** (1h): AC1~AC3 각각 수동 테스트

---

## Exit Criteria

- [ ] AC1: LSP tool → `engine/api/routes/patterns.py`의 `parse_pattern` 정의에 정확 점프 (수동 검증)
- [ ] AC2: MCP semantic query → "GateV2DecisionStore" 키워드로 관련 파일 5+ 자동 회수 (serena 또는 대안)
- [ ] AC3: 평균 코드 탐색 Read tool 호출 수 baseline 대비 ≥ 50% 감소 (3회 시나리오 측정)
- [ ] AC4: `agents/engine.md`, `agents/app.md`, `agents/coordination.md` 3개 파일 존재
- [ ] AC5: `head -20 CLAUDE.md`에 도메인 분기 표 포함
- [ ] CI green (engine + app)

---

## Decisions

- **[D-0290-1]** sub-file 분리 (`agents/{domain}.md`): AGENTS.md 단일 파일 항상 364L 로드 대신 도메인별 분기. 거절: "AGENTS.md 한 파일 유지" — 현재 비용 가장 큼.
- **[D-0290-2]** MCP codebase 인덱서: 직접 빌드 ❌ (§Frozen 250줄+), 기존 서버 install ✅ (serena oraios, 조사 중).
- **[D-0290-3]** LSP tool: deferred 유지, ToolSearch로 on-demand. 전부 활성화 → 매 세션 schema 로드 비용 역행.

## Open Questions

- [ ] [Q-0290-1] serena (oraios, 코드 인텔리전스) vs codebase-rag: Python+TypeScript 혼합 레포에서 어느 MCP가 더 안정적?
- [ ] [Q-0290-2] LSP tool — ToolSearch 스키마 로드 후 실제 호출 테스트 필요
- [ ] [Q-0290-3] agents/ 디렉토리가 다른 용도로 쓰이면 → `docs/claude-context/` 대안

## Owner

meta (agent productivity — engine/app 둘 다 영향)

## Canonical Files

- `CLAUDE.md` (도메인 분기 표)
- `AGENTS.md` (context7 패턴 + LSP 가이드)
- `agents/engine.md`, `agents/app.md`, `agents/coordination.md` (신규)
- `.claude/settings.json` (LSP allow 추가)
- `.mcp.json` (신규 — MCP 서버 등록)

## Facts

- `agents/engine.md`, `agents/app.md`, `agents/coordination.md` 3개 신규 파일 생성 완료 ✅
- CLAUDE.md에 도메인 분기 표 추가 완료 ✅
- LSP deferred tool: system-reminder에서 이미 노출됨 — ToolSearch로 schema 로드 가능
- serena pypi package (0.9.1) = AMQP 클라이언트 (다른 것). oraios/serena = 코드 인텔리전스 MCP (별도 설치)
- context7 MCP: plugin lazy-loaded, 이미 사용 가능

## Assumptions

- `.mcp.json` 설치 시 Claude Code 재시작 필요
- LSP tool은 deferred — 매 세션 ToolSearch 없이도 사용 가능 (schema auto-loaded when called)

## Next Steps

1. oraios/serena MCP 설치 방법 확인 (uvx or npm)
2. `.mcp.json` 신규 생성 + engine/ + app/src/ 인덱싱
3. `.claude/settings.json` allow에 LSP 추가
4. AC1~AC3 수동 검증

## Handoff Checklist

- [x] agents/ 도메인 sub-file 3개 생성
- [x] CLAUDE.md 도메인 분기 표 추가
- [ ] MCP 코드베이스 인덱서 설치 (.mcp.json)
- [ ] LSP tool 실제 호출 테스트
- [ ] AC1~AC3 수동 검증
