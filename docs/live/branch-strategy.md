# Branch & Execution Strategy

Version: v1.0
Author: A023 (CTO)
Date: 2026-04-26

---

## 1. 현황 진단 (문제 정의)

| 항목 | 현재 | 목표 |
|------|------|------|
| Remote branches | 287개 | ≤ 20개 (main + release + active 최대 8개) |
| Worktrees | 63개 | ≤ 5개 (main + max 4 active) |
| Branch naming | 무작위 (claude/bold-morse) | 규칙: `feat/{issue-id}-{desc}` |
| PR 없이 main 직접 push | 발생함 | 차단 (GitHub protection) |
| Agent 간 브랜치 공유 | 발생함 (충돌) | 1 agent = 1 worktree = 1 branch |
| Memory-sync 자동화 브랜치 | 상시 노이즈 | automation/* prefix 분리 + 즉시 cleanup |

---

## 2. 브랜치 아키텍처 (Target State)

```
main (protected)
  └── release (Vercel production, protected)
       └── feat/F02-verdict-5cat         ← Wave 1
       └── feat/A03-ai-parser-engine     ← Wave 1
       └── feat/A04-chart-drag-engine    ← Wave 1
       └── feat/D03-watch-engine         ← Wave 1
       └── feat/A03-ai-parser-app        ← Wave 2 (after A03-engine merges)
       └── feat/A04-chart-drag-app       ← Wave 2 (after A04-engine merges)
       └── feat/D03-watch-app            ← Wave 2 (after D03-engine merges)
       └── feat/H07-f60-gate             ← Wave 2 (after F02 merges)
```

### 2.1 영구 브랜치 (삭제 금지)

| 브랜치 | 용도 | Push 정책 |
|--------|------|----------|
| `main` | 프로덕션 소스 | PR + CI 통과 필수. 직접 push 금지 |
| `release` | Vercel production 배포 레인 | main에서 merge only. 직접 push 금지 |

### 2.2 Feature 브랜치 (이슈별 1개)

**명명 규칙**: `feat/{Issue-ID}-{kebab-desc}`

- `Issue-ID`: feature-implementation-map.md의 Feature ID (대문자, 하이픈 허용)
- `kebab-desc`: 2~4 단어 영문, 소문자, 하이픈 구분

예시:
```
feat/F02-verdict-5cat
feat/A03-ai-parser-engine
feat/A03-ai-parser-app
feat/A04-chart-drag-engine
feat/A04-chart-drag-app
feat/D03-watch-engine
feat/D03-watch-app
feat/H07-f60-gate
```

**생명주기**: 브랜치 생성 → PR 오픈 → CI 통과 → 머지 → **즉시 삭제**

### 2.3 시스템 브랜치 (자동화)

| prefix | 용도 | 정책 |
|--------|------|------|
| `automation/*` | memory-sync, CI 자동화 | PR 머지 후 즉시 자동 삭제 |
| `docs/*` | 문서 전용 변경 | 이번 세션 종료 후 삭제 |
| `chore/*` | 정리, 인프라 | PR 머지 후 즉시 삭제 |

---

## 3. Worktree 운영 규칙

### 3.1 구조

```
/Users/ej/Projects/wtd-v2                          ← main worktree (docs/설계 작업)
  .claude/worktrees/
    feat-F02-verdict-5cat/                         ← Agent A 전용
    feat-A03-ai-parser-engine/                     ← Agent B 전용
    feat-A04-chart-drag-engine/                    ← Agent C 전용
    feat-D03-watch-engine/                         ← Agent D 전용
```

### 3.2 Worktree 생성/삭제

**생성 (이슈 시작 시)**:
```bash
git worktree add .claude/worktrees/feat-{ID} -b feat/{ID}-{desc} main
```

**삭제 (PR 머지 후 즉시)**:
```bash
git worktree remove .claude/worktrees/feat-{ID}
git branch -d feat/{ID}-{desc}
```

### 3.3 Worktree 규칙

- 에이전트는 **자신의 worktree 경로 내부에서만** Edit/Write/commit 실행
- 다른 에이전트 worktree 파일 읽기 금지 (필요하면 main 브랜치 읽기)
- 최대 동시 active worktrees = 4 (main + 4 feature)

---

## 4. 병렬 실행 Wave 모델

9개 이슈의 의존성 그래프 기반 최적 실행 순서:

```
Wave 1 (동시 4개, 독립)           Wave 2 (동시 4개, Wave 1 선행)
┌─────────────────┐               ┌─────────────────────┐
│ F02-verdict-5cat│──── merge ──→ │ H07-f60-gate        │
│ A03-engine      │──── merge ──→ │ A03-app             │
│ A04-engine      │──── merge ──→ │ A04-app             │
│ D03-engine      │──── merge ──→ │ D03-app             │
└─────────────────┘               └─────────────────────┘
```

### Wave 1 — 독립 (동시 실행 가능)

| 이슈 | 브랜치 | Effort | Agent |
|------|--------|--------|-------|
| F02: Verdict 5-cat | `feat/F02-verdict-5cat` | S | A |
| A03-eng: AI Parser engine | `feat/A03-ai-parser-engine` | M | B |
| A04-eng: Chart Drag engine | `feat/A04-chart-drag-engine` | M | C |
| D03-eng: 1-click Watch engine | `feat/D03-watch-engine` | M | D |

### Wave 2 — 의존 (Wave 1 선행 후)

| 이슈 | 브랜치 | 선행 조건 | Agent |
|------|--------|-----------|-------|
| H07: F-60 Gate | `feat/H07-f60-gate` | F02 merge | A |
| A03-app: AI Parser UI | `feat/A03-ai-parser-app` | A03-eng merge | B |
| A04-app: Chart Drag UI | `feat/A04-chart-drag-app` | A04-eng merge | C |
| D03-app: Watch 버튼 | `feat/D03-watch-app` | D03-eng merge | D |

---

## 5. PR 정책

### 5.1 PR 머지 요건

1. CI 통과 (Engine CI 1448+ tests, App CI 0 TS errors)
2. PR description에 Feature ID + AC 체크리스트 포함
3. 관련 없는 파일 diff 없음 (scope 이탈 금지)
4. CURRENT.md main SHA 업데이트 포함

### 5.2 Merge 방식

- **Merge commit** (not squash, not rebase) — 머지 지점 감사 추적 유지
- `git merge --no-ff` — fast-forward 금지
- 머지 후 source 브랜치 즉시 삭제

### 5.3 PR 크기 제한

- 단일 PR = 단일 Feature ID
- 500줄 초과 diff → 반드시 이슈 분리 검토
- engine + app 동시 변경 시 별도 PR로 분리 가능 (engine PR 먼저 머지 후 app PR)

---

## 6. 즉시 실행 — Cleanup Plan

287개 remote branch를 안전하게 정리하는 순서:

### Step 1: 스테일 worktree 제거

제거 대상 (detached HEAD 상태):
```
/private/tmp/wtd-v2-fb6e98be           (detached HEAD)
/private/tmp/wtd-v2-main.4AbcQT        (detached HEAD)
/Users/ej/.codex/worktrees/bba4/wtd-v2 (detached HEAD)
/private/tmp/wtd-v2-pr240-fix          (stale)
/private/tmp/wtd-v2-w0122-*            (stale, W-0122 완료됨)
/private/tmp/wtd-v2-w0126-*            (stale, W-0126 완료됨)
```

유지 대상:
```
/Users/ej/Projects/wtd-v2              (main — 항상 유지)
.claude/worktrees/w-0215-ledger        (W-0215 PR #350 완료 → 삭제 가능)
.claude/worktrees/w0220-prd-master     (현 세션 docs 작업 → 세션 종료 후 삭제)
```

### Step 2: Remote branch 정리

삭제 우선순위:
1. `automation/*` — memory-sync용, PR 머지됨
2. `claude/*` — 이름 없는 에이전트 브랜치, 대부분 stale
3. `codex/*` — W-0XXX 기반, 완료된 것들
4. `/private/tmp/wtd-v2-*` — 임시 worktrees

유지:
- `main`
- `release`
- 현재 open PR이 있는 브랜치 (gh pr list로 확인)

### Step 3: 정리 후 검증 목표

```
remote branches: ≤ 10개
worktrees: ≤ 5개 (main + 4 feature)
```

---

## 7. 에이전트 배정 규칙

### 7.1 한 에이전트가 할 수 있는 것

- 한 번에 **1개 worktree** 소유
- 한 번에 **1개 이슈** 진행
- 자신의 worktree에서 commit/push/PR 오픈

### 7.2 한 에이전트가 하면 안 되는 것

- 다른 에이전트 worktree 파일 수정
- main에 직접 push
- issue 범위 밖 파일 수정 (spec/CONTRACTS.md의 domain lock 확인)
- Wave 2 이슈를 Wave 1 완료 전에 시작

### 7.3 Lock 관리

- 이슈 시작 시: `spec/CONTRACTS.md`에 domain lock 기록
- 이슈 완료 시: lock 즉시 해제
- 1시간 이상 stale lock → 다른 에이전트가 강제 해제 가능

---

## 8. Charter 정합성 체크

이 브랜치 전략에서 다루는 8개 이슈 전부 Charter 확인:

| 이슈 | Charter 상태 | 근거 |
|------|-------------|------|
| F02-verdict-5cat | IN-SCOPE | L7 Refinement (verdict loop) |
| A03-ai-parser | IN-SCOPE | CHARTER §In-Scope: "AI Parser endpoint" 명시 |
| A04-chart-drag | IN-SCOPE | L5 Search (search layer 개선) |
| D03-watch | IN-SCOPE | L4 State Machine (monitoring) |
| H07-f60-gate | IN-SCOPE | L7 Refinement (quality gate) |
| ~~N05-marketplace~~ | **CHARTER VIOLATION** | "대중형 소셜/카피트레이딩" Non-Goal 명시 |

**N05 (Copy Signal Marketplace)는 현재 Charter §Frozen에 해당 → 개발 보류.**
Charter 변경 없이 진행 불가.

---

## 9. Vercel 배포 정책

- Production: `release` 브랜치에서만 (`vercel deploy --prod`)
- Preview: PR 브랜치 자동 (Vercel auto-preview)
- `main`, `feat/*` 브랜치는 Vercel production 자동 배포 없음

---

## 10. 즉시 실행 순서 (CTO 권고)

```
[지금 즉시]
1. Q1~Q5 결정 (검토 필요 항목 5개)
2. stale worktree 정리 (63 → 5)
3. stale remote branch 정리 (287 → ≤ 10)

[정리 완료 후]
4. Wave 1 시작 — 4개 에이전트 동시 배정:
   - Agent A → feat/F02-verdict-5cat
   - Agent B → feat/A03-ai-parser-engine
   - Agent C → feat/A04-chart-drag-engine
   - Agent D → feat/D03-watch-engine

[Wave 1 PR 머지 후]
5. Wave 2 시작 — 4개 에이전트 재배정:
   - Agent A → feat/H07-f60-gate
   - Agent B → feat/A03-ai-parser-app
   - Agent C → feat/A04-chart-drag-app
   - Agent D → feat/D03-watch-app
```

---

## Appendix: 현재 보존 가치 있는 worktree

| Worktree | 브랜치 | 상태 | 판단 |
|----------|--------|------|------|
| `.claude/worktrees/w-0215-ledger` | `feat/w-0215-ledger-supabase-cutover` | PR #350 머지 완료 | 삭제 가능 |
| `.claude/worktrees/w0220-prd-master` | `docs/w0220-prd-master` | 현 세션 문서 작업 | 세션 종료 후 삭제 |
| `.claude/worktrees/hungry-ishizaka` | `feat/w-0145-search-corpus-40dim` | W-0145 완료 | 삭제 가능 |
| `.codex/worktrees/w-0213-*` | `codex/w-0213-*` | 완료 | 삭제 가능 |
| `.codex/worktrees/w-0214-*` | `codex/w-0214-*` | 완료 | 삭제 가능 |
