# H1 병렬 검증 스포 캐스터디 — Cogochi Per-User LoRA

> **목적:** H1 "유저 피드백 20개 → LoRA 파인튜닝 1회 → 적중률 +5%p"를 최단 시간에 판정.
> **원칙:** 단일 접근 순차 실행 ❌. 여러 접근 병렬 실행 ✅. 각 접근 독립적으로 판정 가능.
> **판정 시한:** 2주 (실측) vs 순차면 6~8주 걸림.
> **작성:** 2026-04-18

---

## 0. Problem → Solution 순서

### 0.1 문제

H1이 Cogochi 전체 사업의 linchpin이다.
- 성공: 제품/투자자 스토리 전체가 성립
- 실패: 제품 재설계, 시장조사 UX 문서 무효, 프로토콜 레이어 의미 없음

**그런데 H1이 나올지 모른다.** 학술 선행 연구(OPPU, Per-Pcs)는 **언어 태스크**이고, 크립토 트레이딩 패턴 인식에서 per-user LoRA가 20개 피드백만으로 +5%p 나올지 누구도 모름.

### 0.2 왜 병렬 검증인가

**순차 실행의 함정:**
1. Qwen2.5-1.5B + KTO만 돌림 → 실패
2. "하이퍼파라미터 탓인가?" 재시도 → 실패
3. "데이터 탓인가?" FIXED_SCENARIOS 재생성 → 실패
4. "모델 크기 탓인가?" Qwen2.5-3B로 바꿈 → 실패
5. 6~8주 지남. 결론 불확실.

**병렬 실행:**
- 4개 접근 동시 실행
- 2주 후 비교 분석
- 어느 하나라도 +5%p 나오면 → **그 조합이 왜 됐나 분석** → 제품 빌드 시작
- 전부 실패하면 → **+5%p가 불가능하다는 더 강한 증거** → 빠른 피봇 결정

### 0.3 Non-Goals

- **Production 코드 만들기** — 이건 검증용 스크립트. 버려도 됨
- **Best adapter 찾기** — 어느 접근이든 +5%p 넘으면 판정 완료
- **미세 튜닝** — 2주 안에 끝나야 함. 하이퍼파라미터 그리드 서치 금지

---

## 1. 병렬 검증 4개 축

순차 실행 시 하나씩 바꿀 것들을 **동시에** 돌리기.

### 1.1 Axis A: Fine-tuning 방법론

| 접근 | 데이터 요구 | 근거 |
|---|---|---|
| **A1: KTO** (기본) | good/bad 단독 라벨 | Scanner ✓/✗ 직접 사용, pair 불필요 |
| **A2: ORPO** | chosen/rejected pair | 기존 코드 `build_orpo_pair()` 있음 |
| **A3: DPO** | chosen/rejected pair + ref model | 더 많은 데이터 필요하지만 안정적 |
| **A4: SFT + LoRA baseline** | good만 사용 | 가장 단순, baseline으로 |

**병렬 실행:** 4개 동시 돌림. 같은 FIXED_SCENARIOS / 같은 base model.

### 1.2 Axis B: Base 모델 크기

| 접근 | 파라미터 | 비용/런 | 근거 |
|---|---|---|---|
| **B1: Qwen2.5-1.5B** (기본) | 1.5B | $0.07 | CLAUDE_1.md 계획 |
| **B2: Qwen2.5-0.5B** | 0.5B | $0.03 | 작으면 오히려 과적합 방지 가능 |
| **B3: Qwen2.5-3B** | 3B | $0.14 | 크면 +5%p 쉬울 수도 |

**병렬 실행:** A1 (KTO)만으로 B1/B2/B3 3개 동시. 총 A × B = 12 조합 중 **4개 우선 + 3개 sub = 7 런**.

### 1.3 Axis C: 피드백 양

| 접근 | 피드백 수 | 근거 |
|---|---|---|
| **C1: 10개** | 10 | 현실적 유저 행동 (느긋이 피드백) |
| **C2: 20개** (기본) | 20 | H1 목표 |
| **C3: 50개** | 50 | 데이터 충분하면 쉽게 나오나? |

