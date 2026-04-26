---
title: MemKraft 슬래시 커맨드 11개 — 목적별 + 구조 강제
date: 2026-04-26
agent: A007
tags: [memkraft, commands, ux, design]
---

# MemKraft 슬래시 커맨드 11개 — 목적별 + 구조 강제

## 맥락

MemKraft v2(Phase 0-2)는 main에 머지됐지만 **사용자가 직접 호출하기 어려웠음**.

- `tools/start.sh` `tools/end.sh` `tools/claim.sh` 같은 bash 스크립트만 존재
- `mk.add_decision()` 같은 Python API는 사용자가 손으로 쓰기 부담
- 결과적으로 "기록한다"는 행위가 자유 텍스트("shipped: X, handoff: Y")로 떨어져 **다음 에이전트가 봐도 의미 없음**
- `tools/end.sh`의 인자 3개(shipped/next/lesson)는 너무 단순해서 거절된 옵션, 전제 가정, 검증 명령 등이 누락됨

## 검토한 옵션

1) **bash 스크립트 + 사용자 자유 텍스트** (현재) — 거절
   - 이유: 자유 텍스트는 검색/재사용 불가. 다음 세션에서 의미 없는 로그가 됨

2) **Python API 직접 호출** (`mk.add_decision(...)`) — 거절
   - 이유: 사용자가 매번 frontmatter, 필드명, slug를 손으로 채워야 함. 실제로 안 씀

3) **Claude Code 슬래시 커맨드 + 구조 강제 + 자동 추출** — 선택
   - 사용자는 트리거(`/결정 <제목>`)만 던짐
   - Claude가 대화/코드/git에서 구조를 자동으로 채움
   - 저장 전 [y/수정/취소] 확인 강제 → 무의미한 저장 차단
   - 필수 필드 누락 시 거부 (예: 거절된 옵션의 거절 이유)

4) **단일 `/기록` 명령어 + 타입 인자** — 거절
   - 이유: 모든 기록을 하나로 합치면 구조 강제가 약해짐. 결정과 사고는 본질적으로 다른 구조

## 선택 이유

- **트리거-구조-확인** 3단 분리로 사용자 부담 최소화 + 품질 강제
- 11개로 분리한 이유: 각 명령어가 **다른 종류의 기억**을 다룸
  - `/결정` (왜, immutable) vs `/계약` (지금 모양, mutable) — 이질적
  - `/사고` (재발 방지 강제) vs `/물음` (검증법 강제) — 다른 사후 처리
  - `/측정`은 추이 자동 계산이 필수라 별도
- "거절된 옵션 + 거절 이유 누락 시 저장 거부" 같은 **품질 룰**을 각 명령어 안에 박아둠

## 영향

### 코드
- `.claude/commands/*.md` 11개 파일 추가 (Korean 파일명)
- 기존 `tools/*.sh` 변경 없음 — 슬래시 커맨드가 wrap

### 운영
- 다음 세션부터 사용자는 `/열기` `/닫기`만 외워도 됨
- 의미 기록은 필요할 때만 (`/결정` `/사고` `/계약` `/물음` `/측정`)

### 타 도메인
- MemKraft Python API와 충돌 없음 (슬래시 커맨드가 호출만)
- `tools/*.sh` 그대로 유지 — 자동화/CI에서 직접 호출 가능

## 명령어 목록

| 명령어 | 매핑 | 강제 구조 |
|---|---|---|
| `/열기` | `tools/start.sh` + 인계 표시 | (출력만) |
| `/닫기` | `/인계` 강제 → `tools/end.sh` | 인계 없으면 거부 |
| `/검색 <q>` | `mk.evidence_first` + 8개 위치 grep | (출력만) |
| `/잠금 <도메인>` | `tools/claim.sh` | 충돌 시 강제 입력 필요 |
| `/결정 <제목>` | `memory/decisions/` 저장 | 거절 옵션 + 이유 필수 |
| `/사고 <제목>` | `memory/incidents/` 저장 | 재발 방지 = 실행가능 수단만 |
| `/계약 <도메인>` | `design/current/contracts/` 저장 | 검증 명령 = 실행가능 |
| `/물음 <질문>` | `memory/questions/` 저장 | 검증법 명시 강제 |
| `/측정 <지표> <값>` | `memory/metrics/*.jsonl` append | (자동) |
| `/인계` | `memory/sessions/agents/A###.jsonl` | 전제 가정 main SHA 필수 |
| `/완료 <W#>` | work item 이동 + CURRENT.md 갱신 | Exit Criteria 검증 |

## 근거

- PR #334 (이번 결정의 구현) — `claude/review-previous-work-glMAc`
- 커밋 `7b53fd1` — feat(commands): MemKraft 11개 슬래시 커맨드 추가
- `design/proposed/multi-agent-os-v2.md` — 상위 v2 아키텍처
- 직전 사고(자유 텍스트 인계의 정보 손실): CURRENT.md 만성 stale 사례 `memory/incidents/inc-2026-04-25-current-md-만성-stale-에이전트-완료-후-중앙-기록-미갱신.md`

## 미해결

- Phase 3 (`design/current/invariants.yml` + `tools/verify_design.sh`)와 연동되어야 `/계약`의 "검증 명령" 필드가 실효성 가짐. 현재는 사용자가 텍스트로 넣지만 자동 실행은 미구현
- 슬래시 커맨드 자체의 동작 검증 (예: `/잠금` 거절 흐름)은 로컬에서 사용자가 직접 한 번 돌려봐야 함
