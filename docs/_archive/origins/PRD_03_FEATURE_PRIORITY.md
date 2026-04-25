# 03 — Feature Priority (P0 / P1 / P2)

**버전**: v1.0 (2026-04-25)
**상태**: canonical
**의도**: 모든 기능을 P0/P1/P2로 분류해 scope creep을 막는다

---

## 0. 원칙

### 0.1 P0 / P1 / P2 정의

| Tier | 의미 | 제거하면 |
|---|---|---|
| **P0** | 제품이 성립하기 위한 필수 | 제품이 없다 |
| **P1** | 제품 가치를 확장 | 제품은 있지만 moat가 약하다 |
| **P2** | 있으면 좋음, 없어도 됨 | 제품 본질에 영향 없음 |

### 0.2 M1 / M3 / M6 / M12 분리

- M0 (pre-launch): P0 전부
- M3 (beta): P0 완성도 ↑ + P1 일부
- M6 (GA): P1 대부분
- M12 (scale): P2 + 새 P0 발견

### 0.3 필터 질문

각 feature마다 3가지 질문:

1. "이게 없으면 P0 페르소나가 떠나나?" — Yes → P0
2. "이게 없으면 moat가 무너지나?" — Yes → P0 or P1
3. "경쟁사가 따라하기 쉬운가?" — Yes → P2로 강등

---

## 1. 기능 카테고리

크게 7개 카테고리로 분류:

1. Capture & Save
2. Pattern Object & Vocabulary
3. State Machine & Scanner
4. Search Engine
5. Visualization & UX
6. Ledger & Verdict
7. Team & Collaboration
8. AI & Automation
9. Integrations

---

## 2. Capture & Save

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Range select on chart | **P0** | M0 | 기본 UX, 없으면 save 불가 |
| Save Setup with feature snapshot | **P0** | M0 | canonical capture event |
| Auto chart screenshot (server-side) | **P0** | M0 | evidence integrity |
| Manual note + tags | **P0** | M0 | user intent context |
| Trade plan structured fields (entry/stop/target) | **P0** | M0 | execution-ready |
| Capture list per user | **P0** | M0 | 기본 관리 |
| Capture duplicate detection | P1 | M3 | 품질 유지 |
| Capture search (my captures) | P1 | M3 | 자기 재참조 |
| Capture export to CSV | P2 | M6 | power user |
| Capture import from Telegram screenshot | P2 | M12 | convenience |

---

## 3. Pattern Object & Vocabulary

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Fixed signal vocabulary (25+ signals) | **P0** | M0 | 검색 기반 |
| Hardcoded library patterns (seed) | **P0** | M0 | empty state 방지 |
| Registry-backed pattern storage | **P0** | M1 | Slice 5 |
| Pattern versioning (immutable) | **P0** | M1 | audit + rollback |
| Pattern candidate review workflow | P1 | M3 | user-created patterns |
| Personal variant with threshold override | **P0** | M3 | key differentiator |
| Vocabulary expansion approval | P1 | M6 | controlled growth |
| Pattern family normalization (multi-TF) | P2 | M12 | Slice 11 |
| Auto-discovery (event → proposed pattern) | P2 | M12 | Phase 3 |

---

## 4. State Machine & Scanner

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Sequential state machine (in-memory) | **P0** | DONE | 이미 구현됨 |
| Durable state persistence (Postgres) | **P0** | M1 | Slice 2, 가장 큰 구멍 |
| Backfill on new pattern | **P0** | M1 | cold start |
| Tier-based scan cadence | **P0** | M1 | 1m/5m/15m/1h |
| Phase timeout & reset | **P0** | M1 | 기본 lifecycle |
| Optimistic concurrency | **P0** | M1 | multi-worker safety |
| Scan cycle audit log | P1 | M3 | debugging |
| Multi-timeframe state tracking | P2 | M12 | Slice 11 |
| Cross-exchange universe | P2 | M6 | Binance-only first |

---

## 5. Search Engine

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Stage 1: SQL candidate filter | **P0** | M1 | Slice 6 |
| Stage 2: Phase path sequence matcher | **P0** | M1 | **moat 핵심** |
| Duration-aware similarity | **P0** | M1 | sequence accuracy |
| Forbidden signal penalty | **P0** | M1 | quality |
| Stage 3: LightGBM reranker | **P0** | M3 | Slice 9, 50+ verdict 후 |
| Isotonic calibration | P1 | M3 | probability meaningful |
| Stage 4: LLM judge (optional) | P2 | M6 | Slice 12 |
| Similar-to-capture search | **P0** | M1 | P0 핵심 JTBD |
| Negative set curation | P1 | M3 | ranker 품질 |
| Benchmark pack infrastructure | P1 | M6 | promotion gate |
| pgvector supplementary | P2 | M6 | stage 1 보조 |

---

## 6. Visualization & UX

### 6.1 Core Layouts

