# Domain: Engine Pipeline

## Goal

Compute features, blocks, scans, scoring, and evaluation as the canonical backend path.

## Canonical Areas

- `engine/scanner`
- `engine/building_blocks`
- `engine/scoring`
- `engine/market_engine`
- `engine/ledger`
- `engine/challenge`
- `engine/api/routes/patterns.py`

## Boundary

- Owns all business and research logic for market interpretation.
- Exposes results through stable contracts, not UI-coupled models.

## Inputs

- market data and cached klines
- challenge definitions and block parameters
- evaluation requests from contract-safe app routes

## Outputs

- feature tables
- block matches and scanner results
- verdicts, scores, and challenge evaluation artifacts

## Related Files

- `engine/scanner/feature_calc.py`
- `engine/building_blocks/`
- `engine/challenge/types.py`
- `engine/scoring/verdict.py`
- `engine/api/routes/patterns.py`

## Non-Goals

- UI composition
- Svelte route concerns
- client-side session state

---

## Implementation Status (2026-04-21)

| 항목 | 현황 |
|------|------|
| 패턴 수 | 16개 (`engine/patterns/library.py`) |
| 빌딩블록 수 | 29개 (triggers / confirmations / disqualifiers / entries) |
| State Machine | `engine/patterns/state_machine.py` — 심볼별 phase 추적 |
| Ledger | `engine/ledger/` — capture / outcome / verdict / stats |
| Scoring | `engine/scoring/` — block evaluator + verdict + entry scorer |
| kline cache | Redis 5분 prefetch + Binance WS fallback (`engine/cache/`) |
| 스캐너 | `engine/scanner/` — feature_calc, alerts, realtime, scheduler |
| 소셜 | `engine/social/blocks.py`, `twitter_client.py` (Twitter API 토큰 필요) |
| Autoresearch | Paradigm Framework (`engine/autoresearch_ml.py`) — 5-methodology scoring |
| 테스트 | 1193 passed (2026-04-21 기준) |
