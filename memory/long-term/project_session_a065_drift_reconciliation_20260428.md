# A065 세션: docs ↔ code 5-axis drift reconciliation (2026-04-28)

## 산출물

- **PR #511** MERGED (squash) → main `d4eab4af`
- **Issue #510** CLOSED (자동, "Closes #510")
- **Branch**: `chore/issue-510-docs-drift-reconciliation` (rebase 완료, push)
- **CI**: 5/5 PASS (App / Contract / Design Verify / Engine Tests / verify)
- **코드 변경**: 0건 (자료만 정정)

## 처리한 5건 Drift

| # | Axis | Detail |
|---|---|---|
| G1 | Q5 모델 lock-in | 자료를 `claude-sonnet-4-5/4-6 둘 다 허용`으로 정정 (코드 4-5 유지) |
| G2 | CURRENT.md SHA | `fd54b314` → `aa8cb99a` (rebase 시 dropped — main이 같은 변경 이미 받음) |
| G3 | W-0259 path | `engine/validation/` → `engine/research/validation/` (5 파일 정정) |
| G4 | Pattern/BB count | 53→52 patterns, 92→85 BB (Python 실측: `len(PATTERN_LIBRARY)==52`, `engine/building_blocks/*/*.py` 카운트) |
| G5 | F-4 status | DecisionHUD.svelte 실측 존재 → checklist `[ ]` → `[~]` partial 표기 |

## 사용자 결정 사항

- **Copy Trading 코드 (engine/copy_trading/, 022 migration, app/api/copy-trading/)**: **frozen 정책 위반 아님** — main에 보존 OK. CHARTER §Frozen은 신규 작업 금지일 뿐, 기존 코드 보존 허용.
- **W-0259 조치**: 자료 정정만 (코드 wrapper layer 신규 구현 안 함).
- **Q5 모델**: 자료에 부권으로 4-5/4-6 둘 다 허용 명시, 코드 4-5 유지.

## 학습 (lesson)

1. **amend는 atomic single-axis 위배 위험** — G1 1차 grep에서 `docs/live/wave-execution-plan.md`를 누락. G5 commit에 G1 누락분 1줄을 amend로 묶이게 됨. 재발 방지: drift grep 시 `spec/`, `docs/live/`, `work/active/` 전 영역 1차 검사 필수.
2. **rebase 시 "dropping ... already upstream"** — main이 같은 변경을 이미 받았다는 신호. 충돌 아니라 정상 정합화.
3. **/검증 시 mergeable 상태 확인 필수** — CONFLICTING이면 즉시 `git fetch + rebase`.

## 잔여 minor (Out of Scope)

- ⚠️ Scheduler "11 jobs" 자료 vs 실측 10 jobs 카운트 (다음 세션 정정)
- ⚠️ 운영 Supabase migration 023 적용 검증 — issue #481 추적
- ⚠️ W-#### 번호 충돌 4쌍 (W-0216/W-0243/W-0244/W-0262) — drift_check 발견, 다음 사용 가능 = W-0271

## 다음 P0 (start.sh 안내)

- #460 W-0254 H-07+H-08 (F-02-fix 차단 해제됨)
- #423 W-0221 V-08 validation pipeline
- #454 W-0217 V-01 PurgedKFold

## 검증 SHA

- baseline: aa8cb99a (A065 부팅 시점)
- final main: d4eab4af (PR #511 squash 머지 후)

---

## 추가 작업 — PR #523 (첫 종료 후, 같은 A065 세션)

### 산출물

- **PR #523** MERGED (squash) → main `172818b7`
- Branch: `chore/end-cmd-add-longterm-memory`
- CI: 5/5 PASS

### 처리 내역

`.claude/commands/닫기.md`에 **Step 7-B 장기 메모리 영구 보존** 추가:
- (a) 세션 결과 파일 생성 (project_session_<agent>_<slug>_<date>.md)
- (b) MEMORY.md "Current State" 최상단 entry 추가
- (c) 정책 예외 결정 시 정책 메모에 보충 섹션 append
- (d) 중복 방지 규칙 (feedback_*는 update만)
- 종료 거부 조건에 "장기 메모리 보존 없이 종료 거부" 추가

### 사용자 결정

A065 첫 종료 후 사용자가 "이걸 닫기명령어에 추가하자" 직접 지시 — Step 7-B 신설로
다음 세션 부팅 시 MEMORY.md 자동 로드 → 같은 분석/오해 반복 방지.

### 학습 (lesson)

- 슬래시 커맨드 자체도 PR로 진화 가능 — 메타 도구도 docs와 동일 워크플로
- 단일 세션 jsonl(`memory/sessions/agents/<id>.jsonl`)은 cross-session 자동 로드되지 않음.
  영구 메모리는 `~/.claude/projects/-Users-ej-Projects-wtd-v2/memory/`에 저장해야 다음 세션 인지

### 검증 SHA (추가)

- after PR #523: 172818b7
