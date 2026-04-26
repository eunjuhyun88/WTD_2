# CURRENT — Multi-Agent OS v2 이후 (2026-04-26)

> 이 파일은 Multi-Agent OS v2 도입 후 점진적 deprecating 중. 신규 source of truth:
> - `spec/PRIORITIES.md` — P0/P1/P2 우선순위
> - `spec/CONTRACTS.md` — file-domain locks
> - `state/state.json` — main SHA, open PRs (자동 생성)
> - `memory/sessions/agents/A###.jsonl` — per-agent 이력
>
> 세션 시작: `./tools/start.sh` 또는 `/start`

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0213-multi-agent-os-phase34` | A009 | 다음 — `.gitattributes` + invariants 확장 |
| `W-0145-operational-seed-search-corpus` | 미할당 | 부분 완료, 확장 필요 |
| `W-0212-chart-ux-polish` | 미할당 | 백로그 |

---

## main SHA

`c0ab48dc` — origin/main (2026-04-26) — PR #335 머지 (Multi-Agent OS v2 + MemKraft 도입)

---

## 다음 실행 가이드

```bash
git checkout main && git pull
./tools/start.sh                     # Agent ID 자동 발번
cat spec/PRIORITIES.md               # P0/P1/P2 상세
./tools/claim.sh "<file-domain>"     # lock
git checkout -b feat/...             # 새 브랜치
# ... 작업 ...
./tools/save.sh "다음에 할 일"        # 중간 체크포인트
./tools/end.sh "PR #N" "handoff"     # 세션 종료
```

설계 참조: `design/proposed/multi-agent-os-v2.md`, `design/proposed/memkraft-full-integration.md`
