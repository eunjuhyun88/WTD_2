# Cogochi Page Architecture Spec

Date: 2026-03-17
Status: Active
Scope: User-facing IA, page roles, gating, primary CTAs, and page-by-page structure
Rule: Confirmed design only. Unknown items remain explicitly marked as open.

## 1. Product Definition

Cogochi is an AI agent training game where the player mints an agent, prepares its brain, trains it, deploys it into BTC history, and intervenes only at decisive whale encounters.

Core loop:

1. Mint agent
2. Prepare and connect the brain
3. Train in Lab
4. Deploy into BTC history
5. Auto-play through eras
6. Enter whale battle when triggered
7. Receive Reflection
8. Feed battle outcome and override data back into growth

## 2. Canonical IA

The product uses seven top-level user-facing pages.

1. Home
2. Create Agent
3. Terminal
4. Lab
5. World
6. Battle
7. Passport

## 3. IA Logic

### Why these seven pages exist

- `Home` explains the product and routes the player into creation or continuation.
- `Create Agent` is the mandatory creation and mint step.
- `Terminal` is the brain connection and operational setup screen.
- `Lab` is the training, doctrine, and readiness screen.
- `World` is the main BTC-history exploration screen.
- `Battle` is the whale encounter battle screen.
- `Passport` is the identity, record, and profile hub for the agent.

### Why these pages are separate

- `Create Agent` must be separate because minting is a required starting condition.
- `Terminal` and `Lab` must be separate because brain connection is different from brain training.
- `World` and `Battle` must be separate because exploration and encounter are different modes.
- `Passport` remains separate because identity and history are persistent meta layers.

## 4. Global Gating

### Unlock order

1. `Home`
2. `Create Agent`
3. `Terminal`
4. `Lab`
5. `World`
6. `Battle`
7. `Passport`

### Gate rules

- Without a minted agent, the user cannot enter `Terminal`, `Lab`, `World`, `Battle`, or `Passport`.
- Without terminal setup completion, the user cannot deploy to `Lab` or `World`.
- Without lab readiness completion, the user cannot enter `World`.
- `Battle` is entered from `World` when a whale encounter triggers.
- `Passport` is available after agent creation because it is the persistent identity hub.

## 5. Global Navigation

### Primary navigation

Always visible after agent creation:

- Terminal
- Lab
- World
- Passport

### Conditional navigation

- `Create Agent` is shown as the main CTA before agent creation.
- `Battle` is not a normal browsing destination. It is entered from `World` during a whale encounter.

### Home CTA by user state

- No agent: `Create Agent`
- Agent exists but terminal setup incomplete: `Continue Setup`
- Terminal complete but lab readiness incomplete: `Continue Training`
- World unlocked: `Enter World`

## 6. Page Specs

## 6.1 Home

### Purpose

Explain the product and move the user into the next valid state.

### User question answered

"What is Cogochi, and what should I do next?"

### Entry conditions

- Always accessible

### Exit conditions

- Move to `Create Agent`
- Move to `Terminal`, `Lab`, or `World` depending on player state

### Primary CTA

- `Create Agent` for new users
- State-based continuation CTA for returning users

### Required sections

1. Hero
2. Core loop preview
3. Why Cogochi is different
4. Agent preview
5. State-based next action

### Hero copy direction

- Mint your own AI agent
- Train the brain before deployment
- Send it into BTC history
- Intervene only when whales appear

### What Home must not contain

- Full mint form
- Detailed terminal tools
- Full battle UI
- Full passport data

## 6.2 Create Agent

### Purpose

Create and mint the player-owned agent container.

### User question answered

"How do I create my own agent?"

### Entry conditions

- No agent exists yet

### Exit conditions

- Agent minted
- Passport identity created
- Terminal unlocked

### Primary CTA

- `Mint Agent`

### Required sections

1. Character shell selection
2. Agent naming
3. Wallet connection
4. Mint confirmation

### Required outputs

- Agent ID
- Agent shell
- Initial Stage 1 status
- Passport identity

### What Create Agent must not include

- Full training flow
- World map
- Battle session

## 6.3 Terminal

### Purpose

Connect and configure the agent brain before training and deployment.

### User question answered

"Is this agent brain connected and ready to begin preparation?"

### Entry conditions

- Agent minted

### Exit conditions

- Brain source connected
- Minimum setup complete
- Lab unlocked

### Primary CTA

- `Continue To Lab`

### Required sections

1. Connected model status
2. Data source connection
3. Brain setup checklist
4. Operational health and connection state

### Minimum completion conditions

All of the following must be complete:

1. Brain connected
2. Required source binding complete
3. Setup checklist complete

### Terminal role boundaries

Terminal is for:

- Brain connection
- Data binding
- Operational state
- Readiness checks

Terminal is not for:

- Long-form training loops
- Whale battles
- World exploration

## 6.4 Lab

### Purpose

Train the agent and define behavior before deployment to the world.

### User question answered

"What should I teach this agent before I send it into BTC history?"

### Entry conditions

- Agent minted
- Terminal minimum setup complete

### Exit conditions

- Readiness criteria complete
- World unlocked

### Primary CTA

- `Deploy To World`

### Required sections

1. Doctrine and behavior tuning
2. Training tasks
3. Override learning inputs
4. Readiness checklist
5. Promotion/readiness summary

### Minimum readiness conditions

The exact readiness formula is product-controlled, but the page must expose a single deploy readiness state.

Display pattern:

