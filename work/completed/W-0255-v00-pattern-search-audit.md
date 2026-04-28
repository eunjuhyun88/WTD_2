# W-0255 — V-00 Audit: pattern_search.py 3283줄 (augment-only)

**Owner**: engine
**Status**: Ready (P0 즉시 시작 — spec/PRIORITIES.md §4)
**Type**: Audit + augment refactor (rewrite 금지)
**Depends on**: W-0214 v1.3 D1~D8 LOCKED-IN (✅ #396 main)
**Estimated effort**: 2~3일 (audit 1일 + augment 1~2일)

---

## Goal

`engine/research/pattern_search.py` 3283줄을 정독·문서화하고, **기존 함수/메서드를 삭제하지 않은 채** MM Hunter 갭(L5 reranker, augmented signal scoring)을 채우는 신규 모듈/함수만 추가한다. 사용자 가치: pattern search recall@10 ≥ 0.7 (P1 W-0247) 달성을 위한 검증된 베이스라인 확보.

## Owner

engine

## Scope

- `engine/research/pattern_search.py` — **읽기 전용 audit + 인라인 docstring 보강만**. 함수 시그니처/동작 변경 금지.
- `engine/research/pattern_search_audit.md` (신규) — audit 결과 문서 (각 함수의 역할, 호출 그래프, 의심 코드, augment 후보)
- `engine/research/_signals.py` — Layer A 40+ dim weighted L1 보강 (W-0145에서 도입된 모듈, augment 대상)
- `engine/research/__init__.py` — 신규 진입점 export 추가만 (기존 export 유지)
- `engine/tests/test_pattern_search_audit.py` (신규) — 현재 동작 회귀 테스트 (golden output 100건 캡처 후 동결)

## Non-Goals

- ❌ pattern_search.py 함수 삭제·rename·서명 변경 (augment-only 정책)
- ❌ Layer C (LambdaRank reranker) 훈련 — verdict ≥ 50 후 별도 work item (W-0247)
- ❌ pgvector / 의미적 RAG 도입 — 별도 트랙
- ❌ UI / app/ 변경 — 본 work item은 engine 단독
- ❌ 새 외부 의존성 추가 (numpy/pandas 외)

## Exit Criteria

1. `engine/research/pattern_search_audit.md` 생성 — 함수/메서드별 역할 + 호출 그래프 + 의심 패턴 (코드 중복, dead code, missing index 등) 표 포함
2. `engine/tests/test_pattern_search_audit.py` golden test 100건 → 모두 GREEN
3. `engine/research/_signals.py` augment 후 기존 호출자 모두 그대로 동작 (`pytest engine/tests/` GREEN, 1400+ tests pass)
4. PR 커밋 메시지에 "augment-only 검증" 명시 + diff에서 `-` 라인 (삭제) 0개 (audit.md 외)
5. CHARTER §In-Scope L5 Search 갭 항목에 본 PR 링크 추가

## Facts (현재 코드 상태)

```bash
$ wc -l engine/research/pattern_search.py
3283 engine/research/pattern_search.py

$ find engine -name "pattern_search.py"
engine/research/pattern_search.py

$ grep -c "^def \|^    def " engine/research/pattern_search.py
# (실측 후 audit.md 첫 섹션에 기록)

$ grep -l "from engine.research.pattern_search" engine/ -r | wc -l
# (호출자 카운트 — audit 시 채움)
```

- Layer A (40+ dim weighted L1): `engine/research/_signals.py` 존재 (W-0145 PR #346 머지)
- `pattern_ledger_records` 테이블 존재 (W-0230)
- Verdict 데이터 < 50건 → Layer C 훈련 불가 → 본 audit 후 W-0247에서 처리

## Assumptions

- Python 3.11+ 환경 (engine .venv)
- Supabase pattern_ledger_records 테이블 + RLS 정책 그대로 (W-0230)
- W-0145 _signals.py 인터페이스 안정 (변경 시 본 work item 재평가)
- 100건 golden test 입력은 `engine/data_cache/cache/` 기존 sample 재활용 (신규 fetch 없음)
- 작업자는 fresh worktree (origin/main 기준) 사용 — tools/start.sh stale guard 통과

## Canonical Files

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/pattern_search.py` | 읽기 + docstring 추가 | 본문 동결 (augment-only) |
| `engine/research/pattern_search_audit.md` | **신규** | audit 결과 문서 |
| `engine/research/_signals.py` | **augment** | Layer A 40+ dim 보강 후크 추가 |
| `engine/research/__init__.py` | export 추가만 | 신규 audit util export |
| `engine/tests/test_pattern_search_audit.py` | **신규** | golden test 100건 회귀 |
| `spec/CHARTER.md` | §In-Scope L5 항목에 PR 링크 | 정합성 추적 |
| `work/active/CURRENT.md` | 현재 작업 항목 갱신 | 상태 추적 |

---

## CTO 4축 사전 체크

### 성능 (100명+ 동시 사용자)

- pattern_search 호출은 read-mostly → DB 쿼리는 `select(필요 컬럼)` 명시 (SELECT * 금지 검증)
- 3283줄 내 N+1 패턴 grep 결과 audit.md에 표로 기록 (있으면 augment 후보)
- Hot path bench: `engine/scripts/bench_pattern_search.py` (신규 가능) — p50/p95 측정, baseline 캡처

### 안정성

- pattern_search.py augment 시 모든 신규 함수에 try/except → graceful degradation
- Supabase 호출은 기존 retry 로직 유지 (변경 금지)
- 신규 _signals.py 함수에 unit test + integration test 1개 이상

### 보안

- pattern_search는 engine 내부 호출 → 외부 input 직접 수신 X. 단 audit에서 sql/injection 가능 grep 확인.
- secret 노출 검증: audit.md에 `os.environ` 직접 참조 위치 표 기록

### 유지보수성

- engine/ ↔ app/ 경계 침범 0건 (engine 단독 work)
- audit.md에 함수별 "왜 존재하는가" 기록 — 다음 agent 가 30초에 파악 가능
- rollback: augment-only이므로 신규 파일/함수만 revert 하면 즉시 복원

---

## Charter 정합성 확인

- ✅ In-Scope L5 Search "reranker 미구현" 갭 — pattern_search audit는 reranker 도입 선행
- ✅ Frozen 진입 X — 기존 도구(pattern_search.py) 안정화, "신규 메타 도구 빌드" 아님
- ✅ Non-Goal 키워드 (copy_trading, chart_polish, memkraft 신규, multi-agent 신규) 진입 0
- ✅ MM Hunter §4 W-0215 V-00 라인과 직접 매칭 (PRIORITIES.md:119)

---

## Open Questions

- Q1: pattern_search.py 내부에 이미 audit/profiling 헬퍼가 있는가? (있으면 재활용, 없으면 audit.md에서 만 기록)
- Q2: W-0145 _signals.py 와 pattern_search.py 중복 로직 비율은? (≥30% 면 augment 단계에서 _signals.py로 이전 후 본문에서 호출만 — 단 시그니처 동결)

위 두 질문은 audit 1일차 종료 시점에 audit.md "Open Questions" 섹션에 답변 채워 넣고, 답에 따라 augment 1~2일차 계획 미세 조정.
