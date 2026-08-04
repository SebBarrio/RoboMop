# RoboMop New Era — Development Record and Traceability Baseline

**Document version:** 1.1

**Traceability cutoff:** 3 August 2026

**Approval meeting:** 4 August 2026

**Repository:** https://github.com/SebBarrio/RoboMop

**Public proposal:** https://sebbarrio.github.io/RoboMop/proposal/

**Purpose:** preserve in the cloud the project planning, research, decisions, rejected assumptions, architecture work, quality findings, artifacts and remaining work developed during the RoboMop reconstruction effort.

---

## 1. How to use this record

This document is a traceability record, not a replacement for controlled source artifacts. It distinguishes four states:

- **CURRENT:** approved planning baseline or latest proposal awaiting the documented gate identified here.
- **PROPOSED:** current proposal requiring Sponsor or design-gate approval.
- **SUPERSEDED:** earlier assumption preserved to explain how the current baseline was reached.
- **EVIDENCE PENDING:** requirement or engineering estimate that still requires physical validation.

When this document conflicts with a signed agreement, apply the approved order of precedence. Until a contract exists, use the Project Charter, approved meeting records, controlled technical release and versioned proposal as the project baseline.

---

## 2. Executive development summary

The work evolved RoboMop from a 2025 Raspberry Pi/PCA9685 single-board prototype into a proposed industrial autonomous cleaning product with:

- separate high-level compute and deterministic low-level control;
- new drivetrain and chassis architecture;
- hot-swappable LFP accumulator with control-electronics ride-through;
- two production-oriented PCBs;
- improved localization, navigation, coverage and perception;
- integrated irrigation and water sensing;
- backend/frontend connectivity and fleet-ready data structures;
- ROS 2 and Isaac-based digital-twin validation;
- subsystem-first test and staged integration;
- formal requirements, acceptance, gates, defect severities and evidence;
- Sponsor-controlled hardware purchases and separately priced professional services.

The project was compressed into a 16-week delivery baseline for one final integrated robot, one accumulator and one charger. The public proposal and Project Charter v1.1 now carry the reconciled commercial, technical and governance baseline.

---

## 3. Legacy 2025 evidence and lessons

The 2025 implementation is preserved as historical evidence only. It is not the architecture to retain.

| Lesson | Observed condition | Requirement generated |
|---|---|---|
| Runtime | Approximately 25–30 minutes | New energy model and physical acceptance ≥4 h |
| High-current connections | Intermittent connectors | Locked connector family, ratings, thermal/drop/cycle tests |
| Motor safety | H-bridge overheated after motor runaway | Deterministic control, independent inhibit, watchdog, stale-command tests |
| Encoders | Connections became unreliable after PCB integration | Hardware counting, connector/EMI validation and staged bring-up |
| Compute contention | High-level and real-time work competed for resources | Jetson/MCU separation |
| Time synchronization | LiDAR–odometry–IMU drift and map offsets | Source timestamps, monotonic timebase, calibration and replay |
| Autonomy evidence | Late records still showed mapping misalignment | Revalidate mapping, localization and navigation; do not inherit claims |
| Irrigation | Integration incomplete | Treat irrigation as a first-class subsystem from requirements onward |

No old autonomy, safety, runtime or cleaning claim is accepted as proof for the rebuilt robot.

---

## 4. Evolution of the planning baseline

### 4.1 Initial rebuild review

The original activity inventory was converted into a dependency-aware product-development model. The review introduced:

- requirements before design;
- ConOps, PRD and SRS;
- hazard analysis/FMEA;
- requirements-to-verification traceability;
- architecture trade studies;
- subsystem benches;
- digital twin with correlation criteria;
- controlled mechanical, PCB, firmware and software releases;
- EVT, DVT and PVT maturity stages;
- supplier qualification, DFM/DFA/DFT and end-of-line thinking.

Early values such as 5 km/h, eight-hour operation, two hub motors, Jetson-class compute, ESP-class controller, two PCBs, CAN/UART/micro-ROS and 960 Wh were explicitly treated as hypotheses rather than approved production decisions.

