---
name: W-0102 Prompt Agent + Chart Discipline
description: 2026-04-19 session — AI-first prompt agent (URL ?q= / chart_action SSE / shared indicator store) + Bloomberg pane density + main chart CVD→sub-pane fix. 5 commits on claude/w-0102-prompt-agent, not yet merged to main.
type: project
---

W-0102 브랜치 `claude/w-0102-prompt-agent` (worktree: wizardly-black).

**Shipped commits** (newest first):
- `48f3484` fix(ChartBoard): CVD 메인→서브페인 분리 (user feedback "보조지표만 같이")
- `f867969` style(terminal): Bloomberg pane header (10px mono, 16px × hit)
- `4c6620b` feat(Slice 3): shared chartIndicators store (SSE+popover+× 단일 소스)
- `2852b47` feat(Slice 1+2): URL ?q= auto-submit + chart_action SSE handler
- `5abbfb3` fix(test): verdict field rename (captures_routes)

**End-to-end 검증됨**:
- 홈/Dashboard 프롬프트 → /terminal?q= → auto-submit → DOUNI SSE 응답
- "ETH 4h" → TF + symbol 전환 실제 차트 반영
- CVD × 버튼 → localStorage 플립 + pane 제거
- 메인 차트는 EMA/BB/VWAP + Funding % 만, CVD는 서브페인 전용

**Why**: 자연어 입력 = 제품 코어. 홈/Dashboard/Terminal 어디서든 단일 endpoint 수렴해야 UX가 자연스러움.

**How to apply**: 다음에 chart_control tool에 `add_indicator`/`remove_indicator` 외에 `draw_annotation`, `highlight_pattern` 추가 시 동일한 `chart_action` event 패턴 사용. 새 SSE event type 추가하지 말 것.

**남은 작업 (다음 세션)**:
1. UI 중복 제거 (W-0103): 심볼·가격·TF 가 4-5 군데 중복. canonical header strip으로 수렴.
2. "끊이지 않는 캔들" 조사 — API는 500 bars 반환하지만 visible range는 8 bars. timeScale 초기 fit 로직 의심.
3. Slice 4 (contextBuilder Terminal state 주입) 보류.

**Status**: PR #99 MERGED (2026-04-20, main 진입). W-0102 완료.

**System update**: 12-pattern 시스템 달성. W-0103 UI dedup (PR #102 open) 다음은 W-0110 CTO 설계 (Pattern #13 candidate + ChartBoard 모듈화 + 캔들 연속성 버그).
