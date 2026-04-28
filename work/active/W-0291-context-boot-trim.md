# W-0291 — 컨텍스트 부팅 트리밍 (매 세션 토큰 ≥ 50% 절감)

> Wave: 5 (Productivity) | Priority: P2 | Effort: S (반나절)
> Charter: In-Scope (메타 효율 — 기존 파일 축소, 새 시스템 빌드 아님)
> Status: 🟡 Design Approved
> Created: 2026-04-29
> Issue: #583
> Suggested order: W-0290 이후 (도메인 sub-file 분기 완료 후 AGENTS.md 트리밍 효과 극대화)

---

## Goal

매 세션 자동주입 토큰 ~10,572 → ≤5,000 (≥50% 절감). 비용 절감 + 코어 작업 컨텍스트 비율 증가. 정확도 향상은 부수효과 (주목적 아님).

---

## 현재 부팅 토큰 실측

| 파일 | 라인수 | 추정 토큰 |
|---|---|---|
| `CLAUDE.md` | 188L | ~2,100 |
| `AGENTS.md` | 364L | ~3,518 |
| `work/active/CURRENT.md` | 107L | ~1,040 |
| `~/.claude/projects/.../memory/MEMORY.md` | 106L | ~3,914 |
| **합계** | **765L** | **~10,572** |

목표: 합계 ≤5,000 tokens.

---

## Scope

### A. CLAUDE.md 188L → ≤90L

유지 섹션 (필수 4개):
1. Canonical Read Order
2. Canonical Truth
3. Default Exclude Scope
4. Branch Naming

제거/이동 섹션 (AGENTS.md 또는 sub-file로):
- Work Mode → AGENTS.md
- Design-First Loop → AGENTS.md
- Context Discipline → AGENTS.md
- Multi-Agent Orchestration 상세 → agents/coordination.md
- Branch-Thread Rules → agents/coordination.md
- Vercel Deploy Guardrail → agents/app.md

### B. AGENTS.md 364L → ≤120L

W-0290 도메인 sub-file 완료 후:
- engine 관련 상세 → agents/engine.md
- app 관련 상세 → agents/app.md
- coordination 상세 → agents/coordination.md
- AGENTS.md 본문: Agent ID 발번 규칙 + Priority 표 + sub-file 진입 안내만 유지

### C. MEMORY.md 106L → ≤50L

2026-04 이전 entry를 `_archive/2026-04.md`로 이동:
- "Current State 2026-04-26" 이전 전체 → archive
- MEMORY.md에 archive 링크 추가: `[📦 2026-04 archive](_archive/2026-04.md)`
- 최근 2주 entry만 상단 유지

### D. CURRENT.md 107L → ≤50L

- Wave 4 실행 계획 표 축약 (3개 활성 work item만)
- "Wave 1 / Wave 2 완료" 섹션 삭제 (git history에 있음)
- "BLOCKER — F-02-fix 해소" 섹션 삭제 (완료됨)
- main SHA + 활성 work item 상태만 유지

### E. tools/measure_context_tokens.sh (신규, ~30줄)

```bash
#!/usr/bin/env bash
# 4개 핵심 컨텍스트 파일 토큰 측정 (4-char/token 근사 또는 tiktoken)
CLAUDE_MD="CLAUDE.md"
AGENTS_MD="AGENTS.md"
CURRENT_MD="work/active/CURRENT.md"
MEMORY_MD="$HOME/.claude/projects/-Users-ej-Projects-wtd-v2/memory/MEMORY.md"

total_chars=0
for f in "$CLAUDE_MD" "$AGENTS_MD" "$CURRENT_MD" "$MEMORY_MD"; do
  chars=$(wc -c < "$f" 2>/dev/null || echo 0)
  tokens=$((chars / 4))
  echo "$(basename $f): ${chars}chars ≈ ${tokens}tokens"
  total_chars=$((total_chars + chars))
done
total_tokens=$((total_chars / 4))
echo "────────────────────────"
echo "합계: ${total_chars}chars ≈ ${total_tokens}tokens"
[ $total_tokens -le 5000 ] && echo "✅ 목표 달성 (≤5,000)" || echo "❌ 목표 미달 (>5,000)"
```

---

## 파일 목록

| 파일 | 변경 유형 |
|---|---|
| `CLAUDE.md` | 수정 (188L → ≤90L) |
| `AGENTS.md` | 수정 (364L → ≤120L, W-0290 이후) |
| `work/active/CURRENT.md` | 수정 (107L → ≤50L) |
| `~/.claude/projects/.../memory/MEMORY.md` | 수정 (106L → ≤50L) |
| `~/.claude/projects/.../memory/_archive/2026-04.md` | 신규 (이동된 entry) |
| `tools/measure_context_tokens.sh` | 신규 (~30줄) |

