# ML Pattern Intelligence — PRD v1.0

> Track: ML-INTEL | Status: 🟡 Design Draft
> Created: 2026-04-30
> Index: [P-00-master.md](P-00-master.md)

---

## 1. 제품 한 줄 정의

WTD 패턴 엔진이 학습한 ML 모델과 paper-trading 검증 결과를 사용자가 IntelPanel에서 실시간으로 확인하고, verdict를 남길수록 개인화된 순위로 정렬된다.

---

## 2. 현재 vs 목표

| 항목 | 현재 | 목표 |
|---|---|---|
| 패턴 순위 기준 | BH-FDR p-value 정렬 | composite_score (E/S/W/D/C 5-axis) 정렬 |
| ML 모델 반영 | predicted_prob=0.6 고정 | MODEL_REGISTRY active model inference |
| Pipeline 결과 노출 | parquet에 저장만 됨 | GET /research/top-patterns → IntelPanel |
| 개인화 | 없음 | verdict 누적 → context-tag weight → reranking |
| Sector/MTF 신호 | engine 내부에만 있음 | opportunity scan + SingleAssetBoard 배지 |

---

## 3. 사용자 스토리

### US-01 — 복합 점수 기반 패턴 브라우징
> "코코지 IntelPanel에서 패턴을 고를 때 win_rate나 sharpe가 아니라 S/A/B/C 종합 등급으로 한눈에 비교할 수 있다."

- composite_score 0~100 + quality_grade 표시
- n_trades_paper, win_rate_paper, sharpe_paper 세부 수치 확인 가능
- 마지막 파이프라인 실행 기준 (generated_at 표시)

### US-02 — ML 확률 기반 신호 강도 표시
> "같은 패턴이라도 이번 신호는 실제 모델이 77% 확률로 예측했고, 다른 건 fallback 0.6이다는 걸 알 수 있다."

- opportunity scan 결과에 model_source (registry/fallback) + predicted_prob 표시
- registry 모델이 없는 패턴은 fallback 마킹

### US-03 — Verdict 누적 → 개인화 순위
> "BTC 4h 압축돌파에 valid를 여러 번 눌렀더니 그 컨텍스트 패턴이 위로 올라온다."

- verdict 5건 이상 시 context-tag(symbol/timeframe/intent)별 weight 활성
- invalid 패턴은 강하게 아래로

### US-04 — Sector/MTF 필터
> "강한 섹터에 속하고 MTF가 정렬된 패턴만 보고 싶다."

- QuickPanel SECTOR 필터 탭
- SingleAssetBoard sector 배지

---

## 4. 제외 (Non-Goals)

| 제외 | 이유 |
|---|---|
| 글로벌 모델 재학습 UI | 수동 /train 트리거 유지 |
| Cross-user collaborative filtering | Wave 5 범위 초과 |
| A/B test traffic split | rollout_state 정의만, split 구현 별도 |
| 실시간 composite_score 스트리밍 | 파이프라인 배치 기준 |
| 3개 초과 심볼 ML 모델 | 현재 ML 모델 scope 그대로 |

---

## 5. 성공 지표

| 지표 | 목표 |
|---|---|
| composite_score 기반 패턴 노출 비율 | 100% (pipeline 실행 후) |
| ML inference 활성 패턴 비율 | ≥ 80% (active model 보유 패턴 기준) |
| Verdict 개인화 활성 사용자 비율 | 첫 10명 중 5명 verdict ≥ 5건 달성 |
| API latency (top-patterns cache hit) | p50 < 50ms |
