# CI Pipeline

## Purpose

This file defines the remote CI rules that mirror the local agent operating model.

The goal is:

- local gates and remote gates should mean the same thing
- pushes and merges should fail for the same reasons in both places
- merge discipline should be explicit, not social-only

## Pipeline Model

The installed workflow is `.github/workflows/ci.yml`.

It runs two stages:

1. `Context Gate`
   - `npm run ci:context`
   - expands to:
     - `npm run gate:context`
2. `Project Checks`
   - `npm run ci:install`
   - `npm run ci:all`
   - expands to:
     - configured `gate`
     - configured `check`
     - configured `build`

## What The Context Gate Must Prove

The context gate is the minimum remote merge barrier.

It must prove that:

- canonical docs are current
- generated docs are not stale
- semantic context quality passes
- coordination claims are valid
- sandbox policy checks pass

In practice this means:

- `docs:check`
- `ctx:check -- --strict`
- `sandbox:check`

Remote CI runs `coord:check` only when committed coordination claim artifacts are available,
or when `CTX_CI_REQUIRE_COORD=1` is explicitly set.

Reason:

- local pre-push is the primary place where ephemeral `.agent-context/` claims are enforced
- most repos do not commit `.agent-context/coordination/claims/*.json`
- remote CI should not fail just because local ephemeral claim state is intentionally untracked

## What The Project Checks Must Prove

Project checks are repo-specific.

They should use:

- `commands.gate`
- `commands.check`
- `commands.build`

from `context-kit.json`, or matching npm scripts if those commands are not explicitly configured.

## Merge Criteria

Do not merge unless all of these are true:

1. CI `Context Gate` passes
2. CI `Project Checks` passes
3. the branch includes the latest protected branch state
4. the active task has a semantic checkpoint or current brief
5. any active coordination claim has been resolved, released, or handed off

## Recommended Branch Protection

For GitHub:

- protect the main branch
- require pull requests before merge
- require status checks before merge
- require up-to-date branches before merge
- prefer squash merge
- disable force-pushes to the protected branch

Recommended required checks:

- `Context Gate`
- `Project Checks`

## Local And Remote Parity

Local pre-push and remote CI should stay aligned:

- local: `.githooks/pre-push`
- remote: `.github/workflows/ci.yml`

If one is updated, update the other.

## Dependency Installation Rule

CI should install dependencies only as much as needed to run repo-specific checks.

The provided install script supports:

- `pnpm-lock.yaml`
- `yarn.lock`
- `package-lock.json`
- `npm-shrinkwrap.json`
- fallback `npm install` when only `package.json` exists

## Interpretation

This repository treats CI as part of the agent operating system:

- local hooks stop bad state before push
- CI stops bad state before merge
- branch protection turns those checks into actual merge policy
