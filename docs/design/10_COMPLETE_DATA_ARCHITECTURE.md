# 10 — Complete Data Architecture
# (전체 데이터 설계: 외부 수집 → 엔진 → 사용자 기록 → 시각화)

**버전**: v1.0 (2026-04-25)
**목적**: 기존 설계 문서(00-09)에서 누락된 영역을 메꾸고, 전체 데이터 흐름을 하나의 문서로 완성.
**기존 문서가 다루는 것**: 외부 데이터 수집, 패턴 엔진, 검색, AI 에이전트
**이 문서가 추가하는 것**: 사용자 행동 기록 + 위키 구현 + 통계 엔진 + 알림 + 시각화 Read Path

---

## 0. 전체 데이터 흐름 (Big Picture)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WRITE PATH (데이터가 어디서 만들어지는가)                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [외부] Binance/OKX → raw_market_bars, raw_perp_metrics               │
│  [외부] On-chain    → raw_onchain_metrics                               │
│  [외부] News API    → news_chunks (pgvector)                           │
│                          ↓                                              │
│  [엔진] feature compute → feature_windows (92 cols × symbol × TF)     │
│  [엔진] state machine   → pattern_runtime_states, phase_transitions    │
│  [엔진] ledger entry    → ledger_entries (actionable phase 진입 시)    │
│  [엔진] outcome job     → ledger_outcomes (72h 후 자동 평가)           │
│                          ↓                                              │
│  [사용자] capture      → capture_records                               │
│  [사용자] verdict      → ledger_verdicts                               │
│  [사용자] pattern 제안 → pattern_candidates                            │
│  [사용자] personal var → personal_variants                             │
│  [사용자] session msg  → episodic_sessions                             │
│                          ↓                                              │
│  [시스템] stats engine → pattern_stats_cache (materialized view)       │
│  [시스템] wiki export  → wiki_pages (Postgres + md 파일)               │
│  [시스템] notification → notification_queue (72h verdict 알림)         │
│  [시스템] reranker log → reranker_scoring_log                          │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ READ PATH (어디서 어떻게 가져오는가)                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  터미널 차트     ← feature_windows, raw_market_bars (Direct API)        │
│  HUD 패널       ← pattern_runtime_states, feature_windows              │
│  검색 결과       ← search_corpus → 4-stage pipeline                    │
│  판단 받은함     ← ledger_entries + ledger_outcomes (72h 경과)         │
│  내 기록         ← capture_records + ledger_verdicts + stats           │
│  패턴 위키 페이지 ← wiki_pages (= DB materialized to markdown)         │
│  알림            ← notification_queue → WebSocket push                 │
│  내 성과 통계    ← pattern_stats_cache (per-user slice)               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. 기존 설계에서 누락된 영역 목록

| 영역 | 기존 문서 커버리지 | 이 문서에서 추가 |
|---|---|---|
| User Activity Layer | ❌ 없음 | ✅ §2 전체 |
| Wiki 구현 (DB + API) | 개념만 (COGOCHI.md) | ✅ §3 전체 |
| Stats Engine SQL | 언급만 (DESIGN_V3.2 §4) | ✅ §4 전체 |
| Notification System | ❌ 없음 | ✅ §5 전체 |
| Social Layer (익명화) | ❌ 없음 | ✅ §6 전체 |
| Copy Trading 데이터 | PRD만 있음 | ✅ §7 전체 |
| Missing DB Tables | 분산 정의 | ✅ §8 통합 |
| Missing API Endpoints | 분산 정의 | ✅ §9 통합 |
| Read Path 시각화 명세 | 없음 | ✅ §10 전체 |

---

## 2. User Activity Layer (사용자 행동 기록 + 대시보드)

### 2.1 왜 필요한가

기존 설계는 "무엇을 저장할 것인가"는 다루지만,
"저장된 것을 사용자가 어떻게 보는가"를 설계하지 않았다.

이게 제품 핵심 moat이다: **나의 트레이딩 기억을 되돌아보는 경험**.

### 2.2 사용자가 생성하는 데이터 종류

```
capture_records         ← 차트에서 구간 드래그 → "이 구간 저장"
ledger_verdicts         ← 72h 후 "이건 맞았다/틀렸다"
pattern_candidates      ← 패턴 제안 (Parse → Candidate → Review)
personal_variants       ← 내 기준으로 threshold 조정
episodic_sessions       ← AI 대화 (30일 TTL)
```

### 2.3 사용자 대시보드 화면 (Read Path)

**화면 1: 나의 캡처 히스토리**
```
GET /api/user/captures?status=all|pending_verdict|resolved

응답:
[
  {
    capture_id,
    symbol,
    timeframe,
    range_start,
    range_end,
    note,
    tags,
    definition_id,          // 어느 패턴과 연결
    outcome_status,         // pending | hit | miss | expired
    peak_return_pct,        // 72h 후 최대 수익
    verdict,                // user judgment if exists
    created_at
  }
]
```

**화면 2: 판단 받은함 (Verdict Inbox)**
```
GET /api/user/inbox

응답: 72h 경과 + verdict 미제출 캡처 목록
- capture_id
- symbol + timeframe
- outcome 요약 (가격 움직임 요약)
- judge_advice (Judge Agent 사전 생성)
- expires_at (판단 기한 없음, 단 알림 스케줄)
```

**화면 3: 내 성과 통계**
```
GET /api/user/stats?pattern_id=all|{id}&window=30d|90d|all

응답:
{
  total_captures: 47,
  total_verdicts: 31,
  win_rate: 0.62,
  avg_return_on_win: 0.0081,
  avg_loss_on_miss: -0.024,
  expected_value: 0.003,
  by_pattern: [
    { pattern_id, label, captures, verdicts, win_rate, sample_size }
  ],
  by_symbol: [...],
  by_timeframe: [...],
  decay_signal: "improving" | "declining" | "stable"  // 최근 30d vs 전체
}
```

**화면 4: 패턴별 내 히스토리**
```
GET /api/user/captures?pattern_id={id}

패턴 PTB_REVERSAL로 캡처한 전체 내역 + 성과
```

### 2.4 User Activity Log

```sql
-- 사용자 활동 추적 (analytics용, audit_log와 분리)
create table user_activity_log (
  activity_id     uuid primary key default gen_random_uuid(),
  user_id         text not null,
  activity_type   text not null,  -- 'capture' | 'verdict' | 'search' | 'view_pattern' | 'parse'
  target_id       text,           -- capture_id | pattern_id | etc.
  target_type     text,
  metadata        jsonb,          -- {symbol, timeframe, pattern_id, query, ...}
  session_id      text,
  occurred_at     timestamptz default now()
);

create index on user_activity_log (user_id, occurred_at desc);
create index on user_activity_log (activity_type, occurred_at desc);
```

활용:
- "이 패턴을 자주 보는 사용자" → 추천
- "이 심볼에서 많이 캡처하는 사용자" → 유사 유저 발견
- 7일 비활동 → 재활성 이메일 트리거

---

## 3. Wiki Layer 구현 (Layer 1 구체화)

COGOCHI.md + DESIGN_V3.2에서 개념은 정의됐으나 구현 스펙이 없었다.

### 3.1 Wiki는 DB가 canonical, markdown은 export

```
오해 금지: wiki는 파일 시스템이 아니다.
Canonical: Postgres wiki_pages 테이블
Export: DB → markdown 파일 (LLM context 주입용)
```

### 3.2 DB 테이블

