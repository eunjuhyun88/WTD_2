---
name: Founder Seeding 완료 (2026-04-21)
description: bulk_import로 8개 과거 TRADOOR/PTB 복기 케이스 엔진에 투입. outcome_resolver 대기 중.
type: project
---

8개 manual_hypothesis capture 투입 완료 (2026-04-21).

**Why:** flywheel axis 3 (Verdict Inbox)이 엔진/UI 모두 완성됐지만 데이터 0 상태. cold start용 founder seeding으로 학습 루프 시동.

**How to apply:** outcome_resolver가 hourly로 가격 조회 → win/loss 판정 → `/patterns` Verdict Inbox에 카드 나타남 → 창업자 VALID/MISSED/INVALID 레이블링 → ML axis 4 트리거 (50개 누적 시).

## 투입 데이터

| # | 심볼 | 패턴 | 날짜 | 결과 메모 |
|---|------|------|------|-----------|
| 1 | BTCUSDT | funding-flip-reversal-v1 | 2026-01-13 | 역프. 91K→96K +5.5% WIN |
| 2 | BTCUSDT | funding-flip-reversal-v1 | 2026-03-02 | 역프 2차. 상승 확인 WIN |
| 3 | BTCUSDT | funding-flip-reversal-v1 | 2026-03-05 | 역프 3차. 진입 불가. 결과 미기록 |
| 4 | KOMAOUSDT | funding-flip-reversal-v1 | 2026-03-23 | funding -0.00056 → +21.5% WIN |
| 5 | PUFFERUSDT | whale-accumulation-reversal-v1 | 2026-04-04 | 숏스퀴즈 발동 WIN |
| 6 | ETCUSDT | whale-accumulation-reversal-v1 | 2026-04-08 | 숏스퀴즈 진입 |
| 7 | BTCUSDT | tradoor-oi-reversal-v1 | 2025-11-01 | TRADOOR 레퍼런스 1차 (추정) |
| 8 | BTCUSDT | tradoor-oi-reversal-v1 | 2025-12-10 | TRADOOR 레퍼런스 2차 (추정) |

## 상태

- 현재: `pending_outcome` (8개)
- 스크립트: `engine/scripts/founder_seed.py`
- outcome_resolver 수동 트리거: `POST http://localhost:8000/jobs/outcome_resolver/run` (미확인, 확인 필요)
- 50개 누적 목표 → ML refinement 자동 트리거

## 다음 액션

- outcome_resolver 다음 틱 후 `/patterns` Verdict Inbox 확인
- 더 많은 케이스 추가 시 `founder_seed.py`의 ROWS 리스트에 append 후 재실행
