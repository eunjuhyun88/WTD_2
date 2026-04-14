# Domain: Terminal

## Goal

Deliver fast, evidence-rich interaction for live analysis and follow-up questions.

## Canonical Areas

- `app/src/routes/terminal`
- `app/src/routes/api/cogochi/terminal`
- `app/src/components/terminal`
- `app/src/routes/api/wizard`
- `docs/domains/contracts.md`

## Boundary

- Owns presentation, interaction flow, and streaming UX.
- Does not own indicator math or block-level signal logic.

## Inputs

- user query or command
- route/query params for symbol, timeframe, and challenge deep links
- contract-safe engine outputs returned through app API routes

## Outputs

- rendered market context and evidence
- streamed explanations or responses
- saved searches or challenge-creation requests forwarded through contracts

## Related Files

- `app/src/routes/terminal/+page.svelte`
- `app/src/routes/api/wizard/+server.ts`
- `app/src/lib/contracts/challenge.ts`

## Non-Goals

- feature calculation
- building block execution
- verdict math