```sql
-- Wiki 페이지 (패턴, 사용자 캡처, 버딕트, 제안 포함)
create table wiki_pages (
  page_id         uuid primary key default gen_random_uuid(),
  page_type       text not null,
  -- 'pattern' | 'user_capture' | 'user_verdict' | 'user_index'
  -- | 'refinement_proposal' | 'system_log' | 'pattern_index'
  slug            text unique,          -- e.g. "patterns/PTB_REVERSAL"
  owner_type      text,                 -- 'system' | 'user'
  owner_id        text,                 -- user_id or 'system'
  title           text,
  body_md         text,                 -- prose (LLM-writable)
  frontmatter     jsonb,                -- stats, metadata (stats engine-writable ONLY)
  schema_version  int not null default 1,
  last_calculated timestamptz,          -- stats engine 마지막 실행 시
  calculator      text,                 -- 'stats_engine_v2' | 'user' | 'llm_refinement'
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 페이지 간 링크
create table wiki_links (
  link_id         uuid primary key default gen_random_uuid(),
  from_page_id    uuid references wiki_pages(page_id),
  to_page_id      uuid references wiki_pages(page_id),
  link_type       text,                 -- 'capture_ref' | 'verdict_ref' | 'related_pattern' | 'cross_ref'
  created_at      timestamptz default now()
);

-- 위키 변경 이력 (drift 감지용)
create table wiki_change_log (
  change_id       uuid primary key default gen_random_uuid(),
  page_id         uuid references wiki_pages(page_id),
  changed_by      text,                 -- 'stats_engine' | user_id | 'refinement_agent'
  change_type     text,                 -- 'frontmatter_update' | 'body_update' | 'created'
  diff_summary    text,
  occurred_at     timestamptz default now()
);

create index on wiki_pages (page_type, owner_id);
create index on wiki_pages (slug);
create index on wiki_change_log (page_id, occurred_at desc);
```

### 3.3 패턴 페이지 Frontmatter 스키마

```jsonc
// wiki_pages.frontmatter (for page_type='pattern')
{
  "pattern_id": "PTB_REVERSAL",
  "version": 3,
  "status": "active",
  "last_calculated": "2026-04-25T10:00:00Z",
  "calculator": "stats_engine_v2",
  "schema_version": 1,

  // stats engine이 쓰는 것 (LLM 수정 금지)
  "occurrence_count": 47,
  "verdict_count": 31,
  "win_rate": 0.62,
  "avg_30min_movement": 0.0081,
  "avg_72h_movement": 0.0243,
  "median_holding_min": 18,
  "sample_size": 31,
  "news_conditioned_win_rate": 0.48,  // Layer 3 RAG에서 derived

  // capture backlinks
  "recent_captures": ["01HXY...", "01HXZ..."],
  "total_captures": 47
}
```

### 3.4 Markdown Export Pipeline

```python
# engine/wiki/exporter.py
# 매 5분 또는 DB 변경 시 실행

def export_pattern_to_markdown(pattern_id: str):
    page = db.query_one("SELECT * FROM wiki_pages WHERE slug = ?", f"patterns/{pattern_id}")
    stats = db.query_one("SELECT * FROM pattern_stats_cache WHERE pattern_id = ?", pattern_id)

    md = render_pattern_template(page, stats)
    path = f"cogochi/pattern_library/patterns/{pattern_id}.md"
    write_if_changed(path, md)

def export_user_data_to_markdown(user_id: str, page_type: str, target_id: str):
    # user captures, verdicts → individual markdown files
    # LLM이 per-call context로 읽을 수 있도록
    pass
```

### 3.5 위키 API

```
GET  /api/wiki/patterns/{pattern_id}       → 패턴 페이지 (stats + body)
GET  /api/wiki/patterns                    → 패턴 카탈로그
GET  /api/wiki/users/me/captures/{id}      → 내 캡처 페이지
GET  /api/wiki/users/me/verdicts/{id}      → 내 버딕트 페이지
GET  /api/wiki/users/me/index              → 내 데이터 인덱스
POST /api/wiki/refinement/proposals        → 제안 제출
GET  /api/wiki/refinement/proposals        → 대기 중 제안 목록 (admin)
```

---

## 4. Stats Engine (통계 계산기)

DESIGN_V3.2 §4에서 "LLM이 통계 수치를 만들지 않는다"고 결정했으나 구현 스펙이 없었다.

### 4.1 설계 원칙

```
LLM → prose(설명글) 만 생성
Stats Engine → 모든 수치(occurrence_count, win_rate 등) 계산
```

### 4.2 Materialized View

```sql
-- pattern_stats_cache: Stats Engine의 output
create materialized view pattern_stats_cache as
select
  e.pattern_id,
  count(distinct e.entry_id)                                         as occurrence_count,
  count(distinct v.verdict_id)                                       as verdict_count,
  count(distinct v.verdict_id) filter (where v.verdict = 'VALID')
    / nullif(count(distinct v.verdict_id), 0)::float                 as win_rate,
  avg(o.peak_return_pct) filter (where o.auto_verdict = 'HIT')      as avg_return_on_hit,
  avg(o.exit_return_pct) filter (where o.auto_verdict = 'MISS')     as avg_return_on_miss,
  -- news 조건부 win rate (Layer 3 RAG 연동)
  count(distinct v.verdict_id)
    filter (where v.verdict = 'VALID' and e.entry_id in (
      select entry_id from capture_news_overlap
    )) / nullif(
      count(distinct v.verdict_id) filter (where e.entry_id in (
        select entry_id from capture_news_overlap
      )), 0
    )::float                                                          as news_conditioned_win_rate,
  -- 최근 30d vs 전체 decay
  count(distinct e.entry_id) filter (
    where e.entry_at > now() - interval '30 days'
  )                                                                   as occurrence_count_30d,
  max(o.evaluated_at)                                                as last_outcome_at,
  now()                                                              as calculated_at
from ledger_entries e
left join ledger_verdicts v  on v.entry_id = e.entry_id
left join ledger_outcomes o  on o.entry_id = e.entry_id
group by e.pattern_id;

-- 5분마다 refresh
-- Cloud Scheduler: SELECT refresh_materialized_view_job()
```

### 4.3 Per-User Stats

```sql
create materialized view user_pattern_stats as
select
  v.user_id,
  e.pattern_id,
  count(distinct e.entry_id)                                         as capture_count,
  count(distinct v.verdict_id)                                       as verdict_count,
  count(*) filter (where v.verdict = 'VALID')
    / nullif(count(distinct v.verdict_id), 0)::float                 as personal_win_rate,
  avg(o.peak_return_pct) filter (where v.verdict = 'VALID')        as personal_avg_return,
  max(v.judged_at)                                                   as last_verdict_at
from ledger_verdicts v
join ledger_entries e   on e.entry_id = v.entry_id
left join ledger_outcomes o on o.entry_id = v.entry_id
group by v.user_id, e.pattern_id;
```

### 4.4 Stats Engine Job

```python
# engine/stats/engine.py

class StatsEngine:
    def run(self):
        """매 5분 cron. Cloud Scheduler → /jobs/stats_refresh/run"""
        self.refresh_pattern_stats()
        self.refresh_user_stats()
        self.update_wiki_frontmatter()
        self.detect_decay_patterns()

    def refresh_pattern_stats(self):
        db.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY pattern_stats_cache")

    def refresh_user_stats(self):
        db.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY user_pattern_stats")

    def update_wiki_frontmatter(self):
        """변경된 pattern stats → wiki_pages.frontmatter 업데이트"""
        changed = db.query("""
            SELECT ps.pattern_id
            FROM pattern_stats_cache ps
            JOIN wiki_pages wp ON wp.slug = 'patterns/' || ps.pattern_id
            WHERE ps.calculated_at > wp.last_calculated
               OR wp.last_calculated IS NULL
        """)
        for row in changed:
            self._update_wiki_page(row.pattern_id)

    def detect_decay_patterns(self):
        """최근 30d win_rate가 전체보다 10%p 이상 낮으면 refinement trigger"""
        db.query("""
            SELECT pattern_id
            FROM pattern_stats_cache
            WHERE occurrence_count_30d >= 5
              AND win_rate IS NOT NULL
              -- 30d rate 계산은 별도 subquery
        """)
        # → refinement_job 트리거
```

