# W-0215 — pattern_search.py Audit (V-00)

**Owner:** research
**Status:** Ready (pending W-0214 PR #396 merge)
**Type:** Read-only code audit
**Depends on:** W-0214 v1.3 LOCKED-IN
**Estimated effort:** 1 day (S)

---

## Goal

`engine/research/pattern_search.py` (3283줄)을 read-only로 audit하여 함수 시그니처 inventory를 작성하고, W-0214의 `engine/research/validation/` 모듈에서 wrapping 가능한 함수 매핑 표를 만든다. W-0214 §14 Appendix B를 채운다. 재구현 금지(augment-only) 정책 enforce.

## Owner

research

## Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/pattern_search.py` | **read-only** | 3283줄 audit, 변경 X |
| `work/active/W-0214-mm-hunter-core-theory-and-validation.md` | edit (§14 Appendix B) | 함수 inventory 통합 |
| `memory/decisions/dec-2026-04-XX-pattern-search-augment-policy.md` | new | augment-only 정책 결정 record (선택) |

## Non-Goals

- ❌ `pattern_search.py` 코드 변경 (read-only)
- ❌ 새 `engine/research/validation/` 모듈 파일 생성 (W-0216으로 분리)
- ❌ 함수 redesign 제안 (audit only, 평가 X)
- ❌ Hypothesis test 함수 재구현 (augment-only 위반)
- ❌ 다른 engine/research/ 파일 audit (이번엔 pattern_search.py만)

## Exit Criteria

```
[ ] engine/research/pattern_search.py 3283줄 전체 read 완료
[ ] 함수별 시그니처 inventory markdown 표 작성 (이름 / 파라미터 / 반환 타입 / 라인 번호)
[ ] validation 매핑 표 작성: 4 metrics (M1~M4)별로 wrapping 가능한 함수 식별
[ ] BenchmarkPack class와 W-0214 §3.3 baselines 4종 매핑
[ ] 재구현 금지 리스트 — 이미 존재하는 hypothesis test / variant evaluation / MTF search 함수
[ ] W-0214 §14 Appendix B에 위 결과 통합 (단일 commit)
[ ] PR 작성 + reviewer가 augment-only 정책 위반 없는지 확인
```

## Facts

- **F1** [factual]: W-0220 PRD §4 L5는 `engine/research/pattern_search.py:3283줄 — 벤치마크 팩, 변형 평가, MTF 검색, 가설 테스트` 명시
- **F2** [factual]: W-0214 §5.0은 augment-only 정책 lock-in. 재구현 금지
- **F3** [factual]: W-0214 §1.5 WVPL chain은 검증된 패턴이 search corpus에 포함되는 메커니즘 명시 (validation framework가 corpus filter를 갱신)
- **F4** [factual]: W-0220 PRD §4 L7는 Phase A+B AutoResearch (Hill Climbing + LightGBM) 이미 BUILT 명시. validation framework는 이와 통합

## Assumptions

- **A1** [assumption]: `engine/research/pattern_search.py` 파일이 실재하며 python 3.x로 readable. 검증 가능.
- **A2** [assumption]: 다른 agent가 동일 파일을 동시 수정하지 않음. **lock 권장**.
- **A3** [assumption]: 함수 docstring 또는 type hints 일부 존재. 시그니처 추출 가능.
- **A4** [speculation]: hypothesis_test, BenchmarkPack, variant_evaluation, mtf_search 함수가 명확히 분리되어 있음. 실제 audit에서 mixed 또는 missing 가능성 있음.

## Open Questions

- **Q1**: `pattern_search.py`가 internal helper 함수와 public API를 어떻게 구분? `__all__` 또는 underscore prefix?
- **Q2**: BenchmarkPack class가 이미 baseline 개념을 가지고 있나? B0~B3와 직접 매핑 가능?
- **Q3**: hypothesis_test 함수가 multiple comparison correction (BH/FDR) 또는 DSR을 이미 구현했나? 안 했으면 W-0214 §3.5 stats.py에서 추가

## Decisions (V-00 audit 결과로 채워짐)

(현재 [unknown]. Audit 완료 시 다음 채움)
- D-V00-1: pattern_search.py의 hypothesis_test wrapping 방식
- D-V00-2: BenchmarkPack vs validation/baselines.py 통합 또는 분리
- D-V00-3: variant_evaluation을 W-0214 §3.8 decay monitoring과 연결 가능 여부

## Canonical Files

```
engine/research/pattern_search.py        (read-only)
work/active/W-0214-mm-hunter-core-theory-and-validation.md  (§14 Appendix B 추가)
work/active/CURRENT.md                   (W-0215 active 등록)
memory/decisions/dec-2026-04-XX-pattern-search-augment-policy.md  (선택)
```

## CTO 설계 원칙 적용

### 성능
- N/A (read-only audit). 측정 후속 모듈에서 적용.
- 단, audit 결과로 N+1 쿼리 / 비효율 패턴 발견 시 ⚠️ 메모만 (수정은 W-0216+에서)

### 안정성
- **File-domain lock 필수**: 다른 agent가 동시 수정 차단. CONTRACTS.md에 lock 등록 권장.
- 폴백: audit 도중 파일 못 읽으면 → 부분 inventory + 명시적 [unknown] 라벨로 진행
- 멱등성: audit 재실행 시 동일 결과. 부수효과 없음.

### 보안
- N/A (read-only).
- 단, audit 중 secret/credential 발견 시 → incident report 필수 (`memory/incidents/`)

### 유지보수성
- 계층 준수: `engine/research/`만 audit. `app/` `engine/api/` 등 미접근.
- 결과는 W-0214 §14에 영구 보존 → 다음 agent가 wrapping 작업 시 재참조
- markdown 표 형식 통일: `| name | line | params | returns | usage |` 5-column

## Next Steps

1. **Lock acquisition**: file-domain lock on `engine/research/pattern_search.py` 등록
2. **Read 3283줄**: 5분/100줄 = 약 165분 소요 [estimate]
3. **Inventory 작성**: 함수당 1~2줄, 표 형식
4. **Wrapping 매핑**: M1~M4 / B0~B3 / G1~G7 각각 어떤 기존 함수 활용 가능한지
5. **재구현 금지 리스트**: 신규 작성 시 중복될 함수 명시
6. **W-0214 §14 통합**: single commit
7. **PR 작성**: title `docs(W-0215): pattern_search.py audit + W-0214 §14 update`
8. **Lock release**: PR 머지 후

## 절대 하지 말 것

- ❌ `pattern_search.py` 1줄도 수정 X
- ❌ 새 `engine/research/validation/` 파일 생성 X (다음 work item)
- ❌ "내가 더 잘 짤 수 있다" 식의 redesign 제안 X (augment-only)
- ❌ Lock 없이 시작 X (다른 agent와 충돌 위험)
- ❌ Audit 중 발견한 버그를 즉시 수정 X (별도 incident report)

## 후속 work items (이 audit 통과 후)

- **W-0216 V-01**: PurgedKFold + Embargo 구현 (`engine/research/validation/cv.py`)
- **W-0217 V-02**: M1 phase_eval (pattern_search.hypothesis_test wrapping)
- **W-0218 V-06**: stats.py (BH + DSR)
- **W-0219 V-07**: SQL view migration
- **W-0220+ V-08**: pipeline.py + dashboard JSON

(전체 V-00 ~ V-13은 W-0214 §7.3 표 참조)

## Acceptance — 이 work item 완료 조건

```
[ ] 위 7개 Exit Criteria 모두 통과
[ ] PR가 reviewer (CTO 또는 senior researcher) approval 받음
[ ] augment-only 정책 위반 0건 (코드 수정 0줄)
[ ] W-0214 §14 Appendix B가 다음 agent의 V-01 작업 시작에 충분
[ ] 후속 W-0216 work item이 본 audit 결과 위에 작성 가능
```

---

## Cross-references

- **W-0214** v1.3 §5.0 augment-only 정책
- **W-0214** v1.3 §14 Appendix B (이 audit 결과 들어갈 곳)
- **W-0220** PRD v2.2 §4 L5 (pattern_search.py 3283줄 [factual])
- **memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md**

---

*W-0215 created 2026-04-27 as next work item after W-0214 lock-in.*
