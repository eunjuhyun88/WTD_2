# Root CLAUDE.md Rewrite Proposal — 2026-04-12

- Status: PROPOSAL (not yet applied)
- Target file: `/Users/ej/Projects/maxidoge-clones/CLAUDE.md`
- Author: heuristic-knuth session, 2026-04-12
- Applied by: Phase 3 of `cto-cleanup-plan-2026-04-12.md`
- Approval required: yes (sitewide rule change)

## Rationale

이 rewrite 는 2026-04-12 heuristic-knuth 세션에서 사용자와 결정된 것을 반영한다:

1. **BE 추출 허용** — 기존 "새 top-level 폴더 금지 / frontend 내부 경계 먼저" 규칙은 무효화. 사용자 결정: "프론트 유지, 백엔드 package 로 추출 진행".
2. **Worktree Lifecycle Policy 신설** — 26 registered + 17 orphan 현실 대응. Orphan 은 **영구 동결**.
3. **Parallel Session Coordination 신설** — 병렬 세션 (0xchew + claude + codex 다수) 관리 규칙.
4. **Decision Authority Matrix 신설** — 어떤 작업이 사용자 승인 필요한지 명시.
5. **Session End Protocol 확장** — 세션 종료 시 브랜치/워크트리 자기 정리 (merged 조건 만족 시).

## Supersedes

기존 root CLAUDE.md 의 다음 섹션들은 폐기되고 대체된다:

- "Frontend/Backend 분리 원칙" → 전면 rewrite (§ 3)
- "작업 시작 전" → 확장 (§ 11)
- "Git/Sync 운영 규칙 (필수, 2026-03-06)" → 유지 + 신규 조항 추가 (§ 8)
- "Agent Context Protocol (필수, 2026-03-09)" → 확장 (§ 9)

## Proposed New Content

아래 내용이 P3 에서 `/Users/ej/Projects/maxidoge-clones/CLAUDE.md` 에 **전체 덮어쓰기** 된다.

---

