# Engine Context (engine/ 작업 시 필수 로드)

> 이 파일은 `engine/` 코드를 수정·테스트할 때 로드. app/ 전용 작업에는 불필요.

---

## Engine 구조

```
engine/
├── api/           — FastAPI routes (main.py, routes/*.py)
├── ledger/        — Ledger store + types (store.py, types.py)
├── patterns/      — State machine + scanner (state_machine.py, scanner.py)
├── scanner/       — Universe scan + scheduler (scheduler.py)
├── research/
│   └── validation/ — V-track 8-axis pipeline (runner.py, actuator.py, gates/)
├── worker/        — Background jobs (research_jobs.py)
├── data_cache/    — Kline cache (loader.py)
├── stats/         — Stats engine (engine.py)
└── tests/         — pytest suite
```

## 핵심 파일 (자주 편집)

| 파일 | 역할 |
|---|---|
| `api/routes/patterns.py` | Pattern API endpoints |
| `ledger/store.py` | Pattern ledger (SQLite + Supabase) |
| `patterns/state_machine.py` | Pattern lifecycle state |
| `scanner/scheduler.py` | Job scheduler (always_on + conditional) |
| `research/validation/runner.py` | V-track pipeline entry point |
| `research/validation/actuator.py` | GateV2DecisionStore + alert suppression |

## 테스트 실행

```bash
# 단일 파일
cd engine && uv run pytest <test_file> -q --tb=short

# 전체 suite
cd engine && uv run pytest -q

# 1사이클 회귀
cd engine && uv run python ../tools/cycle-smoke.py
```

## 핵심 상수 (변경 시 테스트 영향)

- `F60_MIN_SAMPLES_PER_WINDOW = 10` — ledger/types.py
- `HIT_RATE_GATE = 0.55` — research/validation/gates/
- `_BTC_RETURNS_TTL = 3600` — research/validation/runner.py
- `GATE_V2_DECISION_DIR` env — research/validation/actuator.py

## 환경 변수 (Cloud Run)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `ENABLE_PATTERN_REFINEMENT_JOB` | false | refinement loop ON/OFF |
| `ENABLE_SEARCH_CORPUS_JOB` | false | search corpus rebuild ON/OFF |
| `ENABLE_FEATURE_MATERIALIZATION_JOB` | true | feature 생성 ON/OFF |

## Contract 동기화

engine API 변경 후:
```bash
cd app && npm run contract:sync:engine-types
```

## 도메인 docs

- `docs/domains/engine-architecture.md`
- `docs/domains/validation-pipeline.md`
- `docs/domains/pattern-lifecycle.md`