### 4.2 Four-hour battery roadmap

An early conservative model used:

- 1,024 Wh nominal;
- 90% state-of-charge window;
- 92% system efficiency;
- 847.872 Wh usable;
- 4.239 h at 200 W.

That model was useful for identifying limited beginning-of-life margin and end-of-life risk. It also highlighted a discrepancy between a 200 W robot model and an approximately 75 W electronics allocation.

The user later selected the current planning model:

- 1,024 Wh nominal;
- 960 Wh operational planning energy;
- 200 W average reference;
- 4.8 h modeled runtime;
- 800 Wh required for four hours;
- 160 Wh reserve;
- 20% margin over the minimum four-hour energy requirement.

The 847.872 Wh model is **SUPERSEDED as the presentation baseline**, but remains useful as sensitivity evidence. The 4.8 h value is an estimate, not a physical result.

### 4.3 Compressed 16-week delivery plan

A longer conventional EVT/DVT/PVT program was initially estimated at approximately:

- 20–30 weeks to first integrated EVT robot;
- 30–42 weeks to DVT design freeze;
- 38–52 weeks to PVT/pilot readiness.

The Sponsor-facing plan was then compressed to 16 weeks by:

- defining the deliverable as the final integrated product of this phase, without homologation;
- parallelizing mechanical, electrical, battery, software, irrigation and simulation work;
- freezing architecture and procurement decisions early;
- integrating by subsystem;
- holding feature freeze at Week 12;
- reserving Weeks 13–15 for verification and regression;
- retaining Week 16 for FAT, handoff and closure.

This compression remains a high project risk and requires strict scope and WIP control.

### 4.4 Charter and proposal evolution

The Charter progressed through draft planning versions, v1.0 and v1.1. Material changes included:

- final role assignments;
- one-accumulator delivery;
- no homologation in this phase;
- corrected energy semantics;
- Sponsor-controlled hardware procurement;
- separate professional-service fees;
- NTP start rule;
- 12-row acceptance matrix;
- P0/P1/P2 defect rules;
- formal gates and change classes;
- corrected PCB allowance;
- corrected project total;
- explicit treatment of the pending new-chassis approval.

The public proposal was reconciled with Charter v1.1 and deployed through PR #4.

---

## 5. Current commercial baseline

| Account | Current value | Status |
|---|---:|---|
| Hardware base | MXN $49,739.85 | CURRENT |
| Sponsor contingency, 15% | MXN $7,460.98 | CURRENT |
| Hardware forecast | MXN $57,200.83 | CURRENT |
| Proposed hardware ceiling | MXN $58,000.00 | CURRENT, subject to Sponsor approval |
| Project Manager services | MXN $160,000.00 | CURRENT |
| Senior Engineer services | MXN $160,000.00 | CURRENT |
| Professional services total | MXN $320,000.00 | CURRENT |
| Planned project budget | MXN $377,200.83 | CURRENT before applicable fiscal charges |
| Hardware-cap + services reference | MXN $378,000.00 | Reference before applicable fiscal charges |

### Superseded commercial figures

| Earlier figure | Status | Reason superseded |
|---|---|---|
| Approximate MXN $40,000 hardware target | SUPERSEDED | Sensor, PCB, drivetrain and integration scope matured |
| MXN $47,097.85 base / $54,162.53 with contingency | SUPERSEDED | PCB and BoM reconciliation |
| MXN $3,000–$3,600 PCB allowance | SUPERSEDED | USD $160 + USD $180 at MXN $18/USD = MXN $6,120 |
| MXN $160,000 joint professional services | SUPERSEDED | Corrected to MXN $160,000 for each professional |
| MXN $217,200.83 planned total | SUPERSEDED | Corrected professional-services total |
| “TODO INCLUIDO” | REMOVED | Hardware purchases and services follow different commercial rules |

### Procurement rules developed

