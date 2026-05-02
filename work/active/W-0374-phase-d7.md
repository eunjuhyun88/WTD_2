# W-0374 Phase D-7 — AIAgentPanel 5탭 완성 + DrawerSlide + aiQueryRouter

> Wave: 5 | Priority: P1 | Effort: M (2.5일: Stage A 0.5 + Stage B 2.0)
> Parent: W-0374-cogochi-bloomberg-ux-restructure.md
> Issue: #864
> Status: 🟡 Design Draft
> Created: 2026-05-02

## Goal

AIAgentPanel을 완성된 Bloomberg 우측 패널로 만들기 — 5탭 full-name 레이블, 슬래시(`/`) AI Search, DrawerSlide 카드 확장, aiQueryRouter 자연어→action 6-rule chain.

## Scope

### 단계 A — D-4+D-6 정리 PR (기존 코드, 0.5일)

로컬 커밋(미머지) 7파일 → PR:

| 파일 | 변경 |
|---|---|
| `app/src/lib/cogochi/components/IndicatorLibrary.svelte` | 신규 (D-4) |
| `app/src/lib/cogochi/shell.store.ts` | drawing mode 추가 (D-4) |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | handleAddIndicator + 4 drag handlers (D-4+D-6) |
| `app/src/components/terminal/workspace/ChartBoardHeader.svelte` | indicator button 배선 (D-4) |
| `app/src/components/terminal/workspace/ChartToolbar.svelte` | drawingMode 상태 표시 (D-4) |
| `app/src/components/terminal/chart/overlay/RangeModeToast.svelte` | 4-action 토스트 (D-6) |

### 단계 B — D-7 신규 PR (2일)

**신규 파일 3개:**
- `app/src/lib/cogochi/components/DrawerSlide.svelte`
- `app/src/lib/cogochi/utils/aiQueryRouter.ts`
- `app/src/lib/cogochi/utils/aiQueryRouter.test.ts`

**수정 파일 4개:**
- `app/src/lib/cogochi/AIAgentPanel.svelte` (탭 재구성 + Search + DrawerSlide 배선)
- `app/src/lib/cogochi/shell.store.ts` (DrawerContent union type 추가)
- `app/src/routes/cogochi/+layout.svelte` or `AppShell.svelte` (`/` 키 핸들러)
- `app/src/lib/indicators/registry.ts` (findIndicatorByQuery export)

## Non-Goals

- Copy trading, leaderboard (Frozen)
- AI 자동매매 / 신규 메모리 stack (Frozen)
- D-8 이후 (PatternLibraryPanel, ScreenerPanel, VerdictInboxPanel) — 별도 Phase
- ⌘K CommandBar 수정 없음 — `/` 충돌 없이 독립 동작

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| R1: DrawerSlide focus-trap이 기존 모달과 z-index 충돌 | 중 | 중 | `z-index: 60` 고정 (모달 `50`보다 위) |
| R2: aiQueryRouter 오매칭 — "BTC 분석해줘"가 잘못 dispatch | 중 | 낮 | confidence < 0.4 시 chat fallback, 오매칭 telemetry |
| R3: `/` 키가 input focus 중 AI Search 오활성화 | 높 | 낮 | `event.target`이 input/textarea면 차단 |
| R4: IndicatorLibrary (D-4) 화면 좌측 drawer가 ChartBoard z-index와 충돌 | 낮 | 중 | 이미 D-4 로컬 테스트 통과 |
| R5: shell.store DrawerContent type 확장으로 기존 코드 TS 에러 | 중 | 낮 | union 추가, 기존 타입 유지 |

### Dependencies

- PeekDrawer.svelte 존재 확인 ✅ (`app/src/lib/terminal/peek/PeekDrawer.svelte`)
- registry.ts aiSynonyms 위치 확인 ✅ (AIPanel 내부 아님)
- chartSaveMode store 존재 확인 ✅ (D-6에서 배선 완료)

### Rollback

- 단계 A: squash merge → revert 1 commit
- 단계 B: DrawerSlide/aiQueryRouter 신규 파일 → feature flag 불필요, AIAgentPanel에서 import 제거만으로 비활성화

### Files Touched 요약

