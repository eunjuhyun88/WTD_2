# W-0252 — V-00 `pattern_search.py` Audit (MM Hunter Validation 호환성)

> Wave: MM Hunter Track 2 | Priority: **P0** (Week 1 즉시) | Effort: **M (1d audit + 0.5d report)**
> Charter: ✅ In-Scope L5 Search (`spec/CHARTER.md`)
> Status: 🟡 **Design Draft** (사용자 검토 대기)
> Created: 2026-04-27 by Agent A045
> Branch: `feat/W0252-v00-audit` (생성 예정, `claude/*` 금지)
> Replaces ID: PRIORITIES.md "W-0215" (해당 ID는 `W-0215-ledger-supabase-cutover`가 점유 중 → drift 발생)

---

## Goal (1줄)

`engine/research/pattern_search.py` 3283줄을 **augment-only** 원칙으로 정밀 감사하여 MM Hunter validation framework (V-01~V-13, M1~M4 × B0~B3 × G1~G8)와의 호환성 갭을 식별하고 V-track 후속 작업 계획을 확정한다.

## Scope

### 포함
- `engine/research/pattern_search.py` (3283줄, 20 classes, 62 top-level functions) 구조 mapping
- 15개 dependent 파일과의 contract 분석 (`live_monitor.py`, `cli.py`, `market_retrieval.py`, `capture_benchmark.py`, `api/routes/patterns.py`, `api/routes/captures.py` + 7개 테스트)
- MM Hunter D1~D8 (`memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md`)와의 갭 분석:
  - D2 forward return horizon (4h primary, 1h+24h 보조) 지원 여부
  - D3 cost model (15bps round-trip) 반영 여부
  - D5 F-60 gate (Layer A AND B) 호환성
  - D8 phase taxonomy (Wyckoff 4-phase + OI Reversal 5-phase) 둘 다 측정 가능 여부
