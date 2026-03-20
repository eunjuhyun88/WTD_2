# Tech Debt Tracker

Purpose:
- Track structural and context-management debt that compounds if ignored.

| Debt | Severity | Why it matters | Target action |
| --- | --- | --- | --- |
| Upstream Arena/War authority outside git root | high | agents need to leave repo for deep semantics | localize stable rules into repo-local specs |
| Sibling clone drift | high | duplicated code and docs increase review noise and stale guidance | freeze or archive non-canonical clones |
| Large watch log as implicit memory layer | medium | hard to query and easy to misuse as authority | promote stable findings into canonical docs |
| Dated working docs acting like canon | medium | newer agents may open the wrong file first | keep canonical entry docs up to date |
| Missing generated schema/index artifacts | medium | data reasoning remains slower than necessary | add more derived/generated summaries |
