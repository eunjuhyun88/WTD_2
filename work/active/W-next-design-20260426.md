# 다음 실행 설계 — 2026-04-26

> 세션 종료 체크포인트. 다음 에이전트는 이 문서부터 읽는다.
> 이 세션에서 완료한 것: Cloud Scheduler 5 jobs, _primary_cache_dir fix (GCP 배포), App CI 수리, CURRENT.md 동기화.

---

## 현재 상태 스냅샷

| 항목 | 값 |
|---|---|
| main SHA | `30707d34` |
| App CI | 250 tests pass, 0 TS errors |
| Engine CI | 1448 passed |
| Supabase feature_windows | 138,915 rows (29 symbols × 3 tf) |
| GCP revision | cogotchi-00013-c7n (1024MiB) |
| Cloud Scheduler | 5 jobs 등록 완료 |
| open PRs | 없음 (PR #285 research only, 무시 가능) |

---

## 우선순위 1 — W-0145: Search Corpus 107 symbols 확장

### 문제
현재 `feature_windows` = 29 symbols. SearchCorpusStore는 이 데이터로 40+차원 벡터를 구성.
유니버스 = 107 symbols인데 나머지 78 symbols의 OHLCV 캐시가 없어서 builder가 스킵함.

### 진단 명령 (먼저 실행)
```bash
cd engine
uv run python -c "
from data_cache.loader import list_cached_symbols
syms = list_cached_symbols()
print(f'캐시된 symbols: {len(syms)}')
print(syms[:10])
"
```

### 실행 계획

**Phase A: 107 symbols OHLCV 다운로드**
- 파일: `engine/scripts/backfill_data_cache.py` (신규 작성)
- Binance public API: `GET /api/v3/klines?symbol=X&interval=1h&limit=1000`
- 인터벌 3개: 1h, 4h, 1d
- 저장: `engine/data_cache/cache/{symbol}/{timeframe}.parquet`

**Phase B: feature_windows_builder 재실행**
```bash
uv run python -m research.feature_windows_builder --symbols all --force-rebuild
```

**Phase C: corpus_bridge_sync 트리거**
- `engine/features/corpus_bridge.py` → SearchCorpusStore 자동 upsert
- Cloud Scheduler `feature-windows-build` job 수동 트리거로 확인

### 검증
```sql
SELECT COUNT(*) as rows, COUNT(DISTINCT symbol) as symbols
FROM feature_windows;
-- 목표: rows > 300,000, symbols >= 100
```

### Branch
```bash
git checkout -b feat/w-0145-corpus-107symbols origin/main
```

### Exit Criteria
- [ ] `list_cached_symbols()` ≥ 100 symbols
- [ ] Supabase feature_windows ≥ 100 symbols
- [ ] `/search/similar?symbol=SOLUSDT` → 후보 5개 이상 반환
- [ ] Cloud Scheduler `feature-windows-build` manual trigger 성공

---

## 우선순위 2 — W-0132: Copy Trading Phase 1

### PRD 요약
`memory/project_copy_trading_prd_2026_04_22.md` 참조.
핵심: JUDGE verdict 데이터 → ELO reputation → 리더보드 → 구독.
Phase 1 = alert-only (실제 주문 실행 없음).

### DB Migration 022
파일: `app/supabase/migrations/022_copy_trading_phase1.sql`

```sql
-- Migration 022: copy trading phase 1 tables
CREATE TABLE IF NOT EXISTS leader_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  judge_score  NUMERIC(10,4) DEFAULT 1000.0,  -- ELO-style, base 1000
  win_count    INT DEFAULT 0,
  loss_count   INT DEFAULT 0,
  total_pnl_pct NUMERIC(10,4) DEFAULT 0,
  is_public    BOOLEAN DEFAULT true,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS copy_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leader_id    UUID NOT NULL REFERENCES leader_profiles(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL DEFAULT 'alert' CHECK (mode IN ('alert', 'review', 'auto')),
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, leader_id)
);

ALTER TABLE leader_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE copy_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read public profiles
CREATE POLICY "public leader profiles readable"
  ON leader_profiles FOR SELECT USING (is_public = true);

-- RLS: user can only see/manage own subscriptions
CREATE POLICY "own subscriptions only"
  ON copy_subscriptions FOR ALL USING (auth.uid() = follower_id);
```

### Engine Module
`engine/copy_trading/` (신규):
- `__init__.py`
- `leader_score.py` — `pattern_ledger_records.outcome` 집계 → ELO delta 계산
- `leaderboard.py` — Supabase top-20 조회
- `reputation_updater.py` — scheduler job wrapper

Scheduler job: `engine/api/routes/jobs.py` → `/jobs/reputation_update/run`

### App Routes
- `GET /api/copy-trading/leaderboard` — public, 캐시 5분
- `POST /api/copy-trading/subscribe` — auth required, body: `{leader_id, mode}`
- `DELETE /api/copy-trading/subscribe/[id]` — auth required

### UI
`app/src/lib/cogochi/CopyTradingLeaderboard.svelte`:
- rank + display_name + judge_score + W/L ratio + subscribe CTA
- Empty state graceful

### Branch
```bash
git checkout -b claude/w-0132-copy-trading-p1 origin/main
```

### Exit Criteria
- [ ] Migration 022 Supabase prod apply
- [ ] `GET /api/copy-trading/leaderboard` → 200
- [ ] `POST /api/copy-trading/subscribe` → 201
- [ ] Engine `/jobs/reputation_update/run` → 200
- [ ] App CI + Engine CI 통과

---

## 인프라 미완 (사람이 직접)

| 항목 | 설명 |
|---|---|
| GCP cogotchi-worker Cloud Build trigger | GCP Console에서 수동 설정 필요 |
| Vercel `EXCHANGE_ENCRYPTION_KEY` | Vercel 대시보드 환경변수 설정 필요 |
