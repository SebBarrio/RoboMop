# Product

## Register

brand

## Users

Makers, robotics hobbyists, and engineers who have built (or want to build) the
RoboMop SLAM mopping robot. They arrive curious and technically literate: they
want to see that the live operator console is real, trustworthy, and genuinely
remote, not a toy app with a cartoon vacuum and a fake "cleaning score." Many
land here from GitHub. The decision the page drives is "open the console" or
"build my own."

## Product Purpose

RoboMop is a DIY SLAM mopping robot plus a live operator console (an installable
React PWA) that streams the robot's occupancy-grid map, 360° lidar, pose and
trajectory in real time over a Cloudflare Worker relay, from anywhere, with an
always-present emergency stop. The landing page exists to make that real-time,
honest telemetry felt in the first fold, and to send people to the console or
the open-source build.

## Brand Personality

Precise, candid, instrument-grade. Three words: honest, live, engineered. The
voice is a working operator console, not a marketing site: it shows real
telemetry and labels stale data as stale. Confidence comes from transparency,
not hype. Emotionally it should evoke the quiet competence of watching a real
machine map a room.

## Anti-references

- Generic SaaS hero template: status pill + big headline + subhead + two
  buttons + a static product shot floating in a browser frame.
- Robot-vacuum consumer marketing: cartoon vacuums, cleaning-score gamification,
  glossy lifestyle photography, friendly mascots.
- Editorial-magazine affectation (display-serif italic + drop caps): wrong
  register for a telemetry instrument.

## Design Principles

- **The robot and its system are the product; the live map is the proof.** The
  hero leads with the live occupancy grid (real telemetry, never a cartoon
  vacuum), and a clean render of the actual machine earns its place where the
  page talks about the hardware. The most ownable asset is a real robot mapping a
  room in real time, shown honestly.
- **Show, don't tell.** Real (simulated) telemetry on screen beats adjectives.
- **Honest instrument.** Read like an operator console: mono readouts, real
  values, "no data" instead of a stale number.
- **Identity preservation.** The light instrument theme, blueprint grid, decisive
  blue + loud red, and Archivo/Spline Sans Mono pairing are the committed brand.
  Elevate them; don't replace them.

## Accessibility & Inclusion

WCAG 2.1 AA: body text ≥4.5:1, large text ≥3:1, visible focus, semantic
landmarks and headings. Every animation needs a `prefers-reduced-motion`
alternative; the live map must settle to a representative static frame and the
hero copy must be fully visible without JS or motion. Canvas scenes carry text
alternatives (`role="img"` + descriptive label).