**목적:** "20개가 최소 충분량인가?" 증명. 50개로도 안 되면 접근 실패.

### 1.4 Axis D: 평가 FIXED_SCENARIOS 품질

| 접근 | 구성 | 근거 |
|---|---|---|
| **D1: TRAIN 160 / VAL 40 (4 regime strata)** | 기본 설계 | CLAUDE_1.md 계획 |
| **D2: VAL만 80개 (regime 비균등)** | 현실 시뮬 | 유저는 강세장에 패턴 배움 |
| **D3: OOS (out-of-sample) VAL 40** | 학습 시점 이후 데이터 | Leak 방지 극대화 |

**목적:** +5%p가 나와도 "leak 때문 아닌가?" 의심 제거.

---

## 2. 실행 매트릭스

### 2.1 Tier 1 (필수, 2주)

| ID | 방법론 | 모델 | 피드백 | VAL | 우선순위 | 런 비용 |
|---|---|---|---|---|---|---|
| R1 | KTO | Qwen2.5-1.5B | 20 | D1 | P0 | $0.07 |
| R2 | ORPO | Qwen2.5-1.5B | 20 | D1 | P0 | $0.07 |
| R3 | DPO | Qwen2.5-1.5B | 20 | D1 | P0 | $0.07 |
| R4 | SFT | Qwen2.5-1.5B | 20 | D1 | P0 | $0.05 |
| R5 | KTO | Qwen2.5-0.5B | 20 | D1 | P1 | $0.03 |
| R6 | KTO | Qwen2.5-3B | 20 | D1 | P1 | $0.14 |
| R7 | KTO | Qwen2.5-1.5B | 50 | D1 | P0 | $0.10 |

**총 비용:** $0.53. Computalot 무료 크레딧으로 충분.

### 2.2 Tier 2 (조건부, R1~R7 결과 보고 결정)

- **만약 어느 하나 +5%p 나옴:** 그 조합의 robustness 테스트 (D2, D3 eval)
- **만약 전부 실패:** 
  - R8: KTO + Qwen2.5-7B (큰 모델, $0.35)
  - R9: 학습 epoch 증가 (2 → 5)
  - R10: LoRA rank 증가 (16 → 32)

### 2.3 Tier 3 (피봇 트리거)

Tier 1 + Tier 2 모두 실패 시:
- **R11: TinyLlama + KTO** — 다른 base model family 시도
- **결과 없음:** H1 **failed**. 제품 방향 재검토.

---

## 3. 실행 자동화

### 3.1 단일 런 스크립트

```python
# training/parallel_h1_runner.py
import argparse
from training.train_kto import train_kto
from training.train_orpo import train_orpo  
from training.train_dpo import train_dpo
from eval.evaluate import evaluate_adapter

def run_one_experiment(
    run_id: str,
    method: str,      # "kto" | "orpo" | "dpo" | "sft"
    base_model: str,  # "Qwen2.5-0.5B" | "Qwen2.5-1.5B" | "Qwen2.5-3B"
    n_feedback: int,  # 10 | 20 | 50
    val_scheme: str,  # "D1" | "D2" | "D3"
):
    print(f"[{run_id}] Start: {method}/{base_model}/n={n_feedback}/val={val_scheme}")
    
    # 1. 학습
    if method == "kto":
        adapter_path = train_kto(base_model, n_feedback)
    elif method == "orpo":
        adapter_path = train_orpo(base_model, n_feedback)
    # ... etc
    
    # 2. 평가
    baseline_hit = evaluate_adapter(base_model, None, val_scheme)
    adapter_hit = evaluate_adapter(base_model, adapter_path, val_scheme)
    delta = adapter_hit - baseline_hit
    
    # 3. 결과 기록
    result = {
        "run_id": run_id,
        "method": method,
        "base_model": base_model,
        "n_feedback": n_feedback,
        "val_scheme": val_scheme,
        "baseline_hit": baseline_hit,
        "adapter_hit": adapter_hit,
        "delta": delta,
        "pass": delta >= 0.05,
    }
    print(f"[{run_id}] {delta:+.1%} | {'PASS' if result['pass'] else 'FAIL'}")
    return result
```

