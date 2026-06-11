# Product

## Register

product

## Users

Sebastian (builder/operator) and household members operating a DIY SLAM mopping
robot. Two contexts: at a desk tuning and watching the robot work (laptop,
large screen), and on the go checking on it or driving it manually (phone,
PWA, one thumb). The robot may be offline, warming up, or mid-clean when the
app opens; the user's first question is always "where is it and what is it
doing right now?"

## Product Purpose

Live operator console for the RoboMop robot. It renders the SLAM occupancy
grid, lidar scan, pose and trajectory in real time, lets the user switch
control modes (manual / clean / explore), drive manually with a virtual
joystick, and stop the robot instantly with an emergency stop. Telemetry
arrives over a cloud relay, so the app works from anywhere, not just the LAN.
Success: the user trusts the map view enough to leave the robot unattended,
and trusts the e-stop enough to let guests drive it.

## Brand Personality

Calm, precise, trustworthy. The interface of a well-engineered instrument:
quiet surfaces, confident data, one loud red button. Never playful-toy, never
hacker-terminal.

## Anti-references

- Dark "mission control" dashboards with neon accents and fake gauges.
- rviz/ROS tooling aesthetics: dense panels, raw topic names, debug-first UI.
- Consumer-appliance app fluff: mascots, confetti, gamified cleaning scores.
- Fake features: no dead nav items for capabilities the robot doesn't have.

## Design Principles

1. **Map first.** The live map is the product; everything else orbits it.
2. **State is never ambiguous.** Connection, robot online/offline, mode, and
   e-stop state are always visible at a glance, with words, not just color.
3. **Dangerous actions feel different.** E-stop is oversized, red, and
   always reachable; mode changes confirm visually within 150 ms.
4. **Honest telemetry.** Show real values (pose, heading, scan age) or show
   "no data", never stale numbers that look live.
5. **Thumb-grade controls.** Joystick, e-stop, and mode switches sized and
   placed for one-handed phone use.

## Accessibility & Inclusion

WCAG AA contrast throughout. State colors always paired with text/icons
(color-blind safe). Touch targets ≥44 px for controls, ≥56 px for e-stop.
`prefers-reduced-motion` honored: telemetry still updates, decorative motion
stops. Works offline as an installed PWA shell with a clear disconnected
state.
