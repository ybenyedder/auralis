# Auralis Design System — Apple Music

> Reference for the post-redesign UI. The old 31-theme engine (Spotify clone +
> 23 animated cosmic/vivid/ambiance themes with starfields, nebulae, glass) has
> been retired. We now ship one opaque palette in two modes — **dark** and
> **light** — inspired by Apple Music.

## Appearance modes

Driven by `src/lib/auralis/themes.ts` (`Mode = "dark" | "light" | "auto"`):

- `applyMode(mode)` writes `data-mode` + `.light`/`.dark` on `<html>` and syncs
  `<meta name="theme-color">`.
- An inline bootstrap script in `src/app/layout.tsx` reads `localStorage`
  **before first paint** to avoid a FOUC flash of the wrong palette.
- "auto" resolves to dark/light via `prefers-color-scheme`.
- The settings panel (`DetailView.tsx` → `ModeSelector`) exposes the choice.

## Palette tokens (`src/app/globals.css`)

All colours are CSS variables on `:root` (dark default) and overridden under
`:root[data-mode="light"]` / `:root.light`.

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--background` | `#000000` | `#FFFFFF` | app stage |
| `--foreground` | `#FFFFFF` | `#000000` | primary text |
| `--surface-1` | `#1C1C1E` | `#F2F2F7` | cards (iOS secondarySystemBackground) |
| `--surface-2` | `#2C2C2E` | `#E5E5EA` | elevated cards / hover |
| `--surface-3` | `#3A3A3C` | `#D1D1D6` | active / pressed |
| `--sidebar` | `#000000` | `#F7F7F9` | nav column |
| `--popover` | `#1C1C1E` | `#F2F2F7` | popovers / menus |
| `--primary` | `#FA233B` | `#FA233B` | Apple Music red (accent) |
| `--ink` | `#FFFFFF` | `#FFFFFF` | text on the red accent |
| `--text-muted` | `#98989F` | `rgba(60,60,67,0.6)` | iOS secondaryLabel |
| `--text-faint` | `#636366` | `rgba(60,60,67,0.3)` | iOS tertiaryLabel |
| `--line` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.08)` | hairlines |
| `--destructive` | `#FF453A` | `#FF3B30` | iOS systemRed |

> `--panel`, `--panel-2`, `--panel-3` are kept as **aliases** of the surface
> tiers so legacy class names keep resolving during the component refresh; new
> code should prefer `--surface-*`.

## Typography

- Font stack: `-apple-system, "SF Pro Display", "SF Pro Text", var(--font-inter, "Inter"), …`
- SF Pro renders natively on Apple platforms via `-apple-system`. Elsewhere we
  load **Inter** (`next/font/google` in `layout.tsx`) as a legal approximation
  of SF Pro (SF Pro itself is not redistributable outside Apple).

## Radius scale (base 10px)

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | chips, tight pills |
| `--radius-sm` | 6px | small controls |
| `--radius-md` | 8px | rows |
| `--radius-lg` | 10px | cards |
| `--radius-xl` | 14px | artwork covers |
| `--radius-2xl` | 20px | large surfaces |

All six are registered in `tailwind.config.ts` (`rounded-xs` … `rounded-2xl`).

## Component grammar

- **Sidebar** — flat single list with section headers (Apple Music / Bibliothèque
  / Playlists), active item in `--primary`. No stacked rounded boxes.
- **Cards** — `matte-panel` (surface-1 → surface-2 on hover), `rounded-xl`,
  square artwork `rounded-xl`. Play FAB uses `.signal-button` (red fill).
- **Fullscreen player** — square static cover (no tilt, no blurred-cover wash).
  Backdrop is a single soft vertical tint from the cover palette fading to
  `--background`.
- **Track rows** — hover `bg-[var(--surface-2)]`, current track in `--primary`.
- **Player bar** — play button red (`bg-[var(--primary)]`); sliders track
  `--surface-3`, fill `--foreground` → `--primary` on hover.
- **Mobile** — tab bar active label/icon in `--primary`.

## Light-mode rules (important)

Never hardcode `text-white` / `bg-white/*` / `bg-black/*` for normal surfaces —
they're invisible in light mode. Use the tokens. The only legitimate hardcoded
whites are: text on a red/coloured fill, and scrims/overlays sitting on cover
art.

## What was removed

- `ThemeBackdrop.tsx` (597 lines) — the animated starfield/galaxy/nebula/mesh
  engine.
- `TiltStage.tsx` — 3D parallax tilt on cover art.
- `themes.ts` 31-theme catalogue (651 → 115 lines, now mode-only).
- All `.bd-*` CSS (stars, aurora, blob, mesh, ocean, particles) in `globals.css`.
- The `flatBackdrop` setting + "Arrière-plan sobre" toggle.
