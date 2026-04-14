# System Architecture

This document defines the current high-level structure with ownership boundaries.

## Context Diagram

```mermaid
flowchart LR
  Browser[Browser / UI] --> App[SvelteKit App]
  App --> Engine[FastAPI Engine]
  App --> AppDB[(App DB / Supabase)]
  Engine --> Cache[(Engine Data Cache)]
  Engine --> Exchange[Market Data APIs]
  Engine --> EngineStore[(Engine Ledger / Models)]
```

## Ownership Map

- `app/`: UI surface and orchestration only
- `engine/`: canonical decision logic and scoring
- `docs/`: product/domain/decision truth and runbooks
- `research/`: hypotheses, eval protocol, experiment records

## Analyze Hot Path

```mermaid
sequenceDiagram
  participant U as User
  participant A as App /api/cogochi/analyze
  participant P as Providers
  participant E as Engine /deep + /score

  U->>A: analyze(symbol, timeframe)
  A->>P: fetch raw market bundle
  P-->>A: klines/perp/depth/liquidations
  A->>E: POST /deep
  A->>E: POST /score
  E-->>A: deep + score payloads
  A-->>U: mapped response (or explicit degraded envelope)
```

## Route Types

- proxy routes: pass-through only, no app-domain logic
- orchestrated routes: app assembles inputs and calls engine
- app-domain routes: engine not involved

## Reliability Notes

- degraded responses must set explicit degraded flags/reasons
- app never executes duplicated engine scoring logic
- contract updates must include both engine schema and app type sync
