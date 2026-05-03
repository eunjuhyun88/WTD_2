# W-1003 — Karpathy Token-Efficient Multi-Agent Architecture

> Wave: 7 (제안) | Priority: P0 (인프라) | Effort: M
> Charter: 전 영역 (인프라)
> Status: 🟢 PR Open — [#1029](https://github.com/eunjuhyun88/WTD_2/pull/1029)
> Created: 2026-05-04
> Issue: #1026

## Goal
Opus 설계 → Haiku 구현 분업과 컨텍스트 다이어트로 세션당 토큰을 10.8k → ≤5k로 절감하고, 에이전트 간 파일 중복 수정으로 인한 rebase 충돌 토큰 낭비를 제거해 평균 세션 비용을 50% 이상 낮춘다.

## 토큰 낭비 분석 (CTO 진단)

### A. 자동 주입 컨텍스트 (매 세션 10,838 tok — 실측)

| 파일 | 토큰 | 진단 | 처방 |
|---|---|---|---|
| MEMORY.md | 6,305 | 135L 중 ~110L가 session log. 최근 3일 외엔 cold data | 7일 회전 → _archive/ |
| AGENTS.md | 2,011 | 세부 절차 일부 sub-file 이전 가능 | 100L 이하로 슬림화 |
| CURRENT.md | 1,629 | 과거 완료 서술 불필요 | active + 락테이블만 |
| CLAUDE.md | 892 | 라우터 역할 | (유지) |

### B. 도메인 sub-file 조건부 로드 (~1-3k tok)
- agents/coordination.md 189L / app.md 137L / engine.md 73L

### C. 에이전트 호출 시 발생 토큰 (정성적)
- 슬래시 명령 본문 procedural narrative → facts-first 슬림화 가능
- 서브에이전트 동일 spec 파일 read 반복
- Sonnet이 Haiku 작업(grep/rename) 수행 — 75x 비용 차이
- isolation:worktree 자식이 CLAUDE.md 풀로드 → 자식도 10.8k 동일 누수
- **에이전트 간 파일 중복 수정 → rebase 충돌 처리 토큰**:
  - 두 에이전트가 같은 파일을 다른 API로 수정 시 manual merge 필요
  - 충돌 진단·재설계·재구현 round trip 평균 est. 5-15k tok/충돌
  - 실측 사례: clever-wilson(W-0399-p2) ↔ ecstatic-goldstine(W-0395) — `mountIndicatorPanes.ts`, `ChartBoard.svelte` 중복 수정 → 수동 병합 발생

### D. 누적 손실 추정
- 세션당 10.8k × est. 20 세션/주 = ~216k tok/주
- + 파일 충돌 est. 1-2회/주 × 10k tok = ~10-20k tok/주
- est. 50-65% 절감 가능 (PR 5 telemetry 확정)

## 에이전트 간 파일 충돌 문제

### 실측 사례 (2026-05-04)

```
Agent A (clever-wilson)           Agent B (ecstatic-goldstine)
────────────────────────          ─────────────────────────────
W-0399-p2 구현 시작               W-0395 Phase 6/7/8 + W-0399-p2 설계
mountIndicatorPanes.ts 수정       mountIndicatorPanes.ts 수정 (다른 API)
ChartBoard.svelte 수정            ChartBoard.svelte 수정
                                  B가 먼저 merge
                                  A가 rebase → 충돌 → 수동 병합
```

두 에이전트가 `mountSecondaryIndicator`를 다르게 설계:
- A: `(chart, kind, data[], paneIndex, ...)`
- B: `(chart, payload: SecondaryIndicatorPayload, paneIndex, ...)`

### 근본 원인 3가지
1. **파일 단위 락 없음**: CURRENT.md 락 테이블은 W-XXXX 단위만, 파일 단위 아님
2. **Work Item 범위 너무 큼**: W-0399-p2 하나가 5개 파일 → W-0395도 겹침
3. **에이전트마다 독립 API 설계**: 서로 모르고 각자 구현

### 해결 방향 (단/중/장기)
- **단기 (PR 1)**: CURRENT.md 락 테이블에 `Files` 컬럼 추가
- **중기 (PR 2)**: `tools/file-lock-check.sh` + Work Item ≤3 파일 경계 분해
- **장기 (PR 4+)**: 도메인-에이전트 매핑 표준 (chart/hubs/engine 분리)

## Scope
- 포함: 컨텍스트 슬리밍, 모델 분업 정책, spec-readiness gate, telemetry, 명령 표준화, 파일-단위 락 테이블, Work Item 파일 경계 분해, 도메인-에이전트 매핑
- 파일: MEMORY.md, agents/, .claude/commands/, tools/ 신규 4개, .github/workflows/ 1개, docs/runbooks/ 2개

## Non-Goals
- LLM cost 실시간 dashboard
- per-token 청구 attribution
- 모델 자동 라우팅 (수동 슬래시 명령 선택 유지)
- 파일 락 hard enforcement (advisory만, push hook 차단은 차후)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| MEMORY 회전으로 lesson 잃음 | 중 | 중 | _archive/ 보존 + MEMORY-INDEX grep |
| Haiku 구현 품질 저하 | 중 | 고 | spec-readiness gate + Sonnet 검증 단계 |
| 설계-구현 분리 round trip 증가 | 저 | 중 | Opus spec ambiguity=0 강제 |
| 슬림화로 신규 에이전트가 룰 모름 | 저 | 고 | 핵심 룰은 AGENTS.md 유지 |
| **파일 충돌 미감지** | 중 | 고 | file-lock-check.sh + Files 컬럼 + 새 탭 체크리스트 |
| **Work Item 분해 과잉으로 PR 폭증** | 저 | 중 | ≤3 파일/Work Item 가이드라인 (강제 X) |

### Dependencies
- 기존 `tools/measure_context_tokens.sh`, `tools/context-pack.sh`
- agents/coordination.md Karpathy 4원칙 (PR #1022)
- GitHub Actions cron

### Files Touched (실측)
- MEMORY.md, MEMORY-INDEX.md, AGENTS.md, CURRENT.md, agents/coordination.md
- .claude/commands/구현.md (신규), .claude/commands/설계.md (수정)
- tools/spec-readiness.sh, tools/memory-rotate.sh, tools/log-session-tokens.sh, tools/file-lock-check.sh (신규 4개)
- .github/workflows/memory-rotate.yml
- docs/runbooks/opus-design-haiku-impl.md, docs/runbooks/parallel-agent-file-isolation.md (신규 2개)

## AI Researcher 관점

### Data Impact
- token telemetry → work/log/token-usage/YYYY-MM-DD.csv
- spec→구현 성공률 (Haiku CI green 비율)
- MEMORY 검색 빈도 (archive grep 호출 수)
- **파일 충돌 발생 빈도**: work/log/file-conflicts/YYYY-MM-DD.csv

### Statistical Validation
- A/B: Sonnet 단독 vs Opus설계+Haiku구현, N≥10 작업, primary = $ cost
- Welch t-test (비대칭 N), 효과크기 est. -60%
- 파일 충돌 빈도 before/after Files 컬럼 도입 비교 (N≥4주)

### Failure Modes
- Haiku 멈춤 → spec 8/10 미만이면 Opus 재호출, ≥8이면 Haiku 강행 후 fail → Sonnet escalate
- MEMORY 망각 → MEMORY-INDEX에 (date, W#, lesson 1줄, archive path) 영구 보존
- Haiku git workflow 오류 → /구현 명령에 --no-verify 등 명시 금지 룰
- **파일 락 stale** → /닫기에 락 해제 step, file-lock-check.sh가 24h+ stale 락 경고

## Decisions

- **[D-7001]** MEMORY.md 7일 회전 → _archive/ (거절: 30일 회전 — 6.3k→4.5k로 목표 미달)
- **[D-7002]** /구현 명령 신설 (Sonnet) — 코드 작성·리팩토링·테스트. /반복(Haiku)은 판단 불필요 bulk만. (거절: Haiku로 구현 — 코드 품질 위험, Sonnet이 80% 저렴하면서 충분)
- **[D-7003]** Spec readiness gate (8/10 미만 → Opus 재호출) (거절: gate 없음 — Haiku fail round trip이 gate 비용보다 큼)
- **[D-7004]** MEMORY-INDEX 분리 + on-demand pull (조건부 — PR 5 실측에서 ≤5k 미달 시만)
- **[D-7005]** Facts-First 프롬프트 표준 — Goal/Facts/Constraints/AC 4섹션
- **[D-7006]** 슬래시 명령 `model:` 필드 의무 (미명시 시 Sonnet 자동 — 의식적 선택 강제)
- **[D-7007]** CURRENT.md 락 테이블에 `Files` 컬럼 추가 (즉시 적용)
- **[D-7008]** Work Item ≤3 파일 경계 분해 원칙 (가이드라인, 강제 X)
- **[D-7009]** 도메인-에이전트 매핑 표준 (Chart/Hubs/Engine 분리)

## Open Questions

- [ ] [Q-7001] Haiku 4.5가 svelte-check + git workflow 정확히 수행하는가? (PR 4 AC2-2 샘플로 측정)
- [ ] [Q-7002] MEMORY 회전 임계값 7일 vs entry 개수 기반? (PR 5 telemetry 검색 빈도 후 결정)
- [ ] [Q-7003] /구현 spec input format — frontmatter? inline? spec.json? (PR 4 gate 통과 형식 확정)
- [ ] [Q-7004] AGENTS.md 슬림화 시 어느 절차를 sub-file로? (PR 3 별도 결정)
- [ ] [Q-7005] isolation:worktree 자식의 CLAUDE.md 재로드 — SDK 레벨 제어 가능?
- [ ] [Q-7006] 파일 락 만료 정책 — 24h 자동 해제 vs 수동? (제안: /닫기 해제 + 24h stale 경고)
- [ ] [Q-7007] 도메인 횡단 작업의 락 명시 규약 (`app/chart, engine/indicators` prefix 표기?)

## PR 분해 계획

> 각 PR 독립 배포 가능. Files 컬럼 → 충돌감지 → 컨텍스트 슬림 → 모델분업 → 텔레메트리 순서.
> AC 수치 중 "(est.)"는 PR 5 이후 실측으로 교체.

### PR 1 — CURRENT.md Files 컬럼 즉시 추가 (Effort: S, 2 파일)
**목적**: 파일 단위 충돌 가시성 확보 — 새 탭 에이전트가 락 테이블 보고 충돌 감지 가능
**검증 포인트**: 새 탭 에이전트가 CURRENT.md 락 테이블 1줄로 파일 충돌 감지 가능한가
**수정**:
- CURRENT.md — 락 테이블에 `Files` 컬럼 추가 (기존 행 업데이트)
- AGENTS.md — Files 컬럼 작성 규약 1문단 추가
**Exit Criteria**:
- [ ] AC1-1: 락 테이블에 Files 컬럼 존재 (현행 active Work Item 전체 backfill)
- [ ] AC1-2: `grep -h 'Files' work/active/CURRENT.md` 충돌 파일 1초 내 확인 가능
- [ ] CI green

### PR 2 — file-lock-check.sh + 병렬 에이전트 런북 (Effort: S, 3 파일)
**목적**: 새 탭 에이전트 시작 전 파일 충돌 자동 감지 + 도메인 매핑 문서화
**검증 포인트**: stale 락 24h+ 경고 + 충돌 파일 grep 동작 확인
**신규**:
- `tools/file-lock-check.sh` — CURRENT.md Files 컬럼 grep, 충돌 시 경고, stale 24h+ 경고
- `docs/runbooks/parallel-agent-file-isolation.md` — 새 탭 에이전트 시작 체크리스트
**수정**:
- agents/coordination.md — 도메인-에이전트 매핑 표 (D-7009) + file-lock-check.sh 규칙 추가
**Exit Criteria**:
- [ ] AC2-1: 충돌 파일 있을 때 exit 1 (bats 3 케이스: 충돌/정상/stale)
- [ ] AC2-2: 런북 체크리스트 5항목 이상 (시작 전/중/종료)
- [ ] CI green

### PR 3 — MEMORY 회전 + 컨텍스트 슬림 (Effort: M, 5 파일)
**목적**: 자동 주입 10.8k → ≤5.5k (MEMORY 6.3k가 핵심 타깃)
**검증 포인트**: 회전 후 measure_context_tokens.sh 합계가 5.5k 이하인가
**신규**:
- `tools/memory-rotate.sh` — 7일 이상 entry → _archive/, MEMORY-INDEX append
- `tools/token-budget-check.sh` — 5k 초과 시 경고
- `MEMORY-INDEX.md` — 회전된 entry 1줄 인덱스
- `.github/workflows/memory-rotate.yml` — 주 1회 cron
**수정**:
- MEMORY.md — 수동 첫 회전 (4-28 이전 → _archive/2026-04.md)
**Exit Criteria**:
- [ ] AC3-1: `measure_context_tokens.sh` 합계 ≤ 5,500 tok (est.)
- [ ] AC3-2: `grep -r "W-0341" MEMORY-INDEX.md _archive/` 로 과거 lesson 찾기 가능
- [ ] AC3-3: cron dry-run 성공 (workflow_dispatch)
- [ ] CI green

### PR 4 — Haiku /구현 명령 + spec-readiness gate (Effort: M, 6 파일)
**목적**: Opus설계→Haiku구현 분업. 동일 작업 비용 est. 60-70% 절감
**검증 포인트**: 샘플 작업 1개 Haiku 구현 PR CI green — Haiku 적합성 실증 (Q-7001 답)
**신규**:
- `.claude/commands/구현.md` (model: claude-haiku-4-5-20251001)
- `tools/spec-readiness.sh` — spec 충분도 0-10점 검증
- `docs/runbooks/opus-design-haiku-impl.md` — 분업 가이드 + 모범 spec + 안티패턴
**수정**:
- `.claude/commands/설계.md` — Step C에 spec-readiness 점수 출력 + model 필드
- agents/coordination.md — 모델 분업 정책 명시 (Haiku 적합 작업 5종 기준)
- CLAUDE.md — /구현 명령 한 줄 추가
**Exit Criteria**:
- [ ] AC4-1: spec-readiness.sh 모호 spec 거절 (bats 3 케이스: 명확/모호/누락)
- [ ] AC4-2: 샘플 작업 1개 Haiku PR 머지 성공
- [ ] AC4-3: 비용 비교 1쌍 실측 (est. 60-70% 절감)
- [ ] CI green

### PR 5 — Token/파일충돌 Telemetry (Effort: S, 4 파일)
**목적**: 매 세션 토큰·모델·충돌 빈도 기록 → PR 1-4 AC 수치 실측
**검증 포인트**: ⟵ 1주 후 실측으로 PR 3/4 AC 수치 확정 + Q-7002 답
**신규**:
- `tools/log-session-tokens.sh`
- `work/log/token-usage/.gitkeep`
- `work/log/file-conflicts/.gitkeep`
- `docs/runbooks/token-budget.md`
**수정**:
- `.claude/commands/닫기.md` — 종료 시 log-session-tokens 호출 + 파일 락 해제
**Exit Criteria**:
- [ ] AC5-1: 세션 종료 시 자동 기록 (bats 5 케이스 PASS)
- [ ] AC5-2: 0 PII (작업명만, user 정보 미포함)
- [ ] AC5-3: 1주 데이터로 D+7 자동주입 ≤5k 달성 여부 + Haiku 비용 절감 보고
- [ ] CI green

## 전체 Exit Criteria (Wave-level)
- [x] D+0 자동 주입 컨텍스트 ≤ 5,000 tok — **실측 3,753 tok ✅** (목표 대비 25% 추가 절감)
- [ ] D+14 파일 충돌 발생 0건/주 (PR 2 이후 file-lock-check 운용)
- [ ] D+30 평균 세션 비용 -50% 이상 (PR 5 telemetry baseline 대비)
- [ ] CI green (App + Engine + Contract)
- [ ] MEMORY 검색 가능성 회귀 없음 (과거 lesson grep 1초 이내)
