---
name: Worktree Audit & Cleanup Strategy (2026-04-25)
description: 46개 worktree 정리 계획 — Active/Orphaned/Modified 분류 + 우선순위
type: project
---

# Worktree Audit Report — 2026-04-25

## Executive Summary

**문제:**
- 46개 worktree 존재
- **모든 worktree가 W-0001 ~ W-0204 전체 work items 복사본 보유** (161개 W 정의)
- 각 worktree마다 다른 CURRENT.md (또는 없음)
- 구조 규칙 완전 붕괴

**영향:**
- 에이전트가 "어느 worktree가 진짜 W-0202인가?" 파악 불가
- 중복 개발 자동 발생
- next 에이전트가 어디서 작업할지 불명확

---

## Worktree 분류

### ✓ ACTIVE (17개 — 최근 사용 중)
```
agitated-mcclintock        → claude/w-0122-rolling-percentile-v2 (3d)
busy-williams-52d050       → claude/w-0124-0125-reorder-presets (2d)
condescending-thompson     → claude/condescending-thompson (4d)
eager-clarke               → claude/w-0117-mobile-fix (4d)
gifted-raman               → claude/gifted-raman (2d)
gifted-shannon             → claude/gifted-shannon (0d) [W-0162]
infallible-davinci-26f1c0  → claude/infallible-davinci-26f1c0 (3d)
infallible-solomon         → claude/infallible-solomon (4d)
nice-aryabhata-5414ac      → main (0d) ⚠️
nostalgic-leavitt          → claude/w-0122-phase3-ui (3d)
practical-mcclintock-a4de4b → claude/practical-mcclintock-a4de4b (3d)
romantic-merkle            → claude/romantic-merkle (0d) [PR #281 머지됨]
silly-gagarin              → claude/silly-gagarin (3d)
strange-proskuriakova      → claude/strange-proskuriakova (0d) [arch-improvements]
stupefied-fermi            → claude/stupefied-fermi (0d)
w-0131-tablet-peek-drawer  → codex/w-0131-tablet-peek-drawer (2d)
w-0162-stability           → claude/w-0162-stability (0d) [P1/P2 hardening]
```

**평가:** 이들은 아직 누군가 사용 중일 수 있음 → **건드리지 말 것**

### ✗ ORPHANED (17개 — origin branch 삭제됨)
```
bold-morse                 → claude/bold-morse (origin gone)
busy-hermann-e9db0a        → claude/busy-hermann-e9db0a (origin gone)
competent-blackwell-59e973 → claude/competent-blackwell-59e973 (origin gone)
confident-saha-ec5ebc      → claude/confident-saha-ec5ebc (origin gone)
eager-lamport-99daf8       → claude/eager-lamport-99daf8 (origin gone)
focused-hoover             → claude/focused-hoover (origin gone)
goofy-stonebraker-9cc667   → claude/goofy-stonebraker-9cc667 (origin gone)
great-ishizaka             → claude/great-ishizaka (origin gone)
kind-lichterman-2d1a19     → claude/kind-lichterman-2d1a19 (origin gone)
musing-pare                → claude/musing-pare (origin gone)
romantic-hypatia-d2e1c3    → claude/romantic-hypatia-d2e1c3 (origin gone)
sad-darwin-f2de70          → claude/w-0131-tablet-peek-drawer (origin gone)
strange-johnson            → feat/w-0202-fws-cutover ⚠️⚠️⚠️ (origin gone!)
vibrant-lumiere-ab6637     → claude/vibrant-lumiere-ab6637 (origin gone)
vibrant-tereshkova         → claude/vibrant-tereshkova (origin gone!)
vigorous-yalow-af4352      → claude/vigorous-yalow-af4352 (origin gone)
xenodochial-germain-89ea13 → claude/xenodochial-germain-89ea13 (origin gone)
```

**⚠️ 특이점:**
- `strange-johnson`: **feat/w-0202-fws-cutover (W-0202 branch!)** 근데 origin gone?
  - 즉, W-0202 branch가 origin에 없다는 뜻
  - 우리는 W-0202를 해야 하는데, origin에 기초가 없다!