| Feature | Tier | Target | Notes |
|---|---|---|---|
| TradingView lightweight charts base | **P0** | M0 | DONE |
| Multi-pane: price + OI + funding + volume | **P0** | M0 | 기본 |
| Phase zone overlays | **P0** | M1 | state_view essential |
| Resizable IDE-style split pane | **P0** | M1 | Slice 7 |
| Divider drag with min size | **P0** | M1 | basic UX |
| LocalStorage pane ratio persistence | **P0** | M1 | |
| Mode switcher (Observe/Analyze/Execute) | P1 | M3 | 3 modes separation |

### 6.2 6 Templates

| Template | Tier | Target | Notes |
|---|---|---|---|
| state_view | **P0** | M1 | 가장 많이 쓰임 |
| event_focus (WHY) | **P0** | M1 | |
| scan_grid (SEARCH) | **P0** | M1 | P0 JTBD |
| compare_view | P1 | M3 | team use |
| flow_view | P1 | M3 | power user |
| execution_view | P1 | M3 | separate mode |

### 6.3 HUD & Workspace

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Decision HUD 5 cards | **P0** | M1 | |
| Phase timeline component | **P0** | M1 | |
| Evidence table | **P0** | M1 | |
| Compare section | P1 | M3 | |
| Ledger section | **P0** | M1 | |
| Judgment section | **P0** | M1 | verdict UI |
| Intent classifier routing | P1 | M3 | Slice 7 |
| Highlight planner | P1 | M3 | |

### 6.4 Mobile

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Responsive observe mode | **P0** | M1 | 알림 수신 후 확인 |
| Native app | P2 | M12 | PWA 먼저 |
| Push notifications | P1 | M3 | 알림 핵심 |

---

## 7. Ledger & Verdict

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Entry record auto-creation | **P0** | M0 | DONE (JSON) |
| 4-table split (entry/score/outcome/verdict) | **P0** | M1 | Slice 5 |
| 72h auto-outcome computation | **P0** | M1 | |
| User verdict 5 categories | **P0** | M1 | |
| Verdict comment field | **P0** | M1 | refinement signal |
| Aggregate stats per pattern | **P0** | M1 | hit_rate, EV |
| Regime-conditioned stats | P1 | M3 | BTC trend 분리 |
| Personal stats per user | **P0** | M3 | motivation |
| Training materialized view | P1 | M3 | ML ready |
| Ledger dataset export | P2 | M6 | research |
| Pattern decay monitor | P1 | M3 | critical signal |

---

## 8. Team & Collaboration

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Individual accounts | **P0** | M0 | |
| Share capture via link | P1 | M3 | |
| Team workspace | P1 | M6 | Phase 2 |
| Shared pattern library | P1 | M6 | **P1 moat 핵심** |
| Shared watch list | P1 | M6 | |
| Team-level verdicts | P1 | M6 | |
| Assignment system | P2 | M12 | P1 nice-to-have |
| Per-member performance | P2 | M12 | |
| Role-based permissions | P1 | M6 | admin/editor/viewer |
| Audit log | P2 | M12 | enterprise |

---

## 9. AI & Automation

| Feature | Tier | Target | Notes |
|---|---|---|---|
| LLM parser endpoint | **P0** | M1 | Slice 3 |
| Strict vocabulary enforcement | **P0** | M1 | |
| Parser retry + validation | **P0** | M1 | |
| Parser confidence gate | **P0** | M1 | |
| Intent classifier | P1 | M3 | visualization route |
| Explanation ("왜 비슷한가") | P1 | M3 | UX value |
| Refinement suggestion engine | P1 | M3 | threshold propose |
| LLM judge (stage 4) | P2 | M6 | optional |
| Chart interpreter | P2 | M12 | multimodal fine-tune |
| Auto-discovery agent | P2 | M12 | Phase 3 |
| Personal LoRA adapter | P2 | M12+ | Pro tier |
| Orchestrator agents | P2 | M12 | operator tools |

---

## 10. Integrations

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Binance perp data feed | **P0** | DONE | |
| CoinGlass API fallback | P1 | M3 | resilience |
| Telegram alert push | P1 | M3 | P0 habit |
| Discord alert push | P2 | M6 | community users |
| Webhook out (user-defined) | P2 | M6 | power user |
| TradingView Pine export | P2 | M12 | nice integration |
| MetaTrader/exchange direct order | ❌ | never | out of scope |
| Wallet connect | ❌ | never | not trading execution |
| Bybit / OKX data | P1 | M6 | exchange parity |
| Hyperliquid | P2 | M12 | growing venue |

---

## 11. Infrastructure

| Feature | Tier | Target | Notes |
|---|---|---|---|
| Auth (email + OAuth) | **P0** | M0 | |
| Session management | **P0** | M0 | |
| Rate limiting | **P0** | M1 | cost control |
| Tiered pricing enforcement | **P0** | M3 | |
| Payment (Stripe) | **P0** | M3 | GA prerequisite |
| Observability (metrics + logs) | **P0** | M1 | |
| Error tracking (Sentry) | **P0** | M1 | |
| Backup & recovery | **P0** | M1 | data integrity |
| Multi-region deployment | P2 | M12 | Asia latency |
| On-premise enterprise | P2 | M12+ | team plan expansion |

