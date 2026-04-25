# Design v3.2 — Knowledge Architecture (Wiki + Sequence Matcher + RAG + Time-series)

**버전**: v3.2 (2026-04-25, patch over v3.1)
**상태**: canonical patch
**기반**: design v3.0 + v3.1 patch + Karpathy LLM Wiki 패턴 + RAG/Wiki 차이 분석
**의도**: Cogochi의 지식 아키텍처를 명시적 4-layer로 분리. 각 layer 책임, 데이터 mapping, LLM 권한, drift 방지 정책 확정.

---

## 0. 왜 이 patch가 필요한가

design v3.0 + v3.1까지 "memory tiers"를 설계했지만 **실행 도구별 분리**가 모호했다. RAG, LLM Wiki, Sequence Matcher, Time-series DB가 각각 어디에 쓰이는지, 같은 데이터가 두 곳에 있을 때 어느 쪽이 canonical인지 결정 필요.

**핵심 결정**: 데이터 종류별로 단 하나의 canonical layer 존재. 다른 layer는 derived view 또는 cache.

---

## 1. 4-Layer Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ LAYER 1: LLM Wiki (Karpathy 패턴 적용)                       │
│   책임: Pattern memory, Verdict ledger, Personal variants    │
│   특성: 천천히 변화, 누적, 관계 중요, audit 필수            │
│   Storage: Postgres (canonical) + git mirror + md export    │
│   Update: capture/verdict event-driven                       │
│   LLM role: 페이지 update (제한적), 통계는 stats engine     │
├──────────────────────────────────────────────────────────────┤
│ LAYER 2: Sequence Matcher (자체 알고리즘, deterministic)     │
│   책임: Phase path matching, similar case search             │
│   특성: 구조적, deterministic, verdict-conditioned ranking  │
│   Storage: Postgres index + 메모리 캐싱                      │
│   Update: 매 capture 시 incremental                          │
│   LLM role: 없음 (옵션: 결과 자연어 설명 시)                │
├──────────────────────────────────────────────────────────────┤
│ LAYER 3: RAG (외부 dynamic 문서)                             │
│   책임: News, 공시, market commentary 검색                   │
│   특성: dynamic, 외부 source, semantic 검색                  │
│   Storage: pgvector + chunk store                            │
│   Update: WebSocket stream (Velo News API 또는 자체)        │
│   LLM role: 합성 (얇음)                                      │
├──────────────────────────────────────────────────────────────┤
│ LAYER 4: Time-series + Direct API                            │
│   책임: Feature snapshots, real-time stream, market data    │
│   특성: high velocity, 대용량, 시계열 query                 │
│   Storage: Postgres / TimescaleDB / ClickHouse              │
│   Update: 1m batch + WebSocket stream                        │
│   LLM role: 없음                                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Canonical Data Mapping (drift 방지)

**Rule: 각 데이터 종류는 exactly one canonical layer.**

| 데이터 | Canonical Layer | Derived/Cached In | 비고 |
|---|---|---|---|
| Pattern definition | **Layer 1 (Wiki)** | — | Postgres `patterns` table |
| User verdict ledger | **Layer 1 (Wiki)** | — | append-only |
| Personal variant | **Layer 1 (Wiki)** | — | per-user |
| Refinement proposal | **Layer 1 (Wiki)** | — | proposed/accepted/rejected |
| Pattern occurrence stats | **Layer 1 (Wiki)** | — | stats engine 계산 |
| Capture event | **Layer 4 (TS)** | Layer 1에 backlink | DB row, wiki에 wikilink만 |
| Feature snapshot | **Layer 4 (TS)** | — | TimescaleDB hypertable |
| Pattern runtime state | **Layer 4 (TS)** | — | live state machine |
| Market price/OI/funding | **Layer 4 (Direct API)** | 일부 cache | exchange/Velo direct |
| News article (raw) | **Layer 3 (RAG)** | — | pgvector chunks |
| News-conditioned stats | **Layer 1 (Wiki)** | — | 사전 계산, derived from RAG queries |
| User session conversation | **별도 (Episodic)** | — | 30일 hard delete |
| Sequence matcher index | **Layer 2** | derived from Layer 4 | 캐시 + index |

