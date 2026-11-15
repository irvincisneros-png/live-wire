# src/sim: pure logic

No DOM, no three.js. Everything here is plain TypeScript and unit-tested (`tests/sim.*.test.ts`). Import from the module file, for example `import { fmt } from '../sim/units'`. Units are SI unless a name says otherwise: volts, amps, ohms, watts, joules, seconds. `kWh` is used for household energy. All data tables are approximate; see `docs/DATA-SOURCES.md`.

Every scorer returns a `JobResult` (`src/types.ts`) built by `makeResult`: score 0 to 100, stars (50 gives 1, 70 gives 2, 90 gives 3), 2 to 4 short `lines`, and `answers` for the Job sheet.

## circuit.ts (solver, not mine)
`solve(circuit)`, `meterReading(part, solution)`, `resistanceOf(part)`, constants `WIRE_OHMS`, `AMMETER_OHMS`, `VOLTMETER_OHMS`, `BATTERY_RINT`, `SHORT_LIMIT_A`, `BLOW_FACTOR`. Battery `a` is negative, `b` is positive. A voltmeter part reads V(b) minus V(a).

## score.ts
`starsFor(score)`, `clampScore(score)`, `makeResult(score, lines, answers)`.

## units.ts
`fmt(value, unit, sig = 3)` formats with SI prefixes: `fmt(0.0123,'A')` is "12.3 mA", `fmt(1500,'W')` is "1.50 kW", `fmt(3.6e6,'J')` is "3.60 MJ". `kWh`, `%`, `h` and a few others take no prefix. NaN and Infinity give "—". `fmtMoney(1234.5)` is "$1,234.50". `joulesToKWh`, `kWhToJoules`, `J_PER_KWH`. `within(value, answer, tolerance, absFloor = 1e-6)`: tolerance is a fraction (0.05 is 5 %). Also re-exports `starsFor`.

## seed.ts
`rng(seed)` gives `{ next(), int(lo, hi) (inclusive), pick(arr), shuffle(arr) }`. Same seed, same numbers. `shuffle` returns a copy.

## appliances.ts
`APPLIANCES` (16: id, name, powerW, hoursPerDay, resistive, category), `applianceById`. `energyJ(P, seconds)`, `energyKWh(P, hours)`, `cost(kWh, price = 0.33)`, `currentAt(P, volts = 230)` (only meaningful for resistive loads). `EXAMPLE_PRICE_PER_KWH`, `MAINS_V`. Labels: `LABELS` (`EnergyLabel { id, type, sizeLabel, stars, kWhPerYear }`), `LABEL_PAIRS` (same type and size, `lower` and `higher` label ids; more stars always means fewer kWh), `SIZE_TRAP` (a small 3-star fridge uses less than a big 5-star one), `labelById`, `pairSavingPerYear`.
Example: `cost(energyKWh(2200, 0.5))` is 1.1 kWh × 0.33 = $0.363.

## efficiency.ts
`efficiency(useful, total)` returns percent (NaN if total is not above 0). `LAMPS` (incandescent 60 W, halogen 42 W, LED 9 W; each `inputW`, `lightW` = 4.0, `heatW`; light + heat = input exactly), `lampEfficiency(lamp)`, `lampSankey(lamp)`. `sankey(inputW, outputs[{label, watts, useful}])` throws if outputs do not add to the input and returns `{ inputW, outputs, usefulW, wastedW, efficiencyPct }`.

## sources.ts
`SOURCES` (coal, gas turbine, hydro, wind, solar PV): `renewable`, `chain[{form, device}]` (first step is the store, last is electrical), `efficiencyPct [lo, hi]`, `capacityFactorPct [lo, hi]`, `costBand` 1 to 5 and `costNote`, `buildYears [lo, hi]`, `co2gPerKWh` (operating), `dispatchable`, `advantage`, `disadvantage`. `OMITTED` is `['nuclear','geothermal','biomass']` and `OMITTED_NOTE` is the sentence to show. Helpers: `sourceById`, `midpoint(range)`, `hasTurbine(source)`, `renewableIds()`.

## powerboard.ts (Job 3)
`BOARD_APPLIANCES`, `mainIds()`, `applianceCurrent(id)`, `boardCurrent(ids)` (I = total P ÷ 230), `trips(currentA, limitA)` (strictly above the limit), `BOARD_LIMIT_A = 10`, `CIRCUIT_LIMIT_A = 16`. A plan is `Record<applianceId, 0 | 1 | 2>` (0 off, 1 or 2 the circuit); `planCurrents(plan)`, `planRuns(plan)` (no trip and at least 4 main appliances on; all five cannot fit on two 16 A circuits). `EXPLANATION_OPTIONS`, `EXPLANATION_CORRECT`. `scorePowerBoard({ currents, explanation, plan })`.

