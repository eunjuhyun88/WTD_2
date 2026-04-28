# Engine Bridge 완료 (2026-04-13)

## 완료된 작업 (PR #3~#7)

### PR #3 — FastAPI 엔진 ↔ SvelteKit 브릿지
- `engine/api/` — FastAPI 서버 (main, schemas, score/backtest/challenge/train 라우트)
- `engine/scoring/` — LightGBM 엔진 + 피처 매트릭스(28개) + 빌딩블록 평가기
- `engine/challenge/` — 패턴 타입, 히스토리 매처, 3전략 리파이너
- `app/src/lib/server/engineClient.ts` — 타입드 HTTP 클라이언트
- `app/src/routes/api/engine/[...path]` — SvelteKit 프록시 (ENGINE_URL 서버사이드 격리)
- `/api/cogochi/analyze` — Python 엔진 single source, TypeScript layerEngine 폴백

### PR #5 — Registry 데이터 파이프라인
- `engine/data_cache/registry.py` — DataSource 레지스트리 패턴
- MACRO_SOURCES (fear/greed, BTC dominance, DXY/VIX/SPX) + ONCHAIN_SOURCES
- FEATURE_COLUMNS: 28개 → 39개 자동 확장

### PR #6 — L4/L5/UI
- **L4 스캐너**: APScheduler 15분 유니버스 스캔 → Supabase `engine_alerts`
- **L5 학습루프**: `POST /api/cogochi/outcome` → trade_records → N×20 시 auto-train
- **UI**: SingleAssetBoard에 P(Win) 스탯카드 + blocks_triggered 그린 칩
- DB 마이그레이션 016: engine_trade_records + engine_alerts + RLS

### PR #7 — CTO 리뷰 버그 7개 수정
| 심각도 | 버그 | 수정 |
|--------|------|------|
| CRITICAL | score.py tbv: absolute를 volume으로 또 곱함 → CVD 오염 | `b.tbv * b.v` → `b.tbv` |
| CRITICAL | schemas.py tbv default 0.5 (비율) → 0.0 (absolute) | 수정 |
| CRITICAL | scheduler.py compute_snapshot perp 타입: DataFrame → dict | last row 변환 추가 |
| CRITICAL | schemas.py min_length=10 vs MIN_TRAIN_RECORDS=20 불일치 | 20으로 통일 |
| HIGH | LightGBM StratifiedKFold → 시간 누수 | expanding-window walk-forward로 교체 |
| HIGH | fold_aucs 비었을 때 AUC=0.5로 모델 교체 | ValueError로 방어 |
| HIGH | snap_dict to_dict() → np.float64 JSON 직렬화 오류 | model_dump(mode="json") |

## 현재 아키텍처 상태

```
L1: Python 피처 계산 (39개 = 28 core + 11 registry)  ✅
L2: LightGBM P(Win) 엔진 (untrained 상태, 학습 대기)  ✅
L3: DOUNI + FastAPI 브릿지                           ✅
L4: APScheduler 15분 스캐너 + Supabase alerts        ✅
L5: outcome endpoint + auto-train (N×20)             ✅
UI: P(Win) 배지 + blocks_triggered 칩                ✅
```

## PR #8 완료 — 마이그레이션 016 + Outcome UI (2026-04-13) `a1e69e4`

### 추가된 파일
- `app/supabase/migrations/016_engine_trade_records_alerts.sql` — engine_trade_records + engine_alerts 테이블 + RLS
- `app/src/routes/api/cogochi/outcome/+server.ts` — POST outcome → DB INSERT + N×20 auto-train

### 수정된 파일
- `app/src/components/terminal/SingleAssetBoard.svelte` — pWin 스탯카드, blocksTriggered 그린 칩, WIN/LOSS 버튼 + outcomeLogged 피드백 상태
- `app/src/routes/terminal/+page.svelte` — currentPWin/currentBlocksTriggered state, normalizeAnalysisPayload spread 순서 fix, handleOutcome (snapshot strip), SingleAssetBoard props 전달

### CTO 검증 수정사항
- handleOutcome: chart/indicators/annotations 등 UI 필드 제거 후 전송
- onOutcome 타입: `void | Promise<void>` 수정
- normalizeAnalysisPayload: p_win/blocks_triggered를 spread 이후에 기록 (덮어쓰기 방지)
- outcome 서버 라우트: UI_ONLY_KEYS 서버사이드 필터 (방어 레이어)
- WIN/LOSS 클릭 후 `✓ WIN` / `✓ LOSS` 피드백 텍스트

### worktree dev 서버 설정
- `app/node_modules` → symlink to `/Users/ej/Projects/wtd-v2/app/node_modules`
- `app/.svelte-kit` → symlink to `/Users/ej/Projects/wtd-v2/app/.svelte-kit`
- `.claude/launch.json`: `npm --prefix app run dev -- --port 5178`

## 남은 작업
1. `supabase db push` 또는 Supabase 대시보드에서 마이그레이션 016 적용 (파일은 커밋됨)
2. `uv run python -m data_cache.fetch_binance` — 데이터 캐시 채워야 스캐너/backtest 동작
3. PR #8 머지 후 메인 브랜치 반영

## 핵심 계약
- `KlineBar.tbv` = absolute taker buy volume (NOT ratio)
- `compute_snapshot(perp=dict)` / `compute_features_table(perp=pd.DataFrame)` — 다른 타입
- LightGBM train: `min_length=20`, expanding-window walk-forward 5-fold
- 스캐너: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수 필요
- ENGINE_URL=http://localhost:8000 (app/.env.example에 문서화)
