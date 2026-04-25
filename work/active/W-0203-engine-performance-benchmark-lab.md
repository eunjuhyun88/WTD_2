# W-0203 — Engine Performance Benchmark Lab

## Goal

검색 시스템의 품질을 측정하고, 개선이 실제로 효과가 있었는지 기록하는 벤치마크 운영 체계를 구축한다.

## Owner

research

## Primary Change Type

Research or eval change

---

## 설계 결정 (2026-04-25)

### 우리가 풀고 있는 문제

```
Given: 지금 이 시장 상태 (symbol, timeframe, bar_ts)
Find:  과거에 이것과 비슷했던 순간들
Ask:   그때 거래했으면 어떻게 됐나?
```

고전적인 retrieval + ranking 문제.
핵심 질문: **"좋은 검색 결과"란 무엇인가? 어떻게 측정할 것인가?**

---

### 현재 검색 파이프라인

```
쿼리 → [Stage 1] boolean flag filter  → 후보 풀 (수천 개)
      → [Stage 2] weighted L1 (39-dim) → top-K 정렬
      → [Stage 3] phase path bonus     → 최종 순위
      → [Stage 4] LambdaRank           → 미구현 (verdict 50개 이하일 때 불필요)
```

### 근본 문제 3가지

| # | 문제 | 현재 상태 |
|---|------|-----------|
| 1 | 코퍼스가 비어있음 | 197행 (BTCUSDT 1h 8일분) |
| 2 | 검색 품질 측정 방법 없음 | 개선됐는지 나빠졌는지 알 수 없음 |
| 3 | Ground truth 정의 없음 | verdict는 있지만 search quality와 연결 안됨 |

---

## 설계 결정 3개

### 결정 1: 코퍼스 목표 크기

```
107 symbols × 3 timeframes (15m/1h/4h) × 90일
= 1h 기준 약 690,000 windows
= 15m 포함 시 약 2.7M windows

첫 번째 유용한 검색을 위한 최소값: 50,000+ windows
```

**실행**: `python -m research.feature_windows_builder --all --tf 15m,1h,4h --since-days 90`
**쓰기 대상**: `get_all_feature_window_stores()` → SQLite(로컬) + Supabase(GCP) 동시 쓰기

### 결정 2: 검색 품질 메트릭 4단계

```
Level 0 (오늘):   Corpus coverage — row count
Level 1 (다음):   Retrieval recall — 쿼리 패턴과 같은 family가 top-K에 있는가?
Level 2 (나중):   Precision@K — top-K 중 positive verdict 비율
Level 3 (미래):   nDCG — verdict strength로 weighted ranking 품질
```

W-0203은 **Level 0 → Level 1** 측정 프로토콜을 정의한다.

### 결정 3: 첫 번째 baseline = TRADOOR on 1h

```
이유:
- TRADOOR는 실제 benchmark_packs/ 존재
- 1h는 데이터가 가장 풍부
- 4-phase 구조로 phase path similarity 테스트 가능
- PTB(Pump-Then-Breakout)와 함께 패턴 쌍 비교 가능
```

---

## Benchmark Ladder (L0 → L4)

| Level | 이름 | 설명 | 도구 |
|-------|------|------|------|
| L0 | Corpus health | row count, timeframe coverage, freshness | `store.count()`, `coverage()` |
| L1 | Retrieval smoke | 알려진 패턴 쿼리 → top-K에 같은 family 있는가? | `candidate_search.py` |
| L2 | Ranking quality | top-K 중 positive verdict 비율, verdict 있을 때 | `quality_ledger.py` |
| L3 | Regression gate | 최적화 전후 top-K 집합이 degraded되지 않았는가? | A/B comparison report |
| L4 | Shadow runtime | 실제 scan 결과와 비교 | live scan snapshot |

---

## Improvement Hypothesis Card 포맷

새 최적화를 시도하기 전 반드시 작성:

```markdown
## Hypothesis: [제목]

**What**: 무엇을 바꾸는가
**Why**: 어떤 메트릭이 개선될 것으로 예상하는가
**Baseline**: 현재 측정값 (L0-L2 기준)
**Expected**: 변경 후 예상값
**Guardrail**: 이 값이 나빠지면 roll back (regression)
**Result**: (실행 후 채움)
**Decision**: accept / reject / shadow
```

---

## Scope

- `docs/domains/engine-performance-benchmark-lab.md` 신규 작성 (이 설계의 공식 문서화)
- `engine/research/experiments/2026-04-25-tradoor-1h-baseline/` — 첫 번째 baseline 실험 기록
- Benchmark Ladder, metric family, hypothesis card, comparison report 스키마 정의

## Non-Goals

- benchmark runner 자동화 구현
- engine 최적화 구현
- production monitoring dashboard
- app UI reporting

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0203-engine-performance-benchmark-lab.md` (이 파일)
- `docs/domains/engine-performance-benchmark-lab.md` (생성 예정)
- `engine/research/feature_windows_builder.py`
- `engine/research/candidate_search.py`
- `engine/research/similarity_ranker.py`

## Facts

1. 코퍼스 현황: BTCUSDT 1h 197행만 존재 (2026-04-25 기준)
2. 로컬 data_cache: 107 symbols 보유
3. `get_all_feature_window_stores()` → SQLite + Supabase 동시 쓰기 지원
4. TRADOOR benchmark_packs/ 존재 → 첫 baseline 실험 가능
5. Stage 4 (LambdaRank)는 verdict 50개+ 이후에 유효

## Assumptions

1. 50K+ rows면 /search/similar가 의미 있는 결과를 반환할 것
2. Level 1 recall 측정은 replay 없이 family slug 비교만으로 가능
3. Baseline 기록 포맷은 JSON file → 이후 Supabase sync

## Open Questions

- Corpus rebuild 빈도: 매일? 12시간마다?
- 15m timeframe의 노이즈가 너무 높아서 precision을 낮추지는 않을까?
- Stage 1 boolean filter가 너무 tight하면 recall 자체가 0이 되는 edge case?

## Decisions

- 메트릭 family 2개 분리: quality performance / systems performance
- 모든 최적화는 hypothesis card + baseline run + candidate run + 결정 기록 필수
- 첫 번째 benchmark track: TRADOOR/PTB 1h Stage 1+2

## Next Steps

1. **Phase A**: `feature_windows_builder --all` 실행 → Supabase 50K+ rows 달성
2. **Phase B**: `docs/domains/engine-performance-benchmark-lab.md` 작성
3. **Phase C**: `engine/research/experiments/2026-04-25-tradoor-1h-baseline/` 생성 + baseline 기록

## Exit Criteria

- `docs/domains/engine-performance-benchmark-lab.md` 존재
- Supabase FeatureWindowStore: 50K+ rows, 3개 이상 symbol coverage
- TRADOOR 1h baseline experiment 기록 완료
- CURRENT.md에 W-0203 완료 표기

## Handoff Checklist

- active work item: `work/active/W-0203-engine-performance-benchmark-lab.md`
- active branch: `claude/arch-improvements-0425`
- verification: docs + experiment file review; no engine tests required
- remaining blockers: corpus build 실행 필요 (Phase A)
