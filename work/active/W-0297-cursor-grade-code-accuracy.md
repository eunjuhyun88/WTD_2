# W-0297 — Cursor-grade 코드 정확도 인프라 (LSP + MCP + 도메인 분기)

> Wave: 5 (Productivity) | Priority: P1 | Effort: M (1.5일)
> Charter: In-Scope (코어 갭 작업 효율 향상 — 도구 사용, 빌드 아님)
> Status: 🟢 Phase A ✅ Phase B ✅ — 구현 완료, AC 검증 대기
> Created: 2026-04-29
> Issue: #582

---

## Goal

에이전트가 "이 함수가 어디서 쓰이는지", "GateV2DecisionStore 관련 모든 파일", "이 import 정의 위치" 같은 질의를 수동 grep 없이 1회 호출로 정확하게 답할 수 있게 한다. 코드 탐색 Read tool 호출 수 기준 ≥ 50% 감소.

---

## §Frozen 검토

- ✅ Claude Code 내장 LSP tool **사용** = §Frozen 아님
- ✅ MCP 서버 **설치** (oraios/serena) = §Frozen 아님
- ✅ AGENTS.md 도메인 sub-file 분기 = 기존 파일 분할
- ❌ 250줄+ 신규 벡터 인덱서 직접 빌드 = §Frozen (제외)

---

## Scope

### A. LSP Tool 활성화 ✅

`.claude/settings.json` permissions.allow에 추가 완료:
```json
"LSP(go-to-definition)",
"LSP(find-references)",
"LSP(hover)"
```

`LSP(*)` 와일드카드 거절 — rename/code-action 등 의도치 않은 권한 확장 방지.

사용 패턴 (AGENTS.md `/컨텍스트` 섹션 참조):
```
정의 점프:  LSP(go-to-definition, file=<path>, line=<n>, col=<n>)
참조 회수:  LSP(find-references, symbol=<name>)
시그니처:   LSP(hover, file=<path>, line=<n>, col=<n>)
```

### B. 코드베이스 의미 검색 MCP 설치 ✅

**선택: oraios/serena** — LSP 기반 symbol graph, Python+TypeScript 동시 지원, uvx 무설치 실행.

| 후보 | 결정 | 이유 |
|---|---|---|
| **oraios/serena** | ✅ 채택 | pyright+tsserver 백엔드, find_symbol/search_for_pattern 제공 |
| codebase-mcp | ❌ | Python+TS 혼합 검증 부족, 정의 점프 없음 |
| tree-sitter MCP | ❌ | grep 수준 (의미 검색 없음) |
| sourcegraph cody | ❌ | 외부 서비스, 코드 업로드 보안 |

`.mcp.json` (project root):
```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": [
        "--from", "git+https://github.com/oraios/serena",
        "serena-mcp-server",
        "--context", "ide-assistant",
        "--project", "."
      ]
    }
  }
}
```

- `--context ide-assistant`: read-heavy tool만 노출 (agent 모드 거절 — 우리 hook과 충돌)
- 초기 인덱싱: ~1-2분, 이후 증분
- fallback: `.mcp.json` 없으면 git grep 동작 유지

### C. AGENTS.md 도메인 sub-file 분기 ✅

| 파일 | 대상 | 로드 조건 |
|---|---|---|
| `agents/engine.md` | engine/ 작업 시 필수 | Python 파일 수정, pytest 실행 |
| `agents/app.md` | app/src/ 작업 시 필수 | Svelte/TS 파일 수정 |
| `agents/coordination.md` | 멀티 에이전트 조율 | worktree/PR/머지 작업 |

### D. /컨텍스트 Skill 연동 (W-0299)

W-0299가 이 도구들을 on-demand context pack 생성에 활용. `.claude/commands/컨텍스트.md` 참조.

---

## 파일 목록

| 파일 | 상태 |
|---|---|
| `.claude/settings.json` | ✅ LSP allow 3줄 추가 |
| `.mcp.json` | ✅ project root 신규 |
| `CLAUDE.md` | ✅ 도메인 분기 표 추가 |
| `AGENTS.md` | ✅ /컨텍스트 섹션 추가 |
| `agents/engine.md` | ✅ 신규 |
| `agents/app.md` | ✅ 신규 |
| `agents/coordination.md` | ✅ 신규 |

---

## Non-Goals

- ❌ 벡터 인덱서 직접 빌드 (§Frozen)
- ❌ `LSP(*)` 와일드카드 (권한 범위 초과)
- ❌ AGENTS.md 전체 재작성

---

## Exit Criteria

- [ ] **AC1**: `LSP(go-to-definition)` → `engine/api/routes/patterns.py`의 parse_pattern 정의 라인 정확 반환. 검증: `git grep -n "def parse_pattern" engine/` 결과와 일치.
- [ ] **AC2**: Claude Code 재시작 후 `mcp__serena__find_symbol(name_path="GateV2DecisionStore")` → 5+ 파일 회수. 검증: `git grep -l GateV2DecisionStore | wc -l`과 동수 이상.
- [ ] **AC3**: Read tool 호출 수 baseline 대비 ≥ 50% 감소 (3 시나리오):
  - "GateV2DecisionStore 사용처": 8 → 4 이하
  - "parse_pattern caller 트레이스": 6 → 3 이하
  - "engine/verification 진입점 매핑": 10 → 5 이하
- [ ] **AC4**: `ls agents/{engine,app,coordination}.md` 3개 존재 ✅
- [ ] **AC5**: `head -20 CLAUDE.md | grep "도메인 분기"` 매칭 ✅
- [ ] **AC6**: CI green

---

## Decisions

- **[D-0297-1]** MCP 서버: oraios/serena 채택. 이유: pyright+tsserver 백엔드 (Python+TS 동시), uvx 무설치. codebase-mcp/tree-sitter/sourcegraph 거절.
- **[D-0297-2]** LSP allow 방식: 명시 3종. `LSP(*)` 와일드카드 거절 — 의도치 않은 권한 확장.
- **[D-0297-3]** serena `--context ide-assistant`: agent 모드 거절 (serena가 직접 코드 편집 → post-edit hook 충돌).

## Open Questions

- [ ] [Q-0297-1] AC1~AC3 수동 검증 — Claude Code 재시작 후 serena 인덱싱 완료 시점에 측정 필요.

## Owner

meta (agent productivity)

## Handoff Checklist

- [x] agents/ 도메인 sub-file 3개 생성
- [x] CLAUDE.md 도메인 분기 표
- [x] .mcp.json 생성 (oraios/serena)
- [x] .claude/settings.json LSP allow 추가
- [x] AGENTS.md /컨텍스트 섹션
- [ ] Claude Code 재시작 후 AC1~AC3 수동 검증
