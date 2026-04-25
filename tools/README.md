# Multi-Agent OS Tools

Multi-Agent OS v2의 boot/coordination 도구. MemKraft 위에 얇은 layer.

## 사용법

### 세션 시작
```bash
./tools/start.sh
```
출력: Agent ID (자동 발번), main SHA, open PRs, active locks, P0/P1, MemKraft 신호.

```bash
./tools/start.sh --quiet
```
한 줄 요약만.

### 작업 시작 (lock)
```bash
./tools/claim.sh "engine/search/, app/copy-trading/"
```
다른 에이전트가 같은 domain 잡고 있으면 거절. 병렬 머지 충돌 차단.

### 세션 종료
```bash
./tools/end.sh "PR #321" "git checkout -b feat/w-0146" "FeatureWindowStore migration 주의"
```
자동: ledger append, lock 해제, lesson 기록 (있으면), state 갱신.

### 상태 갱신 (수동)
```bash
./tools/refresh_state.sh
```
보통 start.sh가 자동 호출. 수동 갱신 필요할 때만.

## 파일 구조

| 도구 | 역할 |
|---|---|
| `refresh_state.sh` | git/gh CLI에서 main SHA, open PRs, worktrees 추출 → state/*.json |
| `start.sh` | refresh_state + Agent ID 발번 + spec/ + memkraft session-start 통합 |
| `claim.sh` | spec/CONTRACTS.md에 file-domain lock 추가 |
| `end.sh` | memory/sessions/{date}.jsonl append + lock 해제 |
| `backfill_agents.sh` | 일회성 — Agent 1-6 historical 기록 backfill |

## 설계 참조

- `design/proposed/multi-agent-os-v2.md` — 전체 v2 아키텍처
- `memory/RESOLVER.md` — MemKraft 분류 결정 트리
