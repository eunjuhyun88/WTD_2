---
tier: core
decided_at: 2026-04-27T03:10:00
id: dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin
linked_incidents: []
recorded_at: 2026-04-27T03:10:00
source: manual
status: accepted
tags: ["architecture", "validation", "mm-microstructure", "hunter-framing", "f-60-gate", "phase-machine", "wyckoff", "avellaneda-stoikov"]
title: W-0214 MM Hunter Core Theory & Validation — D1~D8 lock-in
type: decision
valid_from: 2026-04-27T03:10:00
valid_to: null
related_docs:
  - work/active/W-0214-mm-hunter-core-theory-and-validation.md
  - work/active/W-0214-session-checkpoint-2026-04-27.md
  - work/active/W-0213-mm-microstructure-validation-design.md
  - ../w0220-prd-master/work/active/W-0220-product-prd-master.md
---
# W-0214 MM Hunter Core Theory & Validation — D1~D8 lock-in

## What

W-0214 design doc v1.3 lock-in: 8 design decisions confirmed for "MM Pattern Hunting OS" framing of Cogochi/WTD product. Replaces previous "Pattern Research OS" vision while preserving 163 built code assets.

## Why

PRD W-0220 v2.2 ("Pattern Research OS")와 W-0213 ("MM Microstructure Validation")이 분리된 두 갈래로 운영되어 같은 PatternObject에 대해 verdict accuracy vs phase-conditional return 충돌 시 우선순위 미정. F-60 gate threshold 0.55 통계 근거 부재. 53 PatternObject 중 phase-conditional return t-stat 통과 비율 미측정 [unknown] 상태로 marketplace publish 위험.

옵션 4 (User-as-Hunter) 명제로 통합: "유저가 MM 행동 가설을 PatternObject로 외화 → microstructure 통계 검증 → refinement → marketplace". 갈래 A/B 모두 이 명제의 timing 변형으로 일관됨.

## How

### D1~D8 결정 결과

| ID | 질문 | 결정 |
|---|---|---|
| D1 | Hunter framing lock-in (PRD vision 변경)? | **YES** — 옵션 4 명제 채택 |
| D2 | Forward return horizon? | **4h primary, 1h+24h 보조** |
| D3 | Cost model? | **15 bps round-trip** (Binance perp: 10 fee + 5 slippage) |
| D4 | P0 패턴 수? | **5개 측정 + 나머지 48개 보존** (삭제 X, NULL 상태) |
| D5 | F-60 marketplace gate? | **Layer A AND Layer B 둘 다** (objective + subjective) |
| D6 | P0 일정? | **9주** (기존 7주 + V-00 audit + V-13 decay 2주 추가) |
| D7 | Hunter UI 노출 범위? | **전체 공개** — DSR, BH p-value, drop_pct 등 raw 수치 모두 + Glossary toggle |
| D8 | Phase taxonomy? | **둘 다 측정, default Wyckoff** (5-phase OI Reversal + 4-phase ACCUMULATION/DISTRIBUTION/BREAKOUT/RETEST) |

### 학술 grounding (Reading list)

- BSM 1973 (공통 GBM/σ² 뿌리)
- Kyle 1985 (informed flow → price impact)
- Glosten-Milgrom 1985 (adverse selection → spread)
- Easley-Kiefer-O'Hara VPIN 2002 (flow toxicity)
- Avellaneda-Stoikov 2008 ⭐ (HFT 교과서, optimal MM)
- Tishby IB 1995 (M2 ablation 정당화)
- Lopez de Prado 2018 (Purged K-Fold CV + Embargo)
- Harvey-Liu 2015 (multiple testing haircut)
- Bailey-Lopez de Prado 2014 (Deflated Sharpe Ratio)

### Validation framework (4 metrics × 4 baselines × 8 gates)

- M1 phase-conditional return / M2 ablation / M3 sequence / M4 regime
- B0 random time / B1 buy&hold / B2 phase 0 / B3 phase k-1
- G1 BH p<0.05 / G2 cost-adjusted / G3 ablation / G4 sequence / G5 DSR / G6 CV / G7 regime / G8 verdict

### WVPL Mechanism (NSM connection)

```
L1 G1~G7 통과 → L2 search corpus filter → L3 precision ↑ → L4 capture rate ↑ → L5 verdict rate / WVPL ↑
```

### 새 work items (V-00 ~ V-13)

V-00 pattern_search.py audit (P0, 1d) / V-01 PurgedKFold / V-02 phase_eval / V-03 ablation / V-04 sequence / V-05 regime / V-06 stats / V-07 SQL view / V-08 pipeline / V-09 weekly job / V-10 hunter UI / V-11 F-60 gate / V-12 threshold audit / V-13 decay monitoring

## Outcome

**Status:** Accepted, locked-in 2026-04-27. Week 1 V-00 작업 (engine/research/pattern_search.py 3283줄 audit + library audit γ) 즉시 시작 가능.

**Falsifiable kill criteria:**
- F1: 53 PatternObject 중 t-stat ≥ 2.0 (BH-corrected) 통과 비율 = 0% → 시스템 재설계
- F2: Verdict accuracy와 forward return correlation < 0.2 → evidence type 분리 운영
- F3: 유저당 PatternObject 생성 < 1개/30일 → hunter persona 검증
- F4: Personal Variant p > 0.1 → refinement loop 재설계

## Linked Incidents
(none)

## 절대 하지 말 것 (regression 방지)

- `engine/research/pattern_search.py` (3283줄) 재구현 → §5.0 augment-only 정책
- 53 PatternObject 삭제 → D4: NULL 상태 보존
- Hunter UI raw 수치 비공개 → D7: 전체 공개 결정
- Wyckoff/5-phase 둘 중 하나만 채택 → D8: 둘 다 측정
- 7주 P0 유지 시도 → D6: 9주 lock-in (V-00 + V-13 포함)

## Cross-references

- W-0214 v1.3: `work/active/W-0214-mm-hunter-core-theory-and-validation.md`
- 세션 체크포인트: `work/active/W-0214-session-checkpoint-2026-04-27.md`
- 이전 버전 (W-0213 rev 2): `work/active/W-0213-mm-microstructure-validation-design.md`
- PRD master (의존): `../w0220-prd-master/work/active/W-0220-product-prd-master.md`
- Telegram refs (Wyckoff canonical 출처): `../w0220-prd-master/work/active/W-0220-telegram-refs-analysis.md`
- 자기진단 보고서: `~/Downloads/W-0213-critique-2026-04-27.md`
