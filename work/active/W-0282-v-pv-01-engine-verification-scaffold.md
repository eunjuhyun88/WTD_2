# W-0282 — V-PV-01: engine/verification scaffold + paper_executor 인터페이스

> **부모 lane**: W-0281 Pattern Verification Lane (PR #543, work/completed/)
> **PRD**: `docs/live/W-0220-product-prd-master.md` § 0.3.5 V-PV-01
> **상태**: design lock-in. 구현 차단됨 (W-0254 H-07/H-08 머지 대기).
> **Base SHA**: `d6c81ad7` (origin/main, 2026-04-28)
> **저자**: A074 (relaxed-chatelet, 2026-04-28)

---

## Goal

Pattern Verification Lane (W-0281) Phase 1의 첫 piece — `engine/verification/` 모듈 scaffold와 paper_executor 인터페이스를 정의해서, 후속 V-PV-02 ~ V-PV-06이 의존할 수 있는 **계약 표면**을 확정한다. **재사용 우선**: `engine/backtest/` 9 파일을 import해서 portfolio/metrics/simulator 재활용.

---

## Owner

- **Engine**: TBD — 새 worktree `.claude/worktrees/feat-V-PV-01` 생성 후 assign
- **Reviewer**: CTO hat — Frozen 격리 위반 (`import.*copy_trading`) CI 가드 필수

---

## Scope

| 파일 | 변경 이유 |
|---|---|
| `engine/verification/__init__.py` (신규) | 모듈 entry point. `from .paper_executor import PaperExecutor` 등 export |
| `engine/verification/paper_executor.py` (신규) | `PaperExecutor` 인터페이스 (open/close 시뮬 + 슬리피지 + 수수료) |
| `engine/verification/signal_card.py` (신규) | `SignalCardSpec` dataclass + `build_from_pattern(PatternObject) -> SignalCardSpec` |
| `engine/verification/types.py` (신규) | 공통 타입: `SignalCardSpec`, `PaperPosition`, `PaperOutcome`, `VerificationLabel` |
| `engine/api/routes/verification.py` (신규) | `POST /verification/signal-card` route stub (V-PV-02에서 채움) |
| `engine/api/main.py` (수정) | router include 추가 |
| `engine/tests/test_verification_scaffold.py` (신규) | scaffold smoke 테스트 (3개) |
| **재사용 (수정 X)** | `engine/backtest/portfolio.py`, `engine/backtest/simulator.py`, `engine/backtest/metrics.py` import만 |

**예상 LOC**: ~300 신규 + ~50 main.py 수정. simulator/portfolio 재사용으로 신규 시뮬 엔진 코드 0.

---

## Non-Goals

| 금지 | 이유 |
|---|---|
| `engine/copy_trading/` import / 수정 | Frozen W-0132 격리 의무 (CHARTER §Frozen) |
| 실자금 주문 / 거래소 API key 입력 | CHARTER §Frozen 위반 |
| Paper executor 실제 구현 (체결 로직) | V-PV-04에서 처리. 본 work item은 인터페이스 정의만 |
| Signal card UI | V-PV-02 (별 work item) |
| Backtest engine 실제 호출 | V-PV-03에서 처리 |
| Frontend route (`app/routes/paper/`) | V-PV-02부터 시작 |

---

## Exit Criteria

수치 기준 포함 (PRD master § 0.3.7 + spec/PRIORITIES.md 기반):

- [ ] `engine/verification/__init__.py` import 성공 (`python -c "from engine.verification import PaperExecutor"`)
- [ ] `SignalCardSpec` dataclass에 entry / exit / stop / size_hint / pattern_id / archetype 필드 모두 정의
- [ ] `PaperExecutor.__init__` signature 확정 — slippage_bps (int, default 10), maker_fee (float, default 0.0002), taker_fee (float, default 0.0005), notional_default (int, default 1000)
- [ ] `POST /verification/signal-card` 200 응답 (stub은 400 + "not implemented"도 OK, 계약 응답 OK)
- [ ] `engine/tests/test_verification_scaffold.py` 3개 테스트 모두 PASS
- [ ] **CI 가드**: `import.*copy_trading` grep → 0 hit (CI에서 자동 차단)
- [ ] **신규 import 추가**: `engine/backtest/portfolio.py`, `simulator.py`, `metrics.py`만 사용 (Frozen 디렉터리 미접근)
- [ ] **Latency**: signal-card route p95 < **200ms** (PRD F-60 동급 기준)
- [ ] OpenAPI export 후 `app/src/lib/contracts/generated/engine-openapi.d.ts` 자동 동기화 통과 (Contract CI green)
- [ ] 머지 후 W-0282 → `work/completed/` 자동 이동 (`tools/complete_work_item.sh`)

---

## AI Researcher 리스크

### 훈련 데이터 영향

- **None** — V-PV-01은 인터페이스 정의 only. 학습 라벨 영향은 V-PV-04 (paper outcome 라벨 export) 단계에서 발생.
- 단, **타입 schema 호환성**: `SignalCardSpec`/`PaperOutcome`은 미래 LightGBM Layer C feature column으로 직접 매핑되므로, 필드명 변경 시 기존 53 PatternObject corpus retraining 필요. → 필드명은 V-PV-04 직전에 final lock-in.

### 통계적 유효성

- 본 work item은 데이터 수집 시작점이지 통계 검증 대상 아님.
- 단, `slippage_bps=10` 기본값의 통계적 근거: Bybit BTC/USDT perp 평균 슬리피지 measurement 부재 → V-PV-04 머지 후 30일 데이터로 calibration 필요. **Open Question PV-Q1**.

### 실데이터 검증 시나리오

- 53 PatternObject × 평균 archetype 5종 → SignalCardSpec 변환 출력 수: ~265건 (V-PV-02에서 측정).
- `engine/backtest/portfolio.py` 기존 메모리 footprint: 1 portfolio object ~5KB → 100 사용자 동시 paper portfolio 시 ~500KB (메모리 안전).
- **edge case**: PatternObject가 archetype 미정의 시 → V-PV-02 builder가 fallback (rule-based default) 처리. 본 scaffold는 None 허용.

---

## CTO 설계 결정

### 성능 (100명+ 동시 사용자 기준)

- **DB 쿼리**: scaffold 단계는 read-only (PatternObject 조회만). N+1 위험 없음.
- **Supabase**: 본 work item은 DB 접근 없음. V-PV-04 paper position 영속화 시점에 column-explicit select + limit 적용.
- **IN clause**: 미사용. V-PV-04 portfolio 조회 시 220 UUID 한계 의식해서 배치 100단위.
- **캐시**: signal_card.build_from_pattern은 PatternObject hash 기준 함수형 — 별도 캐시 불필요. V-PV-03 backtest는 5분 TTL (`engine/stats/engine.py` 패턴 재사용).
- **비동기**: paper_executor은 stateless dataclass interface. blocking I/O 없음. V-PV-04에서 `asyncio.to_thread()` 검토.

### 안정성

- **폴백**: scaffold 단계는 외부 의존 없음. V-PV-04부터 Supabase 장애 시 메모리 fallback 명시.
- **멱등성**: signal-card route는 read 계산 → 자연 멱등. V-PV-04 paper open은 `client_order_id` 기반 upsert (key는 V-PV-04에서 결정).
- **재시도**: 외부 API 호출 없음 (scaffold).
- **헬스체크**: `GET /verification/health` 추가 (router level, 200 OK).

### 보안

- **JWT**: `POST /verification/signal-card` 는 `requireAuth()` 적용 — 패턴 전략은 사용자별 자산.
- **RLS**: 본 work item은 신규 테이블 없음. V-PV-04부터 paper_position 테이블에 RLS 정책 명시.
- **민감값**: 거래소 API key 없음 (Frozen). slippage/fee 기본값은 코드 상수, env var 불필요.
- **입력 검증**: Pydantic schema `SignalCardRequest` (pattern_id: UUID, options: dict) 정의 후 strict validation.

### 유지보수성

- **계층 준수**: `engine/verification/`은 business logic, `app/routes/paper/`는 surface. 본 work item은 engine만.
- **계약**: 신규 route 추가 → `npm run contract:sync:engine-types` 실행 (CI 자동 검증).
- **테스트**: 3개 smoke 테스트 (import / dataclass / route stub).
- **롤백**: 신규 모듈만 → revert PR 충분. migration 없음.

---

## Facts

코드 실측 (2026-04-28, base SHA `d6c81ad7`):

- `engine/copy_trading/` 디렉토리 존재 (Frozen W-0132). `git ls-files engine/copy_trading | wc -l` → N개 파일. **격리 의무**.
- `engine/backtest/` 9 파일 BUILT — `simulator.py`, `portfolio.py`, `metrics.py`, `calibration.py`, `regime.py`, `audit.py`, `config.py`, `types.py`. **재사용 우선**.
- `engine/stats/engine.py` BUILT (PatternPerf dataclass, 5-min TTL) — paper P&L 누적 시 V-PV-04에서 재사용 가능.
- `engine/research/validation/` 디렉토리 존재 (W-0279 lane, phase_eval / cv) — 본 lane과 무관, 충돌 X.
- `engine/api/routes/` 24 routes BUILT (PRD master § 0.1 v2.1). `verification.py` 없음 → 신규.
- `engine/verification/` 미존재 → 신규 디렉토리.
- W-0254 H-07/H-08 활성 worktree 2개 (`feat-H08`, `W-0254-h07-h08`) — 충돌 회피 의무.

## Assumptions

- W-0254 H-07/H-08 PR이 머지된 후 V-PV-01 시작 — F-60 gate 인터페이스가 stable해야 paper-verified 시그널 게이트 추가 가능.
- `engine/backtest/` API가 v0.x stable — 본 work item이 backtest 9 파일에 의존하는 import 표면 변경 없음 (지난 30일 git log 확인 필요 시점).
- Bybit perp BTC/USDT가 default 시뮬 venue — 다른 거래소 추가는 V-PV-04+.
- Pydantic v2 / Python 3.11 (`engine/.venv` 기준).
- `npm run contract:sync:engine-types` 가 CI에서 자동 실행됨 (확인됨 — 본 PR #543 CI 통과).

## Open Questions

| # | 질문 | 영향 | 결정 권고 시점 |
|---|---|---|---|
| **VPV01-Q1** | `SignalCardSpec` 필드명 final 결정 — entry vs entry_price, stop vs stop_loss? | 학습 라벨 schema | V-PV-01 시작 시 사용자 결정 |
| **VPV01-Q2** | `PaperExecutor` 메모리 vs Supabase persistence — scaffold 단계는 in-memory만? | 영속성 | scaffold = in-memory, V-PV-04 = Supabase |
| **VPV01-Q3** | CI 가드 `import.*copy_trading` 차단 룰을 어디에 추가? `.github/workflows/` 새 파일? 기존 contract-ci 확장? | DevOps | V-PV-01 PR 시점 사용자 결정 |
| **VPV01-Q4** | `engine/backtest/` 재사용 시 portfolio class를 inherit vs composition? | 아키텍처 | composition 권고 (느슨한 결합) |
| **VPV01-Q5** | `POST /verification/signal-card` 200 vs 202 (async) — V-PV-02 UI 연동 시 latency? | API 계약 | 200 sync (계산 단순, p95 < 200ms 기대) |

PRD master § 0.3.6 의 PV-Q1~Q7 (슬리피지/수수료/사이즈/horizon/라벨 우선순위)는 **V-PV-04 시작 시점** 결정 필요 — V-PV-01 scaffold에는 default 값만 박음.

## Canonical Files

신규 (구현 시 생성):
- `engine/verification/__init__.py` — module entry, exports
- `engine/verification/types.py` — 공통 dataclass 4종
- `engine/verification/signal_card.py` — `build_from_pattern()` placeholder
- `engine/verification/paper_executor.py` — `PaperExecutor` 인터페이스 + default 값
- `engine/api/routes/verification.py` — `POST /signal-card` stub + `GET /health`
- `engine/tests/test_verification_scaffold.py` — 3 smoke 테스트

수정:
- `engine/api/main.py` — router include 1줄

참조 (변경 X):
- `engine/backtest/portfolio.py` — composition import
- `engine/backtest/simulator.py` — V-PV-03 시점 사용
- `engine/backtest/metrics.py` — Sharpe/maxDD 재사용
- `engine/stats/engine.py` — V-PV-04 paper P&L 누적 패턴 참조

금지 (격리):
- `engine/copy_trading/` — import / 수정 절대 금지

---

## Decisions

| # | 결정 | 근거 | 일자 |
|---|---|---|---|
| D1 | `engine/backtest/` 재사용 (composition) — 신규 시뮬 코드 0 | 9 파일 BUILT 실측. 중복 구현 차단 | 2026-04-28 |
| D2 | scaffold 단계는 in-memory only, Supabase 영속화는 V-PV-04 | 인터페이스 안정화 후 영속성 추가 — 점진 머지 | 2026-04-28 |
| D3 | `POST /verification/signal-card` 200 sync 응답 | 계산 단순 (PatternObject → SignalCardSpec), p95 < 200ms 기대 | 2026-04-28 |
| D4 | CI 가드 `import.*copy_trading` 차단 룰을 V-PV-01 PR 시점에 추가 | Frozen W-0132 격리 영구화 — 다음 에이전트 무심코 import 방지 | 2026-04-28 |
| D5 | scaffold default: slippage 10 bps / maker 0.02% / taker 0.05% / notional 1000 USDT | Bybit perp 기준 보수적 추정. V-PV-04에서 calibration | 2026-04-28 |

---

## Next Steps

1. **선행 대기**: W-0254 H-07/H-08 PR 머지 — `gh pr list --search "W-0254"` 모니터링
2. **새 worktree 생성**: `.claude/worktrees/feat-V-PV-01` (이 worktree와 격리)
3. **Issue assign**: `gh issue edit 549 --add-assignee @me` (mutex 획득)
4. **첫 5분 명령**:
   ```bash
   grep -rn "verification\|paper_exec\|backtest" engine/  # 실측 (lesson L1)
   ls engine/backtest/                                     # 9 파일 확인
   gh pr list --search "W-0254"                            # 선행 PR 상태
   ```
5. **VPV01-Q1~Q5 사용자 결정 세션** (필드명 / 영속성 / CI 가드 위치 / inheritance / latency)
6. **PV-Q1~Q7 결정은 V-PV-04 진입 시점** — scaffold는 D5 default만
7. **Implementation order**: types.py → signal_card.py → paper_executor.py → routes/verification.py → main.py 등록 → 테스트
8. **머지 후**: `tools/complete_work_item.sh W-0282` 실행

---

## Handoff Checklist

다음 에이전트(V-PV-01 implementer)가 받아갈 정보:

- [ ] 본 문서 (`work/active/W-0282-v-pv-01-engine-verification-scaffold.md`) 정독
- [ ] 부모 W-0281 (`work/completed/W-0281-pattern-verification-lane.md`) 정독
- [ ] PRD master § 0.3 v3 섹션 정독
- [ ] CHARTER §Frozen Pattern Verification Lane 예외절 정독
- [ ] Issue #549 assign (mutex)
- [ ] 새 worktree 생성 (`.claude/worktrees/feat-V-PV-01`), 본 worktree와 격리
- [ ] W-0254 H-07/H-08 PR 머지 확인 (선행 의존)
- [ ] VPV01-Q1~Q5 사용자 결정 세션 진행
- [ ] `engine/backtest/` 9 파일 grep으로 재사용 가능성 확인 (lesson L1 재발 방지)
- [ ] `engine/copy_trading/` import 절대 금지 (CI 가드 동시 추가)
- [ ] CI 가드 룰 위치 결정 (`.github/workflows/` 새 파일 vs 기존 contract-ci 확장 — VPV01-Q3)
- [ ] Exit Criteria 9개 항목 충족 확인 후 PR 작성
- [ ] OpenAPI contract sync (`npm run contract:sync:engine-types`) 머지 전 실행