### 4.5 Drift Detection

```sql
-- 패턴 성능 저하 감지
create view pattern_decay_signals as
select
  pattern_id,
  win_rate                                      as overall_win_rate,
  -- 최근 30d는 별도 계산
  case
    when occurrence_count_30d < 5 then 'insufficient_data'
    when occurrence_count_30d >= 5
         -- 단순화: 30d rate를 별도 계산 후 비교
     then 'sufficient'
  end as decay_status,
  calculated_at
from pattern_stats_cache;
```

---

## 5. Notification System (알림)

설계 문서 어디에도 없었던 영역.

### 5.1 알림 종류

| 타입 | 트리거 | 내용 |
|---|---|---|
| `verdict_due` | capture 후 72h 경과 | "PTB_REVERSAL 판단 기한" |
| `pattern_alert` | 패턴 actionable phase 진입 | "BTCUSDT 축적 구간 진입" |
| `refinement_ready` | 제안 pending | (admin only) |
| `stats_updated` | 패턴 통계 크게 변화 | "PTB_REVERSAL win rate 상승" |

### 5.2 DB 테이블

```sql
create table notification_queue (
  notification_id uuid primary key default gen_random_uuid(),
  user_id         text not null,
  notif_type      text not null,       -- 'verdict_due' | 'pattern_alert' | etc.
  title           text not null,
  body            text,
  payload         jsonb,               -- {capture_id, pattern_id, symbol, ...}
  channel         text[],              -- ['in_app', 'push', 'email']
  status          text default 'pending',  -- 'pending' | 'sent' | 'read' | 'dismissed'
  scheduled_at    timestamptz not null,
  sent_at         timestamptz,
  read_at         timestamptz,
  created_at      timestamptz default now()
);

create index on notification_queue (user_id, status, scheduled_at);
create index on notification_queue (status, scheduled_at) where status = 'pending';
```

### 5.3 72h Verdict Prompt 생성

```python
# engine/notifications/verdict_scheduler.py

def schedule_verdict_notifications():
    """매 15분 실행. 72h 경과 캡처 → notification 생성"""
    due_captures = db.query("""
        SELECT cr.*
        FROM capture_records cr
        LEFT JOIN ledger_verdicts lv ON lv.entry_id = cr.capture_id
        WHERE cr.created_at <= now() - interval '72 hours'
          AND lv.verdict_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM notification_queue
            WHERE payload->>'capture_id' = cr.capture_id::text
              AND notif_type = 'verdict_due'
          )
    """)

    for capture in due_captures:
        # Judge Agent 사전 생성 (비동기)
        judge_advice = generate_judge_advice_async(capture)

        db.insert("notification_queue", {
            "user_id": capture.user_id,
            "notif_type": "verdict_due",
            "title": f"{capture.symbol} {capture.timeframe} — 판단 기한",
            "body": f"72시간 전 캡처한 {capture.symbol} 구간 결과를 확인하고 판단하세요.",
            "payload": {
                "capture_id": str(capture.capture_id),
                "symbol": capture.symbol,
                "judge_advice_id": judge_advice.advice_id if judge_advice else None,
            },
            "channel": ["in_app"],
            "scheduled_at": datetime.utcnow(),
        })
```

### 5.4 알림 API

```
GET  /api/notifications?status=unread       → 읽지 않은 알림 목록
POST /api/notifications/{id}/read           → 읽음 처리
POST /api/notifications/{id}/dismiss        → 알림 숨기기
GET  /api/notifications/settings            → 채널 설정 (in_app/push/email on/off)
```

---

## 6. Social Layer (익명화 집계)

### 6.1 설계 원칙 (COGOCHI.md §5.3에서)

```
- 개인 버딕트: 본인만 읽기 가능
- 집계 통계: k≥10 익명화 (k-anonymity)
- 크로스유저 데이터: 절대 금지
```

### 6.2 익명화 집계 뷰

```sql
-- k-anonymity 집계 (10명 이상일 때만 노출)
create materialized view pattern_community_stats as
select
  pattern_id,
  count(distinct user_id)                           as active_traders,
  count(*)                                          as total_captures,
  -- win_rate은 집계값만
  count(*) filter (where v.verdict = 'VALID')
    / nullif(count(*), 0)::float                    as community_win_rate,
  -- 익명화: 10명 미만이면 null
  case when count(distinct user_id) >= 10
    then count(*) filter (where v.verdict = 'VALID')
      / nullif(count(*), 0)::float
    else null
  end                                               as published_win_rate
from ledger_verdicts v
join ledger_entries e on e.entry_id = v.entry_id
group by pattern_id;
```

### 6.3 패턴 페이지에서 보여주는 것

```
PTB_REVERSAL
────────────────────────────────
전체 발생: 47회
판단 참여: 31회 (by 12 traders)
커뮤니티 승률: 62%          ← 익명화 집계
당신의 승률: 58% (12 trades) ← 개인 데이터
```

---

## 7. Copy Trading 데이터 아키텍처

PRD는 있으나 데이터 구조가 없었다.

### 7.1 핵심 개념

```
팔로워 → 팔로잉하는 트레이더의 패턴 알림 구독
         → 트레이더가 "실행" 표시하면 팔로워도 알림
         → 팔로워가 직접 실행할지 결정 (자동 실행 없음)
```

### 7.2 DB 테이블

```sql
-- 팔로우 관계
create table copy_trade_subscriptions (
  subscription_id uuid primary key default gen_random_uuid(),
  follower_id     text not null,
  leader_id       text not null,
  pattern_filter  text[],      -- null = 전체, ['PTB_REVERSAL'] = 특정 패턴만
  active          boolean default true,
  created_at      timestamptz default now(),
  unique (follower_id, leader_id)
);

-- 리더의 "실행" 신호
create table copy_trade_signals (
  signal_id       uuid primary key default gen_random_uuid(),
  leader_id       text not null,
  entry_id        uuid references ledger_entries(entry_id),
  symbol          text not null,
  direction       text,        -- 'long' | 'short'
  entry_price     numeric,
  tp_price        numeric,
  sl_price        numeric,
  conviction      text,        -- 'high' | 'medium' | 'low'
  note            text,
  published_at    timestamptz default now()
);

-- 팔로워의 반응
create table copy_trade_actions (
  action_id       uuid primary key default gen_random_uuid(),
  signal_id       uuid references copy_trade_signals(signal_id),
  follower_id     text not null,
  action          text,        -- 'copied' | 'skipped' | 'viewed'
  followed_at     timestamptz
);
```

### 7.3 Copy Trading 알림 플로우

```
리더 → verdict = 'VALID' + conviction 표시
  → copy_trade_signals 생성
  → notification_queue에 팔로워들 알림 INSERT
  → 팔로워 in-app 알림 수신
  → 팔로워가 직접 "따라하기" 클릭 시 copy_trade_actions 기록
```

---

## 8. 누락된 DB 테이블 통합 정의

기존 설계 문서에서 언급되었으나 스키마가 없거나,
아예 정의되지 않은 테이블 목록.

### 8.1 Reranker 관련 (09 문서에서 SQL만 없었음)