```markdown
# STOCKCLAW — Monorepo Root Guide

Last rewrite: 2026-04-12 (heuristic-knuth 세션)

## 1. Repo 구조 (2026-04-12 확정)

```
maxidoge-clones/
├── frontend/             # 현재 정본 SvelteKit 풀스택 (프론트 + BFF)
├── CHATBATTLE/           # Cogochi day-1 product repo (active)
├── backend/              # LEGACY reference-only, 신규 작업 금지
├── frontend-passport/    # LEGACY reference-only, 신규 작업 금지
├── frontend-wallet-merge/# LEGACY reference-only, 신규 작업 금지
├── integration/          # 통합 설정
└── STOCKCLAW_UNIFIED_DESIGN.md
```

**목표 구조** (BE 추출 진행 중, 2026-04-12 ~ ):

```
CHATBATTLE/   (또는 frontend/, 타겟 repo 에서)
├── apps/
│   └── web/               # 현재 src/ 전체가 여기로 이동 (마지막 단계)
├── packages/
│   ├── contracts/         # src/lib/contracts/ 에서 이동 (1단계)
│   ├── providers/         # src/lib/server/providers/ (2단계)
│   ├── engine-core/       # src/lib/engine/ 의 server-only 부분 (3단계)
│   ├── server-core/       # src/lib/server/ 의 domain services (4단계)
│   ├── cogochi-legacy/    # cogochi/ Python (유지 only)
│   └── ui/                # (미정)
```

상세: `docs/exec-plans/active/be-extraction-design-v0.md`

## 2. Active Codebase

**현재 정본**: CHATBATTLE (Cogochi day-1) + frontend/ (STOCKCLAW arena)

오늘(2026-04-12) 기준:
- 573 파일, `src/lib/server/` 22K 라인, `src/lib/engine/` 24K 라인
- SvelteKit 2 + TypeScript
- 상세 가이드: 각 repo 의 `CLAUDE.md` / `AGENTS.md`

## 3. Frontend/Backend 분리 원칙 (2026-04-12 전면 재작성)

**이전 규칙** (무효):
> ~~새 top-level 폴더 분리 금지. 내부 경계 먼저 고정. 물리적 분리는 마지막.~~

**신규 규칙** (2026-04-12 ~ ):

### 3.1 원칙
- **프론트는 현 상태 고정**: `src/routes/**`, `src/components/**`, `src/lib/stores/**`, `src/lib/api/**`, `src/lib/services/**` 는 **파일 이동 없이** 유지
- **백엔드는 단계적 package 로 추출**: `src/lib/server/**`, `src/lib/engine/**` (server-only 부분), `cogochi/**` 는 `packages/*` workspace 로 이동
- **공용 계약 먼저 이동**: `src/lib/contracts/**` → `packages/contracts/` 가 **1단계**
- **라우트는 thin BFF 로 유지**: `src/routes/api/**/+server.ts` 는 삭제하지 않음. heavy logic 만 점진적으로 package 호출로 대체
- **한 번에 옮기지 않음**: 1 PR = 1 package 이동 + 기존 import 경로 shim 유지

### 3.2 외부 service 분리는 하지 않음
- 같은 monorepo, 같은 프로세스, 같은 배포 단위
- HTTP/RPC 경계는 나중에 (필요 시)
- 지금은 빌드 분리만

### 3.3 추출 순서 (확정)
1. `packages/contracts/` (2-3h, 리스크 낮음)
2. `packages/providers/` (1d, 중)
3. `packages/engine-core/` (2d, 높음)
4. `packages/server-core/` (3-5d, 높음)
5. `apps/web/` 리네임 (1d, 중)

상세: `docs/exec-plans/active/be-extraction-design-v0.md`

### 3.4 Passport-first 는 권장하지 않음
이전 논의에서 Passport 먼저 추출하자는 제안이 있었으나, Passport (`walletIntelServer`) 는 fan-out (provider + ML + LLM + RAG) 이 가장 큰 서비스로 첫 추출 후보로 부적합. **Contracts → Providers 부터.**

## 4. Design Authority

1. **C02 아키텍처**: 각 repo 의 `CLAUDE.md` → Design Authority 섹션
2. **Arena War 통합 설계**: `STOCKCLAW_UNIFIED_DESIGN.md`
3. **Cogochi 제품 SSOT**: `CHATBATTLE/docs/COGOCHI.md`
4. **BE 추출 실행 계획**: `docs/exec-plans/active/be-extraction-design-v0.md`

충돌 시 우선순위: 4 > 3 > 1 > 2 (BE 추출 진행 중이므로 실행 계획이 최상위)

## 5. 핵심 원칙

- **"같은 데이터, 다른 해석"**: AI 와 인간이 동일 48팩터를 보고 다르게 판단 → 시장이 판정
- 매 게임이 동시에: 게임 플레이 + ORPO 학습 신호 + RAG 메모리 포인트
- GameRecord → OrpoPair (학습) + RAGEntry (기억)

## 6. Worktree Lifecycle Policy (2026-04-12 신설)

### 6.1 Orphan 정의 및 처분
**Orphan = `.claude/worktrees/<name>/` 디렉터리는 있지만 `git worktree list` 에 없는 것.**

- **절대 건드리지 않는다**: `rm -rf` 금지, `git status` 조회도 금지, tar 백업도 안 함
- **이유**: 원 소유 세션이 재사용하거나 stash 가 해당 브랜치에 연결돼 있을 수 있음
- **판정 기준은 기계적**: `ls .claude/worktrees/` 와 `git worktree list --porcelain` 의 차집합
- **예외는 없다**: 어떤 사용자 승인으로도 이 규칙은 override 되지 않음 (RFC 필요)

### 6.2 Registered worktree 관리
git 이 아는 워크트리는 **merge status** 로 판정:

| 상태 | 조건 | 처분 |
|---|---|---|
| **SWEEPABLE** | HEAD 가 `origin/main` 의 ancestor + dirty 없음 + stash 없음 | `git worktree remove <name>` 가능 |
| **KEEP** | HEAD 에 unique commit 있음 | 보존 |
| **KEEP** | uncommitted 있음 | 보존 |
| **KEEP** | 해당 브랜치에 stash 연결됨 | 보존 |
| **KEEP** | 현재 active 세션 | 보존 |

### 6.3 실행 방법
- 개별: `git worktree remove <name>` (git-aware, 안전)
- 일괄: 사용자 명시 승인 후 script
- **강제**: `--force` 는 사용자 명시 승인 후에만, 그마저도 기록 필수
- **`rm -rf` 금지**: 절대 filesystem 직접 조작하지 않음

### 6.4 SessionStart Hook (observer-only)
매 세션 시작 시 `.claude/hooks/session-start-observer.mjs` 가 실행:
- 상태 스캔 → `.claude/session-state-report.md` 덮어쓰기
- **절대 삭제하지 않음**
- 실패해도 세션 시작은 정상 진행

## 7. Parallel Session Coordination (2026-04-12 신설)

이 repo 는 2-10+ 개의 Claude/Codex 세션이 병렬로 돌아갈 수 있음. 충돌 최소화:

### 7.1 세션 시작 시 필수
1. `git fetch origin && git status --short --branch` — 원격 확인
2. `.claude/session-state-report.md` 읽기 — 다른 세션 상태 파악
3. `docs/AGENT_WATCH_LOG.md` 에 시작 기록 — 무엇을 할지 한 줄

### 7.2 Main push 시 필수
1. `git fetch origin` 먼저
2. `git log main..origin/main` 로 divergence 확인
3. divergence 있으면 **force push 금지**, cherry-pick 또는 rebase 선택
4. `npm run gate` 통과 확인
5. push 후 `docs/AGENT_WATCH_LOG.md` 에 완료 기록

### 7.3 중복 작업 방지
- 다른 세션이 같은 파일을 건드리고 있을 가능성을 **항상 의심**
- Feature 브랜치 작업 전 `git branch -a | grep <keyword>` 로 유사 브랜치 검색
- PR 생성 전 `gh pr list --state all | grep <keyword>`

### 7.4 Force push 완전 금지
- **main 에 force push 금지** (사용자 명시 승인으로도 보통 거부)
- feature 브랜치 force push 도 최소화 (amend/rebase 를 피하고 새 commit 선호)

## 8. Git/Sync 운영 규칙 (기존 2026-03-06 + 2026-04-12 강화)

1. 브랜치별 작업은 `git worktree` 로 분리
2. 기본 동기화는 `merge --ff-only` 또는 `cherry-pick`
3. push 전 `npm run gate` 통과 필수
4. pre-push hook 실패 시 `--no-verify` 금지, 원인 수정 후 재시도
5. HEAD/브랜치 포인터만 되돌릴 때는 `git update-ref` 로 ref 만 이동
6. 동기화 직후 `git status`, `git branch -vv`, `git worktree list` 확인
7. **(신규 2026-04-12)** 세션 종료 시 `.agent-context/` snapshot + `docs/AGENT_WATCH_LOG.md` 기록 + § 9.2 세션 종료 프로토콜 수행
8. **(신규 2026-04-12)** 세션 종료 시 본인 워크트리가 merged + clean + no-stash 이면 `git worktree remove` 로 자기 정리

## 9. Agent Context Protocol (유지 + 확장)

### 9.1 세션 시작
```bash
cd <repo-root>
npm run ctx:restore -- --mode brief
npm run coord:list
cat .claude/session-state-report.md   # 신규 (2026-04-12)
```

### 9.2 세션 종료 프로토콜 (2026-04-12 확장)

#### 필수 단계 (순서대로, 빠지면 안 됨)

1. **작업 검증**
   ```bash
   git status --short --branch        # clean 확인
   git log @{upstream}..HEAD           # push 해야 할 commit 있나
   npm run gate                        # 코드 변경 있었으면
   ```

2. **Context 저장**
   ```bash
   npm run ctx:auto session-end        # 체크포인트 + brief + handoff
   npm run ctx:compact                 # brief 요약
   ```

3. **Coordination 해제**
   ```bash
   npm run coord:release -- --path "..."   # 해당 시
   ```

4. **AGENT_WATCH_LOG 기록**
   - 세션 outcome (완료 / 부분 완료 / 중단)
   - 다음 세션을 위한 hand-off 노트
   - 손댄 파일 경로

5. **자기 정리 판정** (아래 결정 트리)

#### 결정 트리 — 본인 브랜치/워크트리 정리 여부

```
이 세션의 브랜치가 origin/main 에 fully merged?
├─ YES → 다음 단계로
└─ NO → STOP. 브랜치/워크트리 보존. 핸드오프에 "resume from branch X" 기록.