---

## Non-Goals

- AGENTS.md 내용 삭제 (내용은 sub-file로 이동, 소실 아님)
- CLAUDE.md 규칙 약화 (이동이지 삭제 아님)
- 코어루프 코드 변경 없음

---

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| CLAUDE.md 축소 후 에이전트가 규칙 놓침 | 중 | 중 | 규칙 삭제 아닌 이동 (sub-file 상세), CLAUDE.md에 "자세한 내용은 agents/*.md" 포인터 |
| MEMORY.md archive 후 stale lookup | 낮 | 낮 | archive 링크를 MEMORY.md 상단에 명시 |
| CURRENT.md 축약 후 히스토리 손실 | 낮 | 낮 | 완료 항목은 git history + work/completed/ 에 있음 |

### Rollback
- `git revert <SHA>` 1 커밋 (4개 파일 묶음)
- archive 이동된 entry는 revert 시 자동 복원

---

## Owner

meta (agent productivity — 모든 에이전트 영향)

## Canonical Files

- `CLAUDE.md` (188L→90L)
- `AGENTS.md` (364L→120L, W-0290 sub-file 완료 후)
- `work/active/CURRENT.md` (107L→50L, 완료 ✅)
- `~/.claude/projects/.../memory/MEMORY.md` (106L→50L, 완료 ✅)
- `~/.claude/projects/.../memory/_archive/2026-04.md` (신규, 완료 ✅)
- `tools/measure_context_tokens.sh` (신규, 완료 ✅)

## Facts

- before: 10,866 tok (CLAUDE.md 2,167 + AGENTS.md 3,633 + CURRENT.md 1,042 + MEMORY.md 4,023)
- CURRENT.md 54L ≈ 379 tok ✅, MEMORY.md 33L ≈ 833 tok ✅
- after Phase 1: 7,014 tok — CLAUDE.md + AGENTS.md 트리밍 필요
- CLAUDE.md: 196L, AGENTS.md: 378L (여전히 목표 초과)

## Assumptions

- W-0290 agents/ sub-file 완료 후 AGENTS.md 트리밍 효과 극대화 (의존성)
- CLAUDE.md/AGENTS.md 내용 삭제 아님 — sub-file로 이동

## Open Questions

- [ ] [Q-0291-1] AGENTS.md MemKraft 블록(MEMKRAFT-BLOCK-START) 트리밍 가능한가?

## Decisions

- **[D-0291-1]** Phase 1 (CURRENT.md + MEMORY.md) 먼저, Phase 2 (CLAUDE.md + AGENTS.md) 후행. 이유: Phase 2는 W-0290 sub-file 완료 의존.
- **[D-0291-2]** MEMORY.md archive: 2026-04-27 이전 → `_archive/2026-04.md`. 이유: 최근 2주 entry만 실사용.

## Next Steps

1. CLAUDE.md 196L → 90L 트리밍 (W-0290 완료 후)
2. AGENTS.md 378L → 120L 트리밍 (도메인 상세 sub-file 이동 후)
3. after 측정: `bash tools/measure_context_tokens.sh`

## Handoff Checklist

- [x] CURRENT.md 107L → 54L ✅
- [x] MEMORY.md 108L → 33L ✅
- [x] _archive/2026-04.md 생성 ✅
- [x] tools/measure_context_tokens.sh 생성 ✅
- [ ] CLAUDE.md ≤90L (Phase 2)
- [ ] AGENTS.md ≤120L (Phase 2, W-0290 후)

## 구현 순서

1. `tools/measure_context_tokens.sh` 생성 + before 측정값 기록
2. `CURRENT.md` 트리밍 (107L → ≤50L) — 가장 안전, 영향 없음
3. `MEMORY.md` archive 이동 (106L → ≤50L)
4. `CLAUDE.md` 트리밍 (188L → ≤90L) — W-0290과 독립
5. `AGENTS.md` 트리밍 (364L → ≤120L) — W-0290 sub-file 완료 후
6. after 측정 + AC1 검증

---

## Exit Criteria

- [ ] AC1: `tools/measure_context_tokens.sh` 출력 ≤ 5,000 tokens (절감률 ≥ 50%)
- [ ] AC2: `wc -l CLAUDE.md AGENTS.md work/active/CURRENT.md` 각각 ≤90 / ≤120 / ≤50
- [ ] AC3: `~/.claude/.../memory/MEMORY.md` ≤50L
- [ ] AC4: `ls ~/.claude/.../memory/_archive/2026-04.md` 존재
- [ ] AC5: 신규 worktree 부팅 후 Read tool 호출 수 비교 (baseline 대비 감소 확인)