**금지된 패턴**:
- ❌ News raw를 wiki에 정리 (RAG → Layer 3 only)
- ❌ Verdict ledger를 RAG embedding (Wiki only)
- ❌ Feature snapshot을 wiki page로 만들기 (Layer 4 only)
- ❌ Pattern definition을 vector DB에 (Wiki only)

---

## 3. LLM 권한 모델 (closed-loop 구체화)

각 LLM agent의 read/write 권한을 명시. design v3.1의 closed-loop 원칙을 layer별로 강제.

### 3.1 Parser Agent (NL → PatternDraft)

```python
class ParserAgent:
    READ_LAYERS = {
        'layer_1_wiki': ['pattern_library_public', 'user_verdicts(self)', 'personal_variants(self)'],
        'layer_2_seq': ['recent_search_history(self)'],  # 최근 검색 결과
        'layer_3_rag': [],  # 사용 안 함
        'layer_4_ts': ['current_feature_snapshot(symbol)'],  # 현재 시점만
    }
    WRITE_LAYERS = {
        'layer_1_wiki': ['pattern_draft_pending(self) — DRAFT only, user confirm 필수'],
    }
    FORBIDDEN = ['web_search', 'external_api', 'social_media']
```

### 3.2 Judge Agent (verdict 후 advice)

```python
class JudgeAgent:
    READ_LAYERS = {
        'layer_1_wiki': ['pattern_library_public', 'user_verdicts(self)', 'pattern_stats'],
        'layer_2_seq': [],
        'layer_3_rag': ['news_at_capture_time'],  # 캡처 시점 ±1h news만
        'layer_4_ts': ['feature_snapshot(capture_time...capture_time+72h)'],
    }
    WRITE_LAYERS = {
        # 시스템에 직접 쓰지 않음. Display only.
        'display': ['verdict_advice'],
    }
    FORBIDDEN = ['web_search', 'modify_user_verdict', 'modify_pattern_stats']
```

### 3.3 Refinement Agent (pattern 진화 제안)

```python
class RefinementAgent:
    READ_LAYERS = {
        'layer_1_wiki': ['all_patterns', 'aggregated_verdicts(anonymized)'],
        'layer_2_seq': ['pattern_overlap_analysis'],
        'layer_3_rag': [],
        'layer_4_ts': ['historical_feature_snapshots'],
    }
    WRITE_LAYERS = {
        'layer_1_wiki': ['refinement_proposals — admin/user confirm 필수'],
    }
    FORBIDDEN = ['direct_modify_pattern', 'modify_user_data']
```

### 3.4 News Synthesizer (RAG only)

```python
class NewsSynthesizer:
    READ_LAYERS = {
        'layer_1_wiki': [],
        'layer_2_seq': [],
        'layer_3_rag': ['news_chunks_top_k'],  # 사용자 query 기반
        'layer_4_ts': ['current_market_state'],  # context로
    }
    WRITE_LAYERS = {
        'display': ['news_summary'],
        # Wiki에 직접 쓰지 않음. 별도 stats engine이 RAG result 누적.
    }
```

### 3.5 사용자 작성 권한

```python
USER_PERMISSIONS = {
    'layer_1_wiki': {
        'read': ['pattern_library_public', 'user_data(self)'],
        'write': [
            'capture(self)',
            'verdict(self)',
            'personal_variant(self)',
            'pattern_proposal(self) — review 후 public 승급',
        ],
    }
}
```

---

## 4. Stats Engine (LLM 대체)

**중요한 구조 결정**: Wiki page의 통계 (occurrence count, win rate 등)는 **LLM이 계산하지 않는다**. Deterministic stats engine이 계산하고 LLM은 prose만 (또는 그것도 없이).

