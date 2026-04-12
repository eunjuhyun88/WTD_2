# CTO Cleanup Plan — 2026-04-12

- Owner session: heuristic-knuth
- Repo: CHATBATTLE (but rules apply repo-wide via root CLAUDE.md)
- Started: 2026-04-12 (대화 중 설계)
- Target completion: 2026-04-12 오늘 오후
- Status: DESIGN APPROVED, awaiting execution approval
- Derived from: 세션 전면 상태 조사 + 사용자 제약 업데이트 (v1.1)
- Rules version applied: root CLAUDE.md rewrite proposal 2026-04-12

---

## 스코프

### In-scope (오늘 실행)
- P0: Precondition check
- P1: State report
- P2: Observer hook 설치
- P3: **Root CLAUDE.md rewrite** (rewrite proposal 2026-04-12 적용)
- P4: BE extraction 설계 메모 작성 (실행 X)
- P5: Registered MERGED 12 worktree 정리
- P6: Local main divergence 해결 (분기 선택 사용자 승인 필수)
- P7: OPEN PR #5 close
- P8: PR1b orphan 정리 (내 것)
- P9: 이 세션 자체의 graceful end

### Out-of-scope (이번 세션 X)
- **Orphan 17 디렉터리 정리** → 영구 동결 (Root CLAUDE.md § 6.1 rewrite proposal)
- **실제 BE 추출 코드 이동** → 별도 전용 세션
- **OPEN PR #11, #33** → 해당 소유자
- **Stash drop** → 내용 확인 후 개별
- **swarm-v1 Z2/Z3/Z4/Z5/Z6 구현** → 별도 infra 세션
- **AI researcher eval harness (Track B)** → BE 추출 후
- **Legacy surface quarantine** → 필요 시점에

---

## 조사 결과 요약 (이 plan 의 근거)

