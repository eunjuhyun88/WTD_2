# Multi-Agent OS v2 — MemKraft 기반 Repo Architecture

**Status**: PROPOSED (2026-04-26, by A006)
**Owner**: A007+
**Goal**: 컨텍스트 / 메모리 / 협업 최적화

---

## 핵심 발견: MemKraft가 이미 절반 이상 한다

기존 진단 후 `memory/` 구조를 검토한 결과, MemKraft가 다음을 이미 제공:

| 기능 | MemKraft 구현 |
|---|---|
| Append-only session log | `memory/sessions/{YYYY-MM-DD}.jsonl` |
| Architecture decisions | `memory/decisions/{slug}.md` (frontmatter+md) |
| Incident records | `memory/incidents/{slug}.md` |
| 충돌/중복 분류 룰 | `memory/RESOLVER.md` (결정 트리) |
| Evidence-first lookup | `mk.evidence_first("query")` |
| Singleton API | `from memory.mk import mk` |
| Session start hook | `app/scripts/dev/memkraft-session-start.sh` |
| Session end hook | `app/scripts/dev/memkraft-session-end.sh` |

**결론**: 새 ledger/, knowledge/ 디렉토리 만들 필요 없다. MemKraft 위에 **얇은 layer**만 추가.

---

## v2 = MemKraft + 4개 신규 layer

```
memory/        ← MemKraft가 관리 (그대로 유지)
  decisions/   ← 아키텍처 결정 (영구)
  incidents/   ← 장애 기록 (영구)
  sessions/    ← 세션 jsonl (append-only)
  RESOLVER.md  ← 분류 결정 트리

state/         ← NEW: 자동 생성, 실시간 (≤ 5초 stale)
spec/          ← NEW: active intent (≤ 200 lines)
design/        ← NEW: verifiable specs (drift 차단)
tools/         ← NEW: boot/end automation
```

각 신규 layer는 MemKraft가 **하지 못하는 것**만 담당.

---

## Layer A: `state/` (NEW)

MemKraft에 없는 이유: derived state는 storage하면 안 됨.

```
state/
  state.json          # main_sha, open_prs[], ci_summary
  worktrees.json      # 현재 worktree 목록 + ahead 카운트
  current_agent.txt   # 이번 세션 ID (예: A007)
```

생성 도구: `tools/refresh_state.sh` (git/gh CLI 호출)

**불변식**: 손으로 안 적음. tool만 갱신.

---

## Layer B: `spec/` (NEW)

MemKraft에 없는 이유: 활성 의도는 "최신 상태"가 단일 파일이어야 함.

```
spec/
  PRIORITIES.md       # ≤ 50 lines, P0/P1/P2만
  CONTRACTS.md        # file-domain ownership lock table
  ROADMAP.md          # W-번호 한 줄 요약 list
```

`spec/CONTRACTS.md` 예시 (병렬 머지 충돌 차단):
```markdown
| Agent | Domain | Branch | Started |
|---|---|---|---|
| A007 | engine/search/ | feat/w-0145 | 18:00 |
```

다른 에이전트가 같은 domain claim 시도 → `tools/claim.sh`가 거절.

**불변식**: 총 ≤ 200 lines. 넘으면 archive로 이전.

---

## Layer C: `design/` (NEW)

MemKraft `decisions/`와 다름:
- `memory/decisions/`: **왜** 그렇게 결정했는가 (영구, immutable)
- `design/current/`: **지금 코드가 어떤 모양이어야 하는가** (mutable, verifiable)

```
design/
  current/
    architecture.md       # 단일 ground truth (≤ 300 lines)
    contracts/
      auth.md             # JWT contract, RLS rules
      pattern-engine.md   # API surface, data shape
      chart.md            # ChartBoard.Props (forbidden_props 포함)
    invariants.yml        # 기계 검증 가능한 규칙
  proposed/
    W-0146-*.md           # peer review 중 (1주 만료)
  rejected/
    W-XXX-*.md            # 거절된 옵션 + 이유
```

`invariants.yml` 예시:
```yaml
contracts:
  - name: "ChartBoard.Props"
    file: "app/src/components/terminal/workspace/ChartBoard.svelte"
    forbidden_props: [surfaceStyle, analysisData]  # PR #308 사고 재발 방지
architecture:
  - forbidden_imports:
      - from: "engine/**"
        to_pattern: "import.*from.*['\"]app"
```

