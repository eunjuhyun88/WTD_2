---
name: Charter Frozen — W-0132 Copy Trading 무효화 (2026-04-27)
description: 메모리상 P0/P1로 기록된 W-0132 카피트레이딩은 spec/CHARTER.md §Frozen으로 이동. 진행 금지.
type: project
originSessionId: c182c7f5-f804-4c0c-a153-8eb67ad8ed6c
---
## 사실

`spec/CHARTER.md` §Non-Goals (2026-04-27 시점) — **Frozen 항목**:

- ❌ AI 차트 분석 툴 / TradingView 대체 / 범용 스크리너
- ❌ **대중형 소셜/카피트레이딩** (`copy.trad`, `copy_trading`, `leaderboard`, `subscription` 류)
- ❌ 초보자용 "AI가 알려주는 매매"
- ❌ 자동매매 실행 (Phase 2+ 별도 레인)
- ❌ TradingView feature parity
- ❌ 신규 MemKraft 대체/확장 시스템

## Why

CTO 리뷰 결과 vision pivot: "Pattern Research OS" (단일 페르소나 Jin, 28-38세 perp 전업/반전업). Copy trading은 retail mass-market 방향이라 ICP 충돌. `spec/PRIORITIES.md` §13 Frozen에 명시.

## How to apply

다음 메모리 entry는 **outdated** — 무시:
- `project_w0145_complete_20260426.md` "다음: W-0132(copy trading P1)"
- `project_agent6_session_20260426.md` "다음: W-0132(copy trading P1)"
- `project_session_20260426_final.md` "다음: ... W-0132(copy trading P1)"
- `project_next_design_20260426.md` "W-0132 + W-0145 실행 계획"
- `project_copy_trading_prd_2026_04_22.md` PRD 자체 (Frozen)

## 보충 (2026-04-28, 사용자 결정 — A065 세션)

**기존 머지된 Copy Trading 코드는 main에 보존 허용**:
- `engine/copy_trading/` (3 modules, 176 LOC) — `leader_score.py`, `leaderboard.py`, `__init__.py`
- `app/src/routes/api/copy-trading/leaderboard/+server.ts`
- `app/src/routes/api/copy-trading/subscribe/+server.ts` + `[id]/`
- `app/supabase/migrations/022_copy_trading_phase1.sql` (`trader_profiles` + `copy_subscriptions`)
- 머지 commit `99e2197c feat(W-0132): copy trading Phase 1 — leaderboard + subscription MVP`

**해석**: CHARTER §Frozen은 **신규 작업 금지**일 뿐, 기존 머지된 코드의 강제 삭제는 요구하지 않음.
- ❌ Copy Trading 신규 기능 추가 (subscription tier, marketplace 등) — 여전히 frozen
- ✅ 기존 코드 보존 / 버그 수정 / 보안 패치 — 허용
- ✅ CI 통과 위한 minor 정정 — 허용

향후 frozen 위반 검사 시 "Copy Trading 코드 존재" = 위반 아님으로 판단.

`copy_trading`, `leader_score`, `leaderboard`, `subscription` 키워드 작업 요청 시 **즉시 중단** + Frozen 사실 안내. 사용자 명시적 unfreeze 결정 전에는 진행 금지.

현재 P0 (2026-04-27):
- **W-0215** `engine/research/pattern_search.py:3283줄` V-00 audit (augment-only)
- **F-02-fix** verdict label 정합 (`missed→near_miss`, `unclear→too_early`) — LightGBM 라벨 노이즈 차단

## 보충 (2026-04-28, 사용자 결정 — A074 세션, PR #543)

W-0132 copy trading 정책은 **유지**. 단 PRD v3에서 **Pattern Verification Lane (Paper Trading)** 을 별 surface로 신설하면서, paper trading의 정확한 분류를 사용자가 결정.

### 기존 정책 vs 사용자 결정

| 항목 | 기존 (~04-27) | 사용자 결정 (04-28) |
|---|---|---|
| Paper trading | "frozen" 모호 | 🟢 **검증 도구로 허용** (W-0281, PRD v3 § 0.3) |
| 실자금 자동매매 | ❌ Frozen | ❌ Frozen 그대로 |
| `engine/copy_trading/` 코드 | ❌ 수정/import 금지 | ❌ 수정/import 금지 그대로 |
| `engine/verification/` (신규) | (미정) | ✅ 별 surface 신설 — paper executor + signal card + backtest 재사용 |
| Marketplace (`N-05`) | Frozen | 🟡 paper-verified 게이트 추가 시 검토 가능 (별 lane) |

### ✅ 허용 (PRD v3 § 0.3 + W-0281 lane)

- `engine/verification/` 신규 모듈 — paper executor / signal card builder / backtest 호출
- `app/routes/paper/` 신규 surface — UI 카드 / 시뮬 결과 / paper portfolio
- `engine/backtest/` 재사용 (9 파일 BUILT — simulator/portfolio/metrics/calibration)
- Paper P&L 라벨을 refinement 학습 입력으로 export (V-PV-06)
- 슬리피지/수수료 시뮬 모델 (고정 bps + maker/taker)

### ❌ 여전히 금지

- 실자금 주문 처리 / 거래소 API key 입력 폼 / 키 DB 저장
- `engine/copy_trading/` 디렉토리 코드 수정·import
- 자동 라우팅 (paper → 실자금 promote 자동화)
- 사용자 간 paper 시그널 직접 공유/구독 (marketplace 본체는 별 lane)
- "AI가 알려주는 매매" 초보자용 자동 실행 (CHARTER §Non-Goals 그대로)

### CI 가드 (W-0282 / V-PV-01 PR 시점 추가 필요)

```yaml
# .github/workflows/ 또는 contract-ci 확장
- name: Frozen W-0132 isolation check
  run: |
    if git diff --name-only origin/main..HEAD | xargs grep -l "from engine.copy_trading\|import.*copy_trading" 2>/dev/null; then
      echo "❌ Frozen W-0132 copy_trading import 발견"
      exit 1
    fi
```

### 정책 출처

- **CHARTER 본문**: `spec/CHARTER.md` §Frozen "Pattern Verification Lane 예외 (PRD v3, 2026-04-28)" 절
- **PRD master**: `docs/live/W-0220-product-prd-master.md` § 0.3.2 "Minara와의 차이 + Frozen 격리 원칙"
- **PRD canonical**: `docs/live/PRD.md` § 5b
- **Work item**: `work/completed/W-0281-pattern-verification-lane.md` (Non-Goals 절)
- **승인 PR**: #543 (squash → main `d6c81ad7`, 2026-04-28T00:27:40Z)
