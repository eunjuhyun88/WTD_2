---
name: W-0091 funding-flip-reversal-v1 완료
description: funding-flip-reversal-v1 두 번째 패턴 promote_candidate 달성 (2026-04-19)
type: project
---

W-0091 완료 (2026-04-19, main 9ada5e8): funding-flip-reversal-v1 두 번째 패턴

**Why:** TRADOOR 단일 패턴 의존 탈피 증명. 펀딩 극단 음수 → 플립 → 숏 스퀴즈 메커니즘.

**How to apply:** 두 번째 패턴 작업 시 이 파일을 참고. live_monitor에 이미 반영됨.

## 결과

- variant: `funding-flip-reversal-v1__canonical__dur-long`
- reference_score=0.820, holdout_score=0.807, overall=0.816
- promote_candidate ✅, 762 tests green

## 벤치마크 팩 (4케이스)

| 심볼 | 역할 | 수익 | 비고 |
|------|------|------|------|
| DYMUSDT | reference | +26.0% | funding_rate -0.00338 (Apr-09) |
| ORDIUSDT | holdout | +3.0% | COMPRESSION→FLIP→SQUEEZE |
| STRKUSDT | holdout | +2.9% | COMPRESSION→FLIP→SQUEEZE |
| KOMAUSDT | holdout | +21.5% | funding <-0.00056 Mar23 → Apr5 |

## 텔레그램 분석에서 도출한 강화

채널: 나혼자매매-차트&온체인 (11,661 메시지, 2021-2026)
- ALPHA TERMINAL S0→S3 신호체계가 패턴 5-phase와 동일 구조
- `cvd_buying` alias 추가 → ENTRY_ZONE soft block (weight=0.08)
- KOMA 역프(Mar23) → +21.5% 실사례 → holdout 케이스 등록

## CTO 실사이클 증명 (2026-04-19 추가)

ORDI: +318% (Apr14 COMPRESSION → Apr17 peak 10.71)
AIXBT: +41% (Apr8 극단 → Apr15 플립 → Apr17 피크)
SHORT_OVERHEAT 타입B 발견: 스퀴즈 도중 역방향 숏 → 가속 신호
라이브 사이클: ANIME(ENTRY_ZONE 대기), PEPE(SHORT_OVERHEAT)
문서: work/active/W-0091-cto-research-cycle-proof.md

## 파일 변경

- `engine/patterns/library.py`: ENTRY_ZONE cvd_buying soft block
- `engine/scoring/block_evaluator.py`: cvd_buying alias
- `engine/scoring/ensemble.py`: cvd_buying category
- `engine/research/live_monitor.py`: variant slug 업데이트
- benchmark pack: KOMA holdout 추가
