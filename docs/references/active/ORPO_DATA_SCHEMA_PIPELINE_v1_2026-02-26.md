# ORPO Data Schema and Pair Generation Pipeline v1

작성일: 2026-02-26
대상 리포지토리: `/Users/ej/Downloads/maxidoge-clones/backend`

## 1) Scope and Goal

이 문서는 ORPO를 실전 트레이딩 의사결정 품질 개선에 맞게 운영하기 위한 **데이터 스키마 + chosen/rejected 생성 파이프라인**을 정의한다.

목표:

1. 같은 컨텍스트에서 더 나은 의사결정을 선택하는 선호 학습(ORPO) 품질을 안정화
2. P0 리스크 규칙 위반 제안을 학습 데이터에서 구조적으로 제거
3. Offline/Shadow/Canary 지표와 직접 연결되는 재현 가능한 데이터 버전 체계 구축

비목표:

1. "가격 방향 예측 정확도"만 최적화하지 않는다.
2. 프롬프트만으로 리스크 제어하지 않는다. 리스크 규칙은 서버 게이트로 강제한다.

## 2) Existing Asset Mapping (Current Code/DB)

현재 저장소에는 ORPO 기본 원장이 이미 존재한다.

- `decision_trajectories` (source event -> decision -> outcome)
- `ml_dataset_versions` (dataset versioning)
- `ml_preference_pairs` (prompt/chosen/rejected/margin)
- `ml_train_jobs`, `ml_eval_reports`

관련 구현:

- `src/lib/server/passportMlPipeline.ts`
- `db/migrations/0006_passport_ml_pipeline.sql`

핵심 결론: 이번 설계는 기존 테이블을 재사용하며, 필요한 확장만 "권장 확장"으로 제시한다.

## 3) Data Contract (SSOT)

ORPO 품질을 위해 prompt/chosen/rejected를 자유 텍스트가 아니라 **구조화 JSON 계약**으로 고정한다.

### 3.1 ORPO Prompt Contract

`ml_preference_pairs.prompt` 권장 구조:

```json
{
  "schemaVersion": "orpo-prompt-v1",
  "traceId": "<trace_id>",
  "asOf": "2026-02-26T03:30:00Z",
  "market": {
    "pair": "BTC/USDT",
    "timeframe": "4h",
    "price": 94000,
    "regime": "trend|range|high_vol"
  },
  "zone": {
    "primary": "UPTREND_CORRECTION",
    "modifiers": ["CROWDED_LONG", "HIGH_VOLATILITY"],
    "ambiguityScore": 31,
    "riskLevel": "medium"
  },
  "mtf": {
    "1H": { "bias": "long", "confidence": 62, "rsi14": 58.1, "emaTrend": "bullish" },
    "4H": { "bias": "long", "confidence": 68, "rsi14": 54.3, "emaTrend": "bullish" },
    "1D": { "bias": "neutral", "confidence": 51, "rsi14": 49.9, "emaTrend": "flat" },
    "1W": { "bias": "long", "confidence": 57, "rsi14": 52.2, "emaTrend": "bullish" },
    "1M": { "bias": "long", "confidence": 64, "rsi14": 55.0, "emaTrend": "bullish" }
  },
  "entryScore": {
    "total": 71,
    "zoneAlignment": 19,
    "frameworkConsensus": 24,
    "riskReward": 14,
    "liquidityStructure": 14
  },
  "riskGate": {
    "p0Blocked": false,
    "violations": [],
    "rr": 2.1
  },
  "skills": {
    "computeEntryScore": "ok",
    "checkP0Rules": "ok",
    "buildRrLevels": "ok",
    "detectConflict": "warning"
  },
  "constraints": {
    "maxLeverage": 3,
    "maxPositionPct": 8,
    "mustSetStop": true,
    "noPredictionClaim": true
  }
}
```

### 3.2 ORPO Response Contract (chosen/rejected)

`ml_preference_pairs.chosen` / `rejected` 권장 구조:

```json
{
  "schemaVersion": "orpo-response-v1",
  "decision": {
    "bias": "long|short|wait",
    "confidence": 0.0,
    "entryPlan": { "type": "zone|breakout|pullback", "levels": ["..."] },
    "riskPlan": { "slBps": 120, "maxPositionPct": 8, "invalidations": ["..."] },
    "tpPlan": [{ "tpBps": 180, "sizePct": 40 }]
  },
  "explanation": {
    "whatChanged": "...",
    "why": ["근거1", "근거2", "근거3"],
    "nowWhat": "...",
    "risk": "..."
  },
  "policy": {
    "p0Compliant": true,
    "ruleViolations": []
  }
}
```

## 4) Pair Builder Pipeline

### 4.1 End-to-End Stages

1. **Trajectory Ingestion**
- source: `passport_event_outbox` -> `decision_trajectories`
- 요구 조건: `context_features`, `decision_features`, `outcome_features`, `utility_score`

2. **Normalization**
- 스키마 표준화(`orpo-prompt-v1`, `orpo-response-v1`)
- 누락 필드 보정 (`missing_fields` 기록)

3. **Candidate Pooling**
- 같은 `pair/timeframe/zone_primary/regime` 군집에서 후보 추출
- 최근성 윈도우(예: 30일) + 최소 표본(예: 군집당 50)

4. **Hard Negative Mining**
- rejected는 단순 랜덤 금지
- 동일/유사 컨텍스트에서 아래를 우선:
  - P0 위반 결정
  - 높은 confidence 대비 낮은 utility
  - 높은 drawdown / risk violation

5. **Pair Scoring and Quality Gate**
- `margin_score = utility(chosen) - utility(rejected)`
- 임계값 미만 pair 제거
- 품질 라벨(high/medium/low) 부여