- No global hardware advance is required.
- Sponsor can pay a supplier directly or reimburse an authorized purchase.
- Each purchase requires authorization, valid receipt/invoice, proof of payment, proof of receipt and ledger entry.
- Contingency belongs to the Sponsor and unused funds remain with the Sponsor.
- Taxes, duties, brokerage, shipping and FX must be handled under the future contract and per-purchase approval.
- Part number, interface, rating, supplier, lead time, landed cost and alternative must be reviewed before critical purchase release.

---

## 6. Team, authority and operating model

| Role | Person | Developed responsibility model |
|---|---|---|
| Sponsor | Luis Vazquez | Scope, budget, contingency, Class 3 changes, gates, commercial acceptance and NTP |
| Project Manager | Germán Velázquez | Schedule, cost, BoM, procurement, risks, changes, documentation, physical development support, assembly, integration and verification coordination |
| Senior Engineer | Sebastian Barrio | Architecture, interfaces, mechanical/electrical design, accumulator/power, PCB release, firmware, ROS/Isaac, autonomy, perception and technical evidence |

The PM coordinates software but is not its primary implementer. Both PM and Senior Engineer have stop-work authority for unsafe tests.

Operating model:

- weekly sprints;
- fixed stage gates;
- daily short coordination;
- weekly BoM/cost/risk/release review;
- two-week look-ahead;
- controlled changes;
- subsystem-first integration;
- evidence-based gate exit.

---

## 7. Work breakdown developed

### WS1 — Program, systems and requirements

- Charter, ConOps, PRD/SRS and acceptance matrix;
- requirements traceability;
- hazard/FMEA and risk register;
- operating environments and FAT definition;
- schedule, cost, configuration, change and decision control.

### WS2 — Legacy teardown and evidence

- systematic disassembly;
- damaged component and wiring records;
- preservation of logs, dimensions, PCB revisions and images;
- classification as reusable bench item, reference-only, unsafe or discard.

### WS3 — Mechanical, chassis and drivetrain

- drivetrain trade study and mule;
- torque, speed, braking, thermal and encoder validation;
- chassis packaging, CG, tip, serviceability and cleaning loads;
- battery bay, tank, sensor, PCB and harness integration;
- drawings, tolerances, materials, DFM/DFA and assembly instructions.

### WS4 — Accumulator, power and hot swap

- 8S2P LFP architecture;
- BMS, protection, fusing, precharge/inrush and connectors;
- charger and charge-time characterization;
- control ride-through;
- pack retention, extraction, touch safety and ergonomics;
- runtime, thermal, fault and cycle tests.

### WS5 — Electronics and PCBs

- high-/low-level split;
- power tree, grounding, shielding and protection;
- E-stop and hardware motor inhibit;
- PCB 1 power/drivetrain and PCB 2 Jetson interface;
- schematic/layout/DFM/DFT reviews;
- test points, programming, bring-up and traceability.

### WS6 — Firmware and deterministic control

- encoder capture;
- motor supervision;
- watchdogs and timeouts;
- safe states and degraded modes;
- timestamping and communication framing;
- current, temperature, battery and irrigation I/O;
- fault injection and logging.

### WS7 — Autonomy, perception and simulation

- ROS 2 architecture;
- mapping, localization, Nav2, replanning and coverage;
- LiDAR/IMU/encoder/camera calibration;
- source timestamps and frame consistency;
- camera dataset and perception pipeline;
- Isaac digital twin, replay, SIL/MIL/HIL and correlation.

### WS8 — Irrigation and cleaning

- tank, pump, valve, distribution and mop interfaces;
- level, flow and leak sensing;
- dry-run, clog, leak and chemical-compatibility behavior;
- cleaning-quality protocol and irrigation mission integration.

### WS9 — Backend, frontend and fleet readiness

- device identity and provisioning;
- telemetry, commands, map stream, alerts and logs;
- reconnect and state recovery;
- offline autonomy and network-loss behavior;
- OTA/rollback foundation;
- fleet-ready data contracts and isolation.

### WS10 — Verification, release and delivery

- digital, bench, subsystem, integration and FAT levels;
- automated regression and fault injection;
- acceptance evidence and raw data;
- configuration and release checklist;
- CAD, BoM, source, binaries, calibrations, manuals and known issues;
- final handoff and next-phase recommendations.

