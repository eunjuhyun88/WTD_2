# Coordination Context (멀티 에이전트 · PR · 머지 작업 시 로드)

> 이 파일은 worktree 관리, PR 생성/머지, 에이전트 간 조율 작업 시 로드.

---

## Karpathy 원칙 — 왜 이 규칙들이 존재하는가

> "Agents must verify their own outputs before reporting done."
> "Give agents a PROBLEM, not a PROCEDURE."
> "Isolation is the most important property of parallel agents."
> "Every failure is a free training signal — retry beats escalation."

이 원칙에서 아래 4가지 규칙이 도출됩니다.

---

## 규칙 1: PR 전 자기검증 (Self-Verify Before PR)

**에이전트가 `gh pr create` 전에 반드시 실행:**

```bash
./tools/pre-pr-check.sh
# 0 반환 시만 PR 생성. 1이면 오류 수정 후 재실행.
```

검사 항목:
- `git diff --stat HEAD` — 변경 파일 확인 (자기 변경을 보는 것 자체가 가치)
- `font-size 7-10px` 직접 사용 → CI 실패 원인 1위
- `svelte-check` 0 errors
- migration 번호 중복

**PR body 필수 형식:**
```
Closes #N   ← 반드시 이 형식. "Refs #N" 금지 (CI 실패).
```

---

## 규칙 2: Migration 번호 원자적 선점

병렬 에이전트가 같은 migration 번호를 선점하는 레이스 컨디션 방지.

```bash
# 브랜치 생성 직후, 코드 작성 전에 실행
MIGRATION_NUM=$(./tools/claim-migration.sh)
# → "055" 반환, 055_.sql.reserved 파일 즉시 생성 (다른 에이전트 차단)
# 실제 SQL 파일 생성 시:
mv app/supabase/migrations/${MIGRATION_NUM}_.sql.reserved \
   app/supabase/migrations/${MIGRATION_NUM}_my_table.sql
```

---

## 규칙 3: git — 주 worktree checkout 금지

```bash
# ❌ 절대 금지 — 미커밋 파일 전부 덮어씀
cd /Users/ej/Projects/wtd-v2 && git checkout main

# ✅ 올바른 패턴 — origin에서 직접 브랜치
git fetch origin
git checkout -b feat/W-####-slug origin/main
```

서브에이전트 생성 시: **항상 `isolation: "worktree"` 사용**.

```python
Agent(
    description="...",
    isolation="worktree",   # 자동 격리 worktree 생성
    run_in_background=True,
    prompt="..."
)
```

---

## 규칙 4: 에이전트 프롬프트 — Facts-First, Not Procedure

**Karpathy**: "Give agents a problem, not a step-by-step procedure."

오케스트레이터(parent)가 할 일:
```bash
# parent가 먼저 핵심 사실 수집
MIGRATION_LAST=$(ls app/supabase/migrations/ | tail -1)
SUPABASE_PATTERN=$(head -5 app/src/routes/api/agents/stats/+server.ts)
HUB_FILES=$(find app/src/lib/hubs/target -name "*.svelte" | head -10)
```

에이전트에게 전달:
```
# ✅ Facts-First 프롬프트 (50줄)
마지막 migration: 053_agent_equity_snapshots.sql
Supabase 클라이언트 패턴: locals.supabase (app.d.ts Locals에 있음)
기존 허브 파일: [목록]
구현할 것: [구체적 스펙]

# ❌ Procedure 프롬프트 (300줄)
먼저 다음 파일들을 읽으세요:
cat app/supabase/migrations/ | tail -3
cat app/src/routes/api/.../+server.ts | head -20
...
```

**이유**: 에이전트가 200줄 읽기 지시를 따르면 이미 있는 컴포넌트를 새로 만들거나 경로를 놓침.
Parent가 사실 수집 → 에이전트는 구현에만 집중.

---

## 1 에이전트 = 1 worktree = 1 branch = 1 issue

충돌 방지 매트릭스:
- 병렬 sub-agent 시 **반드시** `isolation: "worktree"` 옵션
- 같은 파일 동시 수정 = merge conflict → 순차 실행으로 전환
- migration 번호 = 항상 `./tools/claim-migration.sh` 먼저

### 새 탭 에이전트 시작 전 파일 충돌 체크 (필수)

```bash
./tools/file-lock-check.sh [건드릴파일1.ts 건드릴파일2.svelte]
# 0 반환 = 시작 가능. 1 = 충돌 — 락된 Work Item 완료 대기
```

충돌 발견 시 대안:
1. 해당 Work Item PR 머지 대기
2. 다른 파일로 작업 분리 (Work Item 파일 경계 분해)
3. 순서 의존성 확인 후 직렬 전환

### 도메인-에이전트 매핑 (D-7009)

같은 도메인 파일을 두 에이전트가 동시에 수정하지 않는다:

| 도메인 | 경로 | 동시 접근 금지 |
|---|---|---|
| Chart | `app/src/lib/features/chart/**` | 1 에이전트만 |
| Hubs | `app/src/lib/hubs/**` | Hub별 1 에이전트 |
| Engine | `engine/**` | 1 에이전트만 (migration 포함) |
| Shared | `app/src/lib/components/shared/**` | 락 테이블 확인 필수 |

도메인 횡단 작업 (예: chart + engine 동시) = 락 테이블에 양쪽 도메인 Files 모두 명시.

### Work Item 파일 경계 (D-7008)

- ≤3 파일/Work Item 권장 (가이드라인, 강제 아님)
- 4파일+ 계획 = Phase로 분해 검토
- 순서 의존성 있는 Phase = 직렬 / 독립 = 병렬

상세: `docs/runbooks/parallel-agent-file-isolation.md`

---

## Branch 명명

```
feat/{Issue-ID}-{slug}   예: feat/W-0290-cursor-grade-code
chore/{slug}             예: chore/priorities-gap-sync-v2
fix/{slug}               예: fix/gate-v2-null-check
```

---

## PR 생성 패턴 (검증 포함)

```bash
# 1. 자기검증 먼저
./tools/pre-pr-check.sh || exit 1

# 2. PR 생성 (Closes #N 필수)
gh pr create \
  --title "feat(W-####): 한 줄 요약" \
  --body "$(cat <<'EOF'
## Summary
- 변경 1
- 변경 2

## Exit Criteria
- [ ] AC1: ...
- [ ] CI green

Closes #ISSUE_NUM
EOF
)"
```

---

## Worktree Registry

```bash
tools/worktree-registry.sh get              # 현재 worktree 매핑
tools/worktree-registry.sh list --mine      # 내 worktrees
tools/worktree-registry.sh list --orphan    # stale worktrees
```

---

## 머지 후 정리

```bash
bash tools/complete_work_item.sh W-####
git worktree remove .claude/worktrees/<slug>
git branch -d feat/W-####-slug
git push origin --delete feat/W-####-slug
```

---

## main SHA 업데이트

```bash
git fetch origin main
git log origin/main --oneline -1
# → CURRENT.md "## main SHA" 라인 업데이트
```

---

## 도메인 docs

- `docs/runbooks/multi-agent-coordination.md`
- `CLAUDE.md` §Multi-Agent Orchestration
