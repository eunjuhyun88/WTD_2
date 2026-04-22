# W-0130 — 다음 세션 설계

## 진입 순서

### 0. 즉시 처리 (5분)

```bash
gh auth login   # 토큰 재인증
gh pr merge 172 --merge   # W-0123 indicator viz v2
```

Supabase migration 018 (`pattern_ledger_records`) 실행:
```sql
-- app/supabase/migrations/018_pattern_ledger_records.sql
-- psycopg2 pooler 경유 (MCP 불안정)
```

---

## Task 1 — Tablet PeekDrawer (W-0131)

**목표**: 768–1023px에서 캡처 annotation 클릭 시 PeekDrawer review slot에 CaptureReviewDrawer 표시

**파일**
- `app/src/components/terminal/workspace/CenterPanel.svelte` — PeekDrawer slot 연결
- `app/src/components/terminal/chart/CaptureAnnotationLayer.svelte` — onSelect 콜백 (이미 있음)

**설계**
```svelte
<!-- CenterPanel.svelte -->
let selectedCapture = $state<CaptureAnnotation | null>(null);

<!-- PeekDrawer 내부 -->
{#if selectedCapture}
  <CaptureReviewDrawer
    annotation={selectedCapture}
    variant="drawer"
    onClose={() => { selectedCapture = null; }}
  />
{/if}
```

**반응형 분기**
| 뷰포트 | 컴포넌트 | variant |
|---|---|---|
| ≥1024px | ChartBoard 내장 side drawer | `drawer` (x: 320) |
| 768–1023px | CenterPanel PeekDrawer slot | `drawer` (x: 320) |
| <768px | ChartMode bottom sheet | `sheet` (y: 600) |

---

## Task 2 — W-0122 Confluence Phase 2

**목표**: engine-side confluence scoring → flywheel weight learning → capture 시 snapshot 저장

**설계 포인트**
1. `engine/confluence/scorer.py` — 현재 pure Python function → `ConfluenceScorer` 클래스로 전환
2. `engine/capture/store.py` — capture 시 confluence score snapshot을 `chart_context_json`에 포함
3. `/api/confluence/current` — 기존 7-contribution 방식 유지 + weight 필드 추가
4. Flywheel integration: verdict 결과 → 각 contribution weight 조정 (Elo-style simple update)

**contribution 가중치 초기값**
```python
DEFAULT_WEIGHTS = {
    "venue_divergence": 1.0,
    "ssr": 0.8,
    "options": 1.0,
    "oi_trend": 0.9,
    "funding": 0.7,
    "liq_clusters": 0.6,
    "rv_cone": 0.5,
}
```

**flywheel update rule**
```python
# verdict=valid → 해당 capture 시점 active contributions 가중치 +0.05
# verdict=invalid → active contributions 가중치 -0.03
# clamp: [0.1, 2.0]
```

**DB**: `confluence_weights` 테이블 (pattern_slug, contribution_key, weight, updated_at)

---

## Task 3 — Copy Trading Phase 1 (W-0132)

memory의 PRD 참조: `project_copy_trading_prd_2026_04_22.md`

**Phase 1 scope (MVP)**
- `trader_profiles` 테이블 + JUDGE score 연산 (Supabase)
- `copy_subscriptions` 테이블
- `/api/copy-trading/leaderboard` — JUDGE score 기준 top-N
- `/api/copy-trading/subscribe` — 구독 생성
- UI: LeaderboardPanel (기존 ConfluenceBanner 레이아웃 재사용)

**진입 조건**: Task 1 + Task 2 완료 후

---

## 브랜치 전략

| Task | 브랜치 이름 | Base |
|---|---|---|
| Tablet PeekDrawer | `claude/tablet-peek-drawer` | main |
| Confluence Phase 2 | `claude/confluence-phase2` | main |
| Copy Trading Phase 1 | `claude/copy-trading-p1` | main |
