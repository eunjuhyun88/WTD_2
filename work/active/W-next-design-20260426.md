# 다음 실행 설계 (2026-04-26 업데이트)

> main SHA: `092a50de` — CI 3개 전부 ✅ — 미처리 브랜치 0개

---

## 에이전트 작업 이력

| 에이전트 | 담당 | 완료 항목 | SHA |
|---|---|---|---|
| **Agent 1** | 세션 정리 + 설계 | App CI 수리(127→0 TS errors), Supabase corpus backfill(197→138,915행), 리베이스+설계문서 저장, PR #309 오픈 | `2e6f11c8` |
| Agent 2 | — | 미배정 | — |

---

## 현재 상태

| 영역 | 상태 |
|------|------|
| Engine CI | ✅ 1448 passed |
| App CI | ✅ 0 errors, 250 tests |
| Contract CI | ✅ pass |
| GCP cogotchi | ✅ cogotchi-00013-c7n |
| Cloud Scheduler | ✅ 5 jobs |
| 미처리 브랜치 | ✅ 0개 |

---

## P0 — W-0132: Copy Trading Phase 1 ⚡

**Why 먼저:** PRD + 설계 완료. 사용자 가치 최상. 독립 구현 가능.

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

## P1 — W-0145: Search Corpus 40+차원

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
**Ref:** `work/active/W-0145-operational-seed-search-corpus.md`

---

## P2 — 인프라 잔여 (사람이 직접)

| 항목 | 방법 |
|------|------|
| GCP worker Cloud Build trigger | GCP Console → Cloud Build |
| Vercel `EXCHANGE_ENCRYPTION_KEY` | `vercel env add EXCHANGE_ENCRYPTION_KEY production` |

---

## P3 — App 품질 (비긴급)

38개 CSS warnings: `<slot>` → `{@render children()}` Svelte 5 마이그레이션.
CI blocking 없음, 기능 영향 없음.

---

## 다음 에이전트 실행 가이드

```bash
git checkout main && git pull origin main
git checkout -b feat/w-0132-copy-trading-phase1
# CURRENT.md W-0132 활성화
# Track A → B → C
```