```sql
-- §09 §3.4에서 참조됨
create table reranker_scoring_log (
  log_id              uuid primary key default gen_random_uuid(),
  query_id            text not null,          -- search_query_hash
  candidate_id        text not null,
  symbol              text not null,
  pattern_id          text not null,
  feature_vector      jsonb not null,         -- 17-dim float array
  raw_score           numeric,
  calibrated_prob     numeric,
  model_id            text,
  linked_entry_id     uuid references ledger_entries(entry_id),
  created_at          timestamptz default now()
);

create index on reranker_scoring_log (query_id);
create index on reranker_scoring_log (linked_entry_id);

-- §09 §9.1
create table reranker_models (
  model_id            uuid primary key default gen_random_uuid(),
  version             int not null unique,
  pattern_family      text,                   -- null = cross-family
  model_uri           text not null,
  calibrator_uri      text,
  feature_schema      jsonb not null,
  train_data_hash     text,
  train_size          int,
  val_size            int,
  test_size           int,
  hyperparams         jsonb,
  eval_metrics        jsonb,
  baseline_metrics    jsonb,
  promotion_eligible  boolean default false,
  created_at          timestamptz default now(),
  shadow_started_at   timestamptz,
  promoted_at         timestamptz,
  deprecated_at       timestamptz
);

-- §09 §8 eval log
create table reranker_eval_log (
  eval_id             uuid primary key default gen_random_uuid(),
  model_id            uuid references reranker_models(model_id),
  ndcg_at_5           numeric,
  ndcg_at_10          numeric,
  mrr                 numeric,
  precision_at_5      numeric,
  ece                 numeric,
  n_queries           int,
  n_candidates        int,
  label_distribution  jsonb,
  feature_importances jsonb,
  evaluated_at        timestamptz default now()
);
```

### 8.2 Negative Set (03 §8에서 정의됨)

```sql
create table ledger_negatives (
  neg_id          uuid primary key default gen_random_uuid(),
  entry_id        uuid references ledger_entries(entry_id),
  negative_type   text not null,   -- 'hard_negative' | 'near_miss' | 'fake_hit' | 'auto_miss'
  reason          text,
  curated_by      text,            -- user_id or 'auto_rule'
  curated_at      timestamptz default now()
);

create index on ledger_negatives (entry_id);
create index on ledger_negatives (negative_type);
```

### 8.3 Episodic Sessions (DESIGN_V3.2 §8)

```sql
create table episodic_sessions (
  session_id      uuid not null,
  user_id         text not null,
  turn_index      int not null,
  role            text not null,   -- 'user' | 'assistant' | 'tool'
  content         text not null,
  agent_type      text,            -- 'parser' | 'judge' | 'refinement' | 'news'
  token_count     int,
  created_at      timestamptz default now(),
  expires_at      timestamptz generated always as
                    (created_at + interval '30 days') stored,
  primary key (session_id, turn_index)
);

create index on episodic_sessions (user_id, session_id, turn_index);
create index on episodic_sessions (expires_at);

-- 30일 TTL cleanup (daily cron)
-- DELETE FROM episodic_sessions WHERE expires_at < now();
```

### 8.4 News Chunks (DESIGN_V3.2 §6 — Layer 3 RAG)

```sql
-- pgvector extension 필요
create extension if not exists vector;

create table news_chunks (
  chunk_id        uuid primary key default gen_random_uuid(),
  news_id         text not null,
  chunk_index     int not null,
  chunk_text      text not null,
  embedding       vector(1536),              -- text-embedding-3-small dim
  published_at    timestamptz not null,
  priority        int default 0,             -- 0=normal, 1=high, 2=market-moving
  tagged_coins    text[],
  source          text,                      -- 'velo' | 'coindesk' | 'own'
  created_at      timestamptz default now()
);

create index on news_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index on news_chunks (published_at desc);
create index on news_chunks (tagged_coins) using gin;

-- capture 시점 ±1h news overlap (Judge Agent용)
create table capture_news_overlap (
  overlap_id      uuid primary key default gen_random_uuid(),
  entry_id        uuid references ledger_entries(entry_id),
  chunk_id        uuid references news_chunks(chunk_id),
  similarity      numeric,
  created_at      timestamptz default now()
);
```

### 8.5 Signal Vocabulary (01에서 코드로만 정의됨)

```sql
create table signal_vocabulary (
  signal_id        text primary key,
  category         text not null,    -- 'price' | 'oi' | 'funding' | 'volume' | 'flow'
  feature_binding  jsonb not null,   -- rule expression
  description      text,
  description_ko   text,             -- 한국어 설명
  ko_aliases       text[],           -- ["양봉", "급등"] 등 한국어 매핑
  added_at         timestamptz default now(),
  deprecated_at    timestamptz
);
```

### 8.6 Agent Trace Log (04 §7.2에서 언급)

```sql
create table agent_trace_log (
  trace_id        uuid primary key default gen_random_uuid(),
  session_id      uuid,
  agent_type      text not null,     -- 'parser' | 'judge' | 'orchestrator'
  user_id         text,
  tool_calls      jsonb,             -- [{tool, input, output, latency_ms}]
  total_tokens    int,
  total_cost_usd  numeric,
  error           text,
  created_at      timestamptz default now()
);

create index on agent_trace_log (user_id, created_at desc);
create index on agent_trace_log (agent_type, created_at desc);
```

### 8.7 Judge Advice (사전 생성 — Verdict Inbox용)

```sql
create table judge_advice (
  advice_id       uuid primary key default gen_random_uuid(),
  capture_id      uuid,              -- references capture_records(capture_id)
  entry_id        uuid references ledger_entries(entry_id),
  user_id         text not null,
  advice_md       text not null,     -- COGOCHI.md §5.2 format
  news_refs       text[],            -- chunk_ids used
  model           text,
  generated_at    timestamptz default now(),
  viewed_at       timestamptz
);
```

---

## 9. API 엔드포인트 통합 (신규 추가분)

기존 06_DATA_CONTRACTS.md에 없는 엔드포인트만 정리.

### 9.1 User Activity / Dashboard

```
GET  /api/user/captures               → 내 캡처 전체 목록
GET  /api/user/captures/{id}          → 캡처 상세 + outcome + verdict
GET  /api/user/inbox                  → 판단 대기 목록 (72h 경과)
GET  /api/user/stats                  → 전체 성과 통계
GET  /api/user/stats/{pattern_id}     → 패턴별 내 성과
GET  /api/user/activity               → 내 활동 로그
```

### 9.2 Wiki

```
GET  /api/wiki/patterns               → 패턴 카탈로그
GET  /api/wiki/patterns/{id}          → 패턴 위키 페이지
GET  /api/wiki/users/me/index         → 내 데이터 인덱스
GET  /api/wiki/users/me/captures/{id} → 내 캡처 위키 페이지
GET  /api/wiki/users/me/verdicts/{id} → 내 버딕트 위키 페이지
POST /api/wiki/refinement             → 개선 제안 제출
GET  /api/wiki/refinement             → 대기 중 제안 (admin)
POST /api/wiki/refinement/{id}/approve → 제안 승인 (admin)
POST /api/wiki/refinement/{id}/reject  → 제안 거부 (admin)
```

### 9.3 Notifications

```
GET  /api/notifications               → 알림 목록 (미읽음 우선)
POST /api/notifications/{id}/read     → 읽음 처리
POST /api/notifications/read-all      → 전체 읽음
POST /api/notifications/{id}/dismiss  → 숨기기
GET  /api/notifications/settings      → 알림 설정 조회
PUT  /api/notifications/settings      → 알림 설정 변경
```

### 9.4 Copy Trading

