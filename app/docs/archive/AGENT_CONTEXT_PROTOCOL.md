# Agent Context Protocol

Scope: current git worktree rooted at this repository

## 1) Purpose

Prevent context loss and reduce restart cost across long-running agent work.

## 2) Context Architecture

- `snapshot`: machine state
- `checkpoint`: semantic memory
- `brief`: fast resume
- `handoff`: fuller transfer
- `resume`: active-work bundle that resolves the current claim/work state first
- `claim`: multi-agent ownership and path boundary
- `autopilot`: optional session boot wrapper around claim, checkpoint, resume, save, and compact

## 3) Core Commands

- `npm run ctx:save`
- `npm run ctx:checkpoint`
- `npm run ctx:compact`
- `npm run ctx:resume`
- `npm run ctx:restore -- --mode brief`
- `npm run ctx:restore -- --mode handoff`
- `npm run ctx:check -- --strict`
- `npm run coord:claim`
- `npm run coord:check`
- `npm run coord:release`
- `npm run pilot:start`
- `npm run pilot:sync`

## 4) Rules

- use checkpoints for non-trivial work
- use `ctx:resume` first so the active work id, claim, brief, and handoff are resolved together
- use `pilot:start` only when the session should claim or pick work on purpose
- use briefs for fast resume when the active work id is already obvious
- keep pinned facts durable and minimal
- do not commit runtime memory
- do not work on a feature branch without an active coordination claim
