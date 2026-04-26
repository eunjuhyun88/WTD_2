---
title: 세션 ID 체계 — A### → identity-date-seq
date: 2026-04-26
agent: A007
tags: [memkraft, session-id, identity, design]
---

# 세션 ID 체계 — A### → `<identity>-<YYYY-MM-DD>-<seq>`

## 맥락

기존 `tools/start.sh`는 모든 세션을 `A001 A002 A003 ...` 식 단조 증가 번호로 발번.

문제:
1. **정체성 단절** — 같은 Claude의 N번째 세션과 다른 Codex 세션을 ID로 구분 못 함. 같은 Claude를 매번 다른 "에이전트"로 취급
2. **번호에 의미 0** — `A007`만 봐선 누가/언제/뭐 했는지 알 수 없음. 파일을 까봐야 함
3. **검색/정렬 어려움** — 날짜로 필터하려면 jsonl 안의 ts 봐야 함
4. **A### 명명에 락 컨셉 박혀 있음** — 실제로는 사용자 1명 + Claude 1세션이 대부분이라 락 거의 안 씀. ID 체계가 over-engineered

## 검토한 옵션

1) **현행 유지 (A###)** — 거절
   - 위 4개 문제 해결 안 됨

2) **태스크 기반 이름** (`slash-commands-design`) — 거절
   - 검색 가장 쉽지만 매번 사용자가 정해야 함. 자동화 깨짐

3) **세션 번호로 이름만 변경** (`S-2026-04-26-A`) — 거절
   - 정체성(누가) 정보 여전히 없음

4) **`<identity>-<YYYY-MM-DD>-<seq>`** (예: `claude-2026-04-26-01`) — 선택
   - 정체성: claude / codex / cursor / 사용자 (env `MEMKRAFT_IDENTITY`)
   - 날짜: KST 기준
   - 시퀀스: 같은 (identity, date) 안에서 자동 증가

## 선택 이유

- **ID만 봐도 의미가 있음** — 누가, 언제, 그날 몇 번째인지 즉시 파악
- **정체성 stable** — 같은 Claude는 항상 `claude-*`로 묶임. 검색/필터 자연스러움
- **멀티 에이전트 확장성** — codex/cursor가 끼어도 `codex-2026-04-26-01`로 자연스러움
- **번호 무한 증가 안 함** — 매일 01부터 새로 시작, 보통 하루 1-3개로 끝남
- **레거시 호환** — `A001`-`A007` 그대로 유지. 새 ID는 다음 부팅부터 발번

## 영향

### 코드
- `tools/start.sh` 발번 로직 변경:
  - 기존: `grep "A###" memory/sessions/*.jsonl | max + 1`
  - 신규: `IDENTITY="${MEMKRAFT_IDENTITY:-claude}"`, `DATE_KST`, `seq` 자동 계산
- `tools/end.sh` `tools/claim.sh`는 변경 없음 (ID 문자열을 그대로 사용)
- `state/current_agent.txt`에 새 형식 기록

### 문서
- `AGENTS.md` Bootstrap 섹션 갱신
- `design/proposed/memkraft-slash-commands.md` 갱신
- `.claude/commands/측정.md`의 예시 JSON 형식 갱신

### 마이그레이션
- 없음. 기존 A### 파일은 그대로 둠. 검색은 두 형식 모두 매칭

## 거절된 옵션 정리

| 옵션 | 거절 이유 |
|---|---|
| A### 유지 | 정체성/의미/검색 문제 미해결 |
| 태스크 이름 | 매번 사용자 입력 부담, 자동화 깨짐 |
| S-date-letter | 정체성 정보 없음 |

## 근거

- PR #334 (구현)
- 직전 결정 `memory/decisions/dec-2026-04-26-memkraft-슬래시-커맨드-11개-목적별-구조-강제.md` (이 ID 체계 변경의 컨텍스트)
- 사용자 피드백: "에이전트 번호는 고정되고 새로 생길 때 추가되고 그래야 하나 방법이 좀 이상한 거 같긴한데"

## 미해결

- `MEMKRAFT_IDENTITY` 환경 변수 표준화 — `.env.example` 또는 `tools/README.md`에 명시 필요
- 같은 날 Claude가 둘 동시 작업하면 race condition 가능 (둘 다 seq=01 잡음). 현재는 사용자 1명 시나리오라 무시
