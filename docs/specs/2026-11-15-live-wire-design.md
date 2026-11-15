# Live Wire — design spec (v2, 2026-11-15, after Codex adversarial review)

Year 9 Science, NSW Science 7–10 (2023), Stage 5 focus area **Energy** (SC5-EGY-01).
A 3D electricity simulator in two parts: **Learn** (eight stations that each teach one idea) and **The Job** (a summative game where the student plays a first-year apprentice electrician).

Repo `irvincisneros-png/live-wire`, live at `https://irvincisneros-png.github.io/live-wire/`.

## 1. Goals

1. Make the invisible visible. One consistent zoomed-in picture of charge, current, voltage, resistance, energy and power, used everywhere.
2. Teach the basics first, one idea per station, then assess them together in The Job.
3. Look real. Authored real-time 3D that is clearly better than PhET's flat Circuit Construction Kit: real materials, lighting, glow, depth.
4. Run on school laptops and Chromebooks (quality tiers), and be usable at 375 px wide with touch.

Non-goals: AC theory, electromagnetism, capacitors, semiconductors, multiplayer, accounts, any network calls.

## 2. Owner decisions (fixed)

- Electrons move from the negative terminal to the positive terminal. Dots always move that way. Conventional current appears only as one optional note in Station 0 and is never assessed.
- The Job is open from the start (no locks). Stations award "tickets"; each job lists the tickets it draws on and links back to them.
- Individual stations teach; The Job is summative, gives no hints, scores the student and produces evidence the teacher can collect.
- No AI-generated images as visible art. All visuals are authored three.js geometry, materials and shaders.

## 3. Syllabus map

