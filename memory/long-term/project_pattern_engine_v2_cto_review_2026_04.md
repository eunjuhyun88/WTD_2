---
name: Pattern Engine v2 CTO Review
description: Pattern Engine v2 CTO/AI-researcher 리뷰 — jovial-cori 머지 + 6가지 개선 (버그수정, min_bars, auto-verdict, parallel scan, EV 계산, pattern registration API)
type: project
---

## Pattern Engine v2 — CTO/AI Researcher 리뷰 결과 (2026-04-13)

### 머지

- `claude/jovial-cori` → main 머지 완료 (`d84e4c1`)
- 충돌 0건, DOUNI 파일 전부 보존
- 테스트 484 pass (기존 415 + 신규 69)

### v2 개선사항 (`7c97dc8`)

**Bug Fix:**
- `scanner.py:131` — `oi_change_1h`를 `oi_now`에 넣던 버그 수정
- `prewarm_perp_cache()` — offline scan 전 perp 데이터 fetch (cold-start fix)

**State Machine:**
- min_bars 강제 — ARCH_ZONE 4bar 미만이면 전이 불가
- confidence scoring — optional blocks 포함 시 confidence 증가
- feature_snapshot — 전이 시점 92-dim 벡터 저장

**Ledger:**
- `auto_evaluate_pending()` — 72h 후 Binance 가격으로 자동 HIT/MISS/EXPIRED
- Expected Value 계산 — success_rate × avg_gain + failure_rate × avg_loss
- BTC-conditional hit rates — bullish/bearish/sideways 분리
- Edge decay analysis — 전반/후반 비교

**Scanner:**
- 8-worker parallel 평가
- Data quality metrics (perp coverage)

**API:**
- `POST /patterns/register` — 사용자 정의 패턴 등록 (블록 이름 검증)
- `POST /patterns/{slug}/evaluate` — 자동 verdict 트리거

**테스트:** 488 pass (119 pattern/ledger 포함)

### 설계 문서

- `app/docs/PATTERN_ENGINE_FINAL_DESIGN.md` — 통합 설계 (worktree에만 존재, main에 미커밋)

### 다음 작업 (Sprint Plan)

1. **Sprint 0 남은 작업:** feature_calc.py OI/funding zero-stub 해제 (perp DataFrame 연결은 됐지만, 캐시가 없으면 여전히 zero)
2. **Sprint 1:** Save Setup UI (CaptureModal — candle click → challenge create)
3. **Sprint 2:** Result Ledger UI (verdict display, override buttons)
4. **Sprint 3:** Live scanner deployment + Telegram alerts
5. **Sprint 4:** AutoResearch ↔ Pattern 통합 (block threshold optimization)

### 데이터 파이프라인 확인 결과

| 항목 | 상태 |
|------|------|
| feature_calc → 블록 평가 | ✅ perp DataFrame 직접 전달 |
| Binance OI 히스토리 | ⚠️ 20일 제한 (API limit) |
| Funding rate | ✅ 333일 히스토리 |
| 캐시 prewarm | ✅ prewarm_perp_cache() 구현 |

### 두 시스템 관계 (확정)

- **Pattern Engine:** "무엇을 찾을 것인가" (패턴 정의 → phase 감지 → ledger 기록)
- **AutoResearch:** "어떤 파라미터가 최적인가" (weight optimization → LoRA fine-tuning)
- **통합 지점:** Pattern 감지 → AutoResearch가 threshold 최적화 → Ledger 기록 → LoRA 학습
