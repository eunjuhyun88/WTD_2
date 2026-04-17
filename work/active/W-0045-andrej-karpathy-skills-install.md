## Goal

Register the external Codex skill(s) from `forrestchang/andrej-karpathy-skills` into the local Codex skills directory so they are available after restart.

## Owner

research

## Scope

- inspect the external repository structure enough to identify installable skill path(s)
- install the requested skill package into `$CODEX_HOME/skills`
- record the exact installed target and minimal verification state

## Non-Goals

- modifying existing app or engine code
- reorganizing current local skill directories beyond the requested install
- committing or merging unrelated repository changes

## Canonical Files

- `AGENTS.md`
- `work/active/W-0045-andrej-karpathy-skills-install.md`
- `/Users/ej/.codex/skills/.system/skill-installer/SKILL.md`
- external reference: `https://github.com/forrestchang/andrej-karpathy-skills`

## Facts

- the user explicitly requested registration of `https://github.com/forrestchang/andrej-karpathy-skills`
- local Codex user skills currently include `playwright`, `playwright-interactive`, and `security-best-practices`
- `skill-installer` is already available as a system skill and provides `install-skill-from-github.py`
- the repository exposes an installable Codex skill at `skills/karpathy-guidelines`
- `karpathy-guidelines` is now installed at `/Users/ej/.codex/skills/karpathy-guidelines`

## Assumptions

- the target repository contains one or more valid Codex skill directories

## Open Questions

- none

## Decisions

- use the built-in `skill-installer` workflow instead of manually copying files
- keep this task isolated to local skill installation and documentation only
- use installer `--method git` because direct zip download failed on local Python SSL certificate verification

## Next Steps

- restart Codex so the newly installed skill is loaded into future sessions

## Exit Criteria

- the requested external skill is present in the local Codex skills directory
- the installed path is recorded here with any remaining ambiguity noted
- the user is told whether a Codex restart is required

## Handoff Checklist

- active work item for this install exists and reflects the latest status
- install target and verification result are recorded here
- no unrelated repository files are modified by this task
