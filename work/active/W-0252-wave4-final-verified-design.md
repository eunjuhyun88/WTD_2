# W-0252 — Wave 4 최종 확정 설계 (코드 실측 오류 수정)

> **AI Researcher + Quant Trader + CTO 공동 검증 완료**
> 코드 실측 SHA: 6d7de4fe | 검증 일시: 2026-04-27
> **W-0251 오류 7건 수정. 이 문서가 Wave 4 최종 단일 진실.**

---

## 0. 코드 실측으로 발견된 오류 수정 요약

| # | 오류 위치 | 잘못된 설계 | 실제 코드 | 수정 방향 |
|---|---|---|---|---|
| ① | F-60 Gate 수식 | `(valid+near_miss)/total` | `stats/engine.py:141` 3-window median/floor gate | §3 H-07 전면 재작성 |
| ② | F-02-fix 영향 범위 | label_maker.py 수정 | `F60_WIN_LABELS/F60_DENOM_LABELS` in `stats/engine.py:40` | §1 F-02-fix 범위 추가 |
| ③ | draft-from-range 제한 | `range < 4h → 422` | `patterns.py:438` range > 7일 → 422 | §2 chart drag 스펙 수정 |
| ④ | 12 features 실효 | `btc_corr/venue_div` 포함 | `patterns.py:231,265` 둘 다 `None` hardcoded | §2 "10 effective features" |
| ⑤ | ML 학습 데이터 | user_verdict로 LightGBM 학습 | `label_maker.py:77` triple-barrier (가격 액션) | §4 ML 데이터 흐름 재정립 |
| ⑥ | H-07 구현 범위 | 전체 gate 로직 신규 구현 | `stats/engine.py:141` 로직 이미 존재 | §3 엔드포인트 노출만 |
| ⑦ | Hill Climbing 목적 | accuracy 최적화 | `hill_climbing.py:25` `expectancy×√n×(1-MDD)` | §4 Hill Climbing 수정 |

---

## 1. F-02-fix — 수정된 설계 (영향 범위 추가)

> **BLOCKER — 모든 Stream 시작 전 완료 필수**

### 변경 레이블 (확정)

| 기존 | 신규 | 의미 | F-60 Gate 역할 |
|---|---|---|---|
| `valid` | `valid` | 진입 → 수익 | WIN ✓ |
| `invalid` | `invalid` | 진입 → 손실/패턴 틀림 | DENOM (분모) |
| `missed` | `near_miss` | 패턴 맞음, 진입 못함 | DENOM (분모, **WIN 아님**) |
| `unclear` | `too_early` | 조기 진입, 타이밍 실패 | DENOM (분모) |
| `too_late` | `too_late` | 이미 올라서 진입 불가 | DENOM (분모) |

**Quant Trader 설계 근거 — near_miss를 WIN으로 보지 않는 이유:**
`near_miss` = 패턴이 발생했지만 실제 거래를 하지 못한 경우. F-60 Gate는 "이 시그널을 따랐을 때 수익 확률"을 측정한다. 미거래 케이스는 실제 PnL이 없으므로 WIN 카운트에 포함하면 **실제 수익성보다 높은 정확도**를 만든다. 이는 카피시그널 구매자를 기망하는 수치가 됨 → DENOM만 포함.

### 영향 파일 (수정된 전체 목록)

```
1. engine/ledger/types.py:54
   VerdictLabel = Literal["valid", "invalid", "near_miss", "too_early", "too_late"]

2. engine/stats/engine.py:40-41  ← W-0251에서 누락됨
   F60_WIN_LABELS   = {"valid"}
   F60_DENOM_LABELS = {"valid", "invalid", "near_miss", "too_early", "too_late"}
   # too_early 추가 (기존 unclear = skip → too_early = 타이밍 실패 = 측정 대상)

3. engine/api/routes/captures.py
   verdict validation: Literal 타입 체크

4. app/src/lib/components/.../VerdictInboxPanel.svelte
   버튼 5개 텍스트/value 업데이트

5. migration 022 (기존 행 이관):
   missed  → near_miss
   unclear → too_early
```

**F60_DENOM_LABELS 변경 근거:**
기존 `unclear`는 "판단 불가"라 측정 제외 (skip). 새 `too_early`는 "조기 진입 실패"로 명확한 거래 결과 → 측정 포함. 분모에 추가해야 실제 수행 정확도가 정확히 측정됨.

### Migration 022 SQL

