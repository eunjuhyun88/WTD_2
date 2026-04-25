# Hooti Character & Color System Redesign

## Context
The project currently uses a terracotta (#D97757) palette with a cream-toned PixelOwl mascot. The user has provided a complete new design system: **Hooti Blue** (#2F6FDF) palette with blue owl character, new expression variants, dark mode, and pixel-style UI components. This is a full visual identity overhaul.

## Execution Order

### Phase 1: Design Tokens (tokens.css)
**Impact: HIGH (cascades to 662 `var(--accent)` usages across 118 files)**

Replace in `:root`:
| Token | Old | New |
|-------|-----|-----|
| `--accent` | `#D97757` | `#2F6FDF` |
| `--accent-hover` | `#C4644A` | `#1F5FD4` |
| `--accent-light` | `#E8D5C4` | `#DBEAFE` |
| `--accent-subtle` | `rgba(217,119,87,0.12)` | `rgba(47,111,223,0.12)` |
| `--gold` | `#b7860e` | `#FFC83D` |
| `--blue` | `#2d6ca2` | `#2F6FDF` |

Add new tokens: `--hooti-blue`, `--beak-yellow`, `--btn-primary/secondary` states

Update all glow/card-glow rgba from terracotta to blue

Update light theme neutrals to cool tones (`#F4F7F9`, `#D3DDE6`, `#E6EDF2`)

Add `[data-theme="dark"]` block (surface `#1E293B`, bg `#111827`, text `#F8FAFC`/`#94A3BB`/`#6474BB`)

---

### Phase 2: PixelOwl Repalette (PixelOwl.svelte)
**Impact: MEDIUM (11 consumer components auto-update)**

Replace COLORS map only (no frame grid changes):
| Key | Old (terracotta) | New (blue) |
|-----|-----------------|------------|
| K (outline) | `#2D2D2D` | `#0F172A` |
| T (body) | `#D97757` | `#2F6FDF` |
| t (highlight) | `#E8956E` | `#5B8FE8` |
| S (shadow) | `#C4644A` | `#1E3A5F` |
| s (deep shadow) | `#B85A3E` | `#193050` |
| F (face disc) | `#FAF0EB` | `#FFFFFF` |
| f (face shadow) | `#EDD8CB` | `#E8EDF4` |
| C (chest) | `#E8D5C4` | `#A0C4F0` |
| G (beak) | `#C8960F` | `#FFC83D` |
| g (feet) | `#A67A0A` | `#E0A800` |

W (white) and P (pupil) stay as-is.

---

### Phase 3: App Shell Hardcoded Colors (App.svelte, NavBar.svelte)
Replace all hardcoded `rgba(217, 119, 87, ...)` and warm brown (`rgba(192, 147, 113, ...)`) with blue equivalents in:
- `App.svelte`: backdrop grid, orbs, selection, ai-toggle, body bg
- `NavBar.svelte`: rail gradient, mobile nav bg, brand button borders
- `SiteFooter.svelte`: minimal changes (already tokenized)

---

### Phase 4: Component Hardcoded Colors (batch)
Systematic find-replace across ~91 files:
- `#D97757` / `#C4644A` / `#E8D5C4` / `#E8956E` / `#B85A3E` / `#FAF0EB` / `#EDD8CB` hex values
- `rgba(217, 119, 87, ...)` inline values
- Group by: data/config files, hero components, studio components, agent components, remaining

---

### Phase 5: New PixelOwl Expressions (PixelOwl.svelte)
Add expression frames matching character sheet:
- `thinking` (thought bubbles above head)
- `determined` (narrowed eyes)
- `confident` (sunglasses)
- `questioning` (question mark + blush)
- `nervous` (sweat drops)
- `acting` (sparkle effect)

Add new colors: `Q` (pink blush), `B` (light blue bubble), `X` (gold sparkle), `D` (black sunglasses)

Add new moods with animation sequences for each expression.

---

### Phase 6: Dark Mode Infrastructure
- Create `themeStore.ts` (writable store + localStorage)
- Make `App.svelte` data-theme reactive
- Add dark mode toggle to NavBar
- Add dark-specific backdrop styles

---

### Phase 7: Expression-Based Character Placement
- `EmptyState.svelte`: optional `owlMood` prop to show PixelOwl instead of emoji
- `App.svelte` error state: nervous owl
- `PageSkeleton.svelte`: thinking owl during loading

---

## Key Files
- `src-svelte/lib/tokens.css` - design tokens
- `src-svelte/lib/components/PixelOwl.svelte` - mascot component
- `src-svelte/App.svelte` - app shell
- `src-svelte/lib/layout/NavBar.svelte` - navigation
- `src-svelte/lib/layout/SiteFooter.svelte` - footer
- `src-svelte/lib/components/HeroSection.svelte` - hero component
- `src-svelte/lib/components/HeroLanding.svelte` - landing hero

## Verification
After each phase: `npm run build` + visual check at desktop/mobile breakpoints.
Final grep for zero remaining terracotta references: `grep -r "D97757\|C4644A\|E8D5C4" src-svelte/`
