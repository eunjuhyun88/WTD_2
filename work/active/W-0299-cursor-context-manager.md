# W-0299 — Cursor식 On-Demand 컨텍스트 관리 (/컨텍스트 skill)

> Wave: 5 (Productivity) | Priority: P1 | Effort: S (0.5일)
> Charter: In-Scope (코어 갭 작업 효율 향상 — 도구 사용, 빌드 아님)
> Status: 🟡 구현 완료 — PR 미생성, AC 검증 대기
> Created: 2026-04-29
> Issue: #615

---

## Goal

에이전트가 `/컨텍스트 "V-PV-01 구현"` 한 줄로 작업 관련 Work Item + 도메인 파일 + 코드 + 문서 + 메모리를 8k 토큰 이하 Context Pack으로 즉시 조립한다. 자동 주입이 아닌 on-demand 호출.

---

## §Frozen 검토

- ✅ `.claude/commands/컨텍스트.md` 슬래시 커맨드 = §Frozen 아님
- ✅ `tools/context-pack.sh` bash 헬퍼 = §Frozen 아님
- ❌ 250줄+ 신규 벡터 인덱서 직접 빌드 = §Frozen (제외)
- ❌ 자동 컨텍스트 주입 (ContextAssembler 신규 훅) = §Frozen (제외)

---

## Scope

### A. `/컨텍스트` Slash Command ✅

`.claude/commands/컨텍스트.md` — 3-step 조립:

1. **의도 분류**: 키워드 → domain (engine / app / coordination / unknown)
2. **Context Pack 조립** (6 레이어, ≤8k 토큰):
   - Layer 1: Work Item (Goal + Scope + Exit Criteria 슬라이스)
   - Layer 2: Domain sub-file (`agents/engine.md` or `agents/app.md`)
   - Layer 3: 코드 (MCP serena `find_symbol` 우선 → git grep fallback)
   - Layer 4: Domain doc (`docs/domains/engine.md` or `docs/domains/app.md`)
   - Layer 5: 메모리 (관련 feedback/project memory 요약)
   - Layer 6: CURRENT.md 활성 work item 테이블
3. **Pack 출력**: `## Context Pack — {의도}` 형식

도메인 감지 키워드:
- `engine`: V-*, PV-*, verify, pattern, ledger, scanner, backtest, gate, executor
- `app`: chart, svelte, ui, terminal, frontend, 프론트, 차트
- `coordination`: pr, merge, worktree, deploy, branch, 에이전트

### B. `tools/context-pack.sh` 헬퍼 ✅

bash 스크립트 (~60 LOC):
- `find_work_item()`: W-NNNN 직접 매치 또는 키워드 grep
- `slice_work_item()`: Goal + Scope + Exit Criteria 섹션만 추출
- `detect_domain()`: 소문자 키워드 매칭
- `grep_code()`: MCP 미설치 환경 git grep fallback

### C. AGENTS.md `/컨텍스트` 섹션 ✅

사용 예시 및 pack 구성 문서화.

---

## Non-Goals

- ❌ 자동 컨텍스트 주입 (on-demand only)
- ❌ 벡터 인덱서 직접 빌드 (§Frozen)
- ❌ engine/agents/context.py ContextAssembler 수정 (제품 코드 분리)

---

## 파일 목록

| 파일 | 상태 |
|---|---|
| `.claude/commands/컨텍스트.md` | ✅ 신규 |
| `tools/context-pack.sh` | ✅ 신규 |
| `AGENTS.md` | ✅ /컨텍스트 섹션 추가 |

---

## Exit Criteria

- [ ] **AC1**: `/컨텍스트 "V-PV-01 구현"` → Work Item 섹션 + engine 도메인 파일 포함 pack 출력
- [ ] **AC2**: `/컨텍스트 W-0299` → W-0299 goal + scope 포함
- [ ] **AC3**: `tools/context-pack.sh "GateV2DecisionStore" engine` → Goal/Scope + engine.md + code grep 결과 출력
- [ ] **AC4**: 토큰 예산 초과 시 Layer 5→4→3 순서로 truncation (≤8k)
- [ ] **AC5**: CI green

---

## Decisions

- **[D-0299-1]** on-demand 방식 채택. 자동 주입 거절 — 작업 범위 외 컨텍스트 오염 방지.
- **[D-0299-2]** bash + skill 조합. Python 신규 모듈 거절 — 오버킬, §Frozen 위험.
- **[D-0299-3]** MCP serena 우선, git grep fallback. 환경 독립성 유지.

## Open Questions

- [ ] [Q-0299-1] AC1~AC4 수동 검증 — Claude Code 재시작 후 실측 필요.

## Owner

meta (agent productivity)

## Facts

- `engine/agents/context.py` ContextAssembler 패턴 참조 (token budget + lazy load + truncation)
- `.claude/commands/컨텍스트.md` 슬래시 커맨드로 즉시 실행 가능
- W-0297 serena MCP가 Layer 3 코드 회수 품질 향상

## Assumptions

- Claude Code가 `.claude/commands/` 디렉토리를 슬래시 커맨드로 자동 인식
- `tools/context-pack.sh`는 serena MCP 없이도 git grep fallback으로 동작

## Canonical Files

- `.claude/commands/컨텍스트.md`
- `tools/context-pack.sh`
- `AGENTS.md` (/컨텍스트 섹션)

## Next Steps

1. Claude Code 재시작 후 AC1~AC4 수동 검증
2. W-0297 AC1~AC3 검증과 동시 진행

## Handoff Checklist

- [x] `.claude/commands/컨텍스트.md` 생성
- [x] `tools/context-pack.sh` 생성
- [x] `AGENTS.md` /컨텍스트 섹션
- [ ] Claude Code 재시작 후 AC1~AC4 수동 검증
