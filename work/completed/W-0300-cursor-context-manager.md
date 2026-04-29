# W-0299 — Cursor-style Context Manager

> Wave: 5 (Productivity) | Priority: P1 | Effort: S (0.5일)
> Charter: In-Scope (개발 에이전트 툴링 — 기존 harness 확장, 신규 시스템 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Issue: TBD
> Depends on: W-0297 Phase B (.mcp.json + LSP allow 완료 후 풀 체인 테스트 가능)

---

## Goal

`/컨텍스트 "V-PV-01 구현"` 같은 on-demand 명령으로, 해당 작업에 필요한 코드·문서·메모리를 8k token 이하로 압축한 Context Pack을 즉시 출력한다. 에이전트가 작업 시작마다 수동으로 파일을 찾아 읽는 탐색 비용을 제거한다.

---

## 배경: engine/agents/context.py 패러다임

`engine/agents/context.py`의 `ContextAssembler`가 이미 동일한 패턴을 제품 내부 LLM 에이전트에 적용 중:
- Parser (~10K), Judge (~12K), Refinement (~12K) agent별 token budget 관리
- 지연 로딩 + 예산 초과 시 truncate
- "no agent should build its own context ad-hoc" 원칙

W-0299는 이 패턴을 **Claude Code 개발 에이전트 레이어**로 가져온다.
대상이 바뀔 뿐 구조는 동일: 입력(task description) → 분류(domain + work item) → 조립(코드+문서+메모리) → 출력(8k pack).

---

## §Frozen 검토

- ✅ Skill 파일 신규 (~80줄 markdown) = §Frozen 250줄 미달
- ✅ tools/context-pack.sh 신규 (~60줄 bash) = §Frozen 미달
- ✅ W-0297 MCP/LSP tool 호출 = 기존 도구 사용
- ❌ 전용 벡터 인덱서 빌드 = §Frozen (serena가 대신)
- ❌ 자동 주입 (hook → context window) = 미검증, Phase 2 deferred

---

## Scope

### A. `/컨텍스트` Skill 파일

`skills/컨텍스트.md` (Claude Code skill) — 사용자가 `/컨텍스트 "<task>"` 입력 시 실행.

**3단계 어셈블리**:

1. **의도 분류** (Intent Classification)
   - task description → domain (`engine` / `app` / `coordination`) + work item ID
   - 매칭 규칙:
     | 키워드 패턴 | 도메인 | 예시 |
     |---|---|---|
     | V-*, PV-*, 검증, verify | engine | "V-PV-01 구현" |
     | 패턴, 레저, scanner | engine | "GateV2 확장" |
     | 차트, 터미널, Svelte, UI | app | "차트 그리기 툴" |
     | PR, 머지, worktree, 배포 | coordination | "PR #601 머지" |
     | W-NNNN 직접 명시 | CURRENT.md에서 도메인 조회 | "W-0298 완료" |

2. **컨텍스트 조립** (Context Assembly, 우선순위 순)

   | 레이어 | 소스 | 예산 |
   |---|---|---|
   | Work item | `work/active/W-NNNN-*.md` (Goal + Scope + Exit Criteria만) | ~1k |
   | Domain sub-file | `agents/<domain>.md` | ~0.5k |
   | 관련 코드 | `mcp__serena__find_symbol` + `mcp__serena__search_for_pattern` | ~3k |
   | Domain doc | `docs/domains/<area>.md` 해당 섹션 | ~1.5k |
   | Memory | `memory/` 관련 스니펫 (grep 매칭) | ~0.5k |
   | Open work | `CURRENT.md` active items 테이블만 | ~0.5k |
   | **총계** | | **≤ 8k tokens** |

   초과 시 코드 레이어부터 trim (도메인 sub-file·work item은 절대 trim 안 함).

3. **Pack 출력**
   ```
   ── Context Pack: <task> ──────────────────────
   📋 Work Item: W-NNNN (Goal / Scope / Exit Criteria)
   🗂  Domain: engine → agents/engine.md 요약
   🔍 Relevant Code:
     engine/verification/executor.py (lines 12-45)
     engine/api/routes/patterns.py (lines 88-103)
   📄 Domain Doc: docs/domains/verification.md §통계 검증
   🧠 Memory: [관련 메모리 스니펫]
   ─────────────────────────────────────────────
   Total: ~5,200 tokens
   ```

### B. tools/context-pack.sh (~60 LOC)

skill이 호출하는 bash 스크립트. skill이 순수 markdown instruction이면 불필요하지만, token 계산 + 파일 슬라이싱은 shell이 더 정확.

- `work/active/` 에서 work item 검색 (W-NNNN 또는 키워드 grep)
- `agents/<domain>.md` 직접 read
- MCP 미설치 환경에서는 `git grep -n "<keyword>"` fallback

---

## 파일 목록

| 파일 | 변경 유형 | LOC |
|---|---|---|
| `skills/컨텍스트.md` | 신규 | ~80 |
| `tools/context-pack.sh` | 신규 | ~60 |
| `AGENTS.md` | 수정 (사용법 예시 1단락 추가) | +5 |

총 ~145 LOC. §Frozen 250줄 한계의 58%.

---

## Non-Goals

- ❌ **자동 주입 (SessionStart hook)**: hook stdout → LLM context 주입 동작 미검증. Phase 2.
- ❌ **벡터 인덱서 직접 빌드**: serena가 이미 symbol graph 제공.
- ❌ **실시간 스트리밍 pack 업데이트**: on-demand 1회 생성으로 충분.
- ❌ **제품 유저에게 노출**: 개발 에이전트 전용 harness 기능.
- ❌ **자동 작업 추천**: 어떤 작업을 할지 결정은 사람. pack은 결정 후 보조.

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| W-0297 MCP 미완 상태에서 코드 레이어 비어 있음 | 중 | 낮 | git grep fallback — pack은 출력, 코드 레이어만 degraded |
| work item 키워드 매칭 실패 (애매한 task 설명) | 중 | 중 | CURRENT.md active items 전체를 보여주고 선택 요청 |
| 8k 예산 초과 (코드 레이어 비대) | 중 | 낮 | 코드 레이어부터 hard-trim, `engine/agents/context.py` _truncate_to_budget 패턴 동일 적용 |
| skill 파일 미로드 (플러그인 미활성화) | 낮 | 낮 | `tools/context-pack.sh` 직접 실행 fallback 문서화 |

### Rollback

skill 파일 삭제 + tools/context-pack.sh 삭제 = 2파일 git revert. AGENTS.md 1단락 revert. 3분 이내.

### Dependencies

- **W-0297 Phase A ✅** (agents/ sub-files 존재) — 현재 충족
- **W-0297 Phase B** (.mcp.json + LSP) — MCP 없으면 코드 레이어가 grep fallback으로 degraded. 기능 자체는 동작.
- engine/agents/context.py — read-only 참조 패턴 (직접 import 없음)

### CTO 결정: Skill vs Tool

| 방식 | 장점 | 단점 |
|---|---|---|
| **Skill 파일** (채택) | Claude Code 네이티브, 추가 인프라 없음, /컨텍스트 슬래시 커맨드 자동 등록 | LLM이 실행 → 약간의 비결정성 |
| Python script | 완전 결정적, 테스트 가능 | 실행 환경 의존 (venv, import path), ~200 LOC |
| Bash script만 | 가벼움 | token 계산 부정확, MCP 호출 불가 |

**결정**: skill 파일 + 보조 bash (token 계산/파일 슬라이싱) 조합. engine/agents/context.py의 Python 구현은 제품 런타임용이므로 개발 harness에서 직접 실행 금지.

---

## AI Researcher 관점

### Context Quality 개선 예상

현재 문제: 에이전트가 작업 시작마다 탐색 비용 5-15분 소요.
- CURRENT.md 읽기 → 관련 work item 찾기 → 코드 파일 찾기 → 도메인 doc 찾기 → 메모리 grep

W-0299 이후:
- `/컨텍스트 "V-PV-01"` 1회 호출 → 5개 레이어 동시 조립 → 작업 시작 30초 이내

engine/agents/context.py 실제 데이터: Parser 10K 예산 중 평균 6-7K 사용, 탐색 오버헤드 0. 개발 에이전트도 동일 효율 달성 가능.

### Failure Modes

- **F-1**: task 설명이 너무 짧거나 모호 → work item 매칭 실패. 완화: CURRENT.md 테이블 노출 후 선택 요청 (interactive fallback).
- **F-2**: 관련 코드가 없음 (신규 작업) → 코드 레이어 비어 있음. 허용: pack의 나머지 레이어는 유효.
- **F-3**: memory/ 디렉토리 스니펫이 stale. 완화: 메모리 레이어는 "참고용" 표시, 코드가 진실 출처.

---

## Decisions

- **[D-0299-1]** on-demand vs 자동 주입: on-demand 채택. 자동은 hook 동작 미검증 + 불필요한 컨텍스트 오염 위험.
- **[D-0299-2]** token budget 8k: engine/agents/context.py의 10-12K 대비 보수적. 개발 에이전트는 pack 외에도 대화 이력을 유지해야 하므로.
- **[D-0299-3]** 코드 레이어 소스: serena MCP 우선, fallback git grep. 직접 Python import 금지 (개발/런타임 경계).
- **[D-0299-4]** skill 이름: `/컨텍스트` (한국어). 기존 `/설계`, `/검증` 패턴과 일관.

---

## Open Questions

- [ ] **[Q-0299-1]** skills/ 디렉토리가 이 repo에 없음 — `.claude/skills/` 또는 프로젝트 루트 `skills/`? 기존 `/설계` 같은 skill의 실제 위치 확인 필요.
- [ ] **[Q-0299-2]** serena `search_for_pattern` tool의 정확한 파라미터 스키마 — 세션 중 ToolSearch로 확인.
- [ ] **[Q-0299-3]** token 계산 정확도: 1 token ≈ 4 chars (영어) vs 2 chars (한국어). 한글 코드 주석이 많으면 실제 예산 초과 위험. engine/agents/context.py와 동일 heuristic 적용.

---

## Implementation Plan

1. **(5 min)** Q-0299-1 해소: 기존 skill 파일 위치 확인 (`find . -name "설계.md" -o -name "*.skill.md"`)
2. **(20 min)** `skills/컨텍스트.md` 작성: 3단계 어셈블리 로직 + 매칭 테이블 + 출력 포맷
3. **(15 min)** `tools/context-pack.sh` 작성: work item grep + domain sub-file read + token estimate
4. **(5 min)** `AGENTS.md` 사용 예시 추가
5. **(15 min)** 검증: `/컨텍스트 "V-PV-01 구현"` 실행 → AC1~AC3 확인

---

## Exit Criteria

- [ ] **AC1**: `/컨텍스트 "V-PV-01 구현"` → Work item (W-0298) + engine domain + executor.py 관련 코드 포함 pack 출력. 검증: pack에 "verify" 또는 "executor" 키워드 포함 + token 계산값 ≤8,000.
- [ ] **AC2**: `/컨텍스트 "GateV2 확장"` → engine 도메인 + GateV2 관련 파일 3+ 회수. 검증: pack에 `gate_v2` 키워드 포함.
- [ ] **AC3**: pack 생성 시간 ≤ 30초 (MCP 인덱싱 완료 상태).
- [ ] **AC4**: MCP 미설치 상태에서도 pack 출력 (코드 레이어 degraded 허용). 검증: `.mcp.json` 임시 제거 후 실행.
- [ ] **AC5**: `AGENTS.md`에 `/컨텍스트` 사용 예시 포함.

---

## Owner

meta (agent productivity)

---

## Canonical Files

- `skills/컨텍스트.md` (신규 — skill 진입점)
- `tools/context-pack.sh` (신규 — 파일 조립 보조)
- `AGENTS.md` (수정 — 사용법 추가)
- `engine/agents/context.py` (read-only 참조 패턴)

---

## Facts

- `engine/agents/context.py`에 `ContextAssembler` 구현 존재 — 동일 패턴 (lazy load, budget truncate, agent-specific pack).
- `agents/engine.md`, `agents/app.md`, `agents/coordination.md` 3개 존재 (W-0297 Phase A ✅).
- skills/ 디렉토리 위치 미확인 → Q-0299-1.
- W-0297 Phase B (.mcp.json) 미완 → 코드 레이어 degraded로 먼저 구현 후 W-0297과 함께 PR.

## Assumptions

- Claude Code `.claude/commands/` 디렉토리 자동 인식 (slash command 등록 조건).
- `tools/context-pack.sh` 실행 권한 확보 (`chmod +x` 또는 `bash` 직접 호출).
- W-0297 Phase B (.mcp.json + serena MCP) 완료 후 code 레이어 serena 우선 사용 가능.

## Next Steps

1. Claude Code 재시작 후 AC1~AC5 수동 검증 (`/컨텍스트` slash command 동작 확인).
2. W-0297 AC1~AC3 검증과 함께 PR #616 머지.
3. CURRENT.md main SHA 업데이트.

## Handoff Checklist

- [ ] Q-0299-1 해소 (skill 파일 위치 확인)
- [ ] skills/컨텍스트.md 작성
- [ ] tools/context-pack.sh 작성
- [ ] AC1~AC5 검증
- [ ] W-0297 Phase B와 함께 단일 PR
