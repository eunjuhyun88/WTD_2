# Intel Trading Decision Policy (v3)

작성일: 2026-02-25  
대상: `/terminal` 우측 Intel 패널 (Headlines / Events / Flow / Trending / Positions)

변경 이력:
- v1: 기본 목적, 4축 Gate, 보수적 No-Trade 정의
- v2: 패널별 WHY 중심 정책 강화
- v3: 정량 스코어링, 다단계 의사결정 엔진, 백테스트/피드백 루프를 운영 기준으로 고정

## 1) 목적 정의 (v3)

Intel은 "정보 나열"이 아니라 하나의 목적만 가진다.

- 목적: **다음 30~120분 트레이드에서 Long / Short / Wait 결정을 돕는 것**

v3 추가 정의:
- 의사결정 범위: 단기 스캘핑/스윙(30~120분)
- Long: 상승 기대 구간 엔트리/홀드
- Short: 하락 기대 구간 엔트리/홀드
- Wait: 신호 충돌/커버리지 부족/고변동 상태에서 보류

트레이딩 도움 KPI(월간):
- 승률 개선: +7%p 이상
- Sharpe 개선: +0.2 이상
- 최대 낙폭 감소: 15%p 이상
- 사용자 긍정 피드백(NPS Positive): 80% 이상

검증:
- 과거 12개월 백테스트 (월 1회)
- 실시간 A/B (v3 vs v2)
- 앱 내 피드백 수집(도움 여부)

## 2) 데이터 표시 자격 (Quality Gate v3)

모든 Intel 데이터는 5축 점수(0~100)로 평가한다.

1. Actionability
- 공식: `행동유형수 * 20 + 명확성(0~40)`
- 컷: 70

2. Timeliness
- 공식: `((120 - 지연분) / 120) * 100`
- 컷: 65

3. Reliability
- 공식: `소스 신뢰도 - 실패율 + 조작리스크 보정(low +20 / medium 0 / high -20)`
- 컷: 75

4. Relevance
- 공식: `페어 키워드 매칭% + 타임프레임 보너스(+20)`
- 컷: 75

5. Helpfulness
- 공식: `백테스트 승률개선*10 + 피드백긍정%*0.5 + 적용률*0.1 + PnL 보정`
- 컷: 70
- 하드 컷: 50 미만이면 강제 숨김

가중합:
- Actionability 0.25
- Timeliness 0.15
- Reliability 0.25
- Relevance 0.15
- Helpfulness 0.20

판정:
- 축별 최소컷 실패: `hidden`
- 최소컷 통과 + 가중합 75 미만: `low_impact` (회색 표시)
- 최소컷 통과 + 가중합 75 이상: `full`

운영:
- 점수 재계산 캐시 TTL: 5분
- 미통과 로그: `src/lib/intel/gateLogs.ts`

## 3) 패널별 역할/규칙 (v3)

공통:
- 패널당 최대 카드: 5
- 정렬: 가중합 점수 내림차순
- 카드 필드: `What / So What / Now What / Why / Help Score / Visual Aid`

### 3.1 Headlines
- 목적: 촉매 신호
- 규칙:
  - 임팩트 예측 >= 60%
  - 중복 유사도 필터
  - 페어 매칭 우선
- WHY 예시: "유사 헤드라인 후 30분 변동성 확대"

### 3.2 Events
- 목적: 타이밍 리스크 관리
- 규칙:
  - `T-xxm`/`T+xxm` 표시
  - 역사적 임팩트 10% 미만 이벤트 축소
  - 페어 연동 우선순위 반영
- WHY 예시: "이벤트 직전 유동성 축소 가능"

### 3.3 Flow
- 목적: 단기 압력 식별
- 규칙:
  - 이상치 기준: Z-Score >= 2.5
  - 노이즈 제거 후 방향 태그 부여
- WHY 예시: "Funding/청산 쏠림으로 하방 압력"

### 3.4 Trending / Picks
- 목적: 후보군 우선순위
- 규칙:
  - 스코어 분해: Momentum 40 / Volume 30 / Social 20 / Onchain 10
  - Pump 패턴 감지 시 페널티
  - 상단 노출 시 Why Top 태그 필수
- WHY 예시: "거래량 + 소셜 동시 강화"

### 3.5 Positions
- 목적: 보유 포지션 조정
- 규칙:
  - 상태: `SYNCED / ERROR / PENDING`
  - PnL 경보 임계값: 7%
  - 외부 포지션 폴링: 30초
- WHY 예시: "pending 해소 전 신규 리스크 확대 금지"

## 4) 최종 의사결정 엔진 (v3)

단계:
1. 증거 수집
2. 도메인 가중합
3. 충돌 패널티
4. Helpfulness 오버레이
5. No-Trade 규칙
6. Long / Short / Wait 출력

도메인 가중치:
- Derivatives 0.24
- Flow 0.21
- Events 0.19
- Headlines 0.13
- Positions 0.13
- Trending 0.10

충돌 규칙:
- `|Long-Short|` 리드 비율이 25% 미만이면 충돌로 판단
- 신뢰 페널티 40% 적용
- Wait prior 0.6을 가중

No-Trade 강제 조건:
- 커버리지 < 85%
- 백테스트 승률 < 58%
- 변동성 지수 > 50
- 순에지(abs edge) < 8

출력:
- Long/Short: 에지와 근거 3개
- Wait: 블로커 목록 명시

## 5) Intel 카드 출력 표준

모든 카드 구조:
- What: 관측 사실
- So What: 시장 해석
- Now What: 실행 행동
- Why: 근거
- Help Score: 0~100 + 근거 문장
- Visual Aid: 아이콘/미니 차트 식별자

예시:
- What: Funding +0.035%, Long 청산 급증
- So What: 롱 과밀, 하방 변동성 확대
- Now What: 신규 Long 보류, 반등 Short 관찰
- Why: 쏠림 해소 전 하방 압력 지속 가능성
- Help Score: 85
- Visual Aid: `bearish-arrow`

## 6) 운영 원칙

- 상태 분리: loading/error/empty/stale
- 실패 보수성: 핵심 소스 실패 시 Wait
- 관측 가능성: freshness/pending/coverage 로그 및 메트릭
- 백테스트 자동화: 일일 배치 + 월간 리포트
- 피드백 루프: 점수식/임계값 튜닝
- 정책 버전: semver + changelog

## 7) 구현 SSOT (이 저장소)

핵심 파일:
- `config/intelThresholds.json`
- `src/lib/intel/thresholds.ts`
- `src/lib/intel/qualityGate.ts`
- `src/lib/intel/helpfulnessEvaluator.ts`
- `src/lib/intel/decisionEngine.ts`
- `src/lib/intel/gateLogs.ts`
- `src/lib/intel/decisionPolicy.ts`

핵심 API:
- `evaluateQualityGate(...)`
- `evaluateQualityGateFromFeatures(...)`
- `computeIntelDecision(...)`
- `evaluateHelpfulness(...)`
- `patchIntelThresholds(...)`

요약:
Intel v3는 "보여주기"보다 "결정 정확도"를 우선한다.  
표시와 결정을 분리하지 않고 같은 수치 체계(Quality Gate + Decision Engine)로 통합 운영한다.
