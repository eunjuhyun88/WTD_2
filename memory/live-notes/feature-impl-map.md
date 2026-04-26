---
source: docs/live/feature-implementation-map.md
tier: core
updated: "2026-04-26"
version: "v3.0 (code-verified, A023)"
---

# Feature Implementation Map (Live Note)

## Current State

- 19 도메인 (A-S), 코드-검증 기반
- **Built**: 160+ 기능
- **NOT BUILT**: 9 항목 (이슈 등록 단위)
- **PARTIAL**: 4 항목 (C-11 LightGBM untrained / S-08 ContextAssembler LLM 미연결 / S-17 동시 100명+ 검증 / L-04~06 dependent)

## 도메인 요약

- **A INPUT** (A-03/A-04 NOT BUILT) | **B RESOLVE** ✅ | **C SEARCH** ✅ (Layer A/B BUILT, C PARTIAL untrained)
- **D WATCH** (D-03 NOT BUILT) | **E CAPTURE** ✅ 11/11 | **F VERDICT** (F-02 NOT BUILT)
- **G REFINEMENT** ✅ 14/14 (Hill Climbing + LightGBM + variants + alert policy)
- **H STATS** (H-07 NOT BUILT, H-01 PatternStats Engine BUILT — engine/stats/engine.py 5-min TTL)
- **I MARKET DATA** ✅ 33/33 | **J TERMINAL** (J-21 NOT BUILT) | **K LAB** (K-06 NOT BUILT)
- **L DASHBOARD** (L-04/L-05/L-06 dependent NOT BUILT) | **M BRANDING** ✅ 8/8
- **N COPY TRADING** (N-05/N-06 NOT BUILT) | **O AUTH** ✅ 8/8 | **P PROFILE** ✅ 9/9
- **Q DeFi/Trading** ✅ 11/11 | **R PINE/INDICATORS** ✅ 7/7 | **S INFRA** (S-08/S-17 PARTIAL)

## 9개 이슈 등록 단위

| ID | 기능 | Effort | 선행 |
|---|---|---|---|
| A-03-eng | AI Parser engine | M | — |
| A-03-app | AI Parser UI | M | A-03-eng |
| A-04-eng | Chart Drag engine | M | — |
| A-04-app | Chart Drag UI | M-L | A-04-eng |
| D-03-eng | 1-click Watch engine | M | — |
| D-03-app | 1-click Watch UI | S | D-03-eng |
| F-02 | Verdict 5-cat | S | Q1 결정 |
| H-07 | F-60 Gate | S-M | F-02 권장 |
| N-05 | Marketplace | L | H-07 |

## Decisions

- 이 map이 PRD W-0220의 NOT BUILT 정본 카탈로그
- 새 기능은 도메인 ID로 라벨링 (A-XX, B-XX, ...) → 이슈 추적

## Next

- Q1-Q5 답변 후 9 이슈 GitHub 등록
- 4 independent (A-03-eng / A-04-eng / D-03-eng / F-02) 병렬 가능

## See Also

- `telegram-refs.md` (live-note) — F-60 메시지 schema는 N-05 작업 시 참조

---

## Timeline

- **2026-04-26** | feature-impl-map live note initialized [Source: manual]
