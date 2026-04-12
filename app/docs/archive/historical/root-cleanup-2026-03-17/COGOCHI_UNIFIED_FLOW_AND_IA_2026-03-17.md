# Cogochi Unified Flow And IA

Purpose:
- Collapse the current Cogochi + Stockclaw document set into one coherent product flow.
- Resolve route and page-purpose conflicts before more UI or implementation work lands.
- Define a single user journey and page IA that future specs should inherit from.

---

## 1. Product Definition

### One-line definition

Cogochi is an AI trading game and agent platform where the user:
- reads the market,
- encodes judgment into an agent,
- validates that agent in battle,
- publishes or rents the agent,
- and accumulates a durable performance record.

### Core value loop

The product is not two separate apps.

It is one loop:

`Analyze -> Encode -> Train -> Validate -> Publish -> Execute -> Record -> Improve`

### Page-purpose rule

Every top-level page gets one job only.

- `Terminal` = market reading and decision drafting
- `Arena` = validation through battle and reflection
- `Lab` = agent creation, doctrine, training, backtest
- `Market` = discovery, trust, rental, social proof
- `Passport` = identity, performance, holdings, history

If a screen does two of those jobs at once, it should be split or reduced.

---

## 2. Conflict Resolution

The current docs describe overlapping products. This section defines the target merge.

| Conflict | Wrong state | Unified decision |
| --- | --- | --- |
| `Signals` vs `Market` | community signal feed and agent marketplace are treated as separate top-level worlds | merge into one `Market` surface with tabs/sections |
| `Agents` vs `Roster` vs `Agent Detail` | agent collection appears both as collection UI and as training UI | agent collection belongs under `Lab`; agent detail is a shared drilldown route |
| `World` vs `Battle` vs `Reflection` | each is treated as a separate page in some docs and as one flow in others | treat them as one `Arena` shell with internal phases |
| `Passport` vs renter `Dashboard` | renter operations and identity/performance are split across two concepts | renter dashboard folds into `Passport` |
| `Oracle` | separate top-level leaderboard page | remove as primary page; keep only as a redirect or `Market` tab |
| `Backtest` as top-level page | breaks the creation/training flow into too many nav items | move into `Lab` |
| training controls inside `Passport` | mixes identity/history with creation operations | move training controls into `Lab`; `Passport` stays record-centric |

---

## 3. Primary Roles

There are only two product roles that matter at IA level.

### A. Trainer / Creator

Goal:
- turn a personal trading style into a trainable, provable, rentable agent

Primary loop:
- `Terminal -> Lab -> Arena -> Market -> Passport`

### B. Renter / Follower

Goal:
- find a trustworthy agent, subscribe, receive signals or auto-execution, track results

Primary loop:
- `Market -> Terminal -> Passport`

### Supporting state

The same account can move from renter to creator later.
Do not design these as permanently separate products.

---

## 4. Single Master User Journey

### Stage 0. Discover

`Home`

User arrives from social proof, agent share link, performance screenshot, or market alert.

They must understand three things within seconds:
- this is not a generic signal bot,
- decisions are trainable and verifiable,
- there is a free first action.

Primary exits:
- `Open Terminal`
- `Try Arena`
- `Browse Market`

### Stage 1. First value

There are two valid first-value paths.

#### Path A. Fast-value path

`Home -> Terminal`

The user:
- inspects market context,
- runs a scan,
- sees AI reasoning,
- saves a judgment pattern or tracks a signal.

This is the right path for users who already trade.

#### Path B. Game-value path

`Home -> Arena`

The user:
- enters a guided battle,
- sees how the system compares judgment,
- gets a result and reflection quickly.

This is the right path for users who need emotional onboarding and immediate feedback.

### Stage 2. Encoding

`Terminal -> Lab`

Once the user feels value, the next step is not more browsing.
It is encoding a style into a doctrine and training setup.

The user:
- saves a doctrine from analysis,
- selects archetype,
- chooses data scope and risk profile,
- queues AutoResearch or training.

### Stage 3. Validation

`Lab -> Arena`

The user validates the agent in battle or scenario replay.

Outputs:
- win/loss,
- failure cause,
- reflection,
- progress signal,
- candidate promotion to publishable state.

### Stage 4. Trust and monetization

`Arena or Lab -> Market`

The user either:
- publishes the agent,
- compares agents,
- subscribes to another creator,
- or uses proof and rankings to decide what to follow.

Trust comes from:
- battle record,
- backtest summary,
- on-chain or durable record,
- public profile,
- recent activity.

### Stage 5. Ongoing use

`Market -> Terminal -> Passport`

The renter/follower:
- receives signals,
- executes manually or via approved automation,
- reviews positions and outcomes,
- renews or churns based on results.

The creator:
- monitors rental demand,
- compares versions,
- retrains weak agents,
- uses Passport as the durable scorecard.

### Stage 6. Improvement loop

`Passport -> Terminal / Lab / Arena`

Passport should send the user back into action:
- weak accuracy -> return to Lab
- bad execution discipline -> return to Terminal
- poor validation -> return to Arena

Passport is a record surface, not the operating surface.

---

## 5. Target Top-level IA

Keep the top nav to six items max.

```text
/
├── /                    Home
├── /terminal            Market analysis and decision drafting
├── /arena               Validation shell (world, battle, result)
├── /lab                 Agent creation, doctrine, training, backtest
├── /market              Agent and signal marketplace
├── /passport            Identity, performance, holdings, history
└── /settings            Preferences only
```