---

## 8. Detailed 16-week traceability

| Week | Developed baseline outcome |
|---:|---|
| 1 | Charter/NTP activation, requirements, legacy evidence, acceptance, hazards, battery data verification and SRR |
| 2 | PDR, technical baseline, architecture/interfaces, CAD concept, sourcing and long-lead decisions |
| 3–4 | Detailed mechanical/electrical design, PCB packages, hot-swap rig, communication contracts, simulation baseline and CDR |
| 5–7 | External fabrication plus drivetrain, battery, irrigation, sensor, software and digital-twin subsystem work |
| 8 | Incoming inspection, PCB bring-up, dimensional fit and Subsystem Readiness gate |
| 9 | Protected power, safety chain, low-level control and drivetrain integration |
| 10 | Sensor installation, timing, calibration, frames and localization |
| 11 | Mapping, navigation, replanning, restricted zones, coverage and perception |
| 12 | Irrigation, backend/frontend, mission integration and feature freeze |
| 13 | Runtime, hot swap, thermal, connector, E-stop, watchdog, brownout, leak and fault campaigns |
| 14 | Mapping repeatability, relocalization, navigation, coverage, cleaning, perception, connectivity and verification gate |
| 15 | Root cause, corrections, affected-function regression and release candidate |
| 16 | Witnessed FAT, package audit, handoff, acceptance and closure |

A 55-row Gantt with Weeks 1–16, workstream dependencies, route-critical items, owners and gates was produced in HTML/PDF/PNG form. The visual Gantt remains a planning artifact; the controlled schedule must be updated from the actual NTP date.

---

## 9. Current technical architecture and decision status

| Area | Current baseline | Status / next gate |
|---|---|---|
| High-level compute | Jetson Orin Nano 8GB Super Dev Kit + 256 GB NVMe | Selected; confirm interfaces/configuration at PDR |
| Low-level control | ESP32-S3-WROOM-1 N16R8 | Selected; confirm safety and interfaces at PDR |
| Split architecture | SBC for autonomy/perception; MCU for deterministic control | CURRENT requirement |
| SBC–MCU link | UART/micro-ROS framing with CRC, sequence, timestamps, heartbeat and timeout | PROPOSED; freeze ICD |
| Subsystem expansion | CAN-class trunk | PROPOSED |
| Drivetrain | 2 × 24 V 100 W motorreductors, 1:18, 270 rpm, 500 ppr | Selected pending sample/dimensional verification |
| Accumulator | LFP 8S2P, 25.6 V, 40 Ah, 1.024 kWh nominal | CURRENT planning baseline; physical validation pending |
| Operational energy | 960 Wh at 200 W = 4.8 h model | CURRENT planning estimate; ≥4 h physical acceptance |
| LiDAR | 2 × RPLIDAR S2 | Selected; optical window and blind-zone validation pending |
| Cameras | Two cameras | Committed; exact camera combination open at PDR |
| IMU/auxiliary sensors | New IMU, cliff/ToF, bump, water, current and thermal sensors | Classes selected; final part numbers pending |
| PCBs | Two assembled custom boards | Committed; landed quote and design ownership pending |
| Irrigation | Integrated tank/pump/flow/level/leak subsystem | Committed; detailed design/test pending |
| Simulation | ROS 2 + Isaac Sim/Isaac ROS | Required before autonomous physical testing |
| Cloud/app | Backend/frontend, telemetry, command and recovery | Committed to acceptance path |
| Homologation | Not included in this phase | CURRENT scope exclusion |

---

## 10. CAD, layout and design evolution

Repository CAD work includes:

- layout generations v1, v2 and v3;
- dimension-chain documentation;
- BoM v1;
- concept alternatives A, B, C, D, D2 and D3;
- closed, exploded, cap-off and translucent renders;
- LiDAR window/blind-zone analysis;
- mass and CG roll-ups;
- battery, PCB, tank, motor and sensor packaging.

The current CAD/layout artifacts represent the prior chassis iteration relative to the newly published proposal. They are retained for traceability, not accepted as evidence of the new design.