```python
class StatsEngine:
    """
    Wiki page의 모든 수치는 이 engine이 deterministic 계산.
    LLM은 prose (해설)만, 수치 만들지 못함.
    """
    
    def compute_pattern_stats(self, pattern_id: str) -> PatternStats:
        # SQL 직접 query
        captures = db.query("SELECT * FROM captures WHERE pattern_id = ?", pattern_id)
        verdicts = db.query("SELECT * FROM verdicts WHERE pattern_id = ?", pattern_id)
        
        return PatternStats(
            occurrence_count=len(captures),
            win_rate=count_wins(verdicts) / len(verdicts) if verdicts else None,
            avg_30min_movement=compute_avg_movement(captures, 30),
            ...
        )
    
    def update_wiki_page(self, pattern_id: str):
        """Wiki page의 수치 부분만 업데이트. Prose 부분 안 건드림."""
        stats = self.compute_pattern_stats(pattern_id)
        page = wiki.get_page(f"patterns/{pattern_id}.md")
        page.update_frontmatter(stats.to_yaml())
        # Prose body는 user 또는 refinement agent만 변경
        wiki.commit(page, author='stats_engine', message=f'auto-update stats {pattern_id}')
```

이 패턴이 **drift 방지**의 핵심. Karpathy 댓글의 "LLM 자기 prose 읽고 또 쓰면 corruption" 대응.

---

## 5. Wiki 구조 (filesystem layout)

```
cogochi/
├── COGOCHI.md                       ← 시스템 schema (LLM 매 호출 시 reference)
├── pattern_library/
│   ├── index.md                     ← active pattern 카탈로그 (auto-maintained)
│   ├── log.md                       ← chronological events
│   └── patterns/
│       ├── PTB_REVERSAL.md
│       ├── OI_PUMP_FUNDING_NEG.md
│       └── ...
│
├── users/
│   └── {user_id}/
│       ├── index.md                 ← user 본인 데이터 카탈로그
│       ├── log.md                   ← user 활동 시계열
│       ├── verdicts/
│       │   ├── 2026-04/
│       │   │   ├── verdict_{ulid}.md
│       │   │   └── ...
│       │   └── ...
│       ├── personal_variants/
│       │   ├── PTB_v2_higher_threshold.md
│       │   └── ...
│       └── captures/
│           ├── capture_{ulid}.md   ← capture 메타 + Layer 4 backlink
│           └── ...
│
├── refinement/
│   ├── proposals/
│   │   ├── proposal_{ulid}.md
│   │   └── ...
│   └── log.md
│
└── meta/
    ├── COGOCHI.md (schema)
    ├── glossary.md (25 signals 정의)
    └── workflows.md
```

**중요**: 이 구조는 **Postgres 위에 derived view**다. Markdown 파일은 LLM 소비용. Canonical은 DB.

```python
# Markdown export pipeline
def export_to_markdown():
    """매 N분 또는 변경 시 DB → markdown 동기화"""
    for pattern in db.query("SELECT * FROM patterns"):
        md = render_pattern_template(pattern, stats_engine.compute(pattern.id))
        write_file(f"pattern_library/patterns/{pattern.id}.md", md)
        git.commit_if_changed()
```

---

## 6. RAG Layer 상세

### 6.1 RAG 사용처 (제한적)

✅ **사용**:
- News ingest (Velo News API or 자체 sources)
- 공시 / 거래소 announcement
- Market commentary (선택, P3)
- 사용자 자체 메모/post (P3 옵션)

❌ **사용 금지**:
- Pattern 정의
- Verdict ledger
- 사용자 capture
- Feature snapshot

### 6.2 RAG architecture