6. **Dedup + Leakage Guard**
- prompt hash 기반 near-duplicate 제거
- 미래 정보 포함 여부 검사
- 동일 trace 과다 반복 pair 제한

7. **Versioning + Persist**
- `ml_dataset_versions` 생성
- `ml_preference_pairs` 배치 insert
- quality report 저장

8. **Export for Trainer**
- JSONL export: `{prompt, chosen, rejected, metadata}`

### 4.2 Utility Function (Policy)

권장 함수:

`utility = pnl_bps - 1.5 * max_drawdown_bps - 2.0 * rule_violation_count + 0.6 * direction_hit - 0.3 * slippage_bps`

추가 페널티:

- `p0_violation`: `-100` (사실상 rejected 고정)
- `overconfidence_penalty`: `-abs(confidence - realized_quality) * 20`

### 4.3 Pair Quality Rule

- `high`: `margin_score >= 30` and 둘 다 데이터 completeness >= 0.95
- `medium`: `15 <= margin_score < 30`
- `low`: `5 <= margin_score < 15` (학습 샘플 비중 제한 20% 이하)
- `< 5`: discard

## 5) Context/Skill/Prompt Engineering Integration

### 5.1 Skill-First Principle

LLM이 계산하지 않도록 핵심 계산을 skill/function으로 고정한다.

필수 skill:

1. `compute_entry_score`
2. `check_p0_rules`
3. `build_rr_levels`
4. `detect_conflict`
5. `summarize_mtf_context`

ORPO 학습에는 "skill output"이 prompt에 포함되어야 한다.

### 5.2 Prompt Contract (Training/Inference 공통)

출력 계약:

1. `BIAS`
2. `CONFIDENCE`
3. `WHAT_CHANGED`
4. `NOW_WHAT`
5. `INVALIDATION`
6. `RISK`

금지:

1. 미래 확정 표현("무조건 오른다")
2. P0 위반 진입 제안
3. stop-loss 없는 제안

### 5.3 Fine-tuning Order

1. SFT로 형식/정책 준수 학습
2. ORPO로 선호 정렬
3. 필요 시 retrain에서 최신 레짐 데이터 반영

## 6) Dataset Split and Balance

권장 분할:

- train 80% / val 10% / test 10%
- 시간 누수 방지: test는 항상 최신 구간

균형 규칙:

- symbol 상한: 한 심볼 35% 초과 금지
- timeframe 균형: 1H/4H/1D/1W/1M 최소 비중 유지
- 레짐 균형: trend/range/high_vol 각 20% 이상

## 7) Recommended Table Extensions (Optional but Strongly Recommended)

기존 테이블 유지 + 아래 컬럼 확장 권장.

`ml_preference_pairs`:

1. `prompt_hash text`
2. `chosen_utility numeric(12,4)`
3. `rejected_utility numeric(12,4)`
4. `p0_violation_chosen boolean`
5. `p0_violation_rejected boolean`
6. `regime text`
7. `timeframe text`

`decision_trajectories`:

1. `schema_version text`
2. `feature_completeness numeric(5,4)`
3. `risk_violation_count int`

## 8) Builder Pseudocode

```ts
function buildOrpoPairs(windowStart: Date, windowEnd: Date) {
  const trajectories = loadTrajectories(windowStart, windowEnd);
  const normalized = normalizeContracts(trajectories); // prompt v1 / response v1
  const clustered = clusterByContext(normalized); // pair,timeframe,zone,regime

  const pairs = [];
  for (const group of clustered) {
    const candidates = rankByUtility(group);
    for (const chosen of candidates.top) {
      const rejected = mineHardNegative(chosen, group);
      if (!rejected) continue;

      const margin = chosen.utility - rejected.utility;
      if (margin < 5) continue;
      if (!leakageSafe(chosen, rejected)) continue;

      pairs.push({
        prompt: chosen.prompt,
        chosen: chosen.response,
        rejected: rejected.response,
        marginScore: margin,
        pairQuality: toPairQuality(margin)
      });
    }
  }

  const deduped = dedupeByPromptHash(pairs);
  const report = buildQualityReport(deduped);
  const datasetVersionId = createDatasetVersion('orpo', report, deduped.length, windowStart, windowEnd);
  insertPreferencePairs(datasetVersionId, deduped);
  exportJsonl(datasetVersionId, deduped);
}
```

## 9) Evaluation Gate (Before Deploy)

ORPO 모델 배포 전 필수 게이트:

1. P0 violation rate 감소
2. Risk-adjusted return(Sharpe) 개선
3. MDD 악화 금지
4. Overconfidence error 감소
5. Output contract 준수율 >= 99%

Shadow 1주, Canary 10~20% 이후 full rollout.

## 10) Implementation Map for This Repo

권장 신규 모듈 경로:

1. `src/lib/server/orpo/contextContract.ts` (JSON contract validator)
2. `src/lib/server/orpo/utilityScore.ts` (utility 계산)
3. `src/lib/server/orpo/pairBuilder.ts` (chosen/rejected 생성)
4. `src/lib/server/orpo/exportJsonl.ts` (학습 입력 파일 생성)
5. `src/routes/api/profile/passport/learning/datasets/build/+server.ts` (dataset 빌드 API)

기존 연동 포인트:

- `src/lib/server/passportMlPipeline.ts`
- `db/migrations/0006_passport_ml_pipeline.sql`

## 11) Rollout Plan

1. v1: ORPO builder dry-run (DB write 없이 품질 리포트만)
2. v2: DB write + dataset version 생성
3. v3: Train job 연동 (`train_type='orpo'`)
4. v4: Offline/Shadow 자동 평가 + fail-closed 배포

---

이 문서는 ORPO를 "프롬프트 감"이 아니라 "데이터/정책 계약" 기반으로 운영하기 위한 기준 문서다.