```
GET  /api/copy-trading/leaders        → 팔로우 가능 리더 목록 (성과 기준 정렬)
POST /api/copy-trading/subscribe      → 팔로우 시작
DELETE /api/copy-trading/subscribe/{id} → 언팔로우
GET  /api/copy-trading/feed           → 팔로잉 리더들의 최근 신호
POST /api/copy-trading/signals/{id}/copy → "따라하기" 액션 기록
```

### 9.5 Stats (Admin)

```
POST /api/jobs/stats_refresh/run      → Stats Engine 수동 트리거
GET  /api/admin/stats/patterns        → 전체 패턴 성과 대시보드
GET  /api/admin/stats/users           → 사용자 활동 지표
```

---

## 10. Read Path 시각화 명세

각 UI 화면이 어떤 데이터를 어떻게 가져오는지.

### 10.1 터미널 메인 화면

```
차트 (TradingView)    ← GET /api/market/ohlcv?symbol&timeframe
OI 패널              ← GET /api/market/oi?symbol
Funding 패널         ← GET /api/market/funding?symbol
패턴 HUD (우측)      ← GET /api/patterns/states?symbol         (engine)
인텔 패널            ← GET /api/cogochi/analyze?symbol&timeframe
```

### 10.2 패턴 검색 결과

```
POST /api/search/patterns (SearchQuerySpec)
  └→ Stage 1: feature_windows SQL filter
  └→ Stage 2: phase_transition_events sequence matching
  └→ Stage 3: reranker_scoring_log + reranker_models
  └→ Stage 4: judge_advice (optional)

응답: SearchResult → ScanGrid 컴포넌트
```

### 10.3 판단 받은함 (Verdict Inbox)

```
GET /api/user/inbox
  └→ capture_records WHERE created_at <= now() - 72h
  └→ JOIN ledger_entries + ledger_outcomes
  └→ JOIN judge_advice (사전 생성)
  └→ JOIN notification_queue (읽음 처리용)

화면: symbol | 72h movement | judge advice | VALID/INVALID/NEAR_MISS 버튼
```

### 10.4 패턴 위키 페이지

```
GET /api/wiki/patterns/{id}
  └→ wiki_pages WHERE slug = 'patterns/{id}'
  └→ pattern_stats_cache JOIN
  └→ user_pattern_stats WHERE user_id = me
  └→ pattern_community_stats (k-anonymized)
  └→ recent captures (wiki_links)

화면:
  - 정의 (body_md)
  - 통계: 발생 47회, 커뮤니티 승률 62%, 내 승률 58%
  - 최근 인스턴스 10개 (linked captures)
  - Phase Path 다이어그램
```

### 10.5 내 기록 대시보드

```
GET /api/user/stats
GET /api/user/captures?page=1

화면:
  - 총 캡처: 47 | 판단 완료: 31 | 승률: 62%
  - 패턴별 성과 테이블
  - 최근 캡처 타임라인
  - Expected Value 추이 (30d rolling)
```

---

## 11. 전체 DB 테이블 목록 (최종)

기존 문서에 있는 것 + 이 문서에서 추가한 것.

### 11.1 Market Data (L1/L2)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `raw_market_bars` | engine/features | OHLCV raw |
| `raw_perp_metrics` | engine/features | OI, funding, L/S |
| `raw_onchain_metrics` | engine/features | on-chain |
| `feature_windows` | engine/features | 92-col computed |

### 11.2 Pattern Engine (L3/L4)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `pattern_objects` | 01 §9 | PatternObject immutable |
| `pattern_candidates` | 01 §9 | review 대기 |
| `personal_variants` | 01 §9 | 유저별 override |
| `signal_vocabulary` | 01 §9 + §8.5 | 신호 어휘 |
| `pattern_runtime_states` | 02 §2 | 현재 상태 |
| `phase_transition_events` | 02 §2 | 전이 이벤트 |
| `scan_cycles` | 02 §3 | 스캔 감사 |
| `job_run_log` | 02 §5 | 배치 잡 로그 |

### 11.3 Ledger (L6)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `ledger_entries` | 02 §4 | actionable phase 진입 |
| `ledger_scores` | 02 §4 | ML 확률 |
| `ledger_outcomes` | 02 §4 | 72h 결과 |
| `ledger_verdicts` | 02 §4 | 사용자 판단 |
| `ledger_negatives` | 03 §8 + §8.2 | 하드 네거티브 |

### 11.4 Search / Reranker (L5)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `reranker_scoring_log` | 09 §3.4 + §8.1 | 점수 로그 |
| `reranker_models` | 09 §9.1 + §8.1 | 모델 레지스트리 |
| `reranker_eval_log` | 09 §8.4 + §8.1 | 평가 로그 |

### 11.5 User Activity (신규 - 이 문서 §2)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `capture_records` | migration 020 | 사용자 캡처 |
| `user_activity_log` | §2.4 | 행동 추적 (analytics) |
| `notification_queue` | §5.2 | 알림 큐 |
| `judge_advice` | §8.7 | Judge 사전 분석 |

### 11.6 Wiki Layer (신규 - 이 문서 §3)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `wiki_pages` | §3.2 | 위키 페이지 |
| `wiki_links` | §3.2 | 페이지 간 링크 |
| `wiki_change_log` | §3.2 | 변경 이력 |

### 11.7 Stats Engine (신규 - 이 문서 §4)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `pattern_stats_cache` | §4.2 | materialized view |
| `user_pattern_stats` | §4.3 | materialized view |

### 11.8 AI / Agent

| 테이블 | 정의 | 설명 |
|---|---|---|
| `episodic_sessions` | §8.3 | 대화 히스토리 (30d TTL) |
| `agent_trace_log` | §8.6 | 에이전트 실행 추적 |
| `audit_log` | migration 019 | 접근 감사 |

### 11.9 Layer 3 (RAG)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `news_chunks` | §8.4 | pgvector 뉴스 청크 |
| `capture_news_overlap` | §8.4 | 캡처 시점 뉴스 교차 |

### 11.10 Social / Copy Trading (신규 - 이 문서 §6-7)

| 테이블 | 정의 | 설명 |
|---|---|---|
| `copy_trade_subscriptions` | §7.2 | 팔로우 관계 |
| `copy_trade_signals` | §7.2 | 리더 실행 신호 |
| `copy_trade_actions` | §7.2 | 팔로워 반응 |

---

## 12. 구현 우선순위 (Phase별)

### Phase 1 (M0-M3, Closed Alpha) — 지금 해야 할 것

```
[ ] capture_records → 이미 있음 ✅
[ ] ledger 4-table split → 02 기반, 일부 구현
[ ] pattern_stats_cache materialized view → §4.2 SQL 작성 (1일)
[ ] user_pattern_stats materialized view → §4.3 SQL 작성 (1일)
[ ] wiki_pages + update_wiki_frontmatter → §3 (3일)
[ ] notification_queue + 72h scheduler → §5 (2일)
[ ] GET /api/user/captures + GET /api/user/stats → §9.1 (2일)
[ ] GET /api/user/inbox → §10.3 (1일)
```

**총 약 10일 → M1 내 완성 가능**

### Phase 2 (M3-M6)

```
[ ] judge_advice 사전 생성 파이프라인
[ ] wiki API (GET /api/wiki/patterns/*) + 패턴 위키 페이지 UI
[ ] user_activity_log + analytics
[ ] agent_trace_log
[ ] episodic_sessions
```

### Phase 3 (M6+)

```
[ ] news_chunks (pgvector) + news ingest
[ ] capture_news_overlap + news-conditioned stats
[ ] copy_trade_subscriptions + signals + actions
[ ] social/community layer (k-anonymized)
[ ] reranker_scoring_log + reranker_models (Slice 9)
```

