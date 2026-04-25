# COGOCHI — split copies (archive)

## Source vs copies

| Role | Path |
|------|------|
| **Canonical full PRD (edit here)** | `app/docs/COGOCHI.md` |
| **Split copies (derived; do not edit by hand)** | `docs/archive/cogochi/0*.md` |

The files `00`–`07` are **literal extracts** of the canonical file — same text, smaller chunks for navigation and focused reads. They are **not** a second source of truth.

## Regenerate splits after editing the original

From the repo root:

```bash
bash scripts/split-cogochi-archive.sh
```

If you add/remove sections in `COGOCHI.md`, **update the line ranges inside that script** so the eight parts still cover the full file with no gaps or overlap (the script checks total line count).

## Where “current product truth” lives (short)

- `docs/product/brief.md`, `docs/product/surfaces.md`, `docs/product/research-thesis.md`
- `docs/domains/contracts.md`

## Part index

| Part | File | Sections (§) |
|------|------|----------------|
| 0 | [`00-preface-and-status-patch.md`](./00-preface-and-status-patch.md) | Title + status patch |
| 1 | [`01-sections-00-through-07.md`](./01-sections-00-through-07.md) | §0–§7 |
| 2 | [`02-section-08-per-surface-spec.md`](./02-section-08-per-surface-spec.md) | §8 |
| 3 | [`03-sections-09-10-10a.md`](./03-sections-09-10-10a.md) | §9–§10A |
| 4 | [`04-section-11-data-contracts.md`](./04-section-11-data-contracts.md) | §11 |
| 5 | [`05-sections-12-through-15.md`](./05-sections-12-through-15.md) | §12–§15 |
| 6 | [`06-section-16-home-landing.md`](./06-section-16-home-landing.md) | §16 |
| 7 | [`07-sections-17-through-20-appendix.md`](./07-sections-17-through-20-appendix.md) | §17–§20 |

Last regenerated: 2026-04-14 (line ranges in `scripts/split-cogochi-archive.sh`).
