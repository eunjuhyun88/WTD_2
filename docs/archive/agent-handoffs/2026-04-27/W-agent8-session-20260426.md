# Agent 8 세션 기록 — 2026-04-26

## 에이전트 정보
- **Agent ID**: A008
- **Branch**: feat/multi-agent-os-slash-commands → main
- **세션 시작 main SHA**: `51ea37cf` (A007 종료 시점)
- **세션 종료 main SHA**: `c0ab48dc` (PR #335 merge)

---

## 핵심 작업: Multi-Agent OS v2 + MemKraft 전체 도입

### 설계 (3차 → 4차 진화)

| 차수 | 설계 요지 | 결과 |
|---|---|---|
| 1차 | 6-Layer 신규 아키텍처 (state/, ledger/, spec/, knowledge/, archive/, design/) | 폐기 |
| 2차 | MemKraft 발견 — `memory/`에 sessions/decisions/incidents/RESOLVER.md 다 있음 | 4 layer만 신규 (state, spec, design, tools) |
| 3차 | `tools/mk.sh` wrapper로 단일 CLI 진입점 — `MEMKRAFT_DIR` 고정 | 채택 |
| 4차 | per-agent jsonl + slash commands + design verify CI gate | PR #335로 머지 |

**Karpathy 원칙 적용**: derived state는 storage 금지. Storage는 immutable 또는 single-source.

### 4 Layer 추가 (MemKraft 위에)

```
state/         ← 자동 생성 (refresh_state.sh)
spec/          ← active intent (PRIORITIES/CONTRACTS/ROADMAP)
design/        ← verifiable specs (proposed/current/rejected)
tools/         ← boot/coordination 자동화
memory/        ← MemKraft 그대로 (이미 있음)
```

---

## 구현 (PR #335)

### tools/ 도구 6개
| 도구 | 역할 |
|---|---|
| `mk.sh` | MemKraft CLI wrapper (`MEMKRAFT_DIR`, engine venv 우선) |
| `start.sh` | Agent ID 자동 발번 + state + memkraft brief + 직전 handoff |
| `claim.sh` | file-domain lock (병렬 머지 충돌 차단) |
| `save.sh` | 세션 중간 체크포인트 (한 일 + 다음 일) |
| `end.sh` | 세션 종료 + ledger + lock 해제 + design verify |
| `track_repo.sh` | W-번호/Agent/모듈 → MemKraft entity 자동 등록 |
| `refresh_state.sh` | git/gh CLI에서 derived state 추출 |

### .claude/commands/ 슬래시 커맨드 11개
| 커맨드 | 역할 |
|---|---|
| `/start` | 세션 시작 + Agent ID |
| `/save` | 중간 체크포인트 |
| `/end` | 세션 종료 |
| `/claim` | file-domain lock |
| `/agent-status` | 현재 상태 한눈에 |
| `/retro` | 일일 회고 (Well/Bad/Next) |
| `/decision` | 결정 기록 |
| `/incident` | 사고 기록 |
| `/open-loops` | 미해결 항목 |
| `/search` | 메모리 검색 |
| `/lookup` | entity 조회 |

### per-agent jsonl 시스템
- `memory/sessions/{date}.jsonl` — timeline view
- `memory/sessions/agents/A###.jsonl` — per-agent history
- A001-A007 backfill 완료
- A### 자동 발번 (가변, 제한 없음)

### MemKraft entity 등록
- 67 entities tracked: W-numbers (concept), Agent IDs (person), modules (topic)
- normalize_live_notes()로 boilerplate 자동 정리

### app/memory/ 정리
- 잘못된 위치의 RESOLVER.md/live-notes 삭제
- 4개 유의미한 live note는 루트 `memory/`로 이관 (compact 형식)
- `app/scripts/dev/memkraft-session-*.sh`, `app/CLAUDE.md`, `app/package.json` 신규 wrapper로 갱신

### CI 통합
- `Design Verify` check 추가 → drift 차단
- 9개 invariants 등록 (chart.md, auth.md 포함)
- PR #335 머지 시 6개 checks 전부 pass

---

## 시뮬레이션 검증

### A008 자체 시연
```
$ ./tools/start.sh
═══════════════════════════════════
You are Agent A008
═══════════════════════════════════
Baseline:    c0ab48dc  (origin/main)
Open PRs:    #336, #334
Active locks: (none)
Design status: sync ✓ (9 invariant(s))
Open loops: 1
Recent agents: A008, A007, A006, A005, A004
```

→ 50초 안에 컨텍스트 확보 완료.

### Save → End 흐름
```
$ ./tools/save.sh "Phase 3-4 후속 PR"
✓ Checkpoint 저장됨 (A008 @ 9b8d62b1)

$ ./tools/end.sh "PR #335" "feat/multi-agent-os-phase34" "hook 패턴"
✓ Session A008 closed
  agent jsonl: memory/sessions/agents/A008.jsonl
  retro --dry-run: 자동 통합
```

---

## 핵심 lesson (A009+에게)

1. **automation hook이 working tree 덮어쓰는 패턴 자주 발생**
   - 이번 세션에서만 5회 발생 → rebase 반복
   - **Phase 4 (`.gitattributes merge=ours`) 시급**

2. **memkraft cwd 버그 주의**
   - 전역 `memkraft` CLI 직접 호출 시 `memory/memory/` 잘못 생성
   - 반드시 `./tools/mk.sh` wrapper 통해서만 실행
   - `MEMKRAFT_DIR` 환경변수가 영구 해결책

3. **PR 분리 전략 효과**
   - "Phase 0-2 한 번에 + Phase 3-4 다음 PR" 분할이 옳았음
   - PR #335 너무 컸지만 단일 PR이라 CI gate 한 번에 통과
   - Phase 3-4는 별개 PR로 가야 review 가능

4. **branch protection + merge=ours 조합 필요**
   - main에 직접 push 차단됨 (좋음)
   - 그러나 docs branch에 hook이 자동 PR 만들어서 working tree 덮어씀 (나쁨)
   - .gitattributes로 차단해야 정상

---

## 다음 에이전트(A009)에게 핸드오프

### 즉시 (P0)
**Phase 3-4 후속 PR**:
```bash
git checkout main && git pull
git checkout -b feat/multi-agent-os-phase34
```

1. **Phase 3 (이미 부분 구현)**: `design/current/invariants.yml` 확장
   - 현재 9개 → 20개+ (auth, pattern-engine, copy_trading 등 추가)
   - `tools/verify/` 스크립트 추가 (contracts.py, architecture.py)

2. **Phase 4**: `.gitattributes` 최종 정책
   ```
   memory/sessions/**/*.jsonl  merge=union
   spec/**                     merge=ours
   state/**                    merge=ours -text
   work/**                     merge=ours
   knowledge/**                merge=ours
   design/**                   merge=ours
   ```
   + memory-sync workflow scope 축소 (agent branches 제외)

### P1
**W-0145 Search Corpus 40+차원** (이미 main에 부분 머지됨)

### P2
**W-0212 Chart UX Polish** (드래그 리사이즈 검증)

### 참고 파일
- 설계: `design/proposed/multi-agent-os-v2.md`, `design/proposed/memkraft-full-integration.md`
- 이전 에이전트: `work/active/W-agent6-session-20260426.md`, `W-agent7-*` 등
- 메모리: `memory/sessions/agents/A001-A008.jsonl`

---

## 세션 종료 시점

- main SHA: `c0ab48dc`
- 미처리 lock: 0
- CI: 전부 ✅ (App, Contract, Engine, Design Verify)
- MemKraft entities: 67
- A### ledger: 8개 (A001-A008)
- 슬래시 커맨드: 11개
