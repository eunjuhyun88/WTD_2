# Create Agent Page

Route scope:
- `/create`

Purpose:
- Define the first-run activation route that creates a usable agent and hands the user into `Terminal`.

## Primary User Job

- Complete character selection, minting, AI binding, and starter setup in one guided flow.

## Core Flow

1. User selects a character shell.
2. User enters an agent name.
3. User connects wallet if not already connected.
4. User completes mint or activation.
5. User binds an AI/model source.
6. User chooses starter temperament or doctrine preset.
7. Completion state unlocks `Terminal` and routes the user there.

## Guardrails

- Do not split minting and AI setup across separate top-level pages.
- The route must end with one concrete outcome, not a vague “setup later” state.
- Wallet, mint, and AI errors must be explicit and recoverable in-route.
- The page should feel ceremonial, but not slow or overloaded.

## Key UI Blocks

- step progress header
- character shell selector
- name input
- wallet connect block
- mint / activation confirmation block
- AI bind block
- starter setup block
- completion summary and `Enter Terminal` CTA

## State Authority

- selected shell, draft name, and step UI state: route local
- wallet connection: `walletStore`
- mint / activation result: server-authoritative wallet + mint state
- AI binding and starter setup: server-backed agent creation workflow

## Supporting APIs And Data

- wallet connect flow from `walletStore`
- future create-agent API workflow
- agent shell metadata source

## Failure States

- mint succeeds but the route does not create a usable agent state
- AI binding fails silently after mint
- the user leaves without understanding whether Terminal is unlocked
- wallet gating interrupts the ceremony and feels like a separate product

## Read These First

- `docs/product-specs/create-agent.md`
- `docs/design-docs/six-surface-game-loop.md`
- `docs/product-specs/terminal.md`