```
app/src/lib/cogochi/
  AIAgentPanel.svelte          (수정 — 탭+Search+DrawerSlide)
  shell.store.ts               (수정 — DrawerContent type)
  components/
    DrawerSlide.svelte         (신규)
    IndicatorLibrary.svelte    (신규, D-4에서)
  utils/
    aiQueryRouter.ts           (신규)
    aiQueryRouter.test.ts      (신규)
app/src/lib/indicators/registry.ts          (수정 — export findIndicatorByQuery)
app/src/components/terminal/workspace/
  ChartBoard.svelte            (수정, D-4+D-6에서)
  ChartBoardHeader.svelte      (수정, D-4에서)
  ChartToolbar.svelte          (수정, D-4에서)
app/src/components/terminal/chart/overlay/
  RangeModeToast.svelte        (수정, D-6에서)
app/src/routes/cogochi/+layout.svelte      (수정 — `/` 핸들러)
```

## AI Researcher 관점

### Data Impact

- **AI Search query log** → Supabase `ai_search_queries(query TEXT, matched_intent TEXT, matched_action TEXT, unmatched BOOL, user_id UUID, created_at TIMESTAMPTZ)` 저장
  - 베타 기간 수집 → 자연어→action 매퍼 지속 학습 소스
  - 오매칭(unmatched=true) 집계 → router rule 우선순위 재조정 근거
- **drawer expand dwell** → `aipanel.drawer.open(content_type, tab_id, dwell_ms)` telemetry
  - 카드 타입별 빈도 → Decision 탭 inline 카드 priority re-rank

### aiQueryRouter 6-rule Chain (우선순위 순)

```typescript
type Intent = 'tf_change' | 'ai_overlay' | 'pattern_recall' | 'whale_alert'
             | 'indicator_add' | 'range_analyze' | 'unknown';

const RULES: Array<{ pattern: RegExp; intent: Intent; confidence: number }> = [
  { pattern: /(\d+)(m|h|d|w)\s*(차트|봐|전환|바꿔)/, intent: 'tf_change',      confidence: 0.9 },
  { pattern: /(AI|ai)\s*(overlay|오버레이|그려)/, intent: 'ai_overlay',         confidence: 0.9 },
  { pattern: /(패턴|pattern)\s*(찾아|recall|비슷한)/, intent: 'pattern_recall', confidence: 0.85 },
  { pattern: /(고래|whale|대량|大量)/, intent: 'whale_alert',                   confidence: 0.8 },
  { pattern: /(RSI|MACD|볼린저|BB|EMA|MA|볼륨|추가)/, intent: 'indicator_add', confidence: 0.8 },
  { pattern: /(분석|analyze|구간|range)/, intent: 'range_analyze',              confidence: 0.7 },
];
// confidence < 0.4 → intent: 'unknown' → chat fallback
```

### Statistical Validation

- router 단위 테스트 24-case: 6 rule × 4 (맞는 쿼리 2 + 경계 1 + false-positive 1)
- 목표: 24/24 pass (100%), 오매칭 0

### Failure Modes

- query가 모든 rule 미매칭 → `unknown` → AIAgentPanel chat tab으로 fallback (UX 무중단)
- Supabase insert 실패 → fire-and-forget, 사용자 차단 없음
- DrawerSlide ESC → focus 원래 요소로 복귀 (accessibility)

## Decisions

- **[D-1]** 탭 레이블: **Decision / Pattern / Verdict / Research / Judge** (풀네임)
  - 거절: Dec/Pat/Ver/Res/Jdg — Bloomberg 메인탭도 풀네임, 오른쪽 패널 너비 충분

- **[D-2]** PR: **2개 분리** (A: D-4+D-6 / B: D-7)
  - 거절: 단일 PR — D-7 리스크가 D-4+D-6 완성 코드를 블로킹해서는 안 됨

- **[D-3]** AI Search 트리거: **`/` 슬래시** (input/textarea focus 제외)
  - 거절: Alt+L — 비직관적, OS별 동작 불일치
  - 구현: `if (e.key === '/' && !isInputFocused()) { e.preventDefault(); openAISearch(); }`

