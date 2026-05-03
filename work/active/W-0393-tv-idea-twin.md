# W-0393 — TradingView Idea Twin & Hypothesis Compiler

> Wave: 6 | Priority: P1 | Effort: L
> Status: 🔵 Implementation
> Created: 2026-05-03
> PR: #951

## Goal

사용자가 TradingView URL(공개 아이디어/published script)을 붙여넣으면 엔진이 자동으로 가설을 컴파일하고, 신호 추정치(Constraint Ladder)를 보여준 뒤 패턴을 저장한다.

## Owner

engine+app

## Scope

- 포함:
  - Pine Script / text / vision 3-tier cascade parser
  - 결정론적 compiler (ATOM_TO_FILTER allowlist, strict/base/loose variants)
  - estimate gate (MIN_SAMPLE=30 n-gate)
  - 5 FastAPI endpoints: /tv-import/preview, /estimate, /commit, /author/{username}, /twin/{import_id}
  - 5 SvelteKit proxy routes + Import Workbench UI
  - HypothesisCard / ConstraintLadder / IdeaTwinCard Svelte components
  - Migration 049: tv_imports + user_pattern_combos + idea_twin_links + author_reputation_index matview
  - autoresearch scanner user combo injection

- 파일:
  - `engine/integrations/tradingview/` (전체 패키지)
  - `engine/api/routes/tv_import.py`
  - `engine/api/main.py`
  - `app/src/lib/components/TVImport/`
  - `app/src/routes/research/import/+page.svelte`
  - `app/src/routes/api/research/tv-import/`
  - `app/supabase/migrations/049_tv_imports.sql`
  - `engine/tests/integration/tradingview/test_tradingview.py`

## Non-Goals

- 개인 차트 링크 (/chart/XXXXX/) — 로그인 필요, 공개 페이지만 지원
- Copy trading / 자동매매 — Frozen
- TV API 공식 연동 (웹훅, 알림) — 별도 phase

## Canonical Files

- `engine/integrations/tradingview/pine_parser.py` — Pine Script atom 추출
- `engine/integrations/tradingview/compiler.py` — ATOM_TO_FILTER allowlist + 3-variant 컴파일
- `engine/integrations/tradingview/estimate.py` — signal count 추정 + n-gate
- `engine/api/routes/tv_import.py` — 5 FastAPI endpoints
- `app/src/routes/research/import/+page.svelte` — Import Workbench
- `app/supabase/migrations/049_tv_imports.sql` — DB 스키마

## Facts

- Pine parser: `ta.rsi`, `ta.macd`, `ta.bb` 정규식 → VisibleAtom 추출
- ATOM_TO_FILTER allowlist: rsi_oversold→rsi14<30(strict)/35(base)/40(loose), macd_bullish_cross, bb_squeeze
- estimate: base_universe=50,000, hard filter retention=45%, MIN_SAMPLE=30
- loose strictness는 n-gate bypass
- author_reputation_index: matview GROUP BY author_username
- AC1-AC12 모두 구현, 12/12 tests pass (AC2 live LLM skip)

## Assumptions

- TV 공개 아이디어 URL 형식: `tradingview.com/ideas/` 또는 `tradingview.com/script/`
- Pine Script v5 기준 파싱
- Supabase env vars 없으면 user_combos=[] (graceful degradation)

## Open Questions

- [ ] [Q-01] Vision tier (LLM fallback) 언제 trigger할지 — 현재 Pine/text 실패 시

## Decisions

- [D-01] ATOM_TO_FILTER allowlist 방식 채택 — unknown atoms를 silently drop하지 않고 unsupported_atoms로 보존
- [D-02] 3-variant pre-compute — commit 전 사용자가 strictness 선택 가능
- [D-03] loose는 n-gate bypass — 사용자가 낮은 신뢰도로도 진입 가능하게 허용

## Next Steps

1. PR #951 CI green → merge
2. idea_twin_links outcome 자동 업데이트 cronjob (Phase 2)
3. author_reputation_index auto-refresh trigger

## Exit Criteria

- [x] AC1: Pine parser extracts ≥1 atom from Pine code containing ta.rsi
- [x] AC3: Compiler maps rsi_oversold → IndicatorFilter (rsi14 < 30 strict, < 40 loose)
- [x] AC4: estimate_variant returns estimated_signal_count > 0
- [x] AC5: Constraint Ladder pre-computes all 3 strictness variants
- [x] AC8: unsupported atoms preserved in compiler_spec (never dropped)
- [x] AC10: load_active_user_combos returns [] without Supabase env vars
- [x] AC12: fetch_chart_meta raises ValueError on non-TV URL
- [x] CI green (Engine CI + App CI + Quality Gates)
- [ ] PR #951 merged + CURRENT.md SHA 업데이트

## Handoff Checklist

- [x] engine/integrations/tradingview/ 패키지 생성
- [x] compiler ATOM_TO_FILTER allowlist 구현
- [x] estimate MIN_SAMPLE gate 구현
- [x] 5 FastAPI endpoints 구현 + main.py 등록
- [x] SvelteKit proxy routes 5개 생성
- [x] Import Workbench +page.svelte 구현
- [x] HypothesisCard / ConstraintLadder / IdeaTwinCard Svelte 컴포넌트
- [x] Migration 049 SQL 작성
- [x] 12/12 integration tests pass
- [x] engine-openapi.d.ts sync
- [ ] PR merge