---

## 13. 비용 모델 업데이트

DESIGN_V3.2 §10의 비용에 이 문서에서 추가된 비용 반영.

| 추가 비용 항목 | 빈도 | 비용/op | 일 비용/user |
|---|---|---|---|
| Stats Engine refresh | 288회/day | ~$0 (SQL) | $0 |
| Notification SMS | 0-3/day | $0.005 | $0.015 |
| Judge Agent pre-gen | 1-3/day | $0.05 | $0.05-0.15 |
| Wiki MD export | 50/day | ~$0 | $0 |
| news_chunks ingest | shared (not per user) | $0.001/article | ~$0 |

**총 추가: +$0.07-0.17/user/day** (기존 $0.35-1.25 대비 ~15% 증가)

---

## 14. 변경 영향 문서

| 문서 | 추가 사항 |
|---|---|
| `01_PATTERN_OBJECT_MODEL.md` | signal_vocabulary 테이블에 ko_aliases 추가 |
| `02_ENGINE_RUNTIME.md` | capture_news_overlap, judge_advice 생성 job 추가 |
| `03_SEARCH_ENGINE.md` | reranker_scoring_log 스키마 추가 |
| `04_AI_AGENT_LAYER.md` | episodic_sessions, agent_trace_log 스키마 추가 |
| `06_DATA_CONTRACTS.md` | §9의 신규 엔드포인트 전체 추가 |
| `07_IMPLEMENTATION_ROADMAP.md` | Phase 1에 User Layer + Stats Engine Slice 추가 |
| `COGOCHI.md` | wiki_pages DB 테이블이 canonical임을 명시 |
| **신규**: `10_COMPLETE_DATA_ARCHITECTURE.md` | 이 문서 |

---

## 15. Non-Goals (이 문서 범위 밖)

- 실시간 WebSocket 스트리밍 (알림은 polling 또는 Server-Sent Events로 충분)
- ClickHouse / TimescaleDB 도입 (현재 규모에서 불필요)
- Per-user fine-tuning (Phase B 이후)
- Copy trading 자동 실행 (사람의 확인 없는 자동 주문 금지)
- 소셜 피드 / 댓글 / 좋아요 (이 제품의 scope 아님)

---

## 16. 한 줄 결론

> **기존 설계(00-09)는 엔진(Market data → Features → State Machine → Search → Ledger)을 잘 정의했지만,
> "사람이 쓴 것이 어디 저장되고 어떻게 보이는가"가 빠져 있었다.
> 이 문서는 User Activity Layer + Wiki 구현 + Stats Engine + Notification + Social + Copy Trading의
> DB 스키마, API, Read Path를 추가하여 설계를 완성한다.**

---

*Data Architecture Complete v1.2 | 2026-04-25 | 00-09 문서의 갭 메꿈 + indicator viz system 연결 + LLM Wiki 구현 스펙*

---

## 17. 인디케이터 시각화 시스템 데이터 연결

indicator-viz-system-plan (W-0123 후속)을 읽고 발견한 추가 갭.

### 17.1 `user_indicator_preferences` 테이블 (신규 필요)

**발견된 갭**: P3에서 `shell.store.TabState.visibleIndicators: string[]`를 추가 예정인데,
탭을 닫으면 state가 reset된다. `personal_variants`는 패턴 threshold override용이므로
indicator preference와 섞으면 안 된다.

```sql
-- 사용자별 인디케이터 표시 설정 (persist)
create table user_indicator_preferences (
  pref_id             uuid primary key default gen_random_uuid(),
  user_id             text not null unique,
  visible_indicators  text[] not null
    default array['oi_change_1h','funding_rate','cvd_state'],
  pinned_order        text[],    -- drag-to-reorder 결과 (W-0124 이후)
  hidden_indicators   text[],    -- 완전히 숨긴 인디케이터
  updated_at          timestamptz default now()
);

create index on user_indicator_preferences (user_id);
```

**API 추가** (§9에 추가):
```
GET  /api/user/indicator-preferences      → 내 인디케이터 설정 조회
PUT  /api/user/indicator-preferences      → 설정 저장 (visibleIndicators 변경 시)
```

**AppShell 연결 흐름**:
```
로그인 → GET /api/user/indicator-preferences
  → shell.store.updateTabState({ visibleIndicators: prefs.visible_indicators })
  → IndicatorSettingsSheet에서 토글 변경 시
  → PUT /api/user/indicator-preferences (debounce 1s)
  → store 업데이트
```

### 17.2 `wiki_pages.page_type`에 `'indicator'` 추가

**발견된 갭**: §3.2 wiki_pages의 page_type 열거형에 'indicator'가 없음.
30개 신호 각각이 wiki 페이지를 가져야 한다 — LLM이 "funding rate가 뭐야?" 물으면
wiki에서 답해야 하고, signal_vocabulary 테이블과 연결되어야 한다.

```sql
-- page_type 확장 (주석 업데이트)
-- 'pattern' | 'user_capture' | 'user_verdict' | 'user_index'
-- | 'refinement_proposal' | 'system_log' | 'pattern_index'
-- | 'indicator'  ← 신규 추가

-- 인디케이터 페이지 frontmatter 스키마 예시
-- {
--   "indicator_id": "funding_rate",
--   "category": "funding",
--   "archetype": "B",          -- IndicatorArchetype A-J
--   "data_source": "binance_perp",
--   "feature_column": "funding_rate",  -- feature_windows 컬럼명
--   "update_freq_s": 28800,    -- 8h
--   "wiki_url": "https://..."
-- }
```

**Indicator wiki 생성 시점**:
- `signal_vocabulary`에 신규 신호 INSERT 시 → trigger로 wiki_pages INSERT
- 또는 `engine/wiki/exporter.py`의 초기 seeding 스크립트

### 17.3 G/H/I/J Archetype raw 데이터 소스 매핑

indicator-viz-system-plan P4에서 4개 archetype이 추가되는데, Phase 3 이후 실데이터 연결 시
어떤 raw 테이블이 필요한지 미리 정의.

| Archetype | Indicator | 현재 데이터 소스 | 필요 raw 테이블 |
|---|---|---|---|
| G (Curve) | `iv_term_structure` | Deribit IV tenor | `raw_options_metrics` (신규, Phase 3) |
| H (Sankey) | `exchange_netflow` | Arkham/Glassnode | `raw_onchain_metrics` (기존, 확장) |
| I (Histogram) | strike-level OI | Deribit OI by strike | `raw_options_oi` (신규, Phase 3) |
| J (Timeline) | event feed | notification_queue / signal_events | `signal_events` (신규, Phase 2) |

**`raw_options_metrics` (Phase 3 예비 정의)**:
```sql
-- G archetype (iv_term_structure) 실데이터 연결 시 필요
create table raw_options_metrics (
  ts             timestamptz not null,
  symbol         text not null,        -- 'BTC' | 'ETH'
  expiry         text not null,        -- '1W' | '2W' | '1M' | '3M' | '6M'
  iv_call        numeric,              -- implied vol (call)
  iv_put         numeric,
  delta_25       numeric,              -- 25-delta skew
  source         text,                 -- 'deribit' | 'laevitas'
  primary key (ts, symbol, expiry)
) partition by range (ts);
```

