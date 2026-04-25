# 다음 실행 설계 (2026-04-26 업데이트)

> main SHA: `87f44b0b` — CI 3개 전부 ✅ — W-0211 완료

---

## 현재 상태

| 영역 | 상태 |
|------|------|
| Engine CI | ✅ 1448 passed |
| App CI | ✅ 0 errors, 250 tests |
| Contract CI | ✅ pass |
| GCP cogotchi | ✅ cogotchi-00013-c7n |
| Cloud Scheduler | ✅ 5 jobs |
| W-0211 multi-pane chart | ✅ PR #298 + #302 머지 완료 |
| OI/Funding/Liq 기본 ON | ✅ storage key v2 |

---

## P0 — W-0212: 차트 UX 마무리 (즉시)

W-0211 머지 후 남은 시각적 갭. 우선 순위 높음.

### A. 패인 높이 조절 UX
- 현재: `setStretchFactor(4,1,1,1,1,1)` 고정
- 목표: 패인 간 드래그로 높이 조절 (`layout.panes.enableResize: true` 이미 설정됨, 실제 UX 검증 필요)
- 파일: `MultiPaneChart.svelte`

### B. 크로스헤어 값 표시
- 현재: 우측 axis 라벨에 시리즈 값 뜸
- 목표: TradingView 스타일 — 크로스헤어 hover 시 PaneInfoBar 칩 값이 해당 시점 값으로 실시간 업데이트
- 구현: `chart.subscribeCrosshairMove()` → chip 값 업데이트

### C. KPI Strip sparkline 데이터 연결 확인
- OI/Funding 스파크라인이 실제 데이터로 채워지는지 확인
- `buildKpiSnapshots()` → `oiBars`, `fundingBars` null이면 빈 sparkline

**Branch:** `feat/w-0212-chart-ux-polish`
**Exit Criteria:**
- [ ] 패인 드래그 리사이즈 동작 확인
- [ ] KPI strip 스파크라인 데이터 연결 확인
- [ ] App CI ✅

---

## P1 — W-0132: Copy Trading Phase 1

**Why:** PRD + 설계 완료. 사용자 가치 최상. 독립 구현 가능.

**Goal:** JUDGE score 기반 트레이더 리더보드 + 구독 MVP

### Track A — Supabase migration 022
```sql
CREATE TABLE trader_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  display_name TEXT,
  judge_score NUMERIC DEFAULT 0,
  win_count INT DEFAULT 0,
  loss_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE copy_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID REFERENCES auth.users(id),
  leader_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  active BOOLEAN DEFAULT true
);
```
RLS: follower 본인만 read/write

### Track B — Engine `engine/copy_trading/`
- `leader_score.py` — `pattern_ledger_records.outcome` → ELO-style 점수
- `leaderboard.py` — Supabase top-20 조회
- `engine/api/routes/copy_trading.py` — GET /leaderboard, POST/DELETE /subscribe

### Track C — App
- `app/src/lib/cogochi/CopyTradingLeaderboard.svelte` — rank/score/W-L/subscribe
- `app/src/routes/api/copy-trading/+server.ts` — 3개 라우트

**Exit Criteria:**
- [ ] Supabase migration 적용
- [ ] GET /api/copy-trading/leaderboard 응답 확인
- [ ] UI 리더보드 렌더링
- [ ] Engine CI + App CI ✅

**Branch:** `feat/w-0132-copy-trading-phase1`
**Ref:** `work/active/W-0132-copy-trading-phase1.md`, `memory/project_copy_trading_prd_2026_04_22.md`

---

## P2 — W-0145: Search Corpus 40+차원

**Goal:** 3차원 → 40+차원 feature 검색. 패턴 매칭 품질 향상.

**Scope:**
- `engine/search/corpus_builder.py` — 40+ feature 추출 (OI 2×, funding 2× 가중치)
- `engine/scanner/jobs/search_corpus.py` — 30분 주기 갱신
- `engine/search/retrieval.py` — corpus 우선 read path
- `engine/tests/test_search_corpus_quality.py` — recall@10 >= 0.7 검증

**Exit Criteria:**
- [ ] `/search/similar` 40+ 차원 signature 포함
- [ ] recall@10 >= 0.7
- [ ] Engine CI ✅

**Branch:** `feat/w-0145-search-corpus-40dim`

---

## P3 — 인프라 잔여 (사람이 직접)

| 항목 | 방법 |
|------|------|
| GCP worker Cloud Build trigger | GCP Console → Cloud Build |
| Vercel `EXCHANGE_ENCRYPTION_KEY` | `vercel env add EXCHANGE_ENCRYPTION_KEY production` |

---

## P4 — App 품질 (비긴급)

38개 CSS warnings: `<slot>` → `{@render children()}` Svelte 5 마이그레이션.
CI blocking 없음, 기능 영향 없음.

---

## 다음 에이전트 실행 가이드

```bash
git checkout main && git pull origin main

# 차트 UX 마무리 (작은 작업)
git checkout -b feat/w-0212-chart-ux-polish

# 또는 카피트레이딩 (큰 작업)
git checkout -b feat/w-0132-copy-trading-phase1
# CURRENT.md W-0132 활성화
# Track A → B → C
```
