# CURRENT — 2026-05-01

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`f3eeebac` — origin/main (2026-05-01) — PR #826 W-0372 Phase A merged (AppNavRail 7→5 + MobileBottomNav)

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0372-ia-consolidation` | P1 | 🟡 Phase B — hub layout + ★★★ transplant |
| `W-0304-multichart-per-pane-indicator-scope` | P2 | 🟡 Design Draft |

---

## Wave 5 실행 계획 (2026-05-01)

```
완료:  W-0365 P&L verdict ✅ | W-0366 indicator filters ✅ | W-0367 alpha loop ✅ | W-0368 hardening ✅
완료:  W-0372 Phase A ✅ — AppNavRail 7→5 + MobileBottomNav 5-hub (#826)
즉시:  W-0372 Phase B — /dashboard Home repurpose + /market 삭제 + WatchlistRail fold + ★★★ transplant
다음:  W-0372 Phase C — ★★ transplant + Supabase watchlist migration
이후:  W-0304 per-pane indicator
```

---

## 핵심 lesson (A099/A100 세션)

- **Contract CI CURRENT.md sync**: active table에 나열된 work item 파일이 실제로 존재해야 함. 파일 없으면 CI 즉시 BLOCK
- **Contract CI 필수 섹션**: Owner / Facts / Canonical Files / Assumptions / Next Steps / Handoff Checklist 전부 있어야 통과
- **W-0372 Phase A lock-in**: /cogochi = Terminal hub 핵심, /terminal → redirect. 5-Hub 확정

---

## Frozen (Wave 5 기간 중 비접촉)

- Copy Trading Phase 1+
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)
- AI 차트 분석, 자동매매, 신규 메모리 stack

---

## 다음 실행

```bash
./tools/start.sh
cat work/active/W-0372-ia-consolidation.md
# Phase B: /dashboard Home repurpose + /market 삭제 + WatchlistRail fold + ★★★ transplant
```