The 4 August negotiation is the approval gate for the proposed new chassis. After approval, the team must:

1. identify the approved proposal/commit;
2. update CAD, layout and BoM;
3. reconcile material, structure, dimensions, mass and cost;
4. perform mechanical/electrical/thermal/safety/manufacturability review;
5. issue a controlled PDR decision;
6. avoid fabrication release until that decision passes.

---

## 11. Energy and accumulator development trace

### Current baseline

- 16 LFP cells in 8S2P;
- 25.6 V nominal, 29.2 V full;
- 40 Ah;
- 1,024 Wh nominal;
- 960 Wh operational planning energy;
- 200 W average reference;
- 4.8 h modeled;
- ≥4.0 h physical acceptance;
- one accumulator and one charger delivered;
- swap ≤5 minutes;
- controls backup target ≥10 minutes;
- nominal mass reference 7.29 kg and complete-pack ceiling target approximately 8.0 kg, subject to physical confirmation.

### Physical acceptance evidence required

- cell and pack voltages;
- current, power and accumulated energy;
- SoC and initial/final conditions;
- cell and connector temperatures;
- BMS events;
- robot mode and mission profile;
- safe low-energy behavior;
- no reset, uncontrolled motion or loss of safety supervision.

### Battery safety/handling work developed

- preliminary manual-handling review against NOM-036-1-STPS-2018;
- need to validate posture, frequency, reach, grip and insertion force;
- touch-safe and keyed connector requirement;
- inrush/precharge and short-circuit protection;
- cell matching, BMS, fusing, enclosure, guides, handle and labeling;
- trained-operator swap protocol;
- transportation and supplier evidence to be defined.

---

## 12. Acceptance, defects and gate governance

A provisional acceptance matrix with ACC-01 through ACC-12 was created for:

1. integrated delivery;
2. energy runtime;
3. accumulator swap;
4. E-stop and motor inhibit;
5. uncontrolled motion;
6. navigation and coverage;
7. localization;
8. cleaning and irrigation;
9. perception;
10. connectivity;
11. electrical/thermal safety;
12. documentation.

Developed governance rules:

- executing a test is not the same as passing it;
- no commercial waiver can overrule a safety closure;
- P0 requires stop-work, root cause, correction, regression and technical closure;
- P1 requires closure before FAT or explicit joint disposition without safety impact;
- P2 may be managed as a documented punch item;
- after a correction, repeat the failed test and affected regression;
- gates record evidence, quorum, decision, owner, conditions, due date and reopening rule;
- when change classes overlap, the highest activated class applies;
- metrics cannot be relaxed after observing results.

---

## 13. Quality-gate history and issue closure

The pre-signature audit initially identified:

- 8 P0 blockers;
- 18 P1 findings;
- 33 signing questions.

Major closure work included:

| Earlier issue | Resolution/current state |
|---|---|
| Contract unavailable | Expected: contract will be developed from meeting decisions; still not auditable |
| Acceptance criteria TBD | 12-row provisional matrix, severities and ratification mechanism added |
| 847.9 Wh vs 960 Wh conflict | 960 Wh adopted as current operational model; 4 h remains physical acceptance |
| “TODO INCLUIDO” | Removed |
| Technical baseline inconsistent | Proposal/Charter reconciled; CAD explicitly pending new-design approval |
| Week 1 start unclear | Provisional Charter + written NTP rule added |
| Safety waivers too broad | Non-waivable P0/safety rules and separate technical closure added |
| PCB cost mismatch | Corrected to MXN $6,120 |
| 9.6 h with second pack | Removed from base delivery |
| Absolute safety claims | Replaced with architecture and verifiable requirements |
| Contingency ownership unclear | Sponsor-owned and authorization-controlled |
| Service fees misunderstood | Corrected to MXN $160,000 per professional |
| Public proposal outdated | Updated and deployed through PR #4 |

Open commercial/legal work remains in the future contract: legal parties, payments, taxes, IP, confidentiality, warranty, liability, change/delay treatment, termination and document precedence.

---

## 14. Product and terminology decisions

Approved wording:

- “Producto autónomo de limpieza.”
- “Producto final integrado y aceptado.”
- “Un robot RoboMop final, funcional e integrado conforme al alcance aprobado.”
- “No contará con homologación en esta fase.”

Avoid:

- treating the delivery as only an experiment;
- implying full certification or production release;
- “todo incluido” without a matching contract;
- absolute claims such as impossible, never, no error or guaranteed;
- reporting modeled runtime, safety, navigation, cleaning or hot swap as physically passed before evidence exists.

---

## 15. Software, data and repository work preserved separately

The repository contains implementation and specification artifacts that are not duplicated in this record:

### Product/specification

- `README.md`
- `PRODUCT.md`
- `DESIGN.md`
- `specs/001-the-robomop-project/spec.md`
- `specs/001-the-robomop-project/plan.md`
- `specs/001-the-robomop-project/research.md`
- `specs/001-the-robomop-project/data-model.md`
- `specs/001-the-robomop-project/quickstart.md`
- `specs/001-the-robomop-project/tasks.md`
- API and WebSocket contracts.

### Implementation

- robot control/navigation package and unit tests;
- robot configuration;
- frontend application;
- relay service;
- landing and proposal surfaces.

The existing software and 2025 implementation are evidence and starting material. They must be reviewed against the new hardware, timing, safety and acceptance baseline rather than assumed conforming.

---

## 16. Artifact inventory and provenance

### Cloud-controlled repository artifacts

| Path | Purpose | State |
|---|---|---|
| `docs/proposal/` | Public sponsor proposal, visualizations and self-contained bundle | CURRENT public presentation |
| `docs/project-charter/` | Charter v1.1 Markdown/HTML/PDF | CURRENT provisional-signature baseline |
| `docs/quality-gate/` | Human and machine-readable gate assessment | CURRENT assessment |
| `docs/project-baseline/` | This development record and JSON traceability | CURRENT traceability record |
| `cad/BOM_v1.md` | Prior CAD/BoM baseline | REFERENCE; reconcile after chassis approval |
| `cad/LAYOUT_v3.md` | Prior chassis layout and packaging | REFERENCE; not new-design evidence |
| `cad/concepts/` | Visual concept alternatives | REFERENCE |
| `cad/renders/` | CAD presentation/evidence renders | REFERENCE |
| `specs/001-the-robomop-project/` | Product/software specification set | REVIEW against new baseline |
| `robot/`, `frontend/`, `relay/` | Existing implementation | EVIDENCE/STARTING MATERIAL |

### Planning artifacts produced locally and summarized here

| Artifact | Purpose | Current treatment |
|---|---|---|
| `2026-07-16_205817-robomop-rebuild-project-plan-review.md` | Full stage-gated industrial rebuild review | Source for systems/product-development strategy |
| `2026-07-16_210558-robomop-four-hour-battery-roadmap.md` | Battery/hot-swap technical roadmap | Earlier model preserved; current energy baseline supersedes presentation values |
| `2026-07-16_211259-robomop-16-week-delivery-plan.md` | Week-by-week compressed execution plan | Source for current schedule |
| `2026-07-16_212238-robomop-project-charter-proposal.md` | Early integrated Charter proposal | Superseded by Charter v1.1 |
| `robomop-gantt-semanas-1-16.*` | 55-row visual Gantt in HTML/PDF/PNG/source | Planning visualization; update from NTP |
| `robomop-project-charter-v1.0-*` | Prior Charter issue | Superseded, historical trace |
| `robomop-project-charter-v1.1-*` | Current Charter source/render/PDF | Cloud copy exists under `docs/project-charter/` |
| `robomop-quality-gate-pre-firma-2026-08-03.*` | Original pre-signature audit | Superseded verdict, retained as finding history |

Binary previews and PDFs are not duplicated in this development record; their substantive decisions and provenance are captured here.

---

## 17. Validation work completed

### Document/web verification

