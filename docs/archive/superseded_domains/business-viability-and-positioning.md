# Business Viability and Positioning

## Purpose

이 문서는 WTD v2 의 사업적 정체성과 사업화 게이트를 canonical 하게 정의한다. 제품 결정과 work item 우선순위는 본 문서를 참조한다.

## Product Identity

WTD v2 는 다음 두 카테고리에 동시에 위치한다.

1. **Tesla-style labeling flywheel for crypto perp trading** — 트레이더의 `Save Setup` 수동 라벨이 훈련 데이터로 누적되어 패턴 탐지 품질을 compounding 으로 개선한다.
2. **Bloomberg-style chart-first terminal for crypto perp** — 좌측 선택, 중앙 차트, 우측 판정 구조의 워크벤치. TradingView + Binance + CryptoQuant 의 강점을 OI/펀딩 인지 phase 모델 위에서 결합한다.

명시적으로 다음이 아니다.

- "AI 시그널 판매" 카테고리 아님 (블랙박스 시그널 SaaS 와 차별)
- "백테스트 툴" 카테고리 아님 (실시간 phase 추적이 본질)
- "투자 자문" 카테고리 아님 (regulatory boundary)

## Wedge

기존 플레이어들이 비워둔 단일 영역:

| 경쟁자 | 보유 | 미보유 |
|---|---|---|
| TradingView | chart-first UX, 드로잉 | pattern flywheel, OI/펀딩 통합 |
| Coinglass | OI/펀딩 데이터 | 패턴 프레임워크, 학습 루프 |
| CryptoQuant / Glassnode | 온체인 데이터 | 패턴 탐지, perp 통합 |
| AI signal SaaS | 자동 알림 | 투명성, 재현 가능성, 사용자 라벨 회수 |

WTD v2 wedge: chart-first 터미널 + 구조화된 패턴 캡처 + OI/펀딩 인지 phase 모델 + 사용자 라벨 회수 플라이휠.

## Moat Design

핵심 해자는 모델이 아니라 데이터와 방법론이다.

1. **사용자 Save Setup 라벨**: 자체 수집 불가능한 trader intent 라벨이 누적된다.
2. **Reject 포함 reproducible report**: 실패한 가설을 영구 URL 로 발행하여 외부 검증 가능성을 신뢰 자산으로 전환한다.
3. **5-phase state model**: `FAKE_DUMP / ARCH_ZONE / REAL_DUMP / ACCUMULATION / BREAKOUT` — 실매매에서 검증된 분류 체계.

## Business Gate

다음 6개 KPI 가 모두 양수가 되기 전까지 사업화 작업은 동결된다.

1. `captures_per_day_7d > 0`
2. `captures_to_outcome_rate > 0.9`
3. `outcomes_to_verdict_rate > 0.5`
4. `verdicts_to_refinement_count_7d > 0`
5. `active_models_per_pattern[tradoor-oi-reversal-v1] >= 1`
6. `promotion_gate_pass_rate_30d > 0`

이 게이트의 의미: 플라이휠이 실제로 닫혔다는 관측 증거. 게이트 전 GTM/가격/마케팅 작업은 무의미하다.

설계 폐곡선은 `docs/product/flywheel-closure-design.md` 참조.

## Cold-Start Strategy

플라이휠은 라벨 0 에서 시작하므로 다음 두 lane 을 제품 일부로 둔다.

1. **Founder bulk import**: 창업자가 본인 매매 노트를 CSV 로 일괄 입력. 출시 전 500 capture 시드 목표.
2. **Public reproducible reports**: 매 refinement run 결과를 reject 포함 공개 URL 로 발행. 콘텐츠 + 신뢰 + 라벨러 유입의 단일 채널.

## Pricing Tier Plan (게이트 통과 후 활성화)

| Tier | 월가 | 대상 | 가치 |
|---|---|---|---|
| FREE | 0 | 모든 유저 | 통과한 패턴 실시간 phase tracking, 공개 backtest |
| PRO | $49-99 | 액티브 퍼프 트레이더 | Save Setup 개인 패턴 학습/검증 루프 |
| DESK | $2k-10k | 팀 / 프롭 | 공유, API 접근, custom benchmark pack |

수익 모델 결정:

- 성과 수수료 모델 금지 (regulatory + 트랙레코드 부재)
- Affiliate / paid ads 금지 (positioning 충돌)
- 배급 채널은 콘텐츠 only (공개 report + 깃허브)

## Scenario Matrix

게이트 통과 후 사업 경로:

| 시나리오 | 조건 | 우선순위 |
|---|---|---|
| Research Transparency Lab | 게이트 통과 + 공개 report 매주 발행 | 1순위 |
| Pro Terminal | UX 차별화 충분, edge 검증 부분만 필요 | 2순위 |
| B2B Research License | 헤지펀드 / 프롭 납품, generalization 증명 필수 | 3순위 |

게이트 미통과 시 fallback:

| 시나리오 | 조건 |
|---|---|
| Methodology / 콘텐츠 판매 | 5-phase 모델 + FDR/promotion gate 방법론 자체를 콘텐츠화 |
| 자기 매매 (제품화 보류) | edge 가 검증되면 직접 트레이딩이 최고 수익 경로 |

## Feature Freeze List (게이트 통과 전 동결)

다음은 본 문서 기준 동결 대상이다. 게이트 통과 후 해제한다.

- Mobile 추가 개선 (W-0087)
- Cogochi personality 확장 (W-0067 등)
- RAG 서버 라우트 (W-0084)
- Personalization UX
- Karpathy skills install (W-0045)
- Memkraft memory integration (W-0026)
- 다수 contract boundary 정리 (트래픽 발생 후 처리)

이유: flywheel 이 닫히지 않으면 위 작업들이 만들어내는 표면적이 모두 비용으로만 작용한다.

## Decisions

- 제품 카테고리는 "AI 시그널" 이 아니라 "labeling flywheel + chart-first 터미널" 이다.
- 사업화는 6-KPI 게이트 통과를 단일 조건으로 한다.
- Cold-start 는 founder bulk import + 공개 report 두 lane 으로 해결한다.
- 성과 수수료 / 페이드 광고 / 인플루언서는 사용하지 않는다.
- 게이트 통과 전 모든 비-flywheel 작업은 동결한다.

## References

- `docs/product/core-loop.md` — 의도된 학습 루프 정의
- `docs/product/flywheel-closure-design.md` — 폐곡선 코드 설계
- `docs/decisions/ADR-007-work-item-wip-discipline.md` — work item 운영 규율
