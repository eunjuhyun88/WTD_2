---
name: A074 W-0281 Pattern Verification Lane (Paper Trading) design lock-in
description: PRD v3 신설로 검증 루프를 사람 판단(JUDGE)에서 시장 판단(Paper P&L)까지 확장. paper trading은 "검증 도구"로 CHARTER §Frozen 예외 인정 (실자금 자동매매는 그대로 금지).
type: project
---

# A074 W-0281 Pattern Verification Lane Design Lock-in (2026-04-28)

## 산출물

- **PR #543** (squash → main `d6c81ad7`) — W-0281 design lock-in
- **PR #550** (open) — closure cleanup + W-0282 V-PV-01 design
- **Issue #542** (closed by #543), **Issue #549** (open for #550)
- **Branch**: `feat/issue-542-W-0281-pattern-verification-design` (deleted), `chore/W-0281-closure-W-0282-design` (open)
- **Worktree**: `.claude/worktrees/relaxed-chatelet` (A074, 보존 여부 미정)
- **CI**: PR #543 5/5 SUCCESS (Contract / App / Engine / Design / Issue Link)

## 처리 내역

- **G1 PRD master v2.2 → v3 개정**: § 0.3 신설 (8 sub-section: 핵심 재정의 / Minara 비교 / 4-phase / 3-mode 변환 / 신규 lane / Open Q / KPI / v2.2 vs v3)
- **G2 PRD canonical PRD.md**: § 5 Non-Goals 정정(실자금 한정) + § 5b Pattern Verification Lane 신설
- **G3 CHARTER §Frozen 예외절 추가**: paper trading 허용 (검증 도구) / 실자금·`engine/copy_trading/` 수정 금지
- **G4 W-0281 work item**: Goal/Owner/Scope/Non-Goals/Exit/AI Researcher 리스크/CTO 결정/Facts/Assumptions/Open Q/Canonical 11 섹션 (memkraft:protocol 통과)
- **G5 ID 충돌 정정**: 초기 W-0280 → main commit `ce1ed0be feat(W-0279/W-0280): V-track core loop closure`와 충돌 발견 → **W-0281**로 정정
- **G6 W-0282 V-PV-01 후속 설계**: engine/verification scaffold + paper_executor 인터페이스 (실측 발견: `engine/backtest/` 9 파일 BUILT → 재사용 우선)
- **G7 PRIORITIES.md 정정**: paper trading ❌ → 🟢 (검증 도구로 허용)

## 사용자 결정

- **Frozen 처리**: 별 surface 격리 + 시그널 카드 단계부터 시작 (옵션 2+3 채택)
- **깊이**: Full 시뮬 + 백테스트 둘 다 (옵션 1+3 채택)
- **변환**: 3-mode 다 구현 (수동/AI/rule-based 비교 자체가 데이터)
- **우선순위**: 지금 설계만 → W-0254 H-07/H-08 후 구현 (옵션 2+1 순서)
- **CHARTER 정합성**: paper trading은 §Frozen 위반 아님 — "검증 도구이지 자동매매 도구 아님" 명시 lock-in

## 학습 (lesson)

### L1: 신규 lane 설계 전 grep 실측 의무
> v3 PRD에서 `engine/verification/` 신규 모듈로 명시했으나, V-PV-01 work item 작성 단계에서 `ls engine/` 한 번에 `engine/backtest/` 9 파일 BUILT 발견. **재사용 + paper layer만 추가**가 정답. 신규 모듈 ≠ 신규 코드.
>
> **재발 방지**: 다음 lane 설계 시 무조건 `find <root> -type d -name "<keyword>*"` + `grep -rn "<keyword>" engine/ app/` 먼저. PRD 단계에서 안 했어도 work item 단계에서는 필수.

### L2: memkraft:protocol 헤더 매칭은 정확한 문자열
> Contract CI가 `## Non-Goals (격리 선언)` 같은 부제목 헤더를 인식 못 함. 정확히 `## Non-Goals` / `## Open Questions` 만 통과. work item 9 표준 섹션은 부제목 없이 작성.

### L3: 슬래시 커맨드도 Frozen 예외 가능
> CHARTER §Frozen은 "신규 도구 빌드" 금지 + "정책 동결". paper trading은 후자였는데, **사용자 결정으로 예외절 추가** → 정책도 진화 가능. 단 명시적 PR + sign-off + scope 격리 (실자금 ❌ 유지).

### L4: ID 충돌은 git log 전수검사로
> W-0280으로 시작했는데 main에 `ce1ed0be feat(W-0279/W-0280)` 이미 머지됨. **`git log --all --oneline | grep -oE "W-[0-9]{4}" | sort -u`** 한 번이면 발견 가능. work item 만들기 전 의무.

### L5: Frozen 격리는 CI 가드까지
> "engine/copy_trading/ 수정 금지"를 문서로만 두면 다음 에이전트가 무심코 import할 수 있다. W-0282에 **CI 가드 (`import.*copy_trading` grep PR 차단)** Exit Criteria로 명시. V-PV-01 PR 시 `.github/workflows/` 추가 필요.

## 잔여 minor

- PR #550 머지 (closure cleanup + W-0282 design) — 다음 에이전트 또는 auto-merge
- W-0254 H-07/H-08 머지 후 V-PV-01 (W-0282) 시작 가능
- VPV01-Q1~Q5 + PV-Q1~Q7 사용자 결정 세션 (V-PV-01 진입 시점)
- CI 가드 (`import.*copy_trading`) 룰 위치 결정 (.github/workflows 새 파일 vs 기존 contract-ci 확장)
- Worktree `.claude/worktrees/relaxed-chatelet` 처리 — keep vs remove (다음 세션에서 결정)

## 다음 P0

1. **PR #550 머지** (closure + W-0282 design)
2. **W-0254 H-07/H-08 머지 대기** — `gh pr list --search "W-0254"` 모니터링
3. **V-PV-01 (W-0282) 시작** — 새 worktree `.claude/worktrees/feat-V-PV-01`, Issue #549 assign
4. **첫 5분 명령어**: `grep -rn "verification\|paper_exec\|backtest" engine/` (L1 재발 방지)
5. **PV-Q1~Q7 + VPV01-Q1~Q5 사용자 결정 세션**

## 검증 SHA

- baseline: `6aeafff9` (origin/main, 세션 시작)
- after PR #543 머지: `d6c81ad7` (origin/main)
- closure branch HEAD: `744f2aef` (chore/W-0281-closure-W-0282-design)
- W-0282 work item: `work/active/W-0282-v-pv-01-engine-verification-scaffold.md`
- W-0281 archived: `work/completed/W-0281-pattern-verification-lane.md`

## References

- 트리거 메시지: 사용자 인사이트 "Minara처럼 페이퍼 트레이딩 / 그래야 맞는지 알잖아"
- Minara 비교: https://minara.ai/app/trade/strategy-studio (자동매매 실행 vs WTD 검증 도구)
- PRD master § 0.3: `docs/live/W-0220-product-prd-master.md`
- CHARTER §Frozen 예외: `spec/CHARTER.md`