```python
class NewsRAG:
    storage = pgvector_index('news_chunks')
    
    def ingest(self, news_event: NewsEvent):
        # 1. Chunk (보통 500 tokens)
        chunks = chunk_text(news_event.body, size=500, overlap=50)
        # 2. Embed (small model, e.g. text-embedding-3-small)
        embeddings = embed_batch(chunks)
        # 3. Store with metadata
        for chunk, emb in zip(chunks, embeddings):
            self.storage.insert({
                'news_id': news_event.id,
                'chunk_text': chunk,
                'embedding': emb,
                'timestamp': news_event.timestamp,
                'priority': news_event.priority,
                'tagged_coins': news_event.coins,
            })
    
    def search(self, query: str, time_range: TimeRange = None, top_k: int = 5):
        query_emb = embed(query)
        filter_clause = build_time_filter(time_range)
        results = self.storage.cosine_search(query_emb, top_k, filter_clause)
        return results
    
    def search_at_time(self, capture_time: datetime, top_k: int = 3):
        """Capture 시점 ±1h news 검색 (judge agent 사용)"""
        return self.search(
            query='market moving news',
            time_range=(capture_time - 1h, capture_time + 1h),
            top_k=top_k,
        )
```

### 6.3 RAG 결과를 wiki에 reflect하는 방법

```
News-conditioned stats 갱신:
1. RefinementAgent가 daily job으로:
   - 각 pattern의 historical capture timestamp 조회
   - 각 timestamp ±1h news search (RAG)
   - news 발생 / 미발생 시 win rate 분리 계산
2. Stats engine이 wiki page 업데이트:
   "PTB_REVERSAL during news: win rate -15%"
3. RAG raw chunk는 Layer 3에 남고, Wiki에는 derived stat만.
```

---

## 7. Sequence Matcher Layer 상세

### 7.1 위치

design v3 `03_SEARCH_ENGINE.md`에 이미 정의. v3.1에서 우선순위 격상. v3.2에서 **layer 위치 명확화**.

```python
class SequenceMatcher:
    """
    Layer 2: deterministic sequence matching.
    LLM 사용 안 함 (옵션: 결과 prose 설명 시 얇게).
    """
    
    def find_similar(
        self,
        target_phase_path: list[Phase],
        target_features: dict,
        user_id: str,
        k: int = 5,
        time_window: str = "180d",
    ) -> list[SimilarCase]:
        # Layer 4 query
        candidates = ts_db.query_phase_paths(time_window)
        
        # Layer 2 algorithm (deterministic)
        scored = []
        for cand in candidates:
            dtw_score = dtw_distance(target_phase_path, cand.phase_path)
            feat_score = feature_distance(target_features, cand.features)
            time_decay = compute_decay(cand.timestamp)
            
            # Layer 1 query: user verdict bias
            verdict_bias = wiki.query_user_verdict(user_id, cand.pattern_id)
            
            final_score = combine(dtw_score, feat_score, time_decay, verdict_bias)
            scored.append((cand, final_score))
        
        return top_k(scored, k)
```

### 7.2 다른 layer와 결합

- **Layer 4 데이터 사용** (feature snapshots, phase history)
- **Layer 1 verdict bias** (사용자 본인 verdict 우선)
- **결과 = Layer 1 wiki page link** (사용자가 클릭하면 wiki 페이지)

---

## 8. Episodic Memory (별도 처리)

LLM 대화 session은 4-layer 어디에도 안 넣음. 별도 단순 store:

```python
class EpisodicStore:
    """
    Session 내 이전 turn 참조용. 30일 hard delete.
    Wiki 같은 정리 안 함. 단순 chronological.
    """
    storage = postgres_table('agent_sessions')
    
    def add_turn(self, session_id: str, role: str, content: str):
        self.storage.insert({...})
    
    def get_session(self, session_id: str, last_n: int = 10):
        return self.storage.query(
            f"SELECT * FROM agent_sessions WHERE session_id = ? ORDER BY ts DESC LIMIT {last_n}"
        )
    
    def cleanup_expired(self):
        """매일 cron"""
        self.storage.delete("WHERE created_at < now() - interval '30 days'")
```

장점: 
- Wiki, RAG, sequence matcher 모두 영향 안 미침
- Privacy 단순 (30일이면 끝)
- 계산 비용 0

---

## 9. Drift 방지 정책 (전체)

### 9.1 LLM-write 격리