`tools/verify_design.sh`가 PR마다 검증 → drift 발견 시 머지 차단.

---

## Layer D: `tools/` (NEW)

MemKraft hook (`memkraft-session-start.sh`)을 **확장**:

```
tools/
  refresh_state.sh    # state/ 자동 생성
  start.sh            # MemKraft session-start + state + spec + design 통합 boot
  claim.sh            # spec/CONTRACTS.md lock 추가
  end.sh              # mk.log_event + session jsonl + lock 해제
  verify_design.sh    # design/invariants.yml 검증
  verify/
    contracts.py
    architecture.py
```

`tools/start.sh` 동작:
```bash
1. ./tools/refresh_state.sh                # state/ 갱신
2. bash app/scripts/dev/memkraft-session-start.sh  # MemKraft open loops
3. cat spec/PRIORITIES.md                  # active P0/P1
4. echo "You are Agent A$NEXT"             # 가변 에이전트 번호
```

`tools/end.sh` 동작:
```bash
1. mk.log_event("session ended", tags=["session","end"])
2. spec/CONTRACTS.md에서 자기 lock 제거
3. ./tools/verify_design.sh                # drift 0 확인
```

---

## 가변 에이전트 ID 처리

에이전트 수 제한 없음. ID는 자동 발번:
```bash
# tools/start.sh 내부
LATEST=$(grep -oE '"id":"A[0-9]+"' memory/sessions/*.jsonl | \
         sed 's/.*A\([0-9]*\).*/\1/' | sort -n | tail -1)
NEXT=$(printf "A%03d" $((${LATEST:-0} + 1)))
```

A001 ~ A999 자동 발번. 1000 넘어도 그대로 (A1000, A1001).

---

## Hook 정책

`.gitattributes`:
```
memory/sessions/**.jsonl    merge=union   # append-only
state/**                    merge=ours -text
spec/**                     merge=ours
design/**                   merge=ours
work/**                     merge=ours
```

memory-sync workflow scope:
- ✅ stable (main, release)
- ❌ agent active (claude/*, codex/*, feat/*)

---

## 적용 단계 (단축됨)

| Phase | PR | 시간 | 효과 |
|---|---|---|---|
| 0 | `state/` + `tools/refresh_state.sh` | 30분 | derived state 자동화 |
| 1 | `tools/start.sh` (memkraft wrap) | 30분 | 가변 agent ID + boot 통합 |
| 2 | `spec/PRIORITIES.md` + `CONTRACTS.md` | 30분 | 활성 의도 단일화 |
| 3 | `design/current/invariants.yml` + verifier | 2시간 | drift 차단 |
| 4 | `.gitattributes` + hook scope 축소 | 30분 | memory-sync 폭주 차단 |

**Phase 0-2 = 오늘 PR 1개로** (총 1.5시간)
**Phase 3-4 = 다음 에이전트 PR 별개**

---

## 측정 지표

| 항목 | 현재 | v2 목표 |
|---|---|---|
| Boot context | 알 수 없음 | ≤ 2K tokens |
| 충돌 가능성 | 매 세션 | 0 (lock + append-only) |
| 에이전트 식별 | 없음 | 자동 발번 (가변) |
| 병렬 머지 차단 | 없음 (39 failures 발생) | claim lock |
| derived state | 손으로 (stale) | tool 자동 (≤ 5초) |
| 활성 spec 파일 | 70+ | 3 (≤ 200 lines) |

---

## 시뮬레이션: PR #308 사고 재발 방지

```
[Agent N 시작]
$ ./tools/start.sh
  Agent: A007
  Baseline: 51ea37cf (origin/main, 2초 전)
  P0: W-0145 corpus 40+차원
  Open loops (memkraft): 3 decisions pending review
  Design status: chart.md sync ✓

[코드 수정 — surfaceStyle 사용]
$ ./tools/verify_design.sh
  ✗ DRIFT: chart.md.forbidden_props 위반
    file: TradeMode.svelte:1647
    forbidden: surfaceStyle
    → 머지 불가
  
[즉시 알아챔, 5분 안에 수정]
```

vs 실제:
- surfaceStyle 사용 → push → CI 1분 → 실패 분석 5분 → 수정 push → 1분 → automation 덮어씀 → 또 수정...
- **시간 절감 / 세션**: 10-20분