## audit.ts (Job 4)
`AUDIT_APPLIANCES` (10), `OPTIONS` (8, each `costDollars`, `applianceId`, `power?`, `hours?`, `excludes?`), `BUDGET = 1000`. `yearlyKWh(items?)`, `yearlyCost(items?)`, `applianceYearlyKWh(a)`, `topUsers(n)`. Composition rule: two options conflict if they list each other in `excludes` or both set the same field (power or hours) of the same appliance. Different fields combine (heat pump sets power, shorter showers sets hours). `conflicts`, `compatible(ids)`, `optionsCost(ids)`, `applyOptions(ids)` (throws on conflict), `yearlySaving(ids)`, `bestPlan(budget)` (tries all subsets). `scoreAudit({ top3, chosen, explanation })`: top three 30 (6 per correct member, 4 per correct place), saving ÷ best saving × 50, explanation 20; an over-budget or conflicting plan saves nothing.

## solar.ts (Job 5)
`LOAD_KWH` (24 values, 18 kWh), `PV_KWH_PER_KW` (24 values, 4.5 kWh), `simulateDay({ pvKW, batteryKWh })` gives `{ input, hourly, totals }`. `hourly` arrays: pv, load, selfUsed, toBattery, fromBattery, batteryLoss, exported, imported, soc. `totals`: pv, load, selfUsed, toBattery, fromBattery, batteryLoss, exported, imported, batteryEnd. Invariant: `balanceIn(t)` (pv + imported) equals `balanceOut(t)` (load + exported + batteryLoss + batteryEnd). `sankeyFor(result)` gives `{ nodes, flows[{from, to, kWh}] }` with balanced middle nodes. `eveningImport(result)`, `balanceAnswer(result)` (kWh not used by the house), `EVENING_HOURS`, `TRADEOFF_OPTIONS`. `scoreSolar({ pvKW, batteryKWh, balanceKWh, tradeoff })`: balance question 30; evening import at most 2 kWh gives 25 (at most 4 gives 12) and exporting at most 40 % of solar gives 15; trade-off 30.

## faults.ts (Job 1)
`buildScenario(seed)` gives `{ parts, fault: { kind, partId, description }, layout }`. Nodes: 0 negative rail, 1 battery +, 2 positive bus; room k (Lounge 0, Kitchen 1, Hallway 2) uses nodes 3+4k (switch in), 4+4k (switch out), 5+4k (globe top), 6+4k (globe bottom). Part ids: `bat`, `main`, `sw0..2`, `g0..2`, `wire-A..wire-I`. Fault models: switch stuck open is a switch with `closed: false, locked: true` (the UI must not toggle a locked switch); blown globe has `blown: true`; broken wire is removed from `parts` (its layout entry has `missing: true`). `layout.nodes[n]` has `{ x, y, name }` (grid units, y down) and `layout.parts[id]` has `{ label, room, missing? }`. Also `healthyHouse()`, `applyFault(fault)`, `allFaults()` (16), `readVoltage(parts, {a, b})`, `darkGlobes(parts)`. `distinguishes(fault, {a, b})`: the voltmeter reads differently (more than 0.5 V) from the healthy house. A blown globe reads the same as a healthy one, so `discriminates(fault, m)` also counts a reading that separates it from another fault with the same dark globes; `isUseful` is either. `scoreFault({ fault, answerKind, answerPartId, measurements, reasoning })`: kind 20, exact part 30 (10 for the right room), a useful measurement 25, reasoning 25.

## outlet.ts (Job 2)
Nodes: 0 supply neutral, 1 supply active, 2 supply earth, 3 to 5 existing outlet (active, neutral, earth), 6 to 8 new outlet. The student's wiring is `{ active, neutral, earth }`, each an `OutletPoint` or null. `analyseOutlet(wiring, { existingLampW?, newLampW?, limitA? })` gives `{ topology, verdict, problems, existingVolts, newVolts, existingCurrentA, newCurrentA, totalCurrentA, protectorHolds, newOutletFull, existingOutletFull, parts }`. Topologies: `parallel`, `reversed` (cross-connected), `same-point`, `incomplete`, `earth-misused`. With every existing terminal wired straight to the supply a series arrangement cannot be built from three conductors, so there is no `series` result. Protector limit 5 A, default lamps 12 V 12 W (1 A each, 2 A total). `buildOutletParts`, `predictedTotalA(options)`, `handPredictionA(options)`, `CORRECT_WIRING`, `OUTLET_POINTS`, `netOf(point)`. `scoreOutlet({ wiring, isolated, provedDead, testedBoth, predictedA, options? })`: parallel 35 (12 + 12 + 11), off and proven dead 25 (12 if only switched off), both outlets at full voltage 15 (7 if not tested), prediction within 5 % 25.