---

## 12. Priority Scoring Rationale (샘플)

P0 주장에 대한 근거 요약.

### "Durable state plane"이 왜 P0인가

- 현재 in-memory → 재시작 시 phase path 소실
- P0 persona가 알림 받아 open했을 때 phase missing이면 "이 제품 불안정" 인식
- Moat의 핵심인 ledger와도 연결됨 (state 없으면 entry 없음)
- Engineering cost: 2주

### "Sequence matcher"가 왜 P0인가

- P0 JTBD "비슷한 거 찾아줘"의 본체
- 경쟁사(CoinGlass/Hyblock/Surf)가 구현 안 함
- feature vec similarity만으론 정확도 40% 이하 예상
- sequence로 +20-30%p 개선 기대 [estimate, based on §03 benchmark]
- Engineering cost: 2주

### "Team workspace"가 왜 P1인가

- P0 persona는 개인. Team은 secondary segment
- P1 moat이 강하지만 P0 validate 전엔 premature
- B2B sales cycle로 MRR 불안정
- M6 이후 진입 타이밍 적절

### "Auto-discovery"가 왜 P2인가

- P0 use case에 포함되지 않음
- 데이터 누적 (200+ verdict) 후에만 성능 가능
- Hallucination risk 높음 (fake patterns)
- 경쟁 제품이 마케팅용으로 쉽게 따라할 수 있음
- Real moat는 discovery가 아니라 validation

---

## 13. Feature Count Summary

| Tier | Count | Target |
|---|---|---|
| P0 | 39 | M0-M1 |
| P1 | 24 | M3-M6 |
| P2 | 20+ | M6+ |
| Never | 3 | out of scope |

M0 → M1 (6주 내) P0 전부 완료. 40개 feature / 6주 = 6-7 feature/week. 현실적으로 agent 3명 병행 필요.

---

## 14. Dependency Graph (간략)

```
Vocabulary (P0)
  ├── Parser (P0)
  │     └── Candidate review (P1)
  │           └── Shared library (P1)
  ├── Query Transformer (P0)
  │     └── Search Stage 1+2 (P0)
  │           └── Reranker (P0)
  │                 └── Negative set (P1)
  └── Pattern Object registry (P0)
        ├── Durable state (P0)
        │     └── Scanner (P0)
        │           └── Entry (P0)
        │                 ├── Outcome job (P0)
        │                 └── Score (reranker) (P0)
        └── Personal variant (P0)

Capture (P0)
  ├── Feature snapshot (P0)
  ├── Chart screenshot (P0)
  └── Similar-to-capture search (P0) ← uses Search

Ledger (P0)
  ├── Verdict (P0)
  │     └── Refinement suggestion (P1)
  └── Decay monitor (P1)

Visualization
  ├── 3 core templates (P0)
  ├── 3 additional templates (P1)
  ├── Decision HUD (P0)
  └── Mode switcher (P1)
```

---

## 15. What We're NOT Building (자주 요청되는 것)

| Request | Reason not to build |
|---|---|
| 자동매매 | Scope creep, regulatory risk |
| Portfolio P&L | Not our job, 수많은 경쟁사 있음 |
| Social comments | Distraction, moderation cost |
| Coin ranking | CoinGecko/CMC 영역 |
| News aggregator | Distinct product |
| Influencer copy trading | Anti-persona |
| Strategy marketplace | M12 이후 별도 track |
| Paper trading | Slice 밖 |
| Options analytics | Perp focus |
| DEX-only focus | Binance perp first |
| Price prediction | 판단 권한 밖 (§04) |

---

## 16. Feature Sunset Policy

기능을 넣었다가 빼는 프로세스.

1. Usage < 1% of WAA for 2 months → candidate
2. Remove cost 계산 (maintenance + tech debt)
3. 30일 deprecation notice
4. Remove

초기에 넣는 것보다 빼는 게 어렵다. P2는 특히 sunset 가능성 염두.

---

## 17. Kill Criteria (feature 레벨)

| Feature | Kill trigger |
|---|---|
| Parser | Schema compliance < 80% after 100 samples |
| Sequence matcher | Manual eval hit@5 < 40% |
| Reranker | NDCG gain < +0.02 vs baseline |
| LLM judge | No quality gain + latency >8s |
| Share to Telegram | < 5% usage 3 months after launch |
| Team workspace | < 10 paying teams at M6 |
| Chart interpreter | Confidence gate < 60% |

---

## 18. 한 줄 요약

> **P0 = 40개. 이거 다 없으면 제품이 아니다.**
> **P1 = 24개. 이게 있어야 moat가 생긴다.**
> **P2 = 20개+. 이건 "나중에".**
