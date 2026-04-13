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

## ✅ CHECKPOINT — 2026-04-13 (POST-MERGE)

### 현재 상태
- **브랜치**: `main` (최신)
- **마지막 커밋**: `d022a2d` — Merge PR #13 (terminal bloomberg cockpit)
- **서버**: `npm --prefix app run dev` → `http://localhost:5173/`

---

### Engine ✅ (main에 병합됨)

| 모듈 | 상태 |
|------|------|
| `feature_calc.py` | 92 features (Groups I–AB), 공식 검증 완료 |
| `building_blocks/` | 29 blocks |
| `data_cache/loader.py` | MTF resample 지원 — `load_klines(symbol, tf='4h')` |
| `data_cache/resample.py` | `resample_klines(df_1h, target_minutes)` |
| `data_cache/fetch_onchain.py` | MVRV Z-score, Puell Multiple, Etherscan |
| `data_cache/registry.py` | mvrv_zscore, puell_multiple DataSource 등록 |
| `api/main.py` | verdict + scanner routes, scheduler lifespan |
| Tests | 45/45 formula ✅, 302 total |

**MTF pipeline**: `fetch_klines_max(1h)` → `resample_klines(df, 240)` → `load_klines(symbol, '4h')`

---

### App — Terminal Bloomberg Cockpit ✅ (main에 병합됨)

#### Desktop (Bloomberg 3-column)
```
[TerminalCommandBar]   symbol · TF · flow bias badge · layout switch
[LeftRail 240px]  [WorkspaceGrid: Focus/Hero+3/2×2]  [ContextPanel 320px]
[TerminalBottomDock]   multimodal textarea + SSE streaming
```

#### Mobile
```
[TerminalCommandBar]
[MobileActiveBoard]    price · TF alignment · verdict · evidence · sources
[MobileCommandDock]    fixed bottom · quick chips · textarea
[MobileDetailSheet]    bottom sheet · 5탭
```

#### 컴포넌트 경로
```
app/src/components/terminal/workspace/   17개
  VerdictCard, AssetInsightCard, WorkspaceGrid, BoardToolbar
  EvidenceGrid, EvidenceCard, VerdictHeader, ActionStrip, WhyPanel
  SourceRow, SourcePill, FreshnessBadge
  TerminalCommandBar, TerminalLeftRail, TerminalContextPanel, TerminalBottomDock

app/src/components/terminal/mobile/      4개
  MobileActiveBoard, MobileDetailSheet, MobileCommandDock, index.ts

app/src/components/states/               5개
  LoadingState, EmptyState, StaleState, DisconnectedState, index.ts

app/src/lib/types/terminal.ts
  TerminalAsset, TerminalVerdict, TerminalEvidence, TerminalSource, FreshnessStatus
```

#### API 연결
| 엔드포인트 | 주기 | 용도 |
|-----------|------|------|
| `/api/cogochi/analyze` | mount + pair change | 버딕트/에비던스 |
| `/api/market/flow` | 15초 폴링 | flow bias badge |
| `/api/market/trending` | 60초 폴링 | left rail movers |
| `/api/market/news` | mount | catalysts 탭 |
| `/api/cogochi/terminal/message` | SSE | 보드 리렌더 |

#### 디자인 토큰
```css
/* 레이아웃 */
--terminal-left-w: 240px
--terminal-right-w: 320px
--terminal-cmd-bar-h: 40px

/* 서피스 */
--sc-terminal-bg: #000000
--sc-terminal-surface: #0a0a0a
--sc-terminal-border: rgba(255,255,255,0.07)

/* 소스 카테고리 */
--sc-source-market-rgb: 99,179,237    (blue)
--sc-source-derived-rgb: 251,191,36   (amber)
--sc-source-news-rgb: 156,163,175     (neutral)
--sc-source-model-rgb: 167,139,250    (violet)

/* 바이어스 */
--sc-bias-bull: #4ade80
--sc-bias-bear: #f87171
```

#### 네비게이션
- `AppSurfaceId` → `home | terminal | dashboard | scanner | lab | passport`
- `MOBILE_NAV_SURFACES` → 5탭 `[home, terminal, dashboard, passport]` + More sheet
- Terminal 라우트에서 MobileBottomNav 숨김

---

### 다음 작업 후보

1. **실데이터 E2E 테스트** — `/api/cogochi/analyze` 실응답 → board 렌더 확인
2. **Book Panel** — `DEPTH_L2_20` websocket → 오더북 패널 (TerminalContextPanel Metrics 탭)
3. **Trade Tape** — `AGG_TRADES_LIVE` → 체결 테이프 실시간 패널
4. **Liquidation Feed** — `FORCE_ORDERS` → 청산 표시
5. **engine → app 직결** — `app/cogochi/` Python bridge 대신 `engine/` 직접 import
6. **CitationDrawer** — SourcePill 클릭 시 인라인 확장 (현재 미구현)
7. **Symbol picker 드롭다운** — TerminalCommandBar 심볼 클릭 시 검색 UI
