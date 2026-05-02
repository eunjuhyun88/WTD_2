# W-A108 — Verification Framework: CI Gates + Perf Suite + Lint Foundation

> Wave: 6 | Priority: P0 | Effort: M (2-3d)
> Charter: In-Scope (L4 검증 인프라)
> Status: 🟡 Design Draft
> Created: 2026-05-02
> Agent: A107
> Issue: #925

## Goal

"설계 vs 구현 갭이 생기면 다음 PR에서 자동 차단된다." — W-A107 audit이 발견한 357개 font 위반·줄수 초과·Pydantic v3 위험 같은 누수가 다시는 main에 들어가지 못하게 하는 자동화 게이트를 1주 안에 가동한다.

## Scope

- **포함**:
  - `engine/tests/perf/` — pytest-benchmark suite (3 파일)
  - `app/.stylelintrc.cjs` — font-size 7-10px 위반 상한 게이트 (≤400 → 점진 강화)
  - `app/eslint.config.js` — hub boundary 차단 (W-0388 흡수)
  - `.github/workflows/quality-gates.yml` — 4개 게이트 (line-budgets, pydantic, lint, perf)
  - `engine/research/discovery/proposer/schemas.py:77` — Pydantic min_items → min_length
  - `tools/quality_baseline.sh` — 5개 메트릭 현재값 출력 헬퍼
- **포함 안 함**: W-0389 font 정규화 실제 작업, W-0372 Phase D

## Non-Goals

- 즉시 font 위반 0 강제 — W-0389에서 단계적 감소. 본 설계는 상한(≤400)만.
- 기존 9개 workflow 통합 — 신규 `quality-gates.yml` 독립 신설.

## Decisions

- **[D-A108-01]** pytest-benchmark 채택 (통계 분석, CI JSON 출력, baseline diff 지원)
- **[D-A108-02]** 임계값 점진 강화: 본 PR ≤400 → W-0389 단계별 0 감소
- **[D-A108-03]** W-0388 ESLint hub boundary → 본 설계 흡수, W-0388 이슈 close
- **[D-A108-04]** Pydantic 수정 본 설계 포함 (1줄)
- **[D-A108-05]** stylelint 적용 범위: `app/src/lib/hubs/` 한정 (전체 false positive 방지)

## Files Touched

```
NEW:    .github/workflows/quality-gates.yml
NEW:    engine/tests/perf/__init__.py
NEW:    engine/tests/perf/conftest.py
NEW:    engine/tests/perf/test_api_latency.py
NEW:    engine/tests/perf/test_alpha_perf.py
NEW:    app/.stylelintrc.cjs
NEW:    app/eslint.config.js
NEW:    tools/quality_baseline.sh
EDIT:   engine/research/discovery/proposer/schemas.py  (line 77)
EDIT:   engine/pyproject.toml  (+ pytest-benchmark)
EDIT:   app/package.json  (+ stylelint, eslint devDeps)
```

## Exit Criteria

- [ ] AC1: `uv run pytest engine/tests/perf/ --benchmark-only -q` → ≥4 benchmarks PASS
- [ ] AC2: `cd app && pnpm stylelint 'src/lib/hubs/**/*.svelte'` → 위반 ≤ 400
- [ ] AC3: `cd app && pnpm lint` → error 0 (Phase 1: warn only)
- [ ] AC4: `.github/workflows/quality-gates.yml` 4 jobs — PR status checks 노출
- [ ] AC5: `uv run pytest -q 2>&1 | grep "PydanticDeprecatedSince20" | wc -l` = 0
- [ ] AC6: `bash tools/quality_baseline.sh` → 5개 메트릭 수치 출력
- [ ] AC7: 본 PR 자체가 4개 게이트 모두 통과 (self-test)
- [ ] AC8: engine 전체 pytest ≥2274 pass 유지
- [ ] AC9: PR merged + CURRENT.md SHA 업데이트 + W-0388 이슈 close
