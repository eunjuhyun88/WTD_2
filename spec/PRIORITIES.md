# Active Priorities

> 활성 P0/P1/P2만. 총 ≤ 50 lines.
> Charter 정합성: `spec/CHARTER.md` In-Scope.
> 단일 진실: `docs/live/W-0220-status-checklist.md`

---

## P0 — Wave 1: 입구 + 라벨 (4 독립, 즉시 병렬)

| Issue | Feature | Branch | 선행 |
|---|---|---|---|
| **#364** | F-02 Verdict 5-cat (valid/invalid/missed/too_late/unclear) | `feat/F02-verdict-5cat` | — |
| **#365** | A-03-eng AI Parser engine (POST /patterns/parse) | `feat/A03-ai-parser-engine` | — |
| **#366** | A-04-eng Chart Drag engine (POST /patterns/draft-from-range) | `feat/A04-chart-drag-engine` | — |
| **#367** | D-03-eng 1-click Watch engine (POST /captures/{id}/watch) | `feat/D03-watch-engine` | — |

**Charter 매핑**: F-0a/F-0b/F-1/F-2 (PRD v2.2 §8 P0).
**결정 lock-in**: D8(5-cat 즉시 P0) · Q1(missed/too_late 분리) · Q3(실제 드래그) · Q4(자유 텍스트) · Q5(Sonnet 4.5+).

---

## P1 — Wave 2 (Wave 1 머지 후)

- **A-03-app** AI Parser UI (선행 #365)
- **A-04-app** Chart Drag UI 실제 드래그 (선행 #366)
- **D-03-app** 1-click Watch 버튼 (선행 #367)
- **H-07** F-60 Gate API + UI (선행 #364)
- **H-08** per-user verdict accuracy (선행 #364)
- **F-3** Telegram → Verdict deep link (선행 #364)

## P2 — Wave 3 (별도 설계)

- **F-30** Ledger 4-table 분리 + materialized view
- **F-31** LightGBM Reranker 1차 학습 (verdict 50+)
- **F-12** DESIGN_V3.1 features (kimchi_premium, session_*, oi_normalized_cvd)
- **F-17** Visualization Intent Router (6 intent × 6 template)
- **F-39** Screener Sprint 2

---

## Frozen / Non-Goals (CHARTER §Frozen)

- ❌ Copy Trading Phase 1+ (N-05 marketplace는 F-60 gate 후 별도 ADR)
- ❌ AI 차트 분석 툴 / TradingView 대체
- ❌ **신규** dispatcher / OS / handoff framework 빌드
- ❌ Chart UX polish (W-0212류)

→ Issue/assignee/Project 사용은 ✅ Allowed (CHARTER §Coordination)

## 운영 프로토콜

- 부팅: `gh issue list --search "no:assignee" --state open` → assignee 분배
- 충돌 차단: PR #361 (Issue mutex) + PR #362 (pre-commit gate)
- 체크리스트 토글은 PR diff에서만 (CI invariant)
- 상세: `docs/live/wave-execution-plan.md`
