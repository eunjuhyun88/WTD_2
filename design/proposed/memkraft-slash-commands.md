# MemKraft 슬래시 커맨드 명세

**Status**: PROPOSED (2026-04-26, by A007)
**Owner**: claude-2026-04-26-01+
**구현**: PR #334 (`.claude/commands/*.md` 11개)

---

## 설계 원칙

### 1. 트리거 / 구조 / 확인 3단 분리

| 단계 | 누가 | 역할 |
|---|---|---|
| 트리거 | 사용자 | 명령어 + 제목 한 줄 (예: `/결정 RS256 전환`) |
| 구조 | Claude | 대화/코드/git에서 필수 필드 자동 추출 → 초안 작성 |
| 확인 | 사용자 | [y/수정/취소] — 확인 없이는 저장 안 함 |

### 2. 무의미한 기록 차단

각 명령어가 거절 룰을 가짐:

- `/결정`: 거절된 옵션 + 거절 이유 누락 시 저장 거부
- `/사고`: "주의하기" 같은 인적 약속을 재발 방지로 인정 안 함
- `/계약`: "코드 리뷰로 확인" 금지 — 실행 가능한 명령만
- `/물음`: 검증법이 "더 생각해보기" 같은 막연한 것이면 거절
- `/인계`: 전제 가정의 main SHA 누락 시 거부
- `/완료`: Exit Criteria 미정의 work item 완료 거절

### 3. 세션 ID 자동 발번 (정체성 + 날짜 + 시퀀스)

- 형식: `<identity>-<YYYY-MM-DD>-<seq>` (예: `claude-2026-04-26-01`)
- 기본 identity = `claude`; `MEMKRAFT_IDENTITY` env로 오버라이드 (`codex`, `cursor`, `사용자` 등)
- `tools/start.sh`가 같은 (identity, date)의 최대 seq +1
- `state/current_agent.txt`에 기록
- 모든 의미 기록의 `agent` 필드에 자동 삽입
- 레거시 `A001`-`A007`은 그대로 유지 (히스토리 기록)

---

## 11개 명령어 명세

### 세션 관리 (3)

#### `/열기`
- 파일: `.claude/commands/열기.md`
- 호출: `bash tools/start.sh` + `CURRENT.md` 읽기 + 직전 에이전트 인계 표시
- 출력 형식:
  ```
  Agent: <ID>
  Baseline: <main SHA 8자리>
  Branch: <현재>
  Open PRs / Active locks / P0
  직전 인계
  ```

#### `/닫기`
- 파일: `.claude/commands/닫기.md`
- 동작: `/인계` 자동 호출 → `bash tools/end.sh` → lock 해제
- 강제: 인계 작성 없이는 종료 거부

#### `/검색 <키워드>`
- 파일: `.claude/commands/검색.md`
- 검색 위치 (8곳): decisions, incidents, questions, metrics, sessions, design, spec, work
- `mk.evidence_first()` 호출 후 결과 보강

### 락 (1)

#### `/잠금 <도메인>`
- 파일: `.claude/commands/잠금.md`
- 호출: `bash tools/claim.sh "<도메인>"`
- 거절 시: 충돌 행 표시 → [기다림/변경/강제] 중 강제는 명시적 "강제" 입력 필요

### 의미 기록 (5)

#### `/결정 <제목>` → `memory/decisions/dec-{date}-{slug}.md`
- 필수 필드: 맥락, 검토 옵션(거절 이유 포함), 선택, 이유, 영향, 근거
- 거부 룰: 거절된 옵션의 거절 이유 누락, "TBD/추후" 미정 상태

#### `/사고 <제목>` → `memory/incidents/inc-{date}-{slug}.md`
- 필수 필드: 증상, 근본 원인, 수정(commit 포함), 재발 방지, 타임라인
- 거부 룰: "주의하기" 같은 인적 약속, 표면 원인만 적기

#### `/계약 <도메인>` → `design/current/contracts/{도메인}.md`
- 필수 필드: 경로, 공개 API, 불변식, 금지 사항, 검증 명령(실행가능), 관련 결정
- 거부 룰: 검증 명령이 텍스트 설명, API를 추측으로 작성

#### `/물음 <질문>` → `memory/questions/q-{date}-{slug}.md`
- 필수 필드: 질문, 배경, 가설, 검증법(실행가능), 마감, 블로킹
- 답 발견 시: `/결정`으로 승격, frontmatter `status: resolved`

#### `/측정 <지표명> <값> [단위]` → `memory/metrics/{지표명}.jsonl` (append)
- 형식: `{"ts":..., "agent":..., "value":..., "unit":..., "context":..., "commit":...}`
- 자동: 직전 값 비교, 추세 계산, 임계치 위반 보고
- 사용자 확인 생략 (단순 append)

### Work item (2)

#### `/인계` → `memory/sessions/agents/<현재 세션 ID>.jsonl` + `memory/sessions/{date}.jsonl`
- 필수 필드: 한 일, 안 한 일, 막힌 곳, 즉시 다음 단계, 전제 가정
- 자동 추출: git log, gh pr list, state/state.json
- 거부 룰: 전제 가정의 main SHA 누락, "이것저것" 같은 산출물 불명

#### `/완료 <W번호>`
- 동작:
  1. `work/active/W-*<번호>*.md` 매칭
  2. Exit Criteria 검증 — 미달 시 [강제 완료/취소], 강제 시 명시 입력
  3. `git mv work/active/ → work/completed/`
  4. `CURRENT.md` 활성→완료 표 이동
  5. `spec/ROADMAP.md` 해당 줄 제거
  6. `mk.log_event` 호출
- commit/push는 사용자 승인 후

---

## Phase 3-4와의 연결

### `/계약`의 "검증 명령" 필드는 Phase 3에서 실효화
- Phase 3: `design/current/invariants.yml` + `tools/verify_design.sh`
- `/계약`이 저장한 검증 명령을 PR마다 자동 실행 → drift 발견 시 머지 차단

### `/잠금`은 Phase 4에서 hook scope로 보강
- Phase 4: memory-sync workflow가 `claude/*` `codex/*` `feat/*`에서 안 돌게
- `/잠금`이 잡은 도메인을 GitHub Actions에서 검증 → 다른 에이전트의 PR이 같은 도메인 건드리면 경고

---

## 사용 흐름 예시

```
사용자: /열기
Claude: Agent A008 부팅...
        Baseline: 7b53fd1
        Open PRs: #334 (slash commands)
        Active locks: (none)
        P0: Multi-Agent OS Phase 3-4

사용자: /잠금 design/current/, tools/verify_design.sh
Claude: ✓ Locked

사용자: [...작업...]
사용자: /결정 invariants.yml 스키마 정의
Claude: 초안 작성 ↓
        맥락: ...
        검토 옵션: ...
        [y/수정/취소]?

사용자: y
Claude: 저장: memory/decisions/dec-2026-04-27-...md

사용자: /닫기
Claude: 인계 초안 ↓
        한 일: PR #335
        ...
        [y/수정/취소]?
사용자: y
Claude: 저장 + lock 해제 완료
```

---

## 참조

- 결정 파일: `memory/decisions/dec-2026-04-26-memkraft-슬래시-커맨드-11개-목적별-구조-강제.md`
- 구현 파일: `.claude/commands/*.md` 11개
- 상위 아키텍처: `design/proposed/multi-agent-os-v2.md`
- PR: #334
