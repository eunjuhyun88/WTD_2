# W-0016 App Warning Cleanup

## Goal

Reduce current `app` Svelte warnings without changing product behavior.

## Owner

app

## Scope

- clean low-risk accessibility warnings in terminal surfaces
- fix cross-browser CSS compatibility warnings
- remove confirmed dead CSS selectors from shared modal components

## Non-Goals

- redesign terminal layouts or wallet flows
- change engine contracts or backend behavior
- rewrite archived or reference docs

## Canonical Files

- `work/active/W-0016-app-warning-cleanup.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/mobile/MobileCommandDock.svelte`
- `app/src/components/terminal/workspace/SymbolPicker.svelte`
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte`
- `app/src/components/terminal/workspace/SaveSetupModal.svelte`
- `app/src/components/modals/WalletModal.svelte`

## Decisions

- warning cleanup should prefer semantic markup over blanket ignore comments
- dead selectors may be removed only after verifying there is no matching markup in the component
- terminal fixes stay surface-only and must not expand app-engine coupling

## Next Steps

- patch the current warning set
- rerun `npm --prefix app run check`
- leave only warnings that require broader design decisions

## Exit Criteria

- `npm --prefix app run check` reports no avoidable warnings in the touched files
- terminal and wallet modal behavior remains unchanged
