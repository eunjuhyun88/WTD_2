# Multi-Agent Coordination Runbook

> 멀티 에이전트가 같은 작업을 동시에 개발하지 않도록 한다.
> 단일 mutex = **GitHub Issue assignee**. 신규 코드 0, 신규 인프라 0, charter 준수.

---

## 1. 원칙

**1 work item = 1 GitHub Issue = 1 assignee = 1 branch = 1 PR**

- Issue assignee가 lock. GitHub 서버에 살아있으므로 worktree와 무관.
- PR `Closes #N` 머지 = Issue close = lock 자동 해제.
- 상태가 git tree 외부에 있으므로 git 충돌 없음.

---

## 2. 에이전트 라이프사이클

### 2.1 부팅 — 누가 뭐하나 확인 (필수)

```bash
./tools/start.sh                  # Agent ID 발번 + boot 정보
gh issue list --state open --json number,title,assignees \
  | jq -r '.[] | "  #\(.number) [\(.assignees | map(.login) | join(",") // "unassigned")] \(.title)"'
```

출력 예:
```
  #357 [eunjuhyun88] W-0301 — AI Parser endpoint
  #358 [unassigned] W-0302 — Verdict 5-cat 확장
  #359 [eunjuhyun88] W-0303 — Chart Drag Range
```

→ 다른 에이전트가 잡고 있는 작업은 **선택 금지**. unassigned 중에서 골라라.

### 2.2 작업 시작 — Issue 자가-할당 (mutex 획득)

```bash
gh issue edit 358 --add-assignee @me
git checkout -b feat/issue-358-verdict-5cat
```

assignee 추가 시점에 다른 에이전트가 이미 잡으면 GitHub 알림. 보고 다른 Issue로 전환.

### 2.3 작업 중 — heartbeat

기존 `tools/start.sh`가 `tools/live.sh`로 heartbeat 기록 (per-worktree). 다른 에이전트가 보는 진실은 **Issue assignee** (이게 우선).

### 2.4 PR 오픈 — Closes 자동 링크

```bash
gh pr create \
  --title "feat: 5-cat verdict expansion (closes #358)" \
  --body "$(cat <<EOF
## Summary
...

Closes #358
EOF
)"
```

`Closes #358`이 머지 시 Issue 자동 close = assignee mutex 자동 해제.

### 2.5 종료 — 자동 정리

PR 머지 → Issue close → assignee 해제 → 다음 에이전트가 받을 수 있음.
`tools/end.sh`는 별도 호출 (jsonl 기록 등). assignee 정리는 GitHub이 자동.

---

## 3. 새 work item 생성

### 3.1 W-#### 번호 충돌 방지

```bash
git ls-tree origin/main work/active/ | grep -oE 'W-[0-9]+' | sort -u | tail -5
```

→ 가장 큰 번호 + 1 사용.

### 3.2 work item 파일 → Issue 변환

```bash
gh issue create \
  --title "W-0XXX — <한 줄 요약>" \
  --body-file work/active/W-0XXX-<slug>.md
```

Issue body는 work item 본문 그대로. **단일 source = Issue body** (work/active/*.md는 backup/draft).

---

## 4. 충돌 시나리오 처리

### 4.1 두 에이전트가 동시에 같은 Issue assignee 시도

GitHub은 multi-assignee 허용 — 보이는 즉시 한 명이 양보.

```bash
gh issue view 358 --json assignees | jq '.assignees'
# 본인 외 누가 있으면 → "양보" 메시지 + assignee 제거
gh issue edit 358 --remove-assignee @me
```

### 4.2 Stale assignee (1시간+ 무활동)

```bash
gh issue view N --json assignees,timelineItems
# 마지막 활동이 1h+ 전이면 강제 해제 가능 (조정 후)
gh issue edit N --remove-assignee <stale-user>
```

### 4.3 file-domain 미세 충돌 (다른 Issue, 같은 파일)

Issue가 다르더라도 같은 파일 건드리면 git 충돌. `git fetch origin main && git rebase origin/main` 자주 실행.

→ Phase 3에서 pre-commit hook으로 자동화 검토 (현재는 수동 규율).

---

## 5. CHARTER frozen 체크 (작업 시작 전)

새 Issue 생성 전 charter 검증:

```bash
grep -E "^- ❌" spec/CHARTER.md
```

특히:
- Copy Trading / leaderboard / 카피트레이딩 → ❌
- 새 dispatcher / OS / handoff framework 빌드 → ❌
- AI 차트 분석 툴 / TradingView 대체 → ❌

→ 매칭되면 PRD/Master 변경 ADR 먼저, 그 후 작업.

---

## 6. 자주 쓰는 명령

```bash
# 내가 잡은 것
gh issue list --assignee @me --state open

# 비어있는 일감
gh issue list --search "no:assignee" --state open

# 특정 Issue 누가 잡고 있나
gh issue view 358 --json assignees,title,state

# Project board (선택)
gh project list --owner eunjuhyun88
```

---

## 7. FAQ

**Q. CONTRACTS.md는?**
A. Deprecated. Issue assignee로 대체. 호환 위해 한시 유지.

**Q. claim.sh는?**
A. file-domain claim 기능 유지 + `--issue N` 옵션으로 Issue assignee 자동 설정 (W-0222 추가).

**Q. Codex sandbox에서 gh 안 돌면?**
A. `tools/start.sh`가 graceful fallback — gh 없으면 기존 jsonl/CONTRACTS.md만 사용.

**Q. private repo 무료?**
A. ✅ Issue 무제한, 무료.

---

## 8. 관련

- `spec/CHARTER.md` §🤝 Coordination
- `work/active/W-0222-coordination-via-github-issues.md`
- `memory/incidents/inc-2026-04-26-stale-current-md-migration-misfire.md`
- `tools/start.sh`, `tools/claim.sh`
