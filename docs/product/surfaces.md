# Product Surfaces

## Active Surfaces

- `app/src/routes/terminal`: primary AI research surface
- `app/src/routes/lab`: research and experiment workflows
- `app/src/routes/dashboard`: summarized monitoring and status

## Supporting APIs

- `app/src/routes/api/cogochi/*`: analysis and terminal orchestration
- `app/src/routes/api/market/*`: market data endpoints for UI rendering

## Surface Rules

- Surfaces must consume engine artifacts through defined contracts.
- Surface code must not duplicate engine feature/block logic.
- UI-specific state lives in `app`; domain logic remains in `engine`.