```sql
-- Step 1: missed → near_miss
UPDATE pattern_ledger_records
SET payload = jsonb_set(payload, '{user_verdict}', '"near_miss"')
WHERE payload->>'user_verdict' = 'missed';

-- Step 2: unclear → too_early
UPDATE pattern_ledger_records
SET payload = jsonb_set(payload, '{user_verdict}', '"too_early"')
WHERE payload->>'user_verdict' = 'unclear';

-- Step 3: 검증 (0 rows 확인)
SELECT COUNT(*) FROM pattern_ledger_records
WHERE payload->>'user_verdict' IN ('missed', 'unclear');
```

**Exit Criteria:**
- [ ] `POST /captures/{id}/verdict {"verdict": "near_miss"}` → 200
- [ ] `{"verdict": "unclear"}` → 422 (폐기 라벨)
- [ ] migration 022 후 `missed`/`unclear` rows = 0
- [ ] `engine/stats/engine.py` `F60_DENOM_LABELS` 업데이트 확인
- [ ] VerdictInboxPanel 버튼: 성공/실패/니어미스/조기진입/늦은진입
- [ ] Engine CI ✅ / App CI ✅

---

## 2. A-04-eng — 수정된 Chart Drag 스펙

> **코드 실측으로 수정된 2가지**: 범위 제한 + 실효 피처 수

### 수정된 API 계약

```
POST /patterns/draft-from-range
  Body: { symbol: str, start_ts: int, end_ts: int, timeframe: str = "1h" }

  Validation (실제 코드 기준):
    end_ts <= start_ts         → 422 "end_ts must be greater than start_ts"
    (end_ts - start_ts) > 604800 → 422 "range exceeds 7 days"  ← W-0241의 "4h" 오류 수정
    데이터 없음                → 404

  Response: PatternDraftBody
```

### 10 Effective Features (실측 수정)

```python
# engine/api/routes/patterns.py 코드 기준

# ✅ 실제 추출되는 10개
oi_change     = fw.get("oi_change_pct")        # OI 변화율
funding       = fw.get("funding_rate_last")     # 자금 조달 비율
cvd           = fw.get("cvd_delta")             # 누적 거래량 델타
liq_volume    = fw.get("liq_imbalance")         # long/short liq 불균형
price         = fw.get("price_change_pct")      # 가격 변화율
volume        = fw.get("volume_quote")          # 거래대금
higher_lows   = bool(fw.get("higher_low_count", 0) > 0)
lower_highs   = (trend_regime == "downtrend" and hh_count == 0)
compression   = bool(fw.get("compression_ratio", 1.0) <= 1.0)
smart_money   = bool(fw.get("absorption_score", 0))

# ❌ ALWAYS NULL — cross-symbol 데이터 없음
btc_corr   = None  # patterns.py:231 "requires cross-symbol BTC data"
venue_div  = None  # patterns.py:265 "requires cross-venue data"
```

**Quant Trader 관점 — btc_corr/venue_div 로드맵:**
- `btc_corr` = 알트코인 패턴에서 핵심 지표. BTC 상승 장에서의 알트 독립 움직임 여부.
  - 단기 해결: `/search/similar` 호출 시 BTC feature_window를 reference로 교차 계산
  - 중기 해결: corpus_builder에서 btc_corr를 사전 계산하여 feature_windows에 컬럼 추가 (DESIGN_V3.1, F-12)
- `venue_div` = 거래소간 가격 괴리 (Binance vs Bybit). Korea premium과 별개.
  - F-12에서 cross-venue data pipeline 구축 후 활성화 예정

---

## 3. H-07 + H-08 — 수정된 F-60 Gate + 정확도 엔드포인트

> **핵심 수정**: H-07 gate 로직은 이미 `engine/stats/engine.py:141`에 구현됨. 엔드포인트만 추가.

### F-60 Gate 실제 알고리즘 (코드 검증)

```python
# engine/stats/engine.py:141 _compute_gate_status() 검증됨

# 1. 측정 대상 필터
verdicted = [o for o in outcomes if o.user_verdict in F60_DENOM_LABELS]

# 2. 200건 미만 → insufficient_data
if len(verdicted) < 200:
    return GateStatus(passed=False, reason="insufficient_data", ...)

# 3. 3개 롤링 30일 윈도우로 분할
windows = _split_rolling_windows(verdicted)  # W1(가장 오래된) / W2 / W3(최신)

# 4. 각 윈도우 win_rate 계산
accuracies = [
    sum(1 for o in w if o.user_verdict in F60_WIN_LABELS) / len(w)
    for w in windows
]

# 5. 멀티-윈도우 게이트 (anti-overfit)
passed = statistics.median(accuracies) >= 0.55 AND min(accuracies) >= 0.40
```