| Dot point | Text (short) | Where |
|---|---|---|
| 1.1.1 | Conservation of energy with calculations, closed system | Station 6, Job 5 |
| 1.1.2 | Explain efficiency | Station 6, Job 4 |
| 1.1.3 | Improve efficiency | Station 6, Job 4 |
| 1.2.1 | Identify types of energy sources | Station 7 (light touch) |
| 1.2.2 | How electrical energy is produced from different sources | Station 7, Job 5 |
| 1.2.3 | Evaluate renewable vs non-renewable (efficiency, economic, technological) | Station 7, Job 5 |
| 1.3.1 | Elements of a complete circuit | Station 1 |
| 1.3.2 | Construct circuits and draw circuit diagrams | Station 2, Job 2 |
| 1.3.3 | Measure and compare V and I in series and parallel | Station 3, Job 1 |
| 1.3.4 | Investigate V, I, R (Ohm's law) | Station 4, Jobs 2–3 |
| 1.3.5 | Compare energy transformed over time in circuits/appliances | Station 5, Job 3 |
| 1.3.6 | Energy star ratings and their criteria | Station 5, Job 4 |
| 1.4.1 | Evaluate ways to optimise current energy use | Job 4 |
| 1.4.2, 1.4.3, 1.6.1 | Trends, alternative sources, research | Not covered (stay on the Year 9 content page) |

## 4. The one model (used everywhere)

Each quantity is one visible thing with one fixed colour (Okabe–Ito, colour-blind safe) and is never shown by colour alone: the symbol and unit always accompany it.

| Quantity | Symbol, unit | Picture | Colour |
|---|---|---|---|
| Charge | — | Dots that already fill every wire. Never created, never used up | white core |
| Current | I, amps (A) | Dots passing a counter gate per second | sky blue `#56B4E9` |
| Voltage | V, volts (V) | Always *between two points*: the difference in glow (energy carried per dot) from one point to the other. Battery raises it, components drop it. 1 volt = 1 joule for each coulomb of charge | yellow `#F0E442` |
| Resistance | R, ohms (Ω) | How hard a part makes it for dots to get through: collisions with vibrating atoms. Thinner, longer or different material = more resistance (not "more atoms") | reddish purple `#CC79A7` |
| Energy | E, joules (J) | Packets dropped at a component; a growing pile | vermillion `#D55E00` |
| Power | P, watts (W) | How fast the pile grows | bluish green `#009E73` |

Rules of the picture, all derived from the solved circuit:
- Dot speed along a branch ∝ branch current; direction is electron flow (opposite to conventional current from the solver).
- Dot glow at a point ∝ (V_max − V_point), i.e. full glow leaving the negative terminal, dim arriving at the positive terminal. Voltage *across* a component is the drop in glow across it.
- Energy packets leave a component at a rate ∝ its power P = V·I (as light and heat sprites); the joule tally integrates P over sim time.
- With the switch open, dots stay in the wire and stop. They do not drain away.
- Each dot stands for a fixed, very large amount of charge. The amps shown at a counter gate always come from the solver, never from counting rendered dots, so every device and quality tier reads the same.
- The glow is labelled an "energy picture", not "the voltage of a dot". Voltage readouts are always between two named points (a voltmeter's two leads).
- Dots appear only on the low-voltage DC bench circuits and the 12 V training house. Household (230 V AC) content in Stations 5–7 and Jobs 3–5 uses energy-flow displays (packets, Sankey), never dots.

"Limits of this model" note (Station 0 and the lens help): real charges drift at well under a millimetre per second; the energy actually travels through the electric and magnetic fields around the wire; dots carrying packets is a teaching model. Mains is AC (charges jiggle back and forth 50 times a second); Live Wire treats it as steady flow.

### 4.1 The lens

- **X-ray lens** (toggle in every bench station and in The Job): overlays the dots on the 3D circuit; wires go translucent.
- **Deep zoom** (Station 0, and "zoom in" on any component elsewhere): a close-up 3D scene of a short length of conductor: metal-ion lattice, drifting glowing dots, a counter gate reading amps, a resistor/filament section with a denser, jostling lattice where collisions flash and atoms heat up.

### 4.2 Readout dashboard

A fixed strip showing V, I, R, P and E (tally) for the selected component, in the fixed colours, with the live formula lines `V = I × R` and `P = V × I` filling in with the current numbers. Same component in every bench station and job.

## 5. Part 1: Learn (trade school)

Every station has the same three beats:
1. **Guided** — 4–7 coach steps, each asking the student to do one thing in the scene (not a wall of text).
2. **Free play** — the scene unlocked.
3. **Checks** — 3–4 tasks (do-it-in-the-scene, numeric answer with tolerance, or multiple choice). Passing all earns the station's ticket. Unlimited attempts; feedback explains, never just "wrong".

| # | Station | Ticket | Scene | Key tasks |
|---|---|---|---|---|
| 0 | What is electricity? | Charge | Deep zoom + one-globe circuit | Open/close switch and watch dots; count dots at the gate; raise voltage; identify what V, I, R, E, P are in the picture; model-limits note |
| 1 | Complete circuits | Circuits | Bench | Light a globe; find why a circuit is dead (open switch, gap, flat battery, both leads on one terminal); cause and recognise a short circuit safely (battery heats, breaker trips) |
| 2 | Build and draw | Diagrams | Bench + live diagram | Watch the diagram draw itself; build from a given diagram (3 graded diagrams); match symbol to part |
| 3 | Series and parallel | Meters | Bench + ammeter/voltmeter | Measure I at three points in series (same); V across each (adds up); parallel branches (V same, I splits and adds); why house power points are in parallel |
| 4 | Ohm's law | Ohm | Bench + graph | Vary V with fixed R, plot V–I points (straight line); vary R at fixed V; find a mystery resistor from the gradient; three V = IR calculations with real values |
| 5 | Power and energy | Power | Kitchen scene + plug-in power meter | Run appliances for a timed period; compare J and kWh; P = VI; cost = kWh × price; read an Energy Rating label; why stars depend on size class |
| 6 | Efficiency | Efficiency | Three lamps (incandescent, halogen, LED) + thermal view + Sankey | Useful vs wasted energy; efficiency = useful ÷ total × 100; show total out = total in; pick the improvement |
| 7 | Sources | Sources | Cutaway generator turntable: coal, gas, hydro, wind, solar PV | Trace the transformation chain to the spinning generator (PV is the exception); renewable vs non-renewable sort; compare efficiency, cost, build time, emissions |

### 5.1 The bench (Stations 1–4, Jobs 1–2)

A timber trade-school bench with a pegboard of brass terminal posts on a grid (default 5 columns × 4 rows). Parts sit on an *edge* between two adjacent posts; wires also occupy edges. A voltmeter connects any two posts with flying leads.

- Why a grid: the topology is exact (posts = nodes, parts = branches), touch targets are large, and the circuit diagram is the same layout drawn with symbols, so "build ↔ draw" is a true one-to-one mirror.
- Parts: battery (1.5 V cell, 6 V and 12 V packs; adjustable supply 0–12 V in Station 4), wire, switch, globe (rated V and W), resistor (10–100 Ω, plus mystery), ammeter, voltmeter, buzzer-free. Fuse/breaker on the supply.
- Interaction: pick a part from the tray, tap or drag to an edge. Tap a placed part to select: flip polarity, change value, toggle switch, remove. Orbit, zoom and pan the camera; a "front" button resets. Keyboard: arrow keys move an edge cursor, Enter places/selects, Delete removes.
- Behaviours: globe brightness ∝ power (filament colour temperature shifts from dull orange to white); a globe at > 150 % rated power blows (filament breaks, wisp of smoke, becomes open circuit, can be replaced); a short circuit trips the supply breaker after ~1.5 s with the battery visibly heating (never an explosion or fire).
- Live diagram: a 2D SVG panel with standard symbols (cell/battery, switch open/closed, lamp, resistor as a rectangle, ammeter A, voltmeter V, wires), updated on every change. Can be shown beside the bench (wide screens) or as a tab (narrow).

### 5.2 Circuit solver

Pure TypeScript, no three.js. Modified nodal analysis for DC with ideal-ish parts:
- battery: EMF with small internal resistance (0.2 Ω per pack) so shorts give finite current
- wire: 0.001 Ω; ammeter: 0.001 Ω; voltmeter: 10 MΩ; open switch / blown globe: removed
- globe: fixed resistance R = V_rated² / P_rated. This is a stated simplification (a real filament's resistance rises as it heats, so a real globe's V–I graph curves). Ohm's law is taught and assessed with resistors only (Station 4), with V on the vertical axis and I on the horizontal so the gradient is R
- every node gets a 1e-12 S leak to a common reference so floating islands and voltmeter-only links solve without singular matrices; the voltmeter is part of the solve (10 MΩ). `Solution.status` is `ok` or `invalid` (NaN/failed solve); on `invalid` the UI shows "can't read this circuit" and no readouts or check passes
- protection is one thing on the bench: a supply overload protector that trips when battery current exceeds its limit for 1.5 s of sim time (a game approximation, labelled as such). Safety switches (RCDs) are described in text only
- sim time advances in fixed 1/120 s steps accumulated from clamped frame dt, pauses when the tab is hidden, and is owned by the bench (energy tallies, trip timers and blow events all use it)
- Output per part: current (signed, conventional), voltage across, power; per node: potential; flags: `short` (battery current above its limit), `blown`, `open`.
- Unit-tested against hand-worked series, parallel, mixed, short, open and floating cases to 1e-6.

## 6. Part 2: The Job (summative)

Frame: assessment day for a first-year apprentice with "Illawarra Spark Electrical" (fictional) at the trade school's **training house**: a cutaway two-room house frame whose wiring runs on a safe 12 V supply so apprentices can practise before they are ever allowed near mains. The cutaway house and its training switchboard are the 3D set. Five jobs, any order, no hints, one result each.

Why 12 V (Codex review, findings 1–4): a realistic mains procedure done by 14-year-olds risks being copied at home and cannot be complete enough to be safe. So all hands-on wiring is extra-low voltage and nothing in the game is a mains procedure. Jobs 3–5 are desk and planning jobs that use real household numbers (230 V) but involve no wiring.

Standing message at the start of The Job and on Job 2: *Real house wiring is 230 V and can kill. In Australia it must only be done by a licensed electrician. That is why apprentices train on a 12 V board first.*

| Job | Task | Scored on (rubric) | Tickets |
|---|---|---|---|
| 1. Fault call-out | The training house's lighting circuit (12 V) has one fault from a fixed list: switch stuck open, blown globe, broken wire (open circuit). Chosen by seed. X-ray is off. Measure with the multimeter, name the fault and its location, replace the part | Fault and location correct (50); at least one measurement that actually distinguishes the fault taken before answering (25); reasoning question (25). Number of measurements is recorded, not scored | Circuits, Meters |
| 2. Install a new power point | Add a second 12 V training outlet to the wall. Steps the student must choose in a sensible order: switch the training supply off; prove it is dead with the meter; connect the new outlet in **parallel** with the existing one (three colour-coded conductors to matching terminals); switch on; test both outlets with a lamp load; predict the new total current with I = V ÷ R and check the supply protector will hold | Parallel connection correct (35); worked "off and proven dead" before touching conductors (25, recorded as a safe-work habit; breaking it shows a calm "stop: on a real job this is how people are hurt" card and costs the marks, no shock simulation); both outlets test at full voltage (15); current prediction within 5 % (25) | Diagrams, Meters, Ohm |
| 3. The tripping power board | Desk job with real numbers: resistive appliances (heater, kettle, toaster, iron, sandwich press) on one power board with a 10 A overload cut-out, at 230 V. Work out each current (I = P ÷ V), explain the trip, then assign appliances to two separate circuits (each with its own 16 A breaker) so nothing trips; the plan is then run | Currents within 5 % (40); explanation choice (20); plan runs without a trip (40) | Ohm, Power |
| 4. Energy audit | A fixed dataset of 10 household appliances with power and hours per day. Rank the top three energy users, then choose upgrades/changes from a fixed list within a budget to cut the yearly bill; read two Energy Rating labels | Top three (30); saving achieved as a fraction of the best possible saving for the dataset, found by exhaustive search in the scorer (50); efficiency explanation (20) | Power, Efficiency |
| 5. Solar and battery | Choose PV size (kW) and battery size (kWh) for the house using an hourly 24-step model. Sankey shows where every kWh goes | Energy balance question answered from the Sankey (30); evening demand met with grid import under a threshold (40); trade-off question (30) | Efficiency, Sources |

Job 5 energy model (pure, tested): 24 one-hour steps; fixed load profile (kWh per hour) and a fixed clear-day PV profile per kW installed; battery starts empty, has usable capacity = its kWh, max charge/discharge 0.5 C, 90 % round-trip efficiency applied on charge; each hour: PV serves load first, surplus charges the battery, remaining surplus is exported; shortfall is served by battery then grid import. Outputs: self-used, stored, battery loss, exported, imported, unmet = 0. Invariant tested: PV + import = load + export + loss + energy left in battery.

Results: each job gives 0–100 and stars (≥ 50 one, ≥ 70 two, ≥ 90 three) plus what was strong/weak. A **Job sheet** page lists all five with the student's answers, attempt date, seed and app version, printable, with a name field kept only in this browser and a "Clear my results" button. It is described to teachers as evidence for the teacher to review, not an automatic grade. No data leaves the device.

## 7. Visual bar

- Physically based materials: brushed brass posts, turned timber, glass globes with refraction-style fresnel and a visible coiled filament, rubber-insulated leads that sag in catenary curves, knurled knobs, moulded-plastic meter with an LCD that actually renders digits.
- Lighting: warm workshop key light, cool fill, soft contact shadows, environment reflections (procedural, no external HDRIs), bloom on glowing filaments and dots, subtle depth of field in the deep zoom, filmic tone mapping.
- Motion: parts drop in with a small settle; leads sway when placed; filaments warm up over ~0.2 s; dots stream smoothly at any frame rate.
- The house: cutaway walls showing cable runs in the cavity; Australian power points and a switchboard with labelled breakers and a safety switch.
- Quality tiers `low | medium | high`, auto-picked from a short frame-time probe, changeable in a menu. Low: no bloom, no shadows, fewer dots, pixel ratio 1. Reduced-motion preference respected.
- Judged on screenshots at 1280×800 and 375×812 before release.

## 8. Architecture

Vite + TypeScript (strict) + three.js; vitest; GitHub Actions builds, tests and deploys to Pages on push to `main`. No runtime dependencies other than three.

```
src/
  sim/        pure logic, no DOM, no three: circuit.ts (solver), units.ts, appliances.ts,
              efficiency.ts, sources.ts, house.ts, solar.ts, seed.ts
  kit/        three.js shared kit: stage.ts (renderer, camera, quality, post), materials.ts,
              parts/ (battery, globe, switch, resistor, lead, meter, post), env.ts
  bench/      bench.ts (grid, placement, selection, input), benchView.ts (3D), diagram.ts (SVG),
              flow.ts (x-ray dots)
  lens/       deepZoom.ts (close-up conductor scene)
  ui/         shell.ts (home, routing by hash), coach.ts, checks.ts, dashboard.ts, progress.ts,
              styles.css
  stations/   s0..s7/ each exports a StationDef (index.ts) and owns its scene glue
  job/        house3d.ts, jobs/j1..j5, results.ts, jobsheet.ts
  main.ts
teacher.html + src/teacher.ts   dot-point map, how to run it, answers
tests/        vitest, sim only + content sanity
tools/        shot.mjs (headless screenshots)
```

Contracts (in `src/types.ts`, written before parallel work starts):
- `Circuit`, `Part`, `Solution` (sim)
- `StationDef { id, title, ticket, dotPoints, mount(host: StationHost): StationInstance }`, where `StationHost` provides the canvas container, coach, checks, dashboard and progress APIs, and `StationInstance` has `dispose()`.
- `JobDef` has the same shape plus `score(): JobResult`.
- Every scene must fully dispose its three.js resources on exit.

State: `localStorage` key `livewire.v1` holding tickets, check results, job results, quality setting, name. Wrapped in try/catch; the app works without storage.

Debug hook for testing: `window.__livewire` with `go(route)`, `bench` (current bench state get/set), `setQuality()`.

## 9. Content accuracy rules

- Mains values used only as context: 230 V, 10 A socket outlets, power circuits commonly protected at 16 or 20 A. No cable-size selection anywhere. The training house labels its own colour convention (red active, black neutral, green/yellow earth, one common Australian fixed-wiring convention) and states that colour never proves a wire is safe.
- Assessed appliance calculations use resistive appliances only (heater, kettle, toaster, iron), stated as such, so P = V × I holds directly.
- 1 kWh = 3.6 MJ. Efficiency comparisons of lamps are made at equal light output. Source comparisons separate *conversion efficiency* from *capacity factor*, show gas as a gas turbine (not a boiler), PV as direct conversion, and list omitted sources (nuclear, geothermal, biomass) as omissions.
- Electricity price uses one stated example figure (33 c/kWh) labelled "example price".
- Appliance wattages, efficiencies and source comparison figures are typical values, labelled as approximate, each with a source note in `docs/DATA-SOURCES.md`.
- Energy Rating label: more stars = more efficient than other models *of the same type and similar size*; the label's energy figure comes from a standard test and is an estimate, so a household's real use = power × its own hours.
- Every formula shown is checked by a unit test with the same numbers shown on screen.

## 10. Testing and release

- `npm test`: solver cases, appliance/energy maths, every station check validator given a known-good and known-bad state, job scoring, seed determinism.
- `tools/shot.mjs` screenshots of every station and job at desktop and phone sizes; no console errors allowed.
- Manual play-through of each station's guided + checks and each job in the browser pane before release.
- Portfolio homepage card (Year 9, focus `y9-energy`, badge Beta) with a screenshot, plus a "← Learning Hub" link in the app.

## 11. Build order

1. Scaffold, contracts, solver, kit, bench, shell (foundation) with Station 1 as the reference station.
2. Stations 0, 2, 3, 4 (bench and lens), then 5, 6, 7 (own scenes) in parallel.
3. The Job: house set, then jobs 1–5.
4. Visual polish pass by the main session, verification, release.

## 12. Codex adversarial review (2026-11-15): what changed

Full review: `docs/review/codex-spec-review.md`. Accepted and folded in above: hands-on jobs moved to a 12 V training house and all mains procedure, cable sizing and shock simulation removed (1–4); protection modelled as one labelled overload protector (5); glow relabelled as an energy picture with voltage always between two points (6); dots limited to DC low-voltage circuits (7); explicit solver status and voltmeter-in-solve (10, 11); fixed-step sim clock (12); resistive-only appliance maths (13); Ohm's law assessed with resistors, axes fixed (14); amps never derived from rendered dots (15); solar model fully specified (16); resistance not drawn as "more atoms" (21); efficiency at equal output, source definitions (23, 27); rubrics and evidence metadata (29, 30).

Also added:
- Station 2 includes a **draw-it** task: given a 3D circuit, the student places symbols on a blank diagram grid (finding 28).
- Resource ownership (19): the Stage owns the renderer, loop and controls; `kit` owns shared cached materials/geometries (flagged `userData.shared`); a scene disposes only what it created, via `kit.disposeTree()`. Mount/unmount is tested by cycling routes.
- Accessibility floor (17): every bench action is also possible from the keyboard (edge cursor) and from a DOM "parts list" panel; state changes are announced in an `aria-live` region; all checks and job questions are plain DOM.
- Performance floor (18): low tier must hold 30 fps on an integrated-GPU laptop for the bench with x-ray on; WebGL context loss shows a "reload the scene" card.
- Release gate (8, 20): nothing is pushed until `npm test`, `npm run build` and a screenshot + click-through of every route pass. Minimum release if time runs out: solver, bench, Stations 0–4. Stations 5–7 and each job ship only if they pass the same gate; unfinished ones are hidden from the menu.

Not adopted: a full 2D fallback renderer (18) and third-party sign-off of safety text (2). Both are listed as open items for the owner.