Dirty working tree 또는 unstaged 변경 있음?
├─ YES → STOP. 보존.
└─ NO → 다음 단계로

이 브랜치에 연결된 stash 있음?
├─ YES → STOP. 보존.
└─ NO → 다음 단계로

사용자가 "곧 resume 예정" 명시?
├─ YES → STOP. 보존.
└─ NO → 삭제 가능 ↓

# 삭제 실행 (다른 워크트리로 이동 후)
cd <다른 워크트리 (예: zealous-goodall)>
git worktree remove <이 세션 워크트리>   # git-aware, 안전
git branch -d <이 세션 브랜치>           # -D 아님, merged 여야만 성공
git push origin --delete <이 세션 브랜치> # 원격도 있었으면
```

#### 절대 금지
- **`rm -rf` 로 워크트리 삭제 금지** — 반드시 `git worktree remove`
- **`git branch -D` 금지** — merged 된 것만 `-d` 로 삭제
- **다른 세션의 브랜치/워크트리 삭제 금지** — 이 규칙은 본인 것만
- **force push 금지** — 이미 명시된 규칙, 재확인
- **Orphan 디렉터리 건드리기 금지** — § 6.1 hard rule

#### 비정상 종료 (abrupt) 대응
만약 세션이 위 절차 없이 끊긴 경우:
- 다음 세션의 **SessionStart observer hook** 이 해당 워크트리를 감지
- `.claude/session-state-report.md` 에 "MERGED, sweepable" 로 기록
- 사용자가 다음 기회에 일괄 정리

### 9.3 메모리 업데이트는 언제?
- `.agent-context/` 계열: **매 세션 종료 시** (ctx:auto 가 자동)
- `~/.claude/projects/.../memory/MEMORY.md`: **영구적 교훈 있을 때만 사용자 수동**
- `frontend/CLAUDE.md` / `CHATBATTLE/CLAUDE.md`: **새 모듈/API 생성 시** 같은 커밋에 포함
- `Root CLAUDE.md` (이 파일): **절차/권한 변경 시 RFC 필요**

### 9.4 금지
- `NOTES.md` 사용 금지 → `.agent-context/briefs/`
- `docs/plans/` 생성/사용 금지 → `docs/exec-plans/active/`
- `coord:claim` 없이 feature 브랜치 작업 금지
- **(신규)** orphan worktree 건드리기 금지
- **(신규)** main force push 금지

## 10. Decision Authority Matrix (2026-04-12 신설)

각 작업 유형에 대한 승인 요구 수준:

| 작업 | 승인 필요 |
|---|---|
| 파일 읽기, grep, log 조회 | 불필요 |
| 로컬 파일 수정 (gitignored) | 불필요 |
| 커밋 생성 | 필요 (본 세션 작업) |
| Feature 브랜치 push | 필요 |
| Main push (fast-forward) | 필요 |
| Main push (merge commit) | 필수 + force push 금지 |
| Main force push | **차단** (RFC 필요) |
| 원격 feature 브랜치 삭제 | 필요 |
| `git worktree remove` (registered) | 필요 |
| `rm -rf` filesystem 워크트리 (orphan) | **차단** (RFC 필요) |
| `git stash drop` | 필수 (개별 stash 당) |
| PR close | 필요 |
| PR merge | 필요 |
| 파일 이동 (BE 추출) | 필요 + 단계별 승인 |

## 11. 작업 시작 전 체크리스트

1. **Agent Context Protocol 세션 시작 절차 수행**
2. 해당 repo 의 `CLAUDE.md` / `AGENTS.md` 읽기
3. `.claude/session-state-report.md` 읽기 (신규)
4. 변경할 영역의 기존 코드 패턴 확인
5. 작업 범위 분류: `frontend-only` / `backend-package` / `cross-boundary`
6. 설계 먼저 확정
7. 작업 완료 후 `npm run check` + `npm run build` 통과 필수

## 12. Context Engineering 규칙

**새 모듈/API/컴포넌트 생성 시 해당 repo 의 `CLAUDE.md` 갱신 필수.**
- Key Modules 테이블에 추가
- API Endpoints 에 추가
- Directory Structure 에 추가
- Known Pitfalls 에 함정 기록
- Task Backlog 상태 업데이트

**BE 추출로 package 가 생성되면 `packages/<name>/README.md` 추가 + 루트 CLAUDE.md 반영.**
```

---

## Changelog

- 2026-04-12: Initial proposal (heuristic-knuth session)

## References

- Exec plan: `cto-cleanup-plan-2026-04-12.md` (same dir)
- BE 추출 설계: `be-extraction-design-v0.md` (P4 에서 생성 예정)
- 현재 root CLAUDE.md (rewrite 대상): `/Users/ej/Projects/maxidoge-clones/CLAUDE.md`