| LLM이 직접 쓸 수 있는 것 | LLM이 못 쓰는 것 |
|---|---|
| Wiki prose (정의 설명, 해설) — limited | 통계 수치 |
| Refinement proposal (review 필수) | Pattern 정의 직접 변경 |
| Display advice (DB 안 들어감) | User verdict |
| News summary (display) | RAG ingest 자체 |
| PatternDraft (user confirm 필수) | Personal variant 자동 생성 |

### 9.2 Provenance 강제

모든 wiki page frontmatter:
```yaml
---
pattern_id: PTB_REVERSAL
last_calculated: 2026-04-25T10:00:00Z
calculator: stats_engine_v2
sources:
  - capture_id: ulid_xxx
  - verdict_id: ulid_yyy
  - ...
schema_version: 3
---
```

### 9.3 Read-only enforcement at access time

```python
@require_permission('read', layer='layer_1_wiki', subset='pattern_library_public')
def get_pattern(pattern_id):
    ...

@require_permission('write', layer='layer_1_wiki', subset='pattern_draft_pending')
def submit_pattern_draft(draft, user_id):
    # require user confirm
    ...
```

### 9.4 Audit log

`memory_access_log` table (v3.1 정의된 그대로):
- 누가 어느 layer를 read/write 했는지
- Tier 1 (user data) access는 100% log
- 월간 audit report 자동 생성

---

## 10. Cost Model (4-layer 운영)

### 10.1 Per-user-per-day 추정

| Layer | Operation | 빈도/day | 비용/op | 일 비용 |
|---|---|---|---|---|
| L1 Wiki | Page read | 50-100 | $0 | $0 |
| L1 Wiki | LLM page update | 5-20 | $0.05 | $0.25-1.00 |
| L1 Wiki | Stats engine compute | 100 | $0.0001 | $0.01 |
| L2 Seq | Match query | 10-30 | $0.001 | $0.03 |
| L3 RAG | News search | 5-15 | $0.01 | $0.05-0.15 |
| L3 RAG | News ingest (시스템) | n/a | $0.001/article | shared |
| L4 TS | Snapshot read | 100-1000 | $0 | $0 |
| L4 TS | Direct API call | 50-200 | $0.0001 | $0.01-0.02 |
| Episodic | Session ops | 50-200 | $0 | $0 |
| **Total per user/day** | | | | **$0.35-1.25** |

### 10.2 Scale 추정

| Users | Daily | Monthly | 예상 |
|---|---|---|---|
| 100 (Alpha) | $35-125 | $1K-3.7K | 무난 |
| 1,000 (Beta) | $350-1.25K | $10K-37K | OK with optimization |
| 10,000 (GA) | $3.5K-12.5K | $105K-375K | Optimization 필수 |
| 100,000 (Scale) | $35K-125K | $1M-3.7M | Stats engine + caching critical |

### 10.3 Optimization 우선순위

1. **L1 Wiki LLM update → stats engine 분리** (가장 큰 비용)
2. **L3 RAG embedding caching** (반복 query 캐시)
3. **L2 sequence matcher 인덱싱 강화** (대용량 시)
4. **L4 hot/cold storage 분리** (오래된 snapshot은 cold)

---

## 11. 단계적 도입 (실용 timeline)

### Phase 1 (M0-M3, Closed Alpha)
- ✅ Layer 1 Wiki: pattern library + verdict ledger 기본
- ✅ Layer 4 TS: feature snapshot 1m
- 🟡 Layer 2 Sequence Matcher: Stage 1 only (filter)
- ❌ Layer 3 RAG: 없음
- 🟢 Episodic: 단순 30일 store

### Phase 2 (M3-M6, Closed Beta)
- ✅ Layer 2 Sequence Matcher: Stage 1+2 (DTW + ranking)
- 🟡 Layer 1 Wiki: refinement proposal flow 추가
- 🟡 Stats engine: deterministic compute 분리
- ❌ Layer 3 RAG: 아직 없음