### GitHub remote
- Repo: `eunjuhyun88/CHATBATTLE`
- origin/main HEAD: `bf188db` (PR #40, B-final, 2026-04-12 02:38)
- Total remote branches: 53
- Remote branches with unique commits: 37
- OPEN PRs: 3개
  - #5 "refactor: Foundation Refactor Phase 1" — 2026-04-01, 11일 방치
  - #11 "docs: consolidate product canonical into single COGOCHI.md (v2)" — 2026-04-11
  - #33 "feat(engine): E6c thresholds registry — lift L7 F&G band cutoffs" — 2026-04-12 (active, 0xchew)

### Local state
- Registered worktrees: **26** under `.claude/worktrees/`
- Filesystem dirs: **43**
- **Orphan 17** (filesystem 만 있고 git 모름):
  ```
  bold-bardeen, brave-dewdney, eager-gauss, elastic-antonelli,
  frosty-cerf, gifted-feistel, hardcore-haslett, inspiring-jepsen,
  intelligent-carson, keen-dubinsky, loving-kare, loving-wu,
  nifty-wescoff, practical-kilby, trusting-turing, wonderful-proskuriakova,
  zealous-shannon
  ```
  → **HARDFROZEN**, 이 plan 에서 건드리지 않음

### Registered worktree 분류

**MERGED (12개, 정리 대상)**:
```
compassionate-jepsen, eager-nash, elated-davinci, hardcore-kapitsa,
inspiring-hertz, jovial-newton, nice-driscoll, nostalgic-johnson,
objective-vaughan, pensive-bardeen, strange-burnell, upbeat-lovelace
```

**KEEP (14개, 보존 대상)**:
- heuristic-knuth (this session)
- zealous-goodall (+5 local main commits, 다른 세션 소유)
- focused-pike (+1 DIRTY)
- unruffled-pike (+1, OPEN PR #33)
- crazy-beaver (+12)
- bold-engelbart (+8)
- jovial-satoshi (+5, feat/research-spine)
- pensive-agnesi (+1, docs patch content already on origin via cherry-pick)
- pedantic-leakey (+1, PR #32 이미 merged 잔재)
- epic-swanson (+1, PR #40 이미 merged 잔재)
- charming-bartik (+1)
- frosty-spence (+1, PR #23 merged 잔재)
- recursing-leavitt (+1)
- zoom1-terminal (+1, 제 PR1b orphan) → P8 정리 대상

### Local main ↔ origin/main divergence
- **local main ahead**: 5 commits (zealous-goodall 에 앉아있음)
  ```
  562f212  chore(log): close W-20260412-1004 watch entry
  58f7e29  refactor(home): split landing into reusable sections
  1fbcc8f  Merge branch 'codex/home-visualization-analysis'
  9cfc7bf  chore(log): close W-20260412-0950 watch entry
  5415b48  feat(day1-ia): align home lab dashboard and terminal shell
  ```
- **origin/main ahead**: 13 commits (providers B11-B-final + swarm-v1 Z1 + home #36)
- **충돌 의심**: `5415b48 feat(day1-ia): ...` vs `cb21830 feat(home): ... (#36)` — 같은 주제

### Stash list (global, 7개)
```
stash@{0}  feat/research-r4-5-synthetic-source  template smoke rerun timestamp drift
stash@{1}  codex/terminal-wip-sync-20260410      WIP W-20260410-2228
stash@{2}  codex/dev-server-run-20260320-...     WIP W-20260331-2354
stash@{3}  claude/loving-kare                    auto-research-terminal-01-attempt-1
stash@{4}  claude/loving-kare                    auto-research-home-02-attempt-1
stash@{5}  claude/loving-kare                    stray terminal-04 partial
stash@{6}  claude/loving-kare                    auto-research-terminal-04-attempt-1
```
→ loving-kare 4개가 작업물 가능성. P9 에서도 건드리지 않음.

### BE 추출 후보 영역
| 디렉터리 | 파일 | 라인 |
|---|---|---|
| `src/lib/server/` | 85 | 22,387 |
| `src/lib/engine/` | 63 | 24,113 |
| `src/routes/api/` | 134 | 12,406 |
| `src/lib/contracts/` | 9 | 2,111 |
| `cogochi/` | 5 | 1,555 |

---

## Phase 0 — Precondition Check (5분, read-only)

### 액션
```bash
git fetch origin --prune
git log main..origin/main --oneline | wc -l        # 기대: 13
git rev-parse origin/main                           # 기대: bf188db...
git worktree list | wc -l                           # 기대: 28 (registered + root + /private/tmp)
ls /Users/ej/Projects/maxidoge-clones/CHATBATTLE/.claude/worktrees/ | wc -l  # 기대: 43
gh pr list --repo eunjuhyun88/CHATBATTLE --state open --json number | jq length  # 기대: 3
```

### Exit criteria
- 위 5개 수치 기록됨
- 기대값과 차이 있으면 P1 문서에 `DELTA: expected=XX actual=YY` 로 기록 후 진행
- 결정적 변화 (origin/main 이 완전히 다른 commit 등) 면 사용자에게 보고 후 대기

### 위험
- 0 (read-only)

### 로그
- `docs/AGENT_WATCH_LOG.md` 에 "P0 precondition check complete" 기록

---

## Phase 1 — State Report (30분, local-only file)

### 산출물
`.claude/session-state-report-2026-04-12.md` (gitignored, commit 대상 아님)

### 내용 섹션
1. Precondition snapshot (P0 결과)
2. GitHub remote 요약 (3 open PR + 37 merged 요약)
3. Registered 26 worktree 전표
   - 이름 / 브랜치 / HEAD / merge status / dirty / stash link
   - 각 항목에 `SWEEPABLE` or `KEEP` 마킹
4. Orphan 17 리스트 **+ "HARDFROZEN" 마킹 + "건드리지 마세요" 주석**
5. Local main divergence 상세
6. Stash 7 전량 (ID / 연결 브랜치 / 메시지)
7. BE 추출 후보 영역 규모표
8. "왜 건드리지 않았나" 섹션 (hard freeze 이유)

### Exit criteria
- 파일 존재
- 8 섹션 모두 채워짐
- 다음 세션이 5분 안에 repo 상태 파악 가능

### 위험
- 0 (local, gitignored)

### 로그
- AGENT_WATCH_LOG 에 기록

---

## Phase 2 — Observer Hook 설치 (1시간, local-only)

### 산출물 1
`.claude/hooks/session-start-observer.mjs` — Node.js 스크립트, 삭제 없음, 리포트만

```javascript
#!/usr/bin/env node
// SessionStart observer hook (v1) — READ-ONLY, 절대 삭제 없음
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

const report = [];
report.push(`# Session state snapshot — ${new Date().toISOString()}`);
report.push('');

// 1. Registered worktrees
report.push('## Registered worktrees');
report.push('```');
report.push(sh('git worktree list'));
report.push('```');

// 2. Filesystem vs git delta (orphan detection)
const fs = sh('ls /Users/ej/Projects/maxidoge-clones/CHATBATTLE/.claude/worktrees/')
  .split('\n').filter(Boolean).sort();
const registered = sh('git worktree list --porcelain')
  .split('\n').filter(l => l.startsWith('worktree '))
  .map(l => l.replace('worktree ', '').split('/').pop())
  .sort();
const orphans = fs.filter(n => !registered.includes(n));
report.push('## Orphan directories (git-unknown) — HARDFROZEN');
report.push(orphans.length ? orphans.map(n => `- ${n}`).join('\n') : '(none)');

// 3. Main divergence
report.push('## main divergence vs origin/main');
report.push('local ahead: ' + sh('git log origin/main..main --oneline | wc -l'));
report.push('origin ahead: ' + sh('git log main..origin/main --oneline | wc -l'));

// 4. Open PRs
report.push('## Open PRs');
report.push(sh('gh pr list --repo eunjuhyun88/CHATBATTLE --state open --json number,title,headRefName -q ".[] | \\"#\\(.number) \\(.title) [\\(.headRefName)]\\""'));

writeFileSync('.claude/session-state-report.md', report.join('\n'));
console.log('[observer] state report written to .claude/session-state-report.md');
console.log(`[observer] orphans: ${orphans.length}, registered: ${registered.length}`);
// NEVER deletes anything. EVER.
```

### 산출물 2
`.claude/settings.local.json` — SessionStart hook 등록 (local settings only)

### 정책
- 어떤 파일도 삭제하지 않음
- 실패해도 세션 시작 막지 않음 (fail-open)
- 출력 경로: `.claude/session-state-report.md` (덮어쓰기)
- 실행 시간: < 5초

### Exit criteria
- 수동 실행 한 번 성공
- `.claude/session-state-report.md` 생성 확인
- 내용에 orphan list + registered list + divergence 포함
- hook 설정 완료

### 위험
- 0 (로컬, 부작용 없음)

### 로그
- AGENT_WATCH_LOG 에 기록

---

## Phase 6 — Local Main Divergence 해결 (1-2시간) ⭐ CTO 판단 필요

### ⚠️ 순서 중요
**P6 은 P3 전에 반드시 완료되어야 함.** Main divergence 있는 상태에서 P3 push 하면 충돌.

### 현재 상태
- local main: `562f212`
- origin/main: `bf188db` (13 commits ahead)
- local 의 5개 commit 이 zealous-goodall 에 앉아있음

### 분석 단계
```bash
cd /Users/ej/Projects/maxidoge-clones/CHATBATTLE/.claude/worktrees/zealous-goodall
git fetch origin
git show 5415b48 --stat
# cb21830 (origin 의 #36 merge) 위치 확인
git log --oneline origin/main | head -20
git diff 5415b48 cb21830   # 실제 차이
```

### 판단 분기

#### 분기 A: 내용 실질적으로 동일
```bash
# local 5 commit 폐기 (chore log 는 cherry-pick 로 재적용 가능)
# Safety tag first:
git tag rollback-p6a-$(date +%s)

git reset --hard origin/main

# chore log 만 재적용 (필요 시)
git cherry-pick 562f212 9cfc7bf  # or 새로 작성
```
- **조건**: diff 가 cosmetic 차이 (import 순서, 공백) 수준
- **리스크**: 중 — destructive
- **CTO 승인**: **필수**
- **Rollback**: safety tag

#### 분기 B: 내용 다름, 둘 다 보존
```bash
git merge origin/main
# 충돌 해결 (5415b48 과 cb21830 이 같은 파일을 다르게 수정)
npm run gate
git commit
```
- **조건**: 다른 파일 수정 or 의미 있는 추가 기능
- **리스크**: 중 — merge commit
- **CTO 승인**: **필수**
- **Rollback**: `git revert -m 1 <merge-commit>`

#### 분기 C: 건드리지 않음
- 그대로 두고 zealous-goodall owner 에게 넘김
- **조건**: 판단 불가능 or 시간 부족
- **리스크**: 0 (하지만 divergence 유지)
- **의미**: P3 는 다음 기회로 미룸

### CTO 결정 트리
1. diff 비교 → 사용자에게 보고
2. 사용자가 분기 선택
3. 실행

### Exit criteria
- 분기 A/B/C 중 하나 선택됨
- 선택된 액션 완료
- `git log main..origin/main | wc -l` = 0 (A 또는 B 경우)

### 위험
- 중간 (reset --hard 또는 merge conflict 가능성)

### 로그
- 분기 + 결정 이유 기록

---

## Phase 3 — Root CLAUDE.md Rewrite (1시간, committed + pushed) ⭐

### ⚠️ 전제조건
- P6 완료 (main divergence 해결)
- `git log main..origin/main | wc -l == 0`

### 액션
1. 현재 `/Users/ej/Projects/maxidoge-clones/CLAUDE.md` 백업:
   ```bash
   cp /Users/ej/Projects/maxidoge-clones/CLAUDE.md \
      /Users/ej/Projects/maxidoge-clones/CLAUDE.md.bak-2026-04-12
   ```
2. **rewrite proposal 2026-04-12 의 새 내용** 으로 전체 덮어쓰기 (`root-claude-md-rewrite-proposal-2026-04-12.md` 의 "Proposed New Content" 섹션)
3. 차이 `git diff` 로 검증
4. `npm run gate` 통과 확인
5. 단일 commit:
   ```
   docs(root): rewrite CLAUDE.md for BE extraction + worktree policy + parallel session coordination

   - § 3 Frontend/Backend 분리 원칙 전면 재작성 (frontend 고정 + BE package 단계 추출)
   - § 6 Worktree Lifecycle Policy 섹션 신설 (orphan hard freeze 포함)
   - § 7 Parallel Session Coordination 섹션 신설
   - § 9.2 세션 종료 프로토콜 확장 (자기 정리 결정 트리)
   - § 10 Decision Authority Matrix 섹션 신설
   - BE 추출 상세는 별도 be-extraction-design-v0.md 참조

   Supersedes: 2026-03-09 Agent Context Protocol rules (유지 + 확장)
   Rewritten by: heuristic-knuth session 2026-04-12
   ```
6. Push main (ff, divergence 없음 확인 후)

### Exit criteria
- commit pushed
- 로컬 main = origin/main
- 새 CLAUDE.md 내용 확인

### 위험
- 낮음 (P6 이후, divergence 해결된 상태)

### Rollback
- `git revert <commit>` 또는 `cp CLAUDE.md.bak-2026-04-12 CLAUDE.md`

### 로그
- AGENT_WATCH_LOG 에 "root CLAUDE.md rewritten, commit=XXX" 기록

---

## Phase 4 — BE Extraction 설계 메모 (30분, committed + pushed)

### 산출물
`docs/exec-plans/active/be-extraction-design-v0.md`

### 내용 (섹션)
1. **Context**: 사용자 2026-04-12 결정 + root CLAUDE.md § 3 반영
2. **Scope inventory**: 파일 수 + 라인 수 표 (위 "조사 결과" 에서 복사)
3. **Target structure**: `apps/web` + `packages/*` (root CLAUDE.md § 1 참조)
4. **추출 순서**: contracts → providers → engine-core → server-core → apps/web 리네임
5. **Attach mechanism**: 같은 monorepo, 같은 프로세스 (HTTP 분리는 안 함)
6. **각 단계의 exit criteria**
7. **금지 사항**: 이 세션에서 코드 이동 0
8. **실행 시작 조건**: 다른 세션 idle 확인, 전용 worktree 생성

### Exit criteria
- 파일 commit + push
- 다음 전용 세션이 이 문서만 읽고 Phase 1 시작 가능

### 위험
- 낮음 (신규 파일)

### 로그
- 기록

---

## Phase 5 — Registered MERGED 12 Worktree 정리 (30분)

### 대상 (12개, heuristic-knuth 제외)
```
compassionate-jepsen    eager-nash           elated-davinci
hardcore-kapitsa        inspiring-hertz      jovial-newton
nice-driscoll           nostalgic-johnson    objective-vaughan
pensive-bardeen         strange-burnell      upbeat-lovelace
```

### 사전 검증 (각 워크트리마다)
```bash
cd <path>
git status --short                # clean 확인 (empty output)
git stash list | grep -c "<branch>"  # 연결 stash 0 확인
git log origin/main..HEAD --oneline  # empty 확인 (merged 재확인)
```

### 액션 (한 워크트리 당)
```bash
cd /Users/ej/Projects/maxidoge-clones/CHATBATTLE/.claude/worktrees/heuristic-knuth
git worktree remove <name>
git branch -d claude/<name>       # merged 이므로 -d 로 충분
```

### Exit criteria
- 12개 모두 registered 에서 제거
- `git worktree list | wc -l` 이 16 으로 감소 (28 - 12)
- filesystem 에서도 해당 디렉터리 없음
- 각 브랜치 로컬 삭제 (merged 라 reflog 로 복구 가능)

### 위험
- 낮음-중간: 다른 세션이 이 워크트리를 **재사용 중** 일 가능성 0 아님
  - 완화: 각 워크트리 `git status` 에서 dirty 감지 → 즉시 중단
- **원복**: `git worktree add .claude/worktrees/<name> claude/<name>` (브랜치 refs 살아있으면)

### 로그
- 각 워크트리 제거 기록
- 실패한 것 별도 기록

---

## Phase 7 — OPEN PR #5 처리 (15분)

### 대상
PR #5: "refactor: Foundation Refactor Phase 1 — Slice A/B/C"
- 브랜치: `claude/brave-dewdney`
- 생성: 2026-04-01 (11일 방치)
- 저자: eunjuhyun88

### 액션
1. 내용 확인: `gh pr view 5 --repo eunjuhyun88/CHATBATTLE`
2. 관련 파일 조사: 이 PR 의 commits 가 main 에 반영됐는지 check
3. 판단:
   - **Superseded**: close with comment
     ```
     Superseded by 2026-04-12 BE extraction plan.
     See docs/exec-plans/active/be-extraction-design-v0.md
     ```
   - **Still relevant**: leave open, log 만 남김
   - **Unclear**: 사용자 확인

### Exit criteria
- PR 상태 결정됨 + 기록

### 위험
- 낮음 (close 는 reopen 가능)

---

## Phase 8 — PR1b Orphan 정리 (15분)

### 대상 (내 것)
- Worktree: `.claude/worktrees/zoom1-terminal`
- 로컬 브랜치: `feat/zoom1-terminal-deeplink`
- 원격 브랜치: `origin/feat/zoom1-terminal-deeplink`
- Commit: `521705d` (2026-04-12 오전 생성)

### 사전 검증
```bash
git fetch origin
git log origin/feat/zoom1-terminal-deeplink --oneline -5
# HEAD 가 521705d 면 OK. 다른 commit 있으면 STOP.
```

### 액션
```bash
git worktree remove /Users/ej/Projects/maxidoge-clones/CHATBATTLE/.claude/worktrees/zoom1-terminal --force
# --force 이유: feat branch 가 아직 ancestor 아니지만 내 것임을 명시적으로 override

git branch -D feat/zoom1-terminal-deeplink
git push origin --delete feat/zoom1-terminal-deeplink
```

### Exit criteria
- 워크트리 없음
- 로컬 브랜치 없음
- 원격 브랜치 없음
- `git worktree list | wc -l` = 15 (16 - 1)

### 위험
- 낮음 (내 것 확실)

### 로그
- 기록

---

## Phase 9 — This Session's Graceful End (15분)

### Phase 9.1 — 최종 검증
```bash
git status --short --branch
git log @{upstream}..HEAD          # 0 이어야 함
git log origin/main~20..HEAD --stat  # 이 세션이 손댄 파일 확인
```

### Phase 9.2 — Context 저장 + exec plan archive
```bash
npm run ctx:auto session-end
npm run ctx:compact

# 이 exec plan 을 archive 로 이동
mv docs/exec-plans/active/cto-cleanup-plan-2026-04-12.md \
   docs/exec-plans/archive/cto-cleanup-plan-2026-04-12.md
mv docs/exec-plans/active/root-claude-md-rewrite-proposal-2026-04-12.md \
   docs/exec-plans/archive/root-claude-md-rewrite-proposal-2026-04-12.md
git add docs/exec-plans/
git commit -m "docs(exec-plans): archive 2026-04-12 cto cleanup plan (completed)"
git push origin main
```

### Phase 9.3 — AGENT_WATCH_LOG 최종 기록

```markdown
## 2026-04-12 HH:MM — heuristic-knuth session end

Completed phases:
- P0-P8 전부 완료
- Worktree count: 28 → 15
- Branches cleaned: 13 (12 MERGED + 1 PR1b)
- PRs closed: 1 (#5 if superseded branch)
- Docs added: root CLAUDE.md rewrite, be-extraction-design-v0.md
- Main commits pushed: [count]

Hand-off:
- 다음 BE 추출 세션이 be-extraction-design-v0.md § "시작 조건" 읽고 Phase 1 (contracts package) 시작 가능
- zealous-goodall 의 divergence 는 P6 에서 해결됨 (분기 X 선택)
- Orphan 17 디렉터리는 영구 동결, 다음 세션도 건드리지 말 것
- Stash 7개 보존 (특히 loving-kare 4개)

Next session priority:
- (우선) BE 추출 Phase 1: contracts package 이동
- (선택) swarm-v1 Z2-Z6 infra 구현

Signed: heuristic-knuth (claude sonnet 4.6)
```

### Phase 9.4 — 자기 정리 결정 (사용자 승인 필수)

```
이 세션 브랜치 = claude/heuristic-knuth
HEAD = (P9.1 에서 확인)
```

**판정**:
- 이 세션 push 한 commit 들 (CLAUDE.md rewrite, BE design, exec plan archive) 이 main 에 반영
- heuristic-knuth 브랜치 HEAD 가 origin/main 의 ancestor 인가?
- **YES** → 삭제 가능 (조건부)
- **NO** → 보존

**실행 (YES 케이스, 사용자 명시 승인 후)**:
```bash
# zealous-goodall 에서
cd /Users/ej/Projects/maxidoge-clones/CHATBATTLE/.claude/worktrees/zealous-goodall
git worktree remove /Users/ej/Projects/maxidoge-clones/CHATBATTLE/.claude/worktrees/heuristic-knuth
git branch -d claude/heuristic-knuth
```

**주의**:
- 이 세션 자신을 삭제하는 행위이므로 사용자 **명시 승인 후** 에만 실행
- 자동 금지
- Session 이 이 phase 를 실행하려 할 때 이미 종료 절차 중이므로 다른 워크트리에서 실행해야 함

### Exit criteria
- 모든 commit pushed
- ctx:auto session-end 성공
- AGENT_WATCH_LOG 최종 기록
- Exec plan archived
- (선택) 자기 worktree 제거됨

### 위험
- 낮음 (자기 자신 삭제는 사용자 승인 필수)

### 로그
- AGENT_WATCH_LOG 에 기록

---

## 실행 순서 및 종속성

```
P0 (precondition)           ← read-only, 0 risk
  ↓
P1 (state report)           ← local file, 0 risk
  ↓
P2 (observer hook)          ← local file, 0 risk
  ↓
P6 (main divergence 해결)    ← ⚠ 사용자 승인 필수, P3 의 전제
  ↓
P3 (root CLAUDE.md rewrite) ← ⭐ main push, P6 완료 후만
  ↓
P4 (BE design memo)         ← docs push
  ↓
P5 (MERGED 12 정리)         ← git worktree remove
  ↓
P7 (PR #5 처리)             ← gh pr close
  ↓
P8 (PR1b 정리)              ← 내 것, worktree remove --force
  ↓
P9 (session end)            ← 본인 정리 (승인 필수)
  ↓
DONE
```

**중요 제약**:
- P6 → P3 순서 필수
- P9 는 맨 마지막
- 각 phase 사이 사용자 승인 (P0, P1, P2 제외 — 이건 자동)

---

## Deferred Items (후속 세션 담당)

### Immediate (이번 주 내)
- **Orphan 17**: 영구 동결, 아무 액션 없음
- **Stash 7 내용 조회**: 사용자 요청 시
- **OPEN PR #11 검토**: #11 owner 세션

### Short term (다음 주)
- **BE 추출 Phase 1** (contracts package): 전용 세션에서, `be-extraction-design-v0.md` 읽고 시작

### Medium term (2-3주)
- BE 추출 Phase 2-5 (providers → engine-core → server-core → apps/web)
- Swarm-v1 Z2-Z6 구현

### Long term (미정)
- AI researcher eval harness (Track B from prior discussion)
- Legacy surface quarantine
- 외부 service 분리 (HTTP/RPC 경계) — 필요성 검토 후

---

## Exit Criteria (이 문서 전체)

- [ ] P0 완료, delta 있으면 기록
- [ ] P1 파일 존재 + 8 섹션 채워짐
- [ ] P2 hook 설치 + 수동 실행 성공
- [ ] P6 divergence 해결 (분기 A/B/C 중 선택)
- [ ] P3 root CLAUDE.md pushed
- [ ] P4 BE design memo pushed
- [ ] P5 MERGED 12 제거 완료
- [ ] P7 PR #5 결정
- [ ] P8 PR1b 정리 완료
- [ ] P9 session end 완료
- [ ] `git worktree list` = 15 (또는 14 if P9.4 도 실행)
- [ ] `docs/AGENT_WATCH_LOG.md` 에 전체 phase 로그
- [ ] 이 문서를 `docs/exec-plans/archive/` 로 이동

---

## Rollback Plan

각 phase 별 원복 절차:

| Phase | 원복 방법 |
|---|---|
| P0 | 불필요 (read-only) |
| P1 | `rm .claude/session-state-report-2026-04-12.md` |
| P2 | `rm .claude/hooks/session-start-observer.mjs` + settings 복원 |
| P3 | `git revert <commit>` (main) 또는 `cp CLAUDE.md.bak-2026-04-12 CLAUDE.md` |
| P4 | `git revert <commit>` |
| P5 | `git worktree add .claude/worktrees/<name> claude/<name>` (브랜치 refs 살아있으면) |
| P6 (A) | 불가능 (destructive) — 실행 전 tag 생성: `git tag rollback-p6a-$(date +%s)` |
| P6 (B) | `git revert -m 1 <merge-commit>` |
| P7 | `gh pr reopen 5` |
| P8 | `git worktree add` + `git branch feat/zoom1-terminal-deeplink 521705d` + `git push origin feat/zoom1-terminal-deeplink` |
| P9 | 자기 정리 이후 복구 어려움 — tag 필수 |

---

## Progress Log

(실행하며 채움)

```
[TIME] P0 precondition: ...
[TIME] P1 state report: ...
[TIME] P2 observer hook: ...
[TIME] P6 divergence: 분기 X 선택, ...
[TIME] P3 root CLAUDE.md: commit XXX pushed
[TIME] P4 BE design: commit YYY pushed
[TIME] P5 MERGED 12: removed <list>
[TIME] P7 PR #5: closed with comment ...
[TIME] P8 PR1b: removed worktree + branches
[TIME] P9 session end: context saved, plans archived, (self-cleanup?)
[TIME] Complete. Final worktree count: ZZ
```

---

## References

- Rewrite proposal: `root-claude-md-rewrite-proposal-2026-04-12.md` (same dir)
- Memory: `~/.claude/projects/-Users-ej-Projects-maxidoge-clones-CHATBATTLE/memory/MEMORY.md`
- AGENT_WATCH_LOG: `docs/AGENT_WATCH_LOG.md`