**Quant Trader 설계 근거 (Ryan Li + Kropiunig empirical):**
단일 기간 accuracy 0.60이 실제로는 0.45인 경우가 흔하다 (seed luck). BTC 강세장에서만 좋은 패턴이 전 기간 평균으로 묻히는 문제 방지. `min >= 0.40` floor는 "최악의 30일도 40%는 넘어야 한다"는 하방 안전판.

### H-07: 엔드포인트 추가 (기존 로직 활용)

```python
# engine/api/routes/stats.py (신규 라우트 추가)
@router.get("/users/{user_id}/f60-status")
async def get_f60_status(user_id: str, user=Depends(require_auth)) -> dict:
    """Expose existing _compute_gate_status() as REST endpoint."""
    if user["user_id"] != user_id:
        raise HTTPException(403)

    # 기존 stats engine 호출
    outcomes = _load_user_outcomes(user_id)  # ledger에서 user_id 기반 조회
    gate = _compute_gate_status(slug=f"user:{user_id}", outcomes=outcomes)

    return {
        "verdict_count":    gate.verdict_count,
        "remaining":        gate.remaining_to_threshold,
        "passed":           gate.passed,
        "median_accuracy":  gate.median_accuracy,
        "floor_accuracy":   gate.floor_accuracy,
        "window_accuracies": gate.window_accuracies,   # [W1, W2, W3]
        "window_counts":    gate.window_counts,
        "reason":           gate.reason,
    }
```

### H-08: per-user verdict accuracy (Stats Engine 보강)

```python
# engine/stats/engine.py 에 추가
def get_user_verdict_breakdown(user_id: str) -> dict:
    """Per-user verdict count per label. NOT the F-60 gate.
    Used for personal stats panel only (H-08)."""
    verdicts = ledger_store.list_verdicts_by_user(user_id)
    breakdown = Counter(v.user_verdict for v in verdicts if v.user_verdict)
    resolved = sum(breakdown.get(k, 0) for k in F60_DENOM_LABELS)
    wins = breakdown.get("valid", 0)
    return {
        "total":     len(verdicts),
        "resolved":  resolved,
        "win_rate":  wins / resolved if resolved > 0 else 0.0,
        "breakdown": dict(breakdown),
    }
```

**H-07 vs H-08 구분 (Quant 관점):**
- H-07 = F-60 Gate = **시그널 발행 자격** 측정. 3-window anti-overfit. `WIN = {"valid"}` only.
- H-08 = Personal stats = **개인 트레이딩 성과** 측정. 단순 breakdown. `near_miss` 포함 분석 가능.

---

## 4. ML 학습 데이터 흐름 확정 (오해 수정)

> W-0251에서 "user_verdict로 LightGBM 학습" 오기 → 완전 수정

### 두 개의 분리된 피드백 루프

```
루프 1 — 가격 액션 기반 ML (Layer C LightGBM)
─────────────────────────────────────────────────
  feature_windows (40+dim) ──→ label_maker.py
                                  make_triple_barrier()
                                    target: +15% (hit_threshold)
                                    stop:   -10% (miss_threshold)
                                    timeout: 72h → drop
                                  → binary label [1=HIT, 0=MISS]
                            ──→ lightgbm_engine.py
                                  walk-forward CV, AUC gate
                                  P(win) = P(price +15% in 72h)
                            ──→ Layer C score (0~1)

루프 2 — 사용자 판단 기반 Gate (F-60)
─────────────────────────────────────────────────
  사용자 5-cat verdict ──→ stats/engine.py
                             _compute_gate_status()
                             3-window median/floor gate
                           ──→ F-60 gate passed/failed
                           ──→ 카피시그널 발행 자격

루프 3 — 검색 품질 피드백 (Quality Ledger)
─────────────────────────────────────────────────
  사용자 search good/bad ──→ quality_ledger.py
                              compute_weights()
                              Layer A/B/C 가중치 자동 조정
                            ──→ similar.py _W_ABC 런타임 업데이트
```