- 이미 머지된 V-track PR (#435 V-04, #436 V-01, #438 V-06, #440 V-02)의 코드 surface가 pattern_search.py와 어떻게 연결되는지 확인
- Output: 감사 리포트 `docs/live/W-0252-v00-audit-report.md` (gap matrix + augment 작업 목록 + 우선순위)

### Non-Scope
- ❌ pattern_search.py **삭제 / rewrite / 함수 통합** — augment-only 정책 (D6 결정)
- ❌ V-01~V-13 구현 자체 (별도 work item, 이 audit는 갭 식별만)
- ❌ 52 PatternObject 통계 측정 자체 (V-12 threshold audit, 별도)

## Files Touched (예상)

### 읽기만 (audit)
- `engine/research/pattern_search.py:3283줄`
- `engine/research/{live_monitor,cli,market_retrieval,capture_benchmark}.py`
- `engine/api/routes/{patterns,captures}.py`
- `engine/tests/test_pattern_search*.py`, `test_capture_benchmark.py`, `test_live_monitor.py`
- `memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md`

### 쓰기
- `docs/live/W-0252-v00-audit-report.md` (신규, gap matrix + 우선순위)
- `work/active/W-0252-v00-pattern-search-audit.md` (이 문서, status 토글)
- `docs/live/W-0220-status-checklist.md` (V-00 라인 토글)
- `memory/decisions/dec-2026-04-27-w-0252-audit-result.md` (결정 사항 — 갭 처리 방식)

## Charter Check

| 검증 항목 | 결과 |
|---|---|
| L5 Search In-Scope | ✅ pattern_search.py = L5 핵심 모듈 |
| Frozen 진입 (copy_trading 등) | ❌ 없음 |
| MemKraft 대체 시도 | ❌ 없음 |
| 신규 시스템 빌드 | ❌ audit only, 코드 변경 0 |

---

## CTO 관점 (Engineering)

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Audit 결과 갭이 너무 커서 augment-only로 해결 불가 | 중 | 상 | Falsifiable kill criteria 발동 → W-0214 D-결정 재검토 (사용자 결정) |
| 기존 dependent 코드와 V-track 새 코드 간 import 순환 발견 | 중 | 중 | gap matrix에 "circular dep risk" 컬럼 명시, V-08 pipeline 작업으로 연기 |
| 3283줄 1d audit 시간 부족 | 중 | 중 | sub-agent 병렬 (Explore agent로 4개 도메인 분할 매핑) |
| `_archive`/legacy code 발견 시 audit 시간 낭비 | 낮 | 낮 | 이미 .claudeignore에 `_archive` 제외, dead code는 별도 P2 work item |

### Dependencies
- **선행**: 없음 (즉시 시작 가능)
- **차단 해제**: W-0252 완료 시 V-08 (validation pipeline) / V-12 (threshold audit) / V-13 (decay) 시작 조건 충족
- **이미 머지된 관련 PR** (참고용, 재작업 금지):
  - #435 (V-04 sequence completion thin wrapper)
  - #436 (V-01 PurgedKFold + Embargo CV)
  - #438 (V-06 stats engine — Welch+BH+DSR+Bootstrap)
  - #440 (V-02 phase_eval M1)

### Rollback Plan
- 본 work item은 **read-only audit + 문서 작성**이므로 코드 rollback 불필요
- 만약 audit 리포트가 잘못 작성되면 → 단순히 `docs/live/W-0252-v00-audit-report.md` revert + 새 PR로 재작성

### Implementation Plan (1일 audit)

1. **Phase 1 — 구조 mapping (3h)**
   - 20 classes × 62 functions 카탈로그화 (역할 분류: BenchmarkCase / Variant / Promotion / Family / Lookup / Util)
   - 각 class/function의 입출력 dataclass 명세 추출
   - Sub-agent 분할: Explore agent로 BenchmarkPackStore / PatternSearchArtifactStore / NegativeSearchMemoryStore 3개 store 동시 매핑

2. **Phase 2 — D1~D8 갭 매트릭스 (2h)**
   - D2 forward return: `forward_return` 관련 함수 탐색 → horizon 파라미터화 가능 여부
   - D3 cost model: bps cost 인자 받는 함수 탐색
   - D5 F-60 gate: `PromotionGatePolicy` 클래스가 Layer A+B 분리를 지원하는지
   - D8 phase taxonomy: `_phase_path_in_order` / `_phase_depth_progress` / `_normalized_expected_phase_path` — Wyckoff 4-phase + OI Reversal 5-phase 둘 다 라우팅 가능?

3. **Phase 3 — V-track integration 검증 (2h)**
   - V-01 PurgedKFold (#436) → pattern_search 어디에서 호출 / 호출 가능한가
   - V-02 phase_eval (#440) → forward return 계산 source가 pattern_search인가 별도인가
   - V-04 sequence completion (#435) → thin wrapper가 가리키는 "sequence" 정의가 pattern_search M3와 일치?
   - V-06 stats (#438) → Welch+BH+DSR+Bootstrap이 pattern_search 결과를 직접 받는 구조?

4. **Phase 4 — 리포트 작성 (1h)**
   - `docs/live/W-0252-v00-audit-report.md` 생성:
     - §1 구조 카탈로그 (20 classes / 62 functions)
     - §2 Gap matrix (8 D-결정 × 4 status: ✅충족 / 🟡부분 / 🔴갭 / ⚠️circular)
     - §3 Augment 작업 목록 (priority A/B/C)
     - §4 V-track 추가 작업 권고 (V-13 decay 포함 여부)

5. **Phase 5 — 결정 등록 (0.5h)**
   - `./tools/mk.sh decision "W-0252: V-00 audit 결과 — N개 갭, augment-only 처리 가능"`
   - W-0220 status-checklist에서 V-00 라인 ✅ 토글
   - PR #437 처리 후 main에 머지

---

## AI Researcher 관점 (Data/Model)

### Data Impact

| 항목 | 영향 |
|---|---|
| 라벨 / 스키마 변경 | ❌ 없음 (audit only) |
| feature_windows 138,915 row 영향 | ❌ 없음 |
| LightGBM Layer C 학습 신호 | ❌ 직접 영향 없음 |
| 52 PatternObject 카탈로그 | ⚠️ 간접 — gap matrix가 D4 (P0 5개 측정 + 48개 보존)와 충돌 시 알림 |

### Statistical Validation (audit 자체의 품질 측정)

이 work item 자체는 통계적 측정이 아니므로 metric은 적용 안 됨. 대신 audit 품질은:

- **Coverage metric**: 3283줄 중 catalogued % (≥95% target)
- **Gap completeness**: D1~D8 8개 결정 모두에 대해 status 확정 (NULL 금지)
- **Cross-reference accuracy**: 4개 머지된 V-track PR의 호출 그래프 정확도 spot check (random 5 functions, manual verify)

### Failure Modes (AI Researcher가 우려하는 시나리오)

1. **Type-1 error (false positive)**: Audit가 "갭 없음"이라고 했는데 V-08 pipeline 실행 시 누락 발견 → V-track 일정 1주+ 지연
   - 완화: §3 Cross-reference 5-function spot check + V-08 P-1 days dry-run 강제
2. **Type-2 error (false negative)**: 존재하지 않는 갭을 "리스크"로 잘못 표시 → 불필요한 augment 작업
   - 완화: gap matrix에 "evidence file:line" 컬럼 강제, evidence 없으면 갭 등록 불가
3. **Augment scope creep**: 1d audit가 5d 리팩터로 변질
   - 완화: 본 work item은 코드 변경 0줄 강제 (PR diff 검증)

### Falsifiable Kill Criteria (W-0214 D6 inheritance)
- F1: 8개 D-결정 중 3개 이상이 "🔴 augment-only로 해결 불가"로 판정되면 → W-0214 framing 재검토 (별도 incident 등록 + 사용자 결정 필요)

---

## Decisions (이 설계에서 확정한 것)

| ID | 결정 | 거절된 옵션 |
|---|---|---|
| D-W0252-1 | Work item ID = **W-0252** (PRIORITIES.md "W-0215"는 `ledger-supabase-cutover`가 점유, drift) | W-0215 재사용 (✗ 충돌); W-0250 (✗ infra-cleanup가 점유); W-0251 (✗ H-08 IN clause fix가 점유) |
| D-W0252-2 | Audit output = **단일 리포트 파일** `docs/live/W-0252-v00-audit-report.md` | 다중 파일 분할 (✗ 검토 부담); inline comments in pattern_search.py (✗ 코드 변경 = augment-only 위반) |
| D-W0252-3 | Coverage target = **≥95% lines catalogued** | 100% (✗ utility/glue code 자명, 시간 낭비); 80% (✗ 갭 누락 위험) |
| D-W0252-4 | Sub-agent 사용 = **Explore agent 3개 병렬** (3 store mapping) | 단독 진행 (✗ 1d 초과 위험); 5개 이상 (✗ context overhead) |

## Open Questions (사용자 결정 필요)

- [ ] **Q-W0252-1**: PRIORITIES.md "W-0215" 표기를 그대로 유지할까 (drift 허용), 아니면 다음 sync에서 W-0252로 정정할까?
- [ ] **Q-W0252-2**: Audit 결과 F1 발동 (3+개 갭이 augment-only 불가)이면, W-0214 framing 재검토 incident를 자동 등록할까 아니면 사용자에게 먼저 보고할까?
- [ ] **Q-W0252-3**: V-13 (decay monitoring) 작업을 본 audit에서 갭 발견 시 추가할까, 별도 incident로 처리할까?

---

## Exit Criteria

- [ ] AC1: `docs/live/W-0252-v00-audit-report.md` 생성 (≥95% line coverage, 8 D-결정 status 확정)
- [ ] AC2: Gap matrix evidence 컬럼 100% 채워짐 (file:line 인용)
- [ ] AC3: V-track 4 머지 PR cross-reference 5-function spot check 통과
- [ ] AC4: `memory/decisions/dec-2026-04-27-w-0252-audit-result.md` 등록
- [ ] AC5: `docs/live/W-0220-status-checklist.md` V-00 라인 ✅ 토글
- [ ] AC6: PR diff `engine/research/pattern_search.py` 변경 = **0줄** (augment-only 정책 검증)
- [ ] AC7: PR merged + CURRENT.md SHA 업데이트

---

## Implementation Plan (Step-by-step)

```
Day 1 (1d audit):
  09:00-12:00  Phase 1 — 구조 mapping (Explore agent 3개 병렬)
  13:00-15:00  Phase 2 — D1~D8 갭 매트릭스
  15:00-17:00  Phase 3 — V-track 4 PR integration 검증
  17:00-18:00  Phase 4 — 리포트 작성

Day 2 morning (0.5d):
  09:00-09:30  Phase 5 — decision 등록 + checklist 토글
  09:30-10:00  PR open → 사용자 검토 → main 머지
```

---

## References

- `spec/CHARTER.md` §In-Scope L5 Search
- `spec/PRIORITIES.md` §4 P0 — 현재 집중 (라인 119)
- `memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md` (D1~D8 lock-in)
- `work/active/W-0214-mm-hunter-core-theory-and-validation.md` (v1.3)
- 머지된 V-track PR: #435 / #436 / #438 / #440
- 본 work item 다음 단계: V-08 pipeline / V-12 threshold audit / V-13 decay