- **[D-4]** Query telemetry: **Supabase 평문 저장** (PII 없음 — ticker만 포함)
  - 거절: 카운트만 — 베타 기간이 유일한 수집 기회, 학습 소스 포기 불가

- **[D-5]** Effort: **2.5일 그대로** (A 0.5 + B 2.0)
  - router 24-case 테스트 포함하면 이미 타이트

## Open Questions

- [ ] [Q-1] DrawerSlide 너비: 320px peek / 480px expand — 모바일(< 768px) 에서 full-width로 전환? (현재 모바일 UX 미정의)
- [ ] [Q-2] `ai_search_queries` 테이블 migration 번호: 다음 migration이 몇 번인지 확인 필요 (현재 최신 확인 필요)
- [ ] [Q-3] Decision 탭 inline 카드 (p_win + verdict + evidence) 실제 API endpoint: `/api/verdict/{symbol}` 존재? 아니면 모킹?

## Implementation Plan

### 단계 A (0.5일)

1. 현재 워크트리 브랜치 `claude/laughing-lumiere-e77ef9` → `feat/W-0374-d4-d6` rename
2. 7파일 staged → PR 생성 ("feat(W-0374 D-4+D-6): IndicatorLibrary + drag-to-save handlers")
3. CI green 확인 → merge → CURRENT.md main SHA 업데이트

### 단계 B (2일)

**Day 1**

1. 새 브랜치: `feat/W-0374-d7`
2. `DrawerSlide.svelte` 구현
   - Props: `open: boolean`, `content: DrawerContent | null`, `onClose: () => void`
   - 320px → 480px toggle, 200ms ease-out, focus-trap, Esc close
   - PeekDrawer.svelte wrap (기존 로직 재사용)
3. `aiQueryRouter.ts` 구현 (6-rule chain)
4. `aiQueryRouter.test.ts` 24-case vitest

**Day 2**

5. `AIAgentPanel.svelte` 리팩토링
   - 탭 레이블 → Decision / Pattern / Verdict / Research / Judge
   - 각 탭 inline 카드 stub (실 API 연결은 D-8)
   - DrawerSlide 배선 (카드 클릭 → drawer expand)
   - `/` AI Search 입력창 (상단 고정, IME compositionstart/end 처리)
6. `shell.store.ts` DrawerContent union type 추가
7. `+layout.svelte` `/` 키 핸들러
8. `registry.ts` findIndicatorByQuery export
9. Supabase migration — `ai_search_queries` 테이블
10. svelte-check + vitest 전체 통과 확인
11. PR 생성 ("feat(W-0374 D-7): AIAgentPanel 5탭 + DrawerSlide + aiQueryRouter")

## Exit Criteria

- [ ] **AC-B1**: AIAgentPanel 탭 5개가 Decision / Pattern / Verdict / Research / Judge 레이블로 렌더링
- [ ] **AC-B2**: 각 탭 전환 시 해당 탭 콘텐츠가 200ms 이내 표시 (lighthouse trace)
- [ ] **AC-B3**: DrawerSlide 320px→480px 토글 transition 200ms ease-out (devtools animation inspector)
- [ ] **AC-B4**: DrawerSlide ESC로 닫히고, 원래 포커스 요소로 복귀 (axe accessibility pass)
- [ ] **AC-B5**: `/` 키 → AI Search 활성화 (input/textarea focus 중에는 미발동)
- [ ] **AC-B6**: ⌘K CommandBar와 `/` AI Search 동시 발동 0건 (keyboard conflict test)
- [ ] **AC-B7**: aiQueryRouter 24-case vitest 24/24 pass
- [ ] **AC-B8**: 한글 IME 쿼리 ("RSI 추가해줘") Enter 1회 dispatch — 더블 dispatch 0건
- [ ] **AC-B9**: AI Search query → Supabase `ai_search_queries` insert 확인 (Supabase dashboard)
- [ ] **AC-B10**: bundle size 증가 ≤ +15KB (vite-bundle-visualizer 측정)
- [ ] **AC-B11**: telemetry 4 events emit — `ai_search.query`, `ai_search.unmatched`, `aipanel.drawer.open`, `aipanel.tab.dwell`
- [ ] **AC-B12**: svelte-check 0 errors, CI green, PR merged, CURRENT.md main SHA 업데이트
