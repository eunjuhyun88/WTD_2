# RESOLVER.md — WTD MemKraft 분류 규칙

새 정보를 MemKraft에 저장하기 전에 이 파일로 홈 디렉토리를 결정한다.
`memory/`는 repo 전체의 단일 MemKraft 저장소이며, `app/`나 `engine/` 아래에 별도 MemKraft root를 만들지 않는다.

## 홈 디렉토리

| 정보 유형 | 저장 위치 | 예시 |
|---|---|---|
| 활성 작업 요약 | `memory/live-notes/w-XXXX.md` | W-0163 진행 상태, 다음 검증 |
| 에이전트 세션 | `memory/sessions/{YYYY-MM-DD}.jsonl`, `memory/sessions/agents/A###.jsonl` | start/save/end 기록 |
| 아키텍처 결정 | `memory/decisions/{slug}.md` | CI required checks 정책 |
| 장애/실패 | `memory/incidents/{slug}.md` | stale memory-sync PR 충돌 |
| repo/domain 엔티티 | `memory/entities/{slug}.md` | engine/search, app/chart, contract-ci |
| 실행 task 상태 | `memory/tasks/{slug}.md` | 장기 cleanup task |
| 디버깅 가설 | `memory/debug/{slug}.md` | CI failure hypothesis |
| 미분류 입력 | `memory/inbox/{date}-{slug}.md` | 분류 보류 메모 |

## MemKraft 외부 source of truth

| 정보 | 권위 파일 |
|---|---|
| 현재 진행 목록 | `work/active/CURRENT.md` |
| 작업별 의도/범위 | `work/active/W-*.md` |
| 운영 규칙 | `AGENTS.md` |
| 우선순위/락 | `spec/PRIORITIES.md`, `spec/CONTRACTS.md` |
| 검증 가능한 현재 설계 | `design/current/*` |
| 사람이 읽는 ADR/incident | `docs/decisions/*`, `docs/incidents/*` |

MemKraft는 위 파일들을 대체하지 않는다. MemKraft에는 검색 가능한 요약, 결정, 사건, 세션 타임라인을 남긴다.

## 중복 처리

1. 먼저 `./tools/mk.sh search "<keyword>"` 또는 `from memory.mk import mk; mk.evidence_first(...)`로 기존 기록을 찾는다.
2. 같은 주체가 있으면 새 파일을 만들지 말고 기존 홈 파일을 갱신한다.
3. runtime state, generated state, build output, cache는 MemKraft에 저장하지 않는다.
4. `memory/.memkraft/`는 인덱스/cache이므로 commit하지 않는다.

## CLI 규칙

- 모든 CLI 호출은 `./tools/mk.sh ...`를 사용한다.
- `memkraft` 전역 바이너리를 직접 호출하지 않는다.
- `cd memory && memkraft ...`를 사용하지 않는다. MemKraft 2.x에서는 `memory/memory/`를 만들 수 있다.