Supporting routes:

```text
/agent/[id]              Shared agent detail route
/creator/[id]            Public creator profile
/market/agent/[id]       Optional alias -> /agent/[id]
```

Redirects / removals:

```text
/signals   -> /market?tab=feed
/oracle    -> /market?tab=leaderboard
/holdings  -> /passport?tab=wallet
/dashboard -> /passport?tab=subscriptions
/backtest  -> /lab?tab=backtest
/world     -> /arena?view=world
/battle    -> /arena?view=battle
```

---

## 6. Page Contracts

### 6.1 Home

Purpose:
- explain the product and route the user to the first valuable action

Must contain:
- product promise
- one creator proof block
- one renter proof block
- three CTAs: `Terminal`, `Arena`, `Market`

Must not contain:
- deep settings
- training operations
- wallet-first gating

### 6.2 Terminal

Purpose:
- help the user read the market and draft judgment

Key modules:
- chart
- scan / intel / war room
- agent reasoning
- track / copy / save doctrine

Primary exits:
- `Save to Doctrine` -> `Lab`
- `Track / Execute` -> `Passport`
- `Open Market evidence` -> `Market`

Must not become:
- a full training management page
- a profile page

### 6.3 Arena

Purpose:
- validate judgment through game-like battle and reflection

Internal phases:
- `Lobby / World`
- `Draft`
- `Battle`
- `Result / Reflection`

Primary exits:
- `Retry`
- `Promote to Lab`
- `Record in Passport`
- `Publish candidate to Market`

Arena should own:
- emotional payoff
- explicit judgment comparison
- replayable validation

Arena should not own:
- long-form doctrine authoring
- marketplace subscriptions

### 6.4 Lab

Purpose:
- create, train, tune, and evaluate agents

Recommended tabs:
- `Agents`
- `Doctrine`
- `AutoResearch`
- `Backtest`
- `Versions`

Inputs:
- saved doctrine from Terminal
- battle outcomes from Arena
- historic data / research jobs

Outputs:
- trained version
- backtest report
- publishable candidate

Lab is the creator operating system.

### 6.5 Market

Purpose:
- discover trustworthy agents and high-signal activity

Recommended tabs:
- `Feed`
- `Leaderboard`
- `Agents`
- `Subscriptions`

Feed:
- community signal and activity surface

Leaderboard:
- AI or creator ranking; not a standalone product

Agents:
- rentable agents with proof, pricing, fit, and risk summaries

Subscriptions:
- active rentals, renewals, and recent delivered value

Market is where `Signals` and `Marketplace` merge.

### 6.6 Passport

Purpose:
- show durable identity and performance

Recommended tabs:
- `Overview`
- `Positions`
- `Wallet`
- `Records`

Optional future tab:
- `Subscriptions`

Should contain:
- holdings
- open/closed positions
- battle record
- performance metrics
- badges, tier, streaks, calibration

Should not contain:
- agent training controls
- doctrine editing

Passport is the record of truth, not the control center for creation.

### 6.7 Settings

Purpose:
- user preferences only

Contains:
- default pair/timeframe
- data source
- SFX/notifications
- language/theme
- local reset

---

## 7. Correct Cross-page Flows

### Flow A. New trader

```text
Home
-> Terminal
-> run scan
-> save doctrine
-> Lab
-> train agent
-> Arena
-> result
-> Passport
```

### Flow B. Proof-seeking renter

```text
Home
-> Market
-> agent detail
-> verify proof
-> subscribe
-> Terminal alert / signal handoff
-> execute
-> Passport
```

### Flow C. Creator monetization

```text
Terminal
-> Lab
-> Arena
-> Backtest
-> Market publish
-> subscriber acquisition
-> Passport revenue/performance review
-> retrain in Lab
```

---

## 8. What To Remove From The Old Structures

Remove or stop promoting these patterns:

- separate `Signals` and `Market` as unrelated products
- separate `Oracle` top-level page
- separate `Dashboard` for renters
- separate `Backtest` top-level nav item
- training controls inside `Passport`
- world and battle as unrelated top-level destinations
- duplicated agent collection concepts across `Agents`, `Roster`, and `Market`

---

## 9. Recommended Implementation Mapping For Current Frontend

This is the least disruptive mapping from the current codebase.

| Current route | Target meaning | Action |
| --- | --- | --- |
| `/` | Home | keep |
| `/terminal` | Terminal | keep |
| `/arena` | Arena shell | keep and absorb world/battle/result modes |
| `/arena-war` | arena mode experiment | demote from primary nav; fold as mode later |
| `/arena-v2` | arena mode experiment | demote from primary nav; fold as mode later |
| `/signals` | Market feed | rename or conceptually remap |
| `/oracle` | Market leaderboard | keep as redirect only |
| `/agents` | Lab agents tab | demote from top-level nav over time |
| `/passport` | Passport | keep |
| `/settings` | Settings | keep |

Required future additions:
- `/lab`
- optional `/market` alias shell over current `signals` route

---

## 10. Non-goals

This document does not define:
- token economics in detail
- smart contract rollout order
- final art direction
- low-level component specs
- data schema or API contract changes

Those belong to separate docs.

---

## 11. Bottom-line Decision

If one sentence must govern the whole product:

`Terminal is where judgment is made, Lab is where judgment becomes an agent, Arena is where the agent is proven, Market is where proof is sold, and Passport is where outcomes are remembered.`

If a page cannot be explained with that sentence, it likely does not belong in the main flow.