**AI Researcher 해설:**
- LightGBM은 "이 구간이 패턴 진입 후 72h 내 +15% 달성할까?" 예측 → 과거 가격 데이터로 학습
- User verdict는 "나는 이 패턴을 어떻게 평가했나?" → 발행 자격 gate
- 둘은 **학습 신호가 다름** (가격 vs 사람 판단). 혼합하면 안 됨.
- Hill Climbing = `expectancy × √n × (1−MDD)` → threshold 파라미터 최적화 (AUC/accuracy 아님)

---

## 5. 병렬 스트림 최종 확정 (수정 반영)

### 의존성 그래프 (수정됨)

```
F-02-fix (migration 022)
  + engine/stats/engine.py F60_WIN_LABELS/DENOM_LABELS 동시 업데이트
        │
        ├─── Stream A: Core UX (모두 독립)
        │      A-1. F-3  Telegram deeplink    [3일]
        │      A-2. F-4  Decision HUD          [4일]
        │      A-3. F-5  IDE split-pane        [5일]
        │      A-4. F-2  Search result UX      [4일]
        │
        ├─── Stream B: Dashboard
        │      B-1. F-11 WATCHING + Candidate   [5일]  ← 독립
        │      B-2. F-13 Telegram Bot UI         [3일]  ← 독립
        │      B-3. F-14 Pattern lifecycle       [4일]  ← B-1 후
        │
        ├─── Stream C: Data/ML (F-02-fix 후)
        │      C-1. H-07+H-08  [3일]            ← 엔드포인트만 (로직 이미 존재)
        │              ↓
        │      C-2. F-16 recall verify  [3일]   ← 독립
        │              ↓
        │      C-3. F-30 Ledger 4-table [4일]   ← C-1 후
        │
        ├─── Stream D: Infra/Biz (독립)
        │      D-1. F-18 Stripe          [4일]  ← C-1 H-07 후 tier 연동
        │      D-2. F-19 Observability   [3일]  ← 독립
        │      D-3. F-7  Meta automation [1.5일] ← 독립
        │      D-4. F-20-22 Infra        [1.5일] ← 독립
        │
        └─── Stream E: Korea + PersonalVariant (독립)
               E-1. F-12 DESIGN_V3.1    [3일]
               E-2. F-15 PersonalVariant UI [2일]
```

### 실행 우선순위 (수정됨)

```
Week 0 (즉시):
  1. F-02-fix (migration 022 + stats/engine.py 동시)    ← BLOCKER
  2. F-7  Meta automation                                ← 1.5일, 독립

Week 1:
  3. H-07+H-08 (엔드포인트 노출)                        ← C-1, F-02-fix 후
  4. F-3  Telegram deeplink                              ← A-1, 독립
  5. F-11 WATCHING + Candidate Review                   ← B-1, 독립

Week 2:
  6. F-4  Decision HUD                                   ← A-2
  7. F-5  IDE split-pane                                 ← A-3
  8. F-12 Korea features (kimchi/session/oi_norm)        ← E-1
  9. F-13 Telegram Bot connect UI                        ← B-2

Week 3:
  10. F-18 Stripe + tier                                 ← D-1, H-07 후
  11. F-14 Pattern lifecycle UI                          ← B-3, B-1 후
  12. F-16 recall@10 verify                              ← C-2
  13. F-19 Observability                                 ← D-2

Week 4:
  14. F-2  Search result UX                              ← A-4
  15. F-15 PersonalVariant UI                            ← E-2
  16. F-20-22 Infra cleanup                              ← D-4
  17. F-30 Ledger 4-table                                ← C-3, 마지막 (가장 리스크)
```

---

## 6. 퀀트 트레이더 관점 추가 검증 (신규)

### 6-1. Outcome Policy 임계값 (HIT +15% / MISS -10%)

```python
# engine/patterns/outcome_policy.py:29-30
DEFAULT_HIT_THRESHOLD_PCT  = 0.15   # +15% peak gain = HIT
DEFAULT_MISS_THRESHOLD_PCT = -0.10  # -10% exit return = MISS
# timeout: 72h 후 EXPIRED
```

**Quant 검토:**
- +15% / -10% = RR 1.5:1. crypto derivatives에서 수용 가능하나 타임프레임 의존적.
- 4h 차트 기준 72h = 18캔들. 충분한 hold period.
- **개선 제안 (P2)**: 패턴별 hit_threshold 파라미터화 (지금은 모든 패턴 동일). 단기 패턴(1h 기준)에는 +8% / -5% 적용이 더 적합. → `_PATTERN_POLICIES` dict에 이미 구조 있음 (코드 확인됨).

