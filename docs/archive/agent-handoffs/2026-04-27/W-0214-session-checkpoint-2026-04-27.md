# W-0214 Session Checkpoint — 2026-04-27

**Session date:** 2026-04-27
**Worktree:** upbeat-hodgkin
**Outcome:** D1~D8 lock-in 완료. W-0214 v1.3 finalized. Week 1 V-00 작업 시작 가능.

---

## 1. 이 세션에서 일어난 일

### 1.1 시작점
- 사용자가 SFP (Sparse Feature Preservation) project 분석 요청 → microstructure pattern matching 시스템에 적용 가능성 탐색
- Tip 직후 "MM 행동 패턴 발견 + 학습"이 진짜 목표라는 framing 정정
- 프로젝트의 코어 문서 (01_PATTERN_OBJECT_MODEL, 03_SEARCH_ENGINE, 09_RERANKER) 정독 → phase machine 시스템의 정확한 정체 파악

### 1.2 핵심 발견
1. **갈래 A (Pattern Research OS, PRD v4.0/W-0220)와 갈래 B (MM Microstructure Validation)는 옵션 4 (User-as-Hunter)의 timing 변형** — 본질은 같음
2. 너 시스템은 **Avellaneda-Stoikov 2008 + Kyle 1985 + EKO VPIN 2002**의 reverse engineering 도구
3. **검증 갭**: retrieval quality (NDCG)는 검증되지만 **pattern correctness** (directional_belief 라벨이 통계적으로 옳은가)는 검증 안 됨

### 1.3 산출물 (생성된 문서)

| 문서 | 위치 | 길이 | 상태 |
|---|---|---|---|
| W-0213 (validation framework, original) | `work/active/W-0213-mm-microstructure-validation-design.md` | 1100+줄 | rev 2 (BSM 추가) |
| W-0214 v1.0 (CTO 작성) | (사용자가 paste) | — | superseded |
| W-0214 v1.1 (사용자 patch) | (사용자가 paste) | — | superseded |
| **W-0214 v1.3 (final)** | `work/active/W-0214-mm-hunter-core-theory-and-validation.md` | 1100+줄 | **LOCKED-IN** |
| W-0213 critique (자기진단) | `~/Downloads/W-0213-critique-2026-04-27.md` | 200+줄 | reference |

---

## 2. D1~D8 Lock-in 결과

| ID | 질문 | 결정 |
|---|---|---|
| D1 | Hunter framing lock-in? (PRD vision 변경) | **YES, 옵션 4 명제 채택** |
| D2 | Forward horizon? | **4h primary, 1h+24h 보조** |
| D3 | Cost model? | **15 bps (10 fee + 5 slippage)** |
| D4 | P0 패턴 수? | **5개 측정 + 나머지 48개 보존 (삭제 X)** |
| D5 | F-60 gate? | **Layer A AND Layer B 둘 다** |
| D6 | P0 일정? | **9주 (7주 → 9주)** |
| D7 | Hunter UI 노출? | **전체 공개 — raw 수치 포함** + Glossary toggle |
| D8 | Phase taxonomy? | **둘 다 측정, default Wyckoff** |

---

## 3. W-0214 핵심 내용 요약

### 3.1 한 줄 명제
> **Cogochi는 retail crypto perp 트레이더가 자신의 MM 행동 가설을 PatternObject로 외화하고, microstructure 데이터(Avellaneda-Stoikov 2008 + Easley VPIN 2012 + Tishby IB 1995 매핑)와 통계 검증(Lopez de Prado purged CV + Harvey-Liu BH correction + decay monitoring)으로 falsifiable하게 검증·정련하는 인프라다. 검증된 패턴은 WVPL chain (§1.5)을 통해 NSM에 직접 기여한다.**

### 3.2 Falsifiable Kill Criteria (F1~F4)
- F1: 53 PatternObject 중 phase-conditional t-stat ≥ 2.0 통과 비율 = 0%
- F2: Verdict accuracy와 forward return t-stat correlation < 0.2
- F3: 유저당 평균 PatternObject 생성 < 1개 / 30일
- F4: Personal Variant 효과 통계적 무의미 (p > 0.1)

### 3.3 학술 grounding
- BSM 1973 (공통 GBM/σ² 뿌리)
- Kyle 1985, Glosten-Milgrom 1985, Easley VPIN 2012
- Avellaneda-Stoikov 2008 (HFT 교과서)
- Tishby IB 1995 (M2 ablation 정당화)
- Lopez de Prado 2018 (Purged K-Fold CV)
- Harvey-Liu 2015, Bailey-Lopez de Prado 2014 (multiple testing + DSR)

### 3.4 4 Metrics × 4 Baselines × 8 Gates
- M1 phase-conditional return / M2 ablation / M3 sequence / M4 regime
- B0 random time / B1 buy&hold / B2 phase 0 / B3 phase k-1
- G1 BH p / G2 cost / G3 ablation / G4 sequence / G5 DSR / G6 CV / G7 regime / G8 verdict

### 3.5 WVPL Mechanism (5-link chain)
```
L1 (G1~G7 통과) → L2 (search corpus filter) → L3 (precision) → L4 (capture rate) → L5 (verdict rate / WVPL)
```

---

## 4. Week 1 작업 예정 (즉시 시작 가능)