**`signal_events` (Phase 2 — J archetype용)**:
```sql
-- J archetype (event timeline) — Arkham activity feed 스타일
create table signal_events (
  event_id       uuid primary key default gen_random_uuid(),
  symbol         text,
  event_type     text not null,       -- 'large_transfer' | 'exchange_inflow' | 'pattern_trigger' | 'verdict_resolved'
  severity       text,               -- 'info' | 'warning' | 'alert'
  title          text not null,
  detail_json    jsonb,
  occurred_at    timestamptz not null,
  expires_at     timestamptz,        -- null = permanent
  source         text               -- 'engine' | 'arkham' | 'user'
);

create index on signal_events (symbol, occurred_at desc);
create index on signal_events (event_type, occurred_at desc);
```

> **Phase 2 현재**: J archetype은 `signal_events` 없이 `notification_queue`를 재활용.
> Phase 2 이후 분리.

### 17.4 `user_activity_log` action_type 확장

§2.4의 action_type 열거형에 indicator 관련 이벤트 추가:

```sql
-- activity_type 확장 (주석 업데이트)
-- 기존: 'capture' | 'verdict' | 'search' | 'view_pattern' | 'parse'
-- 추가:
--   'indicator_toggle'    — indicator on/off (metadata: {indicator_id, action: 'show'|'hide'})
--   'indicator_search'    — AI 탭에서 "funding 보여줘" 텍스트 검색
--   'layout_change'       — A/B/C 레이아웃 전환 (metadata: {from, to})
```

활용:
- `indicator_toggle` 집계 → 가장 많이 켜는 indicator TOP 5 → 신규 유저 기본값 personalisation
- `indicator_search` → AI 탭 fuzzy search 미스 감지 → keyword 사전 확장

### 17.5 §11 테이블 목록 업데이트 (indicator viz 추가분)

| 테이블 | 정의 | 설명 | Phase |
|---|---|---|---|
| `user_indicator_preferences` | §17.1 | 인디케이터 표시 설정 persist | Phase 1 |
| `signal_events` | §17.3 | J archetype 이벤트 피드 | Phase 2 |
| `raw_options_metrics` | §17.3 | Deribit IV tenor (G archetype) | Phase 3 |
| `raw_options_oi` | §17.3 | strike-level OI (I archetype) | Phase 3 |

### 17.6 indicator viz → data architecture 연결 요약

```
visibleIndicators (shell.store) ←→ user_indicator_preferences (DB)
                                        ↑
                              PUT /api/user/indicator-preferences

INDICATOR_REGISTRY entries ←→ signal_vocabulary (DB)
                           ←→ wiki_pages WHERE page_type='indicator'

G archetype (iv_term_structure) ← raw_options_metrics (Phase 3)
H archetype (exchange_netflow)  ← raw_onchain_metrics (기존)
I archetype (strike OI)         ← raw_options_oi (Phase 3)
J archetype (event timeline)    ← notification_queue (Phase 2) → signal_events (Phase 2+)

indicator_toggle events → user_activity_log → personalization feed
```

---

## 18. LLM Wiki 구현 스펙 (Karpathy Pattern → 우리 시스템)

### 18.1 Karpathy 패턴이란 (3줄 요약)

```
Raw Sources (불변)  →  Wiki (LLM이 유지)  →  Query (위키에서 답변)
```

RAG는 query 시점에 raw 데이터에서 fragment를 꺼낸다.
LLM Wiki는 **ingest 시점에 LLM이 먼저 읽고 wiki 페이지를 업데이트**해둔다.
Query는 이미 정리된 wiki에서 답한다. 훨씬 빠르고, 문맥 일관성이 높다.

**우리 시스템에서의 매핑**:

| Karpathy 개념 | 우리 시스템 |
|---|---|
| Raw Sources | capture_records, ledger_outcomes, pattern_objects, news_chunks |
| The Wiki | wiki_pages (DB canonical) + `cogochi/wiki/` (markdown export) |
| The Schema | `engine/wiki/schema.md` (신규) |
| Ingest Operation | `engine/wiki/ingest.py` (신규) |
| Query Operation | `engine/wiki/query.py` (신규) |
| Lint Operation | `engine/wiki/lint.py` (신규) |

**우리 시스템만의 차이** (corruption 방지):
- Karpathy: LLM이 pages 전체를 읽고 쓴다
- 우리: `frontmatter` (수치, 통계)는 stats_engine만 쓴다. LLM은 `body_md`만 쓴다.
- `wiki_change_log`로 모든 변경 추적. Lint agent는 읽기 전용 + human approval gate.

---

### 18.2 Wiki 페이지 종류 (Schema)

`engine/wiki/schema.md` — 에이전트가 wiki 작성 시 읽는 설정 문서.

```markdown
# Wiki Schema v1.0

## 페이지 종류

### patterns/{pattern_id}.md
- 누가 씀: stats_engine (frontmatter) + refinement_agent (body_md)
- 언제 업데이트: ledger_outcomes 누적 10건마다 OR verdict 5건마다
- 포함 내용: 패턴 정의, 발동 조건, 성과 통계, 최근 인스턴스 10개

### users/{user_id}/index.md
- 누가 씀: judge_agent (body_md) + stats_engine (frontmatter)
- 언제 업데이트: verdict 제출 시 (async, 30s delay)
- 포함 내용: 사용자 트레이딩 스타일, 강점 패턴, 최근 성과 추이

### users/{user_id}/captures/{capture_id}.md
- 누가 씀: judge_agent (body_md, 72h 후 생성)
- 언제 업데이트: verdict 제출 시 1회 + 이후 update 없음 (immutable)
- 포함 내용: 캡처 컨텍스트, 가격 움직임 분석, 뉴스 교차, judge 코멘트

### indicators/{indicator_id}.md
- 누가 씀: 초기 seeding만 (이후 수동)
- 포함 내용: 정의, 계산 방법, 어느 데이터소스, archetype

### concepts/{topic}.md
- 누가 씀: refinement_agent (user 제안 승인 후)
- 예시: "funding_extreme_event", "compression_pattern", "whale_inflow"
- 포함 내용: 개념 정의, 관련 패턴 링크, 관련 인디케이터 링크

### weekly/{yyyy-Www}.md
- 누가 씀: weekly_synthesis_agent (매주 월요일 0900 KST 실행)
- 포함 내용: 지난 주 주요 패턴 발동, 눈에 띄는 커뮤니티 버딕트, 시장 요약

## 금지 규칙
- LLM은 frontmatter의 숫자를 직접 쓰지 않는다. 수치는 stats_engine만.
- 패턴 정의(신호 조건, threshold)는 변경하지 않는다. pattern_objects가 canonical.
- 하나의 ingest 호출이 동시에 10개 이상 페이지를 쓰지 않는다 (anti-storm).
```

---

### 18.3 Ingest 파이프라인 (`engine/wiki/ingest.py`)

**트리거 이벤트별 동작**:

```python
# engine/wiki/ingest.py

class WikiIngestAgent:
    """
    Karpathy pattern: 새 데이터 도착 시 관련 wiki pages를 업데이트.
    LLM은 body_md만 쓴다. frontmatter는 stats_engine 전용.
    """

    async def on_capture_created(self, capture_id: str) -> None:
        """사용자가 구간 드래그 → capture 저장 직후 실행 (async)."""
        # 1. capture_records + feature_windows + pattern_runtime_states 로드
        # 2. LLM에게 전달: "이 캡처가 어떤 시장 상황인지 1-2문장 요약"
        # 3. wiki_pages INSERT (page_type='user_capture', body_md=summary)
        # 4. users/{user_id}/index.md의 body_md에 최근 캡처 1줄 추가
        # 5. wiki_links: capture → pattern 링크
        pass

    async def on_verdict_submitted(self, capture_id: str, verdict: str) -> None:
        """72h 후 사용자가 VALID/INVALID 제출 시."""
        # 1. capture 페이지 + outcome + news_overlap 로드
        # 2. judge_advice 사전 생성 (이미 있으면 skip)
        # 3. capture 페이지 body_md 업데이트: "결과: +8.3%, 사용자 판단: VALID"
        # 4. users/{user_id}/index.md body_md 업데이트: 성과 추이 1줄
        # 5. patterns/{pattern_id}.md body_md: "최근 버딕트: VALID (+8.3%)" 1줄 추가
        # 주의: frontmatter 수치는 건드리지 않음 (stats_engine가 다음 refresh 시 반영)
        pass

    async def on_pattern_stats_refreshed(self, pattern_id: str) -> None:
        """stats_engine이 pattern_stats_cache refresh 후 호출."""
        # 1. pattern_stats_cache에서 최신 stats 읽기
        # 2. wiki_pages.frontmatter 업데이트 (stats_engine 권한, LLM 아님)
        # 3. body_md는 변경하지 않음 (LLM이 나중에 별도 업데이트)
        pass

    async def on_weekly_trigger(self) -> None:
        """매주 월요일 0900 KST Cloud Scheduler."""
        # 1. 지난 7일 capture + verdict + outcome 요약 집계
        # 2. 주요 패턴 TOP 3 (occurrence_count 기준)
        # 3. LLM이 weekly/{yyyy-Www}.md 작성
        # 4. patterns/_index.md "이번 주 활발한 패턴" 섹션 업데이트
        pass
```

**실행 방식**:
```
capture_records INSERT trigger
  → Supabase Edge Function (또는 engine worker)
  → WikiIngestAgent.on_capture_created(capture_id)
  → 큐에 적재 (순차 처리, storm 방지)
  → wiki_pages INSERT/UPDATE
  → wiki_change_log INSERT
```

**Storm 방지 규칙**:
- 동일 page_id는 60초 내 1회만 업데이트 (debounce)
- 하나의 ingest call이 UPDATE하는 pages ≤ 10개
- LLM 호출 실패 시 체인 중단 (partial write 금지, 트랜잭션 단위로)

---

### 18.4 Query 경로 (`engine/wiki/query.py`)

```python
class WikiQueryAgent:
    """
    사용자 질문 → 관련 wiki pages 찾기 → 답변 생성.
    RAG (news_chunks)와 달리 semantic search 없음 — slug 기반 직접 조회.
    """

    async def answer(self, user_id: str, question: str) -> str:
        # 1. Parser agent가 question에서 intent 추출
        #    → pattern_id? | indicator_id? | personal_stats? | concept?
        # 2. 해당 wiki pages slug 결정
        #    예: "PTB 패턴 최근에 어때?" → ["patterns/PTB_REVERSAL", "patterns/_index"]
        #    예: "내 승률이 왜 떨어지고 있어?" → ["users/{id}/index", "users/{id}/captures/*"]
        # 3. wiki_pages SELECT WHERE slug IN (...)
        # 4. frontmatter + body_md 합쳐서 LLM context에 전달
        # 5. 답변 생성
        # 6. 답변이 유용한 경우 (LLM 자체 판단): concepts/{topic}.md에 저장 제안
        pass
```

**RAG와의 병용**:
```
질문 유형별 라우팅:
  "BTC 패턴 분석해줘"    → wiki query (패턴 위키 + 내 히스토리)
  "최근 BTC 뉴스 뭐야?"  → news RAG (news_chunks pgvector)
  "내 성과 분석해줘"     → wiki query (users/{id}/index)
  "자금조달비용 뭐야?"   → wiki query (indicators/funding_rate)
```

---

### 18.5 Lint 에이전트 (`engine/wiki/lint.py`)

Karpathy: "periodic health checks identify contradictions, stale claims, orphan pages, missing cross-references."

```python
class WikiLintAgent:
    """
    읽기 전용. 문제 발견 → lint_report만 생성. 실제 수정은 human approval 후.
    """

    async def run_lint(self) -> LintReport:
        issues = []

        # Check 1: 고아 페이지 (wiki_links에 연결 없는 capture 페이지)
        orphans = db.query("""
            SELECT p.page_id, p.slug FROM wiki_pages p
            LEFT JOIN wiki_links l ON l.from_page_id = p.page_id OR l.to_page_id = p.page_id
            WHERE p.page_type = 'user_capture' AND l.link_id IS NULL
        """)
        issues.extend([LintIssue(type='orphan', page=p.slug) for p in orphans])

        # Check 2: 오래된 패턴 페이지 (frontmatter.last_calculated > 7일)
        stale = db.query("""
            SELECT slug FROM wiki_pages
            WHERE page_type = 'pattern'
            AND last_calculated < now() - interval '7 days'
        """)
        issues.extend([LintIssue(type='stale', page=p.slug) for p in stale])

        # Check 3: 통계 드리프트
        # wiki_pages.frontmatter.win_rate vs pattern_stats_cache.win_rate 비교
        # 5% 이상 차이나면 stale 표시

        # Check 4: body_md에 숫자가 있는데 frontmatter와 다른 경우
        # (LLM이 잘못 쓴 것) → contradiction 표시

        return LintReport(issues=issues, run_at=datetime.now())
```

**실행 주기**: 매일 새벽 3시 Cloud Scheduler

---

### 18.6 파일 구조 (실제 구현 시 생성할 것)

```
engine/
  wiki/
    __init__.py
    schema.md          ← 에이전트가 읽는 설정 (§18.2)
    ingest.py          ← WikiIngestAgent (§18.3)
    query.py           ← WikiQueryAgent (§18.4)
    lint.py            ← WikiLintAgent (§18.5)
    exporter.py        ← DB → markdown 파일 export (§3.4)
    prompts/
      capture_summary.txt     ← ingest용 LLM prompt
      verdict_update.txt
      weekly_synthesis.txt
      query_answer.txt

cogochi/
  wiki/                ← markdown export 출력 (gitignore 비추, LLM context 주입용)
    patterns/
      PTB_REVERSAL.md
      _index.md
    indicators/
      funding_rate.md
      oi_change_1h.md
    concepts/
    users/             ← user별 (user_id/ 하위, privacy 주의)
    weekly/
```

---

### 18.7 DB 마이그레이션 순서 (Phase 1 구현 순서)

```sql
-- Step 1: wiki_pages + wiki_links + wiki_change_log 생성 (§3.2)
-- Step 2: signal_vocabulary seeding → indicators/*.md 생성
-- Step 3: 기존 pattern_objects → patterns/*.md 초기 seeding
-- Step 4: WikiIngestAgent capture hook 연결
-- Step 5: stats_engine → on_pattern_stats_refreshed 연결
-- Step 6: weekly_synthesis_agent Cloud Scheduler 등록
-- Step 7: WikiLintAgent daily cron 등록
```

**소요 예상**: Phase 1 핵심 (step 1-4) = 약 5일

---

### 18.8 주의사항 (Karpathy 커뮤니티의 비판 반영)

| 위험 | 우리 대응 |
|---|---|
| Silent corruption (read+write 같은 프로세스) | stats_engine과 LLM writer 완전 분리. frontmatter = stats_engine 전용. |
| LLM hallucination이 wiki에 누적 | lint agent가 수치 불일치 감지. capture/verdict는 원본 데이터 보존. |
| 버전 관리 불가 | wiki_change_log로 모든 변경 추적. markdown export는 git commit. |
| 동일 정보 중복 업데이트 (storm) | debounce 60s + 페이지당 10개 제한 |
| 비용 폭증 | 하루 최대 ingest LLM 호출 = 캡처 수 × 3. 100 DAU 기준 ~$1.50/day 추가. |