- public proposal responded successfully;
- old MXN $54,162.53 and “TODO INCLUIDO” were removed;
- current MXN $377,200.83 baseline was observed publicly;
- PM and Senior Engineer service fields were separated;
- JavaScript syntax checks passed;
- HTML parsing passed;
- self-contained bundle regenerated;
- desktop and 390×844 mobile layouts were reviewed without blocking overflow;
- Charter HTML/PDF generated and visually reviewed;
- Git diffs passed whitespace checks;
- added-line secret scans passed;
- quality-gate JSON passed ad hoc parse, arithmetic and structural assertions.

### Repository/publication work

- current repository identified as `SebBarrio/RoboMop`;
- `Droid-implementation` confirmed as default/base branch;
- PR #4 reconciled proposal and Charter and was merged;
- public GitHub Pages proposal was rechecked after deployment;
- PR #5 contains quality-gate and traceability documentation.

### Tooling and external-system work

- GitHub CLI was installed and authenticated for repository operations; write permission to `SebBarrio/RoboMop` was verified.
- The official ClickUp MCP integration was configured and authenticated, and its available toolset responded during verification.
- Repository, project-directory and ClickUp searches did not locate a commercial contract; this supported the decision to treat the contract as future work rather than claim it had been audited.
- Headless-browser and responsive-browser checks were used for public proposal validation, including a 390 × 844 mobile viewport.
- Authentication values and credentials are deliberately excluded from all project documentation.

### Not yet completed

No physical validation has yet established:

- four-hour runtime;
- hot swap and backup hold-up;
- E-stop/inhibit performance;
- electrical/thermal safety;
- drivetrain performance;
- new-chassis integrity;
- localization/navigation/coverage;
- perception;
- cleaning/irrigation;
- connectivity acceptance.

---

## 18. Decisions still required

### At the approval meeting

- approve/condition/reject project scope;
- approve hardware forecast and ceiling;
- approve each professional-service budget;
- agree how taxes and payment terms move into the contract;
- approve/condition/reject the new chassis concept;
- authorize replacement of prior CAD;
- approve provisional Charter/NTP mechanism;
- assign owner and due date for contract drafting.

### At SRR

- freeze operating environment and FAT circuit;
- ratify ACC-06 through ACC-10;
- define stopping time/distance;
- confirm backup hold-up target;
- confirm mass/ergonomic limits;
- freeze exact test instrumentation and evidence.

### At PDR

- release the updated CAD/layout/BoM;
- freeze exact cameras, IMU, BMS and auxiliary sensors;
- verify motor dimensions and performance;
- confirm optical window/LiDAR behavior;
- define PCB design/review/release responsibility;
- approve landed quotes and alternatives;
- authorize long-lead purchases.

---

## 19. Future contract work

The contract did not exist at the cutoff and was intentionally expected after negotiation. It must define:

- legal parties and signature authority;
- scope and exclusions;
- payment milestones and invoicing for each professional;
- taxes and withholdings;
- procurement and ownership of purchased materials;
- acceptance, rejection, cure and retest;
- IP, source, CAD, data, credentials and reuse rights;
- confidentiality and data handling;
- warranty, support and maintenance;
- client-caused delay, supplier delay and force majeure;
- change control;
- liability and indemnification;
- termination and non-cancelable commitments;
- obligations after Week 16;
- document precedence.

No record should claim that the contract was reviewed or approved before the actual draft exists.

---

## 20. Traceability conclusion

This record captures the substantive work developed across planning, architecture, energy, battery, chassis, drivetrain, electronics, firmware, autonomy, irrigation, software, verification, finance, governance, quality, publication and contract preparation.

It intentionally preserves superseded values so later reviewers can understand why the current baseline differs from earlier plans. It does not convert estimates into evidence, does not approve the new chassis, does not release CAD for fabrication and does not replace the future contract.

Current program position:

- public proposal: **GO for presentation**;
- project/new-chassis negotiation: **GO for decision**;
- provisional Charter and NTP: **CONDITIONAL GO**;
- CAD release: **NO-GO until updated and approved at PDR**;
- contract: **not yet auditable**;
- final product acceptance: **pending physical evidence**.

---

**Document controlled for traceability — RoboMop New Era — Development Record v1.1**
