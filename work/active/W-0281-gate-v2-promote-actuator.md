# W-0281 — gate_v2 → 실제 promote 결정 반영 (Phase 2)

> Wave: MM | Priority: P1 | Effort: M
> Charter: In-Scope L7 (Refinement — verdict loop)
> Status: 🟡 Design Draft
> Created: 2026-04-28 by Agent A073
> Issue: #548
> Predecessor: W-0280 (#541 — log-only Phase 1)

## Goal (1줄)
`run_full_validation()` 결과(GateV2Result)가 패턴 alert gate에 실제 반영되어, V-track 실패 패턴의 Telegram alert가 자동 억제된다.

## Scope
- 포함:
  - `engine/research/validation/actuator.py` (신규): `apply_gate_v2_decision(research_run_id, result)` — artifact store에 gate_v2_validated 기록
  - `engine/worker/research_jobs.py`: actuator 호출 wire-in (기존 gate_v2_result 획득 직후)
  - `engine/scanner/alerts_pattern.py`: `send_pattern_entry_alert()` — gate_v2_validated=False 시 skip
- 파일/모듈: `engine/research/validation/`, `engine/worker/`, `engine/scanner/`
- API surface: 없음 (내부 worker → artifact store → alert filter)

## Non-Goals
- `pattern_search.py` 수정 금지 (augment-only 정책)
- PromotionReport.decision 변경 금지 (기존 promote 흐름 유지)
- UI 변경 없음
- 실자금 연동 없음

## CTO 관점 (Engineering)

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| gate_v2_validated 없으면 alert가 영원히 block | 중 | 높 | AC4: data 없으면 기존 동작 유지 |
| actuator가 artifact store write 실패 | 저 | 중 | try/except + warning log |
| alerts_pattern.py의 capture_id 추적 누락 | 중 | 중 | research_run_id → capture_id 매핑 확인 |

### Dependencies
- 선행: W-0280 (PR #541) MERGED — `run_full_validation()` 존재
- 차단 없음

### Rollback Plan
- `actuator.py` 제거 + `research_jobs.py` wire-in 라인 제거
- alerts 동작은 gate_v2_validated 없으면 기존 동작으로 자동 fallback

### Files Touched (예상)
- `engine/research/validation/actuator.py` (신규 ~60줄)
- `engine/research/validation/test_actuator.py` (신규 ~50줄)
- `engine/worker/research_jobs.py` (+5줄)
- `engine/scanner/alerts_pattern.py` (+10줄)

## AI Researcher 관점 (Data/Model)

### Data Impact
- `PatternSearchArtifactStore`에 `gate_v2_validated: bool | None` 필드 추가 (기존 JSON 필드 augment)
- 기존 artifact 없으면 `None` → alert 그냥 통과 (migration 불필요)

### Statistical Validation
- 측정: gate_v2_validated=False 패턴의 alert 억제율
- 목표: V-track 실패 패턴 alert 0건 (phase 2 활성화 후)

### Failure Modes
- gate_v2가 너무 엄격해 모든 패턴 억제 → config로 on/off toggle 제공
- btc_returns 없어서 V-05 비활성 → overall_pass가 V-11 only 기반 → 수용 가능

## Decisions

- [D-001] `gate_v2_validated` 필드를 `PatternSearchArtifactStore`에 augment (PromotionReport 변경 대신)
  - 거절: PromotionReport.decision 변경 → pattern_search.py 수정 필요 (augment-only 위반)
- [D-002] alert skip 조건: `gate_v2_validated is False` (명시적 False만 — None이면 통과)
  - 거절: None도 skip → 기존 데이터 전체 alert 억제 (backward-compat 파괴)
- [D-003] toggle: `GATE_V2_ALERT_FILTER=1` env var로 on/off (default: 1)

## Open Questions

- [ ] [Q-001] research_run_id → capture_id 매핑이 artifact store에 있는가? (alerts_pattern.py가 capture_id 기반이므로)
  → 확인 필요: `PatternSearchArtifactStore.load(research_run_id)`로 capture_id 역추적 가능한지

## Implementation Plan

1. `actuator.py` 작성: `apply_gate_v2_decision(research_run_id, result: GateV2Result) -> None`
   - `PatternSearchArtifactStore().load(research_run_id)` → `artifact["gate_v2_validated"] = result.overall_pass`
   - `PatternSearchArtifactStore().save(research_run_id, artifact)` (또는 patch)
2. `research_jobs.py` wire-in: `gate_v2_result` 획득 직후 `apply_gate_v2_decision()` 호출
3. `alerts_pattern.py`: `send_pattern_entry_alert()` 상단에 gate_v2_validated check
   - `PatternSearchArtifactStore` 조회 → `gate_v2_validated is False and os.getenv("GATE_V2_ALERT_FILTER","1")=="1"` → skip
4. `test_actuator.py` + `alerts_pattern.py` 테스트 추가

## Exit Criteria

- [ ] AC1: `overall_pass=True` → artifact `gate_v2_validated=True` 기록
- [ ] AC2: `overall_pass=False` → artifact `gate_v2_validated=False` 기록
- [ ] AC3: `send_pattern_entry_alert()` — `gate_v2_validated=False` 시 alert skip + log
- [ ] AC4: gate_v2 data 없으면 기존 alert 동작 유지 (backward-compatible)
- [ ] AC5: pytest 전체 green
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## References

- W-0280 wire-in: `engine/worker/research_jobs.py:116-136`
- V-11 GateV2: `engine/research/validation/gates.py:121`
- Artifact store: `engine/research/pattern_search.py:684`
- PR #541 (W-0279/W-0280) — Phase 1 log-only baseline
