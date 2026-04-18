# W-0097 다음 세션 설계 — 2026-04-19 checkpoint

## 현재 상태 (2026-04-19 session end)

**완료된 것:**
- PR #85: coinbase_premium_positive + smart_money_accumulation + fetch_exchange_oi + total_oi_spike + oi_exchange_divergence (4 blocks + 3 fetchers)
- PR #88: CTO 리팩토링 패스 (dead code, cache bug, logging, hasattr guards)
- 815 tests pass

**엔진 블록 수:** 37개 (entries 8 / triggers 9 / confirmations 17 / disqualifiers 3)

---

## 다음 세션 우선순위

### P0 — Flywheel Phase C: Verdict Inbox (W-0088)

**Why now:** Axis 1 (Capture) + Axis 2 (Outcome) 닫힘. Axis 3 (Verdict) 가 열려있으면 resolved outcome이 쌓여도 표면이 없음. 창업자가 `/captures/bulk_import` 로 시딩해도 결과를 볼 수 없음.

**What:**
- `GET /captures/outcomes` — outcome_ready 상태인 capture + 결과 목록 API
- `engine/api/routes/captures.py` 에 route 추가
- app side: terminal에 verdict inbox 패널 또는 notification badge

**Exit criteria:**
- 엔진에 POST /captures/bulk_import → hourly resolver → GET /captures/outcomes 에서 결과 확인 가능
- `/observability/flywheel/health` → `captures_to_outcome_rate` > 0

---

### P0.5 — 채널 패턴 → PatternLibrary 등록 (W-0097-channel-pattern)

**Why:** 이번 세션에서 분석가 툴킷의 **재료(블록)**는 만들었지만, 분석가의 실제 **패턴 로직**을 PatternLibrary에 등록하지 않음. 블록이 있어도 패턴으로 묶이지 않으면 `pattern_search`가 탐지할 수 없음.

**분석가 패턴 구조 (채널 반복 패턴):**
```
PHASE 1 — 세력_매집
  조건: oi_spike_with_dump + smart_money_accumulation + funding_extreme(음수)
  해석: 세력이 숏 포지션 쌓으면서 개인 롱 청산 유도

PHASE 2 — 저점_확인
  조건: higher_lows_sequence + ls_ratio_recovery
  해석: 하락 멈추고 스마트머니 저점 매수 시작

PHASE 3 — 진입
  조건: coinbase_premium_positive + total_oi_spike(increase) + oi_exchange_divergence(low_concentration)
  해석: 기관 매수세 + 전 거래소 OI 동반 상승 = 진짜 반등
```

**What:**
1. `engine/patterns/` 에 새 패턴 YAML/Python 정의 추가
2. benchmark pack 구성 (채널에서 나온 사례 코인들: BTC, FARTCOIN 등)
3. `pattern_search.py` 로 backtest
4. `promote_candidate` 통과 시 PROMOTED_PATTERNS 등록

**Exit criteria:**
- `pattern_search` 가 채널 패턴 탐지 결과 반환
- reference_score 측정 (TRADOOR와 비교)

---

### P1 — CME OI 통합 (W-0097-cme)

**Why:** 분석가 툴킷 커버리지 100% 마지막 갭. `cme_oi = 0.0` placeholder.

**Options:**
1. **Coinglass API** ($29/월) — 가장 깔끔
2. **CFTC COT weekly report** — 무료, 주 1회 업데이트, 기관 포지션 파싱 가능
   - URL: `https://www.cftc.gov/dea/futures/financial_lf.htm`
   - Bitcoin Futures (CBTC) 행 파싱 → weekly CME 롱/숏 포지션

**Recommendation:** COT 파서 먼저 (무료, 주간 정밀도면 충분). Coinglass는 실시간이 필요할 때.

---

### P2 — SYMBOL_CHAIN_MAP 확장

**Why:** `smart_money_accumulation` 이 현재 8개 토큰만 커버. 새 universe 심볼 추가 시 자동으로 스킵됨.

**What:** SYMBOL_CHAIN_MAP에 주요 Solana/ETH 토큰 추가.
현재: FARTCOIN, WIF, BONK, JUP, RAY, PEPE, SHIB, FLOKI
추가 후보: TRUMP, MELANIA, MOODENG, NEIRO, MOG, POPCAT, BRETT, BANANA

---

### P3 — Redis Kline Cache (W-0096, 설계 완료)

**Why:** CSV per-request I/O가 500유저 스케일에서 병목. 설계는 완료됨.
**Status:** `work/active/W-0096-perf-scalability-phase1-redis.md` 설계 문서 있음.
**Blocked on:** Redis 인프라 결정 (로컬 dev vs Upstash)

---

## 세션 시작 시 체크리스트

1. `git fetch origin && git log --oneline origin/main..HEAD` — main에 뭐가 쌓였는지
2. `GET /observability/flywheel/health` — flywheel 상태 확인
3. P0 (Verdict Inbox) 또는 유저가 지정한 작업으로 진입

## 참고 파일
- `work/active/W-0088-flywheel-closure-capture-wiring.md` — flywheel 전체 설계
- `work/active/W-0094-checkpoint-2026-04-18-session3d.md` — Phase E 완료 체크포인트
- `work/active/W-0096-perf-scalability-phase1-redis.md` — Redis 캐시 설계
- `memory/project_onchain_signal_expansion_2026_04_19.md` — 이번 세션 온체인 블록 컨텍스트