### Phase 3 (M6-M9, Open Beta)
- ✅ Layer 3 RAG: Velo News API ingest
- ✅ Layer 1 Wiki: news-conditioned stats
- ✅ Layer 2 Sequence Matcher: reranker (Stage 3)

### Phase 4 (M9+, GA + Scale)
- ✅ 전 layer 최적화 (caching, hot/cold)
- ✅ MCP server 출시 (P3)
- ✅ 자체 fine-tune model 검토 (parser specialist)

---

## 12. 변경 영향 받는 design 문서

| 문서 | 변경 |
|---|---|
| 00_MASTER_ARCHITECTURE.md | Section 9 4-layer 다이어그램 추가 |
| 01_PATTERN_OBJECT_MODEL.md | Wiki page 형태 명시 (markdown layout) |
| 02_ENGINE_RUNTIME.md | Stats engine 분리 spec 추가 |
| 03_SEARCH_ENGINE.md | Sequence Matcher = Layer 2 명시 |
| 04_AI_AGENT_LAYER.md | LLM 권한 모델 layer별 강제 |
| 06_DATA_CONTRACTS.md | Canonical mapping 표 추가, RAG schema |
| 07_IMPLEMENTATION_ROADMAP.md | Phase별 layer 도입 순서 |
| **신규**: COGOCHI.md | 시스템 schema document (LLM이 매 호출 시 read) |
| **신규**: 08_KNOWLEDGE_ARCHITECTURE.md | 이 patch의 정식 문서화 |

---

## 13. Non-Goals (v3.2)

명시적으로 안 하는 것:

- ❌ Pattern 정의를 RAG embedding (Wiki only)
- ❌ Verdict ledger를 RAG (Wiki only, structured)
- ❌ Feature snapshot을 wiki (TS only)
- ❌ News raw를 wiki (RAG only, derived stats만 wiki)
- ❌ Episodic memory를 wiki에 file (별도 store)
- ❌ 모든 layer를 동시 Phase 1에 도입 (단계적)
- ❌ LLM이 통계 수치 직접 계산 (stats engine만)
- ❌ Same-process read+write on same data (Karpathy 비판 대응)

---

## 14. 위험 / Open questions

### 14.1 Cost spike 위험

- L1 Wiki LLM update가 가장 큼. 10K users 시 $375K/month [estimate]
- 대응: Phase 4에서 stats engine 분리 + caching

### 14.2 Drift 모니터링

- LLM이 wiki page 잘못 update하면 누적
- 대응: weekly lint job, refinement agent가 contradiction 감지
- 사용자에게 "wiki health score" 노출 (P2)

### 14.3 한국 시장 데이터 격리

- Tier 1 (user verdict) 한국 사용자 데이터는 한국 region DB
- M9+ GA 시 결정 (변호사 자문)

### 14.4 RAG → Wiki 양방향 동기

- News-conditioned stat이 outdated 될 수 있음
- 대응: weekly recompute job

---

## 15. 변경 이력

| Version | Date | Change |
|---|---|---|
| v3.0 | 2026-04-25 | Initial 8 docs |
| v3.1 | 2026-04-25 | PRD deep dive 반영 (features, KO parser, sequence matcher 격상) |
| v3.2 | 2026-04-25 | 4-layer Knowledge Architecture 명시. Wiki + Sequence Matcher + RAG + TS 분리. LLM 권한 layer별 강제. Stats engine 분리. Karpathy 패턴 + Surf RAG 모두 통합 |

---

## 16. 한 줄 결론

> **Cogochi 지식 아키텍처 = 4-layer. Layer 1 Wiki (pattern + verdict, 우리 moat) + Layer 2 Sequence Matcher (deterministic search) + Layer 3 RAG (외부 dynamic news only) + Layer 4 TS (feature snapshot, real-time). 각 데이터는 단 하나의 canonical layer. LLM은 layer별로 read/write 권한 분리. 통계는 stats engine, LLM은 prose만. Drift 방지 = same-process read+write 금지 + provenance 강제 + audit log.**