- `vibrant-tereshkova`: 우리 현재 worktree인데도 orphaned (local-only branch)

**평가:** PR 머지로 정리된 것들 → **삭제 후보**

### ! MODIFIED (10개 — 미커밋 변경사항)
```
confident-shockley-acf736   → claude/confident-shockley-acf736 (changes!)
eager-franklin-ab6805       → claude/eager-franklin-ab6805 (changes!)
friendly-davinci-b9ff0f     → feat/pattern-similarity-search-ui (changes!)
hopeful-faraday-c2363d      → claude/hopeful-faraday-c2363d (changes!)
infallible-chandrasekhar-f6a39f → fix/ci-main-repair (changes!)
jovial-colden               → fix/ci-main-repair (changes!)
naughty-mclean-c8ce16       → claude/naughty-mclean-c8ce16 (changes!)
quirky-chatterjee-3b7be8    → claude/quirky-chatterjee-3b7be8 (changes!)
reverent-grothendieck-bdb1b2 → claude/reverent-grothendieck-bdb1b2 (changes!)
upbeat-tharp-f26013         → claude/W-0133-cogochi-perf (changes!)
```

**평가:** 누군가 **지금 작업 중일 수 있음** → **절대 지우지 말 것**

---

## W 정의 분포 (현재 상태)

**너무 많은 worktree가 "소유권"을 주장:**
- W-0201: 8개 worktree (어디가 진짜?)
- W-0202: 7개 worktree (어디가 진짜?) ← **우리가 해야 할 것**
- W-0203: 7개 worktree (어디가 진짜?)
- W-0204: 7개 worktree

**가장 복제된 것:**
- W-0114: 134 worktrees (!!)
- W-0097: 104 worktrees
- W-0086: 104 worktrees

**원인:** Worktree 생성 시 전체 `work/active/` 디렉토리를 복사

---

## CURRENT.md 현황

| Worktree | CURRENT.md? | main SHA | 상태 |
|----------|-------------|----------|------|
| bold-morse | ✓ | ? | "완료" 표기 |
| romantic-merkle | ✓ | 766c960b | "완료" 표기, PR #281 머지 |
| strange-johnson | ✓ | 60bf3365 | W-0202 담당? |
| vibrant-tereshkova | ✓ | f9eedc21 | 우리 현재 위치 |
| (대부분) | ✗ | N/A | 상태 불명 |

**문제:** CURRENT.md가 있는 것들도 내용이 **각각 다르거나 stale**

---

## 즉시 조치 필요 사항

### 🔴 BLOCKER: W-0202 현황
- **strange-johnson**에서 정의됨 (feat/w-0202-fws-cutover)
- 근데 **origin에 branch가 없음** (orphaned)
- 따라서 다음 에이전트가 W-0202 시작할 때 새로 branch 생성해야 함
- **-> CURRENT.md에 명시 필요: "W-0202는 fresh branch로 시작"**

### 🔴 Worktree/Branch 정규화 필요
현재: worktree 이름 ≠ branch 이름 (명명규칙 없음)
필요: 1:1 매핑
```
w-0202-fws-cutover (worktree) ← feat/w-0202-fws-cutover (branch)
w-0203-benchmark (worktree) ← feat/w-0203-benchmark (branch)
...
```

---

## 정리 우선순위 (사용자 확인 필요)

| 순번 | 대상 | 액션 | 영향 |
|------|------|------|------|
| **1** | Orphaned 17개 | **조사만** → memory에 이유 기록 | 명확화 |
| **2** | Modified 10개 | **보호** → 누가 쓰는지 파악 필수 | 안전 |
| **3** | W-0201/202/203 정의 통합 | 7개 → 1개 (canonical) | 중복 제거 |
| **4** | Root-level CURRENT.md 생성 | 모든 worktree가 참조 | 동기화 |

---

## Next Steps (사용자 결정 필요)

1. **Modified 10개 worktree가 누구 것인지 파악** (다른 에이전트?)
2. **W-0202 branch 상태 명확화** (새로 만들어야 하는지 확인)
3. **Orphaned 17개 정말 지워도 되는지 PR 히스토리 검증**