- `Not Ready`
- `Ready For World`

### Lab role boundaries

Lab is for:

- Training
- Doctrine
- Behavior shaping
- Readiness for world deployment

Lab is not for:

- Wallet minting
- Whale battle runtime
- Persistent profile display

## 6.5 World

### Purpose

Serve as the main gameplay map where the agent auto-progresses through BTC history.

### User question answered

"Where is my agent in BTC history, and what is happening now?"

### Entry conditions

- Agent minted
- Terminal complete
- Lab readiness complete

### Exit conditions

- Whale encounter triggers `Battle`
- User may navigate to `Lab`, `Terminal`, or `Passport`

### Primary CTA

- Stateful:
  - `Continue`
  - `Resume Run`
  - `Enter Battle` when an encounter is live

### Required sections

1. BTC history map
2. Era display
3. Time speed controls (`x1`, `x3`, `x8`)
4. Agent position on price
5. Whale markers
6. Agent HP
7. Intervention card inventory
8. Recent auto-battle summary

### Confirmed world logic

- Map is BTC historical chart from 2017 to present
- Time moves automatically by month
- Agent travels on the BTC price path
- Whale markers appear on historical large-position entry points
- Encounter auto-triggers when close
- Cleared whales display as complete

### World role boundaries

World is for:

- Exploration
- Auto progression
- Era traversal
- Encounter discovery

World is not for:

- Detailed model wiring
- Doctrine editing
- Full battle resolution screen

## 6.6 Battle

### Purpose

Resolve whale encounters through a three-round candle battle.

### User question answered

"Do I intervene now, or let the agent handle this whale alone?"

### Entry conditions

- Triggered from `World`

### Exit conditions

- Battle result resolved
- Reflection shown
- Growth state updated
- Return to `World` or open `Passport`

### Primary CTA

- State-based:
  - `Use Override`
  - `Use Boost`
  - `Skip`
  - `Continue`

### Required sections

1. Whale intro
2. Round 1
3. Round 2
4. Round 3
5. Result
6. Reflection

### Confirmed battle logic

- One battle equals three rounds
- Each round reveals one candle
- Agent chooses LONG, SHORT, or HOLD
- Player may intervene within the decision window
- Two or more wins defeat the whale
- HP falls on loss and recovers slightly on win
- HP 0 does not kill the agent

### Confirmed intervention cards

- `OVERRIDE`
- `BOOST`
- `SKIP`

### Open battle questions

These are not yet fixed and must not be treated as implemented rules:

1. How intervention cards are earned
2. Whether whale classes vary by size or boss state
3. Whether multiplayer exists

## 6.7 Passport

### Purpose

Act as the permanent identity and record hub for the player-owned agent.

### User question answered

"Who is my agent, and how has it grown?"

### Entry conditions

- Agent minted

### Exit conditions

- Navigate back to Terminal, Lab, or World
- Share profile

### Primary CTA

- `Share Agent`

### Required sections

1. Agent identity
2. Stage
3. Win/loss record
4. Whale clear history
5. Reflection history
6. Trainer card
7. Share state
8. Rental state

### Confirmed stage rules

- Stage 1: auto fine-tuning once, 50% range, not rentable
- Stage 2: 200+ battles, 60% range, rentable
- Stage 3: 500+ battles, 65%+, higher rental range

### Passport role boundaries

Passport is for:

- Identity
- Record
- Share
- Social proof
- Rental state

Passport is not for:

- Brain connection
- World traversal
- Live battle resolution

## 7. Canonical User Journey

### First-time user

1. Home
2. Create Agent
3. Terminal
4. Lab
5. World
6. Battle
7. Passport

### Returning user

1. Home
2. State-based continuation:
   - Terminal if setup is incomplete
   - Lab if training is incomplete
   - World if world is unlocked
3. Battle when triggered
4. Passport when checking progress or sharing

## 8. Page-State Summary

| Page | Main purpose | Unlock requirement | Main CTA |
|---|---|---|---|
| Home | Explain and route | None | Create Agent / Continue |
| Create Agent | Mint and create | None | Mint Agent |
| Terminal | Connect brain | Agent minted | Continue To Lab |
| Lab | Train and tune | Terminal complete | Deploy To World |
| World | Main gameplay map | Lab ready | Resume Run / Enter Battle |
| Battle | Resolve whale encounter | Whale encounter live | Use Card / Continue |
| Passport | Identity and record | Agent minted | Share Agent |

## 9. Non-Goals For This Spec

This document does not define:

- Tokenomics
- Contract implementation
- Exact intervention card economy
- Multiplayer
- Admin dashboard implementation
- Visual style tokens
- Backend architecture

## 10. Implementation Consequences For Current Frontend

Current route alignment target:

- `/` -> Home
- `/create` -> Create Agent
- `/terminal` -> Terminal
- `/lab` -> Lab
- `/world` -> World
- `/arena` or `/battle` -> Battle
- `/passport` -> Passport

Current merge implications:

- `Battle` remains its own route and should be user-labeled as Battle
- `Passport` should become the full agent identity hub
- `World` is a new route, not a rename of the full current Terminal
- `Terminal` and `Lab` remain separate responsibilities

## 11. Final Rule

The order of product understanding and progression is:

1. Own the agent
2. Connect the brain
3. Train the brain
4. Deploy into BTC history
5. Fight whales
6. Record growth

If a page or feature does not serve one of those steps, it is not part of the core MVP path.