### Day 1
- **V-00**: `engine/research/pattern_search.py` 3283줄 audit (1일)
  - 함수 inventory 작성
  - validation/* wrapping 가능 매핑
  - 재구현 금지 리스트
  - W-0214 §14 Appendix B 채움
- 동시: γ library audit — 53 PatternObject 중 production hit > 0인 top 5 선정

### Day 2
- V-01: `engine/research/validation/cv.py` PurgedKFold + Embargo (Lopez de Prado 2018)
- V-06: `engine/research/validation/stats.py` (Welch + bootstrap CI + BH/BHY + DSR)
- V-07: SQL view + migration

### Day 3-4
- V-02: `engine/research/validation/phase_eval.py` (M1) — pattern_search.hypothesis_test wrapping
- V-08: `engine/research/validation/pipeline.py` 전체 결합 + JSON dashboard

### Day 5
- 5개 P0 PatternObject 측정 1회
- dashboard JSON 생성
- **Decision gate**: F1 falsified? (5개 모두 t-stat < 2.0?)

---

## 5. Week 2-9 Roadmap

| Week | 주요 작업 |
|---|---|
| W1 | 검증 backbone 구축 + V-00 audit + 첫 측정 |
| W2 | V-03 ablation + V-13 decay infra + V-12 threshold audit |
| W3-W7 | 기존 W-0220 P0 (A-03/A-04/D-03/F-02/F-2/F-3/F-4/F-5) — Hunter framing 하 |
| W8 | V-11 F-60 layer A+B + V-10 Hunter dashboard UI (전체 공개 + Glossary) |
| W9 | 통합 테스트 + WVPL chain 측정 + launch prep |

---

## 6. Open Questions (검증 후 답할 것)

1. 53 PatternObject 중 G1~G7 통과 비율은 몇 %? — Week 1 결정
2. Forward horizon 1h vs 4h vs 24h 중 most informative? — Week 1 측정
3. Threshold (oi_zscore 2.0 등) 데이터 fit인가 감인가? — Week 2 V-12 audit
4. Z-score window 정책? — Week 2 sensitivity test
5. Personal Variant 통계적 유의성? — Week 6+
6. Verdict accuracy ↔ forward return correlation? — Week 8+
7. Hunter persona TAM? — 별도 user research
8. Pattern decay rate? — V-13 6개월 후 측정
9. Cross-pattern interaction? — verdict 1k+ 후
10. arxiv 2512.12924 / 2602.00776 실제 존재 여부? — Week 1 검색

---

## 7. Risk Register (요약)

| Risk | Likelihood | Mitigation |
|---|---|---|
| F1 falsified (0% 통과) | [unknown] | Week 1 즉시 발견, 가설 재설계 |
| pattern_search.py 재구현 | High [§5.0] | augment-only 정책 + V-00 audit + PR review |
| Multiple testing penalty | High | P0 5개로 hypothesis 축소 (5×5×3 = 75) |
| Cost가 alpha 잠식 | Medium | G2 cost 차감 강제 |
| BSM GBM 가정 위반 | High [factual] | bootstrap CI, parametric test 보완 |
| Pattern decay 미감지 | Medium | §3.8 + V-13 weekly job |

---

## 8. 참고 문서 (cross-reference)

### 본 worktree
- `work/active/W-0214-mm-hunter-core-theory-and-validation.md` v1.3 — **본 작업의 산출물**
- `work/active/W-0213-mm-microstructure-validation-design.md` rev 2 — 이전 버전
- `work/active/CURRENT.md` — 갱신 필요
- `docs/design/01_PATTERN_OBJECT_MODEL.md` — Phase machine 정의
- `docs/design/03_SEARCH_ENGINE.md` — 4-stage retrieval pipeline
- `docs/design/09_RERANKER_TRAINING_SPEC.md` — LightGBM lambdarank

### w0220-prd-master worktree
- `work/active/W-0220-product-prd-master.md` v2.2 — Product PRD master (163 built / 9 NOT BUILT)
- `work/active/W-0220-telegram-refs-analysis.md` — 4채널 broadcasting 분석 (Wyckoff canonical 출처)
- `memory/live-notes/prd-master.md` — F-60 gate 정의

### Downloads (외부 백업)
- `~/Downloads/W-0213-mm-microstructure-validation-design.md`
- `~/Downloads/W-0213-critique-2026-04-27.md`
- `~/Downloads/W-0214-v1.2-mm-hunter-core-theory-and-validation.md`
- `~/Downloads/W-0214-v1.3-mm-hunter-core-theory-and-validation.md` (이번 세션 마지막에 추가)

### 외부 (Reading list)
- arxiv 0807.2243 (Avellaneda-Stoikov 2008)
- Lopez de Prado 2018 (book ch7)
- Harvey-Liu 2015 (Backtesting)
- arxiv 2512.12924 / 2602.00776 [unknown — 검증 필요]

---

## 9. 다음 세션을 위한 Handoff

다음 agent / 다음 세션이 이 작업을 이어받을 때:

### 즉시 읽어야 할 파일 (3개)
1. **본 체크포인트 (W-0214-session-checkpoint-2026-04-27.md)** — 무엇이 결정됐는가
2. **W-0214 v1.3 (work/active/)** — 설계 본체
3. **CURRENT.md** — 현재 active work item 상태

### Week 1 V-00 작업 시작 절차
```
1. 본 체크포인트 §4 "Week 1 작업 예정" 읽기
2. engine/research/pattern_search.py 전체 read (3283줄)
3. 함수 inventory 작성 → W-0214 §14 Appendix B에 통합
4. validation/* 모듈에서 wrapping 가능 함수 매핑 표
5. V-01 (PurgedKFold) 코드 작성 시작
```

### 절대 하지 말 것
- pattern_search.py 함수 재구현 (§5.0 정책)
- 53 PatternObject 삭제 (D4 결정 — NULL 상태 보존)
- D7과 다른 UI 스펙 (전체 공개 원칙)
- Wyckoff/5-phase 둘 중 하나만 채택 (D8 — 둘 다 측정)

---

**End of W-0214 Session Checkpoint 2026-04-27.**