### 3.2 병렬 실행

```bash
# Computalot job 7개 동시 제출
for run in R1 R2 R3 R4 R5 R6 R7; do
    python computalot_submit.py --config configs/${run}.yaml &
done
wait
```

### 3.3 결과 aggregator

```
results/
├── R1_kto_1.5b_20_D1.json
├── R2_orpo_1.5b_20_D1.json
├── ...
└── summary.md  # 자동 생성
```

```
# summary.md (자동)
| ID | Method | Model | N | Baseline | Adapter | Δ | Pass |
|----|--------|-------|---|----------|---------|---|------|
| R1 | KTO | 1.5B | 20 | 52.3% | 58.1% | +5.8% | ✓ |
| R2 | ORPO | 1.5B | 20 | 52.3% | 54.9% | +2.6% | ✗ |
| R3 | DPO | 1.5B | 20 | 52.3% | 53.2% | +0.9% | ✗ |
...

## Summary: 2/7 passed (+5%p)
## Best: R1 (KTO/1.5B/20) at +5.8%
```

---

## 4. 판정 규칙

### 4.1 Success 판정

**Tier 1 성공:** R1~R7 중 **최소 1개**가 +5%p 이상.
- **특별 성공:** R1 (기본 KTO/1.5B/20)이 성공. 계획대로 진행 가능.
- **수정 성공:** R2~R7 중 성공. 해당 조합을 기본으로 변경.

**강한 성공:** 2개 이상 조합이 +5%p. 재현성 높음.

**약한 성공:** 1개만 성공. 해당 조합이 robust한지 Tier 2 추가 검증.

### 4.2 Partial 판정

- **Near miss (+3~5%p):** 하이퍼파라미터 조정으로 가능성 있음. Tier 2로.
- **Marginal (+1~3%p):** 통계적으로 noise 수준. Data 재검토.

### 4.3 Failure 판정

**모두 +2%p 미만:** H1 failed.
- 원인 분석 4개:
  1. 패턴이 너무 복잡 (LLM이 학습 못 함)
  2. 피드백 20개가 정보량 부족
  3. FIXED_SCENARIOS가 너무 어려움
  4. LoRA 자체가 트레이딩 도메인에 안 맞음
- 각 원인별 Tier 2 실험으로 검증
- 전부 실패: H1 폐기, 제품 방향 재검토

### 4.4 판정 타임라인

```
D0  (Day 0): Tier 1 런 시작 (R1~R7 동시)
D1-D3:       Computalot job 완료 대기
D3-D5:       결과 aggregation + 1차 판정
D5-D10:      Tier 2 (조건부) 추가 실험
D10-D14:     최종 판정 + 문서화
```

**2주 안에 결론.** 순차 시 6~8주 걸리는 걸 2주로 압축.

---

## 5. 데이터 요구사항

### 5.1 Feedback data

**실제 유저 피드백이 없으니 시뮬레이션:**
- 과거 시장 데이터에서 FIXED_SCENARIOS 200개 생성
- 각 시나리오마다 "가상의 진(Jin) 유저가 ✓/✗를 어떻게 줬을까" 룰 기반으로 생성
- 룰: "bb_expansion + OI 누적이면 ✓, 펀딩비 과열이면 ✗" 같은 Jin 페르소나 규칙

**주의:** 이 룰이 너무 단순하면 LoRA가 쉽게 배움 → +5%p 나와도 진짜 유저로 재현 불가. **페르소나 룰을 복잡하게 만들어야 H1이 현실적으로 검증됨.**

### 5.2 FIXED_SCENARIOS 생성

```python
# data/scenarios.py
def generate_scenarios(n=200, regime_balanced=True):
    """
    FIXED_SCENARIOS 생성.
    - regime: bull / bear / chop / volatile
    - 각 regime당 50개 (균등)
    - 각 시나리오: OHLCV + 28 feature + ground-truth label (1H 후 +0.5% 이상이면 win)
    """
    ...
```

### 5.3 Persona rule

