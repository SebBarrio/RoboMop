# Design

Light operator console, modeled on the approved reference dashboard: white
cards on a cool near-white canvas, one decisive blue, a single loud red
e-stop. Restrained color strategy; the occupancy-grid map provides the visual
interest.

Scene: a phone held one-handed in a daylight living room while the robot
hums across the floor; a laptop on a workbench beside it. Light theme.

## Theme

- Mode: light only (v1)
- Color model: OKLCH
- Feel: instrument panel, not marketing page. Quiet, dense where data lives.

## Color Palette

| Token        | OKLCH                  | Approx   | Use |
|--------------|------------------------|----------|-----|
| `--bg`       | oklch(0.977 0.004 250) | #f5f7fa  | App canvas |
| `--surface`  | oklch(1 0 0)           | #ffffff  | Cards, sidebar, panels |
| `--surface-2`| oklch(0.962 0.005 250) | #eef1f5  | Inset wells, map frame, hover |
| `--border`   | oklch(0.91 0.008 250)  | #dde2e9  | Hairline card borders |
| `--ink`      | oklch(0.27 0.02 260)   | #232a36  | Headings, primary text |
| `--ink-2`    | oklch(0.49 0.02 260)   | #5d6573  | Secondary text, labels |
| `--primary`  | oklch(0.55 0.19 259)   | #2563eb  | Primary actions, selection, robot pose |
| `--primary-soft` | oklch(0.94 0.03 255) | #e3ecfd | Selected nav, active mode tint |
| `--success`  | oklch(0.63 0.14 155)   | #16a34a  | Online, cleaned, OK states |
| `--success-soft` | oklch(0.95 0.04 155) | #e0f4e8 | Cleaned-room tint |
| `--danger`   | oklch(0.55 0.2 27)     | #dc2626  | E-stop, critical threat |
| `--warning`  | oklch(0.72 0.15 75)    | #d97706  | Warnings, degraded telemetry |
| `--ink-inverse` | oklch(0.99 0 0)     | #fcfcfd  | Text on primary/danger |

Map canvas ramp (drawn on canvas, not CSS): unknown `#e8ebf0`, free `#ffffff`,
occupied `#3b4456`, lidar points `--primary` at 65 %, trajectory `--primary`
at 40 %, planned path dashed `--primary`, frontiers `--warning`, threat arc
`--danger`.

## Typography

- Single family: **Inter** (variable, self-hosted via @fontsource-variable),
  `font-feature-settings: "tnum"` on all telemetry numbers.
- Mono not used; tabular Inter covers coordinates.
- Fixed rem scale, ratio ≈1.2: 12 / 13 / 14 (body) / 16 / 20 / 24. Page title 20,
  card titles 13 uppercase is banned — card titles are 14/600 sentence case.
- Weights: 400 body, 500 labels/buttons, 600 headings, 700 stat values.

## Spacing & Shape

- 4 px base unit; common steps 8 / 12 / 16 / 24 / 32.
- Radius: cards 14 px, buttons & inputs 10 px, badges/pills full, map frame 14 px.
- Borders: 1 px `--border` on cards; **no border + big shadow combos**.
  Elevation only on overlays: `0 8px 24px oklch(0.2 0.02 260 / 0.12)`.

## Components

- **App shell**: fixed 232 px sidebar (desktop) → bottom tab bar (mobile ≤820 px).
- **Stat card**: label (13/500 `--ink-2`) over value (20/700 `--ink`, tnum) over
  caption (12/400). No icons-for-decoration.
- **Mode switch**: segmented control; active segment `--primary` fill, white text.
- **E-stop**: full-width red button, 56 px min height; engaged state inverts to
  outlined red with "RESUME" action. Hold-to-engage NOT used (latency kills
  trust); single tap engages, tap again resumes.
- **Joystick**: 176 px circular pad, thumb knob, spring-back on release,
  always visible for stable layout; disabled (with a one-line reason) outside
  manual mode.
- **Status badges**: dot + word ("Online", "Offline", "Reconnecting…").
- **Toasts**: bottom center, single line, auto-dismiss 4 s; errors persist.

## Motion

- 150–220 ms, `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint family).
- Motion conveys state only: mode-switch thumb slide, e-stop engage pulse
  (one 300 ms pulse, not looping), toast slide-up, joystick spring-back.
- Map pose/trajectory animate by data arrival, not CSS.
- `prefers-reduced-motion`: all of the above become instant; data still flows.

## Z-index scale

`--z-sticky: 10`, `--z-overlay: 20`, `--z-modal: 30`, `--z-toast: 40`.
