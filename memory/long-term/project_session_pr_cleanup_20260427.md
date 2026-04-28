---
name: 2026-04-27 PR cleanup + W-0214 lock-in 인지
description: 5개 PR 정리, W-0214 v1.3 MM Hunter framing main lock-in 확인, V-00이 새 P0 1순위
type: project
---

# 2026-04-27 세션 — PR 정리 + W-0214 lock-in 확인

## main SHA: `485ea542` (세션 종료 시점)

## 처리한 PR

| PR | 처리 | 비고 |
|---|---|---|
| #355 | ❌ Closed | chore — events 이미 main 누적, 중복 |
| #363 | ❌ Closed | super stale (PR #362 era, behind 27 commits) |
| #368 | ✅ Merged | W-0223~W-0226 design docs → `work/completed/` 이동 (이미 머지된 Wave 1 historical record) |
| #393 | ❌ Closed (사용자) | 이전 세션에서 닫힘 |
| #394 | ✅ 이미 Merged | PRD v2.2 master |
| #395 | ❌ Closed | PR #396와 중복 (#396이 같은 W-0214 v1.3 머지) |
| #399 | OPEN (놔둠) | 자동 생성 sync events queue, automation이 갱신 |

**열린 PR**: #399 (chore) — 다음 세션에서 처리하거나 automation에 맡김.

## ⭐ 새로 lock-in된 핵심 (PR #396 = W-0214 v1.3, 다른 에이전트가 머지)

**제품 비전 변경**: "Pattern Research OS" → **"MM Pattern Hunting OS for retail crypto perp traders"**

### D1~D8 lock-in (변경 X)

- D1: User as MM Hunter (옵션 4 framing)
- D2: 4h primary forward horizon
- D3: 15bps round-trip cost (Binance perp: 10 fee + 5 slippage)
- D4: 5개 P0 패턴 측정 + 48개 보존 (NULL 상태, 삭제 X)
- D5: F-60 gate = Layer A AND Layer B (objective + subjective)
- D6: 9주 일정 (V-00 audit + V-13 decay 추가)
- D7: Hunter UI 전체 공개 + Glossary toggle (P1)
- D8: Wyckoff default phase taxonomy (둘 다 측정)

### 학술 grounding (W-0214 §2)

BSM 1973 → Kyle 1985 → Glosten-Milgrom 1985 → EKO VPIN 2002 → **Avellaneda-Stoikov 2008** ⭐ → Tishby IB 1995 → Lopez de Prado 2018 → Harvey-Liu 2015 → Bailey-Lopez de Prado DSR

### V-00~V-13 = 새 P0/P1 작업

| ID | 이름 | 우선순위 | 비고 |
|---|---|---|---|
| **V-00** | `pattern_search.py` audit | **P0 1순위** | 3283줄 audit + augment-only 정책 확립, 재구현 금지 |
| V-01 | PurgedKFold | P0 | Lopez de Prado 2018 ch7 |
| V-02~V-09 | phase_eval / ablation / sequence / regime / stats / SQL view / pipeline / weekly job | P0 | 통계 검증 framework |
| V-10 | Hunter UI | P1 | DSR/p-value/regime raw 노출 |
| V-11 | F-60 gate | P1 | Layer A AND B |
| V-12 | threshold audit | P1 | |
| V-13 | decay monitoring | P1 | rolling 30d t-stat watching |

### NSM 기여 chain (§1.5, v1.2 신규)

```
L1 G1~G7 통과 → L2 search corpus filter → L3 precision↑ → L4 capture rate↑ → L5 verdict rate / WVPL↑
```

### Falsifiable Kill (F1~F4)

- F1: 53 PatternObject 중 t-stat≥2.0 통과율 = 0% → 이론 frame 자체 재설계
- F2: verdict accuracy ↔ forward return correlation < 0.2 → evidence 분리 운영
- F3: 유저당 30일 PatternObject 생성 < 1개 → hunter persona 전제 틀림
- F4: Personal Variant p > 0.1 → refinement loop 재설계

→ F1~F4 모두 [unknown]. Week 1~4에 측정해서 결판.

## 🚦 다음 세션 시작 (HANDOFF)

### P0 1순위: V-00 pattern_search.py audit

```bash
# 1. 새 worktree
cd /Users/ej/Projects/wtd-v2
git fetch origin main
git worktree add .claude/worktrees/v00-audit -b feat/v-00-pattern-search-audit origin/main

# 2. 작업 시작
cd .claude/worktrees/v00-audit
wc -l engine/research/pattern_search.py  # 3283줄 확인
# audit 보고서 쓰기: work/active/V-00-pattern-search-audit.md
```

**audit 목표**:
- 기존 3283줄에서 augment-only로 V-01~V-13 어떻게 붙일지 매핑
- 재구현 금지 정책 확립
- 53 PatternObject 중 P0 5개 선정 후보

### 차순위 (V-00 끝나면)

- γ library audit: 53 PatternObject 중 production hit > 0 top 5 선정 (1일)
- V-01 PurgedKFold 구현

### 이전 P1 (지금 보류)

- H-07-eng / H-07-app / F-3 Telegram → V-00 끝나기 전까지 대기

## 컨텍스트 주의사항

- **memory가 자주 stale**: 04-26 기준이면 04-27 main(485ea542)을 반드시 fetch 후 확인
- **modest-haslett worktree**는 7e9e68e0 stale 상태로 남음 (.claude/commands/ 한국어 파일 untracked)
- 다음 세션은 **새 worktree** 권장 (기존 worktree 재사용 X)

## 운영 프로토콜 재확인

- 부팅: `gh issue list --state open --json number,title,assignees`
- claim: `gh issue edit N --add-assignee @me`
- 작업: `git checkout -b feat/issue-N-slug`
- PR: body에 "Closes #N"

상세: `docs/runbooks/multi-agent-coordination.md`
