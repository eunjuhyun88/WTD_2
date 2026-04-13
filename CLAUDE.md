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

## ✅ CHECKPOINT — 2026-04-13 (SESSION 2)

### 현재 상태
- **브랜치**: `main` (최신)
- **마지막 커밋**: `49e59e3` — Merge claude/funny-roentgen (Bloomberg UI design system)
- **서버**: `npm --prefix app run dev` → `http://localhost:5175/` (5173/5174 좀비 가능)

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

### Terminal 현황 (Session 2 완료)

#### 수정된 내용
| 항목 | 내용 |
|------|------|
| 빈 보드 버그 수정 | `heroAsset`/`heroVerdict`를 부모 `$derived`로 계산 — WorkspaceGrid $.prop ACCESSOR 문제 우회 |
| 패널 리사이징 | 좌우 드래그 핸들 (좌: 160–400px, 우: 240–520px) |
| Right panel | 기본 숨김 → 첫 쿼리 이후 표시 (`showRightPanel`) |
| TerminalBottomDock | 2줄 → 1줄 인라인 바 (슬림화) |
| BottomBar 제거 | `/terminal`에서 숨김 (CommandBar에 이미 가격 표시) |
| PageSense 제거 | 한국어 쿠키 배너 2개 뜨던 문제 해결 |
| `$effect` 최적화 | `gPair`/`gTf` narrow derived — 가격 틱으로 분석 재트리거 방지 |
| UI 디자인 복구 | `claude/funny-roentgen` 미머지 커밋 복구 — settings/dashboard/passport/lab Bloomberg 스타일 |

#### 알려진 이슈
- `ensemble: null` — Python 엔진이 BTC 1D에서 앙상블 스코어 미생성 (API는 정상, 데이터 문제)
- 서버 포트 충돌 — 5173/5174 좀비 프로세스 존재, 현재 5175에서 실행 중

---

### 다음 작업 후보

1. **ensemble null 해결** — Python 엔진 1D/4H BTC 앙상블 트리거 조건 디버깅
2. **Symbol picker 드롭다운** — TerminalCommandBar 심볼 클릭 시 검색 UI
3. **Book Panel** — `DEPTH_L2_20` websocket → 오더북 패널 (TerminalContextPanel Metrics 탭)
4. **Trade Tape** — `AGG_TRADES_LIVE` → 체결 테이프 실시간 패널
5. **Liquidation Feed** — `FORCE_ORDERS` → 청산 표시
6. **engine → app 직결** — `app/cogochi/` Python bridge 대신 `engine/` 직접 import
7. **CitationDrawer** — SourcePill 클릭 시 인라인 확장 (현재 미구현)
8. **WalletModal UI** — 기존 리팩토링 검증 (funny-roentgen 머지 후 상태 확인 필요)
