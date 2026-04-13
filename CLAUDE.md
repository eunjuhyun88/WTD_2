# WTD v2 Monorepo

## Structure

```
engine/   Python — feature calc, building blocks, backtest, data cache
app/      SvelteKit — frontend + Supabase + API routes
```

## Read Order

1. This file
2. `engine/pyproject.toml` — Python engine dependencies
3. `app/docs/COGOCHI.md` — product truth (single source)
4. `app/ARCHITECTURE.md` — app structure overview

## Engine (Python)

- Entry: `engine/scanner/feature_calc.py` — compute_features_table() (92 features)
- Blocks: `engine/building_blocks/` — 29 blocks (triggers, confirmations, entries, disqualifiers)
- Data: `engine/data_cache/` — Binance klines fetch + CSV cache + MTF resample
- Tests: `engine/tests/` — 302 tests, run with `cd engine && python -m pytest`

## App (SvelteKit)

- Dev: `npm --prefix app run dev` (port 5173)
- Product docs: `app/docs/COGOCHI.md`
- Frontend: `app/src/routes/`, `app/src/components/`
- Python bridge: `app/cogochi/` — thin wrapper (to be replaced by engine/ imports)

## Rules

- Engine changes: edit `engine/` directly, run tests before commit
- App changes: edit `app/` directly
- Never commit `.env*` files

---

## ✅ CHECKPOINT — 2026-04-13

### 현재 브랜치 상태
- `main` — engine 작업 (92 features, MTF resample)
- `feat/terminal-bloomberg-cockpit` — Terminal UI (PR #13, open, not yet merged)
- 서버 실행 중: `http://localhost:5173/`

---

### Engine 완성 현황 ✅

| 모듈 | 상태 | 위치 |
|------|------|------|
| SignalSnapshot | 92 features (Groups I–AB) | `engine/scanner/feature_calc.py` |
| Formula 검증 | 80개 정확, 3개 수정(BB ddof, Aroon tie, Vol Z) | — |
| Building blocks | 29개 | `engine/building_blocks/` |
| Data cache | fetch_klines_max + resample_klines (MTF) | `engine/data_cache/` |
| MTF pipeline | 1h CSV → 4h/1d 온디맨드 리샘플 | `engine/data_cache/resample.py` |
| Tests | 45/45 formula tests ✅, 302 total | `engine/tests/` |

**fetch_klines_max** → 모든 TF 지원 (1h 캐시 기반)
**resample_klines(df_1h, target_minutes)** → 1h → 4h/1d 변환
**load_klines(symbol, tf='4h')** → 자동 캐시 히트 or 리샘플

---

### App — Terminal UI 완성 현황 (PR #13)

#### Desktop (Bloomberg 3-column)
```
[TerminalCommandBar]  symbol · TF · flow bias · layout switch
[LeftRail 240px | WorkspaceGrid (Focus/Hero+3/2×2) | ContextPanel 320px]
[TerminalBottomDock]  multimodal input + SSE streaming
```

#### Mobile
```
[TerminalCommandBar]
[MobileActiveBoard]   price · TF alignment · verdict · evidence · sources
[MobileCommandDock]   fixed bottom · quick chips · textarea · file attach
[MobileDetailSheet]   bottom sheet · 5탭 (Summary/Entry/Risk/News/Metrics)
```

#### 컴포넌트 위치
```
app/src/components/terminal/workspace/   ← 17개 (VerdictCard, AssetInsightCard, WorkspaceGrid 등)
app/src/components/terminal/mobile/      ← 4개 (MobileActiveBoard, MobileDetailSheet, MobileCommandDock)
app/src/components/states/               ← 4개 (LoadingState, EmptyState, StaleState, DisconnectedState)
app/src/lib/types/terminal.ts            ← TerminalAsset, TerminalVerdict, TerminalEvidence, TerminalSource
```

#### API 연결
| API | 주기 | 용도 |
|-----|------|------|
| `/api/cogochi/analyze` | mount + pair change | 버딕트/에비던스 |
| `/api/market/flow` | 15초 폴링 | 좌상 flow bias badge |
| `/api/market/trending` | 60초 폴링 | left rail movers |
| `/api/market/news` | mount | catalysts 탭 |
| `/api/cogochi/terminal/message` | SSE | 보드 리렌더 |

#### 디자인 토큰 추가
```css
--terminal-left-w, --terminal-right-w, --terminal-cmd-bar-h
--sc-terminal-bg, --sc-terminal-surface, --sc-terminal-border
--sc-source-market-rgb, --sc-source-derived-rgb, --sc-source-news-rgb, --sc-source-model-rgb
--sc-bias-bull (#4ade80), --sc-bias-bear (#f87171)
```

#### 네비게이션 변경
- `AppSurfaceId` → `passport` 추가
- `MOBILE_NAV_SURFACES` → `[home, terminal, dashboard, passport]` 5탭 + More sheet
- Terminal 라우트에서 MobileBottomNav 숨김

---

### 다음 작업 후보

1. **PR #13 머지** → main에 Terminal UI 통합
2. **실데이터 E2E 테스트** — `/api/cogochi/analyze` 실응답 → 보드 렌더 확인
3. **Book Panel** — `DEPTH_L2_20` (KnownRawId) → 오더북 패널
4. **Trade Tape** — `AGG_TRADES_LIVE` → 체결 테이프 패널
5. **Liquidation display** — `FORCE_ORDERS` → 청산 피드
6. **engine → app 직결** — Python bridge(cogochi/) 대신 engine/ 직접 임포트