### 6-2. Layer A 40+dim 가중 L1 — Korea 특화 피처 (F-12)

```
현재 40+col feature_windows:
  oi_change_pct, funding_rate_last, cvd_delta, liq_imbalance, ...

F-12에서 추가할 3개:
  kimchi_premium    = (Upbit KRW price / Binance USDT price - 1) × 100
  session_apac      = 아시아 세션 (00:00~08:00 UTC) 거래량 비중
  oi_normalized_cvd = OI × CVD / 시가총액 정규화
```

**Quant 근거:**
- `kimchi_premium > 3%`: 국내 투자자 쏠림 → 단기 OI 급증 선행 지표. 한국 트레이더에게 핵심.
- `session_apac`: 아시아 세션 지배 코인 = 한국/일본 리테일 주도 → 다른 패턴 적용
- `oi_normalized_cvd`: 시가총액 대비 OI 기반 CVD → 소형 코인에서 whale 포지션 감지

### 6-3. Search Layer 가중치 현황과 수렴 예측

```
현재 (Layer C 미훈련 시):
  A: 0.45 / B: 0.30 / C: 0.25 → _blend(): B None 시 A:0.60 / C:0.25
  실질: Layer B 없으면 A:0.64 / C:0.36 (A+C 정규화)

quality_ledger 자동 조정 조건:
  _MIN_SAMPLES_FOR_RECALIBRATION = 20 (search_judgements 최소 수)
  layer별 최소 3 samples 필요

수렴 시나리오 (AI Researcher 예측):
  Day 1-30:   Layer C None → 실질 2-layer (A+B or A only)
  Day 30-90:  verdict 50+ → LightGBM 1차 학습 → Layer C 활성화
  Day 90-180: quality judgements 20+ → weights 자동 재조정
  Day 180+:   fully calibrated 3-layer blend
```

---

## 7. Migration 순서 확정 (최종)

| 번호 | 내용 | 필수 선행 | 리스크 |
|---|---|---|---|
| **022** | F-02-fix: verdict 레이블 이관 | 없음 | BLOCKER. stats/engine.py 동시 배포 필수 |
| 023 | telegram_connect_codes 테이블 | 없음 | 낮음 |
| 024 | Ledger 4-table 생성 (empty) | H-07/H-08 완료 | 중간 — 신규 테이블만 생성 |
| 025 | Ledger backfill + read cutover | 024 + dual-write 1주 운영 | **높음** — row 수 100만+ 가능 |
| 026 | feature_windows V3.1 컬럼 추가 | 없음 | 낮음 — ADD COLUMN NULL default |
| 028 | user_profiles Stripe 컬럼 추가 | H-07 완료 | 낮음 |

**⚠️ migration 022 배포 주의사항:**
```
배포 순서:
  1. migration 022 실행 (DB 레이블 이관)
  2. engine/stats/engine.py F60_DENOM_LABELS 업데이트 배포
  3. engine/ledger/types.py VerdictLabel 업데이트 배포
  4. app VerdictInboxPanel 버튼 업데이트 배포

→ 3→4 사이 윈도우에서 `near_miss` 값이 DB에 저장될 수 있음
  (engine은 허용, app은 아직 old 버튼) — 짧은 윈도우므로 허용
→ 1 실행 후 engine 배포 전까지 old 값(`missed`)은 자연스럽게 소멸
```

---

## 8. 폐기 목록 (최종)

| Work Item | 이유 |
|---|---|
| W-0221 | §Stream D-3 (F-7 Phase A)로 통합 |
| W-0222 | F-02-fix(§1)로 대체. 레이블 의미 재정의됨 |
| W-0229 | §3 H-07 엔드포인트 설계로 대체 |
| W-0230 | §3 H-08으로 대체 |
| W-0231 | §5 Stream C-3 F-30으로 대체 |
| W-0232-h07 | §3 H-07 설계로 흡수 |
| W-0233 | §5 C-3 F-30 Phase 3으로 흡수 |
| W-0241 | Wave 1 완료 (patterns.py:190) |
| W-0242 | Wave 1 완료 (patterns.py:427) |
| W-0251 | 이 문서(W-0252)로 대체됨 — 오류 7건 발견 |

---

*W-0252 | AI Researcher + Quant Trader + CTO A024 | 코드 실측 2026-04-27*
*다음 체크포인트: F-02-fix 배포 완료 시 migration 022 실행 결과 확인*