```python
# eval/jin_persona.py
def jin_label(scenario):
    """
    진 페르소나가 이 시나리오에 어떻게 반응할지 시뮬레이션.
    복잡한 룰로 만들어야 LoRA 학습 난이도 현실화.
    """
    if scenario["bb_expansion"] > 1.5 and scenario["oi_change_1h"] > 0.05:
        return "✓ good"
    elif scenario["funding_rate"] > 0.001 and scenario["cvd_state"] == "negative":
        return "✗ bad"
    # ... 10~15개 복합 룰
```

**Kill criteria of this eval:** 페르소나 룰이 너무 단순하면 R1이 +30%p 나올 수도. 현실감 없음. +5~10%p 범위에 baseline 나와야 룰이 적절.

---

## 6. 비용

| 항목 | 비용 |
|---|---|
| Tier 1 (R1~R7) | $0.53 |
| Tier 2 (조건부, R8~R10) | $0.75 (최대) |
| Tier 3 (조건부, R11) | $0.05 |
| FIXED_SCENARIOS 생성 (Binance API) | $0 (free tier) |
| 인력 (2주 × 1인) | $0 (본인) |
| **Total** | **~$1.50** |

**Computalot 무료 크레딧 활용 가능.** 실제 지출 $0 가능.

---

## 7. 성공 후 다음 단계

### 7.1 Tier 1에서 R1 성공

- R1 조합(KTO/1.5B/20)을 production 기본값으로
- CLAUDE_1.md 그대로 진행
- COGOCHI_REAL_PERSONALIZATION_UX.md 구현 시작

### 7.2 Tier 1에서 R1 외 성공

- 해당 조합으로 CLAUDE_1.md 기술 스택 수정
- 비용 재계산 (모델 크기 변화 시)

### 7.3 Tier 2에서 성공

- 해당 조합의 robustness 추가 검증 (D2, D3)
- 실제 유저 피드백 수집 단계로 진입

---

## 8. 실패 후 Fallback

### 8.1 "Feedback이 부족한 게 아니라 LoRA가 안 됨" 결론

**대안 기술:**
- **Prompt tuning** (더 작은 파라미터 space)
- **Prefix tuning**
- **In-context learning + few-shot** (context 개인화로 후퇴, GetAgent와 동급이지만 구현 간단)

### 8.2 "패턴 자체가 너무 복잡" 결론

**제품 방향 재검토:**
- Cogochi는 "개인화 AI" 포기
- "대신 유저가 만든 패턴을 24/7 스캔하는 도구"로 단순화 (Altrady + 자연어 UX)
- 경쟁자: Altrady, ChartScout. 가격 경쟁 심함.

### 8.3 H1 완전 실패

- CLAUDE_1.md Kill Criteria 발동
- COGOCHI_REAL_PERSONALIZATION_UX.md 무효
- 프로토콜 레이어 (COGOCHI_PROTOCOL_v0.3.md) 의미 희석
- 사업 전체 재검토 필요

---

## 9. Open Questions

1. **페르소나 룰을 얼마나 복잡하게 만들어야 현실적인가?** — [unknown]. R1 결과 보고 조정.
2. **Computalot 무료 크레딧이 7 런 커버 가능한가?** — 확인 필요. 대체: Together.ai 유료.
3. **FIXED_SCENARIOS 200개가 statistical power 충분한가?** — [estimate] 40개 VAL로 +5%p 탐지 시 p<0.05 가능
4. **baseline hit rate가 어떤 수준일까?** — [unknown]. 50% (random) 근처일 것으로 예상. 70% 넘으면 문제 (룰이 너무 쉬움)

---

## 10. 다음 세션 시작 지점

1. **R1~R7 config 파일 작성** — configs/R1.yaml, R2.yaml, ...
2. **jin_persona.py 룰 설계** — 10~15개 복합 룰, 적절한 baseline hit rate 확인
3. **FIXED_SCENARIOS 200개 생성** — data/scenarios.py 실행
4. **Computalot 7 job 동시 제출** — parallel_h1_runner.py 실행

**예상 시한:** 설계 ~ R1~R7 완료까지 2주. 판정 완료 3주차 말.

---

*— End of H1_PARALLEL_VERIFICATION_PLAN.md —*
