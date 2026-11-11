# Skyberry design system

Source of truth: `src/app/globals.css` (tokens + component classes) and `src/components/{ui,nav,avatar,logo}.tsx`.

## Principles
- **Sky identity, controlled hierarchy.** White and ice surfaces carry content; *deep sky* (`--brand`) is the single action colour; Skyberry Blue and cyan are small highlights; navy is reserved for immersive spaces (Universe, media viewers).
- **Restrained glass.** Only chrome that floats over content is glass: mobile header, bottom navigation, chat header and composer, dialogs/sheets, the sticky settings bar, overlays inside the 3D scene. Everything else is a solid, quiet card.
- **Calm motion.** Short entrances (`.rise`), pressed states, sheet transitions and the pet's own animation. Nothing floats or pulses for decoration. `prefers-reduced-motion` and the in-app *Reduce motion* setting stop animation (the 3D scene renders on demand only).
- **One icon family.** Lucide, 1.9 stroke at rest; active navigation uses a heavier stroke, a soft fill and an ice pill. No emoji anywhere in the interface.

## Colour tokens (all text pairs ≥ 4.5:1)
| Token | Value | Use |
| --- | --- | --- |
| `--bg` / `--bg-2` | `#F3F9FD` / `#EAF5FB` | page backgrounds |
| `--surface` / `--surface-2` / `--ice` | `#FFFFFF` / `#F0F8FD` / `#DCF0F9` | cards, panels, active pills |
| `--line` / `--line-strong` | `#D9ECF7` / `#C3DFEF` | hairlines, field borders |
| `--ink` / `--ink-dim` / `--ink-faint` | `#142E46` / `#4E6A82` / `#5F798E` | text (primary / secondary / metadata) |
| `--brand` | `#1A78B4` | filled buttons, own message bubbles (white text 4.8:1) |
| `--brand-text` | `#1570A8` | links, active labels |
| `--sky` / `--sky-bright` / `--sky-deep` | `#48B9F2` / `#70D0F8` / `#218BCB` | indicators, progress, rings — never behind white text |
| `--cyan` | `#42D5E8` | tiny highlights (navy text only) |
| `--lavender` | `#7D8CF0` | rare secondary accent |
| `--warm` / `--success` / `--danger` | `#B4650C` / `#127A60` / `#C23434` | streaks, confirmations, destructive |
| `--space` / `--space-2` / `--space-3` | `#07182C` / `#0D2945` / `#123B5A` | immersive scenes |
| glass | `rgba(255,255,255,.76)`, blur 18px, border `rgba(255,255,255,.88)`, shadow `0 8px 30px rgba(35,108,150,.08)` | |

Why some palette values moved: white on `#48B9F2` is only 2.2:1 and `#91A8B9` text is 2.5:1, so filled actions use `#1A78B4` and muted text uses `#5F798E`.

## Type & shape
Manrope Variable only. Page titles 26/30px, section titles 16px/800, body 15.5px. Radii: 12 / 18 / 24px (cards 24, controls 13–14, chips round). Shadows: `--shadow-1` for cards, `--shadow-2` for hero surfaces.

## Components (CSS classes)
`.card`, `.card-flat`, `.panel`, `.glass`, `.glass-ice`, `.glass-dark`, `.btn` + `.btn-primary | .btn-soft | .btn-tint | .btn-ghost | .btn-danger | .btn-sm`, `.icon-btn`, `.field`, `.label`, `.hint`, `.chip`, `.badge`, `.eyebrow`, `.section-title`, `.skeleton`. React: `PageHeader`, `Section`, `EmptyState`, `ErrorNote`, `OkNote`, `Spinner`, `Avatar` (stored accent keys map to Periwinkle, Sky, Glacier, Sunrise, Lavender).

## Navigation
Mobile: glass bottom bar (Home, Chats, Camera, Universe, Profile) inset from the edges, safe-area aware; Camera is a modest filled tile. Desktop: sidebar with the same five, a *Spaces* group (Rooms, Games, Saved, Gallery) and utilities (Search, Notifications with live count, Settings).
