# Data sources and approximations

Every number in `src/sim` data tables is a **typical, rounded, approximate** value for teaching. None is a measurement of a real product or a quote of a single source. The notes below say where each kind of figure comes from and how it was rounded, so a teacher can check it. The app labels these figures "approximate".

Sources named here are the places to check the figure. Open them for current values: GenCost and AEMO reports are updated every year.

## Appliances (`src/sim/appliances.ts`, `powerboard.ts`, `audit.ts`)

| Figure | Basis |
|---|---|
| Heater 2400 W, kettle 2200 W, toaster 900 W, iron 1800 W, sandwich press 750 W | Typical nameplate ratings of Australian 10 A plug-in appliances. Kettles are usually 2000 to 2400 W, toasters 800 to 1000 W, irons 1600 to 2400 W. Rounded. Source: rating plates and retailer specifications. |
| Microwave 1200 W, dishwasher 1200 W, washing machine 500 W, dryer 2400 W, vacuum 1200 W | Typical electrical input while running (not the cooking or output power). Rounded. Source: retailer specifications. |
| Fridge 150 W for 8 h/day | Typical compressor power while the motor runs, and a typical share of the day it runs (about 1.2 kWh a day, about 440 kWh a year). Consistent with Energy Rating label figures for 300 to 400 L fridges. |
| Hours per day | Round teaching figures for a typical home. Not survey data. |
| Hot water 3600 W for 3 h/day | A 3.6 kW storage element, which is common, running about 3 h a day. Electric hot water is one of the largest household uses (Australian Government, Your Home). |
| Heat-pump hot water 1000 W | A heat pump delivers about 3 to 4 times as much heat as the electricity it uses, so about one third of 3.6 kW. Source: Your Home, hot water systems. |
| Halogen downlights 6 × 50 W, LED replacements 6 × 7 W (42 W) | Typical 50 W halogen downlights and 7 W LED replacements of similar brightness. |
| Upgrade costs ($0 to $3200) | Round example prices for the game, not quotes. |
| Mains 230 V, 10 A sockets, 16 A circuit breakers | Australian standard supply voltage (AS 60038) and typical power-circuit protection. Used as context only. |
| Example price 33 c/kWh | One stated example figure, labelled "example price". Real tariffs vary by retailer and region (see the Australian Energy Regulator and AEMC price reports). |

## Energy Rating labels (`LABELS` in `appliances.ts`)

Star ratings and kWh/year values are **invented examples in the style of** the Australian Government Energy Rating label (energyrating.gov.au). They do not describe real models. The rules they follow are real: stars compare models of the same type and similar size, more stars means less energy for that size class, and the kWh/year figure comes from a standard test and is an estimate. The size-trap pair shows that stars cannot be compared across sizes.

## Efficiency of lamps (`efficiency.ts`)

| Figure | Basis |
|---|---|
| 800 lm from a 60 W incandescent, 42 W halogen (halogen "eco" replacement) and 9 W LED | Typical retail equivalence tables. About 13 lm/W, 19 lm/W and 90 lm/W. Rounded. |
| 4.0 W of light for 800 lm | A **teaching figure**. Light power depends on the spectrum. White light is about 250 to 350 lm per watt of visible radiant power, so 800 lm is about 2.5 to 3 W of visible light. 4.0 W is used so the three lamps share one simple number. The ranking and the idea (most input becomes heat in a filament lamp) are unchanged. |

## Generation sources (`src/sim/sources.ts`)

Conversion efficiency, capacity factor, cost band, build time and CO2 are all rounded to ranges. Cost bands are qualitative (1 cheapest to 5 dearest) and are about **new-build** electricity before the cost of storage or backup for wind and solar.

| Field | Basis and source to check |
|---|---|
| Conversion efficiency: coal steam 30 to 40 %, gas turbine 30 to 40 %, hydro 85 to 95 %, wind 35 to 45 %, solar PV 15 to 22 % | Typical plant and panel efficiencies. Coal: thermal efficiency of steam plants (IEA, Coal-fired power; Australian plants are mostly at the lower end). Gas: open-cycle gas turbines are typically 30 to 40 %; combined-cycle plants reach about 50 to 60 % (IEA; CSIRO GenCost technology assumptions). Hydro: turbine and generator efficiency (IEA; Hydropower Australia). Wind: the share of wind energy turned into electricity, below the Betz limit of 59 % (IEA Wind). Solar PV: commercial panel efficiency (CSIRO; Australian PV Institute). Conversion efficiency is **not** the same as capacity factor. |
| Capacity factor: coal 60 to 80 %, gas turbine 5 to 15 %, hydro 20 to 40 %, wind 30 to 45 %, solar 20 to 30 % | Share of the year a plant's output equals its full rated output, for Australian plants. Source: AEMO (Integrated System Plan, Inputs and Assumptions; Quarterly Energy Dynamics) and CSIRO GenCost. Open-cycle gas turbines run as peakers, so their capacity factor is low. Hydro varies with rainfall and operating role. |
| Cost band: solar 1, wind 2, gas 4, hydro 4, coal 5 | Ranking of new-build cost of electricity in CSIRO GenCost (annual report). Only the order is used, not dollar figures, because the numbers change each year and depend on assumptions. Wind and solar are shown without the cost of firming (storage or backup), which the app says in the cost note. |
| Build time: coal 5 to 10 years, gas turbine 2 to 4, hydro 6 to 12, wind 1 to 3, solar 1 to 2 | Typical planning and construction periods. Source: CSIRO GenCost (lead times) and AEMO ISP assumptions. Rounded, and wide because real projects vary. |
| Operating CO2: coal about 900 g/kWh, gas turbine about 600, hydro, wind and solar 0 | Direct emissions at the power station per kWh of electricity. Source: Australian Government National Greenhouse Accounts Factors (Scope 1 factors for black coal and gas) and CSIRO GenCost. Rounded. Combined-cycle gas is about 350 to 450. Building the plant adds a small lifecycle amount for every source: the IPCC lifecycle medians (AR5, Working Group III, Annex III) are roughly 800 to 1000 for coal, about 400 to 500 for combined-cycle gas, and about 10 to 50 for hydro, wind and solar PV. Only operating figures are shown. |
| Dispatchable | Whether output can be turned up on demand: yes for coal, gas and hydro (limited by water), no for wind and solar without storage. AEMO ISP definitions. |
| Transformation chains | Standard physics: coal burns in a boiler to make steam that spins a steam turbine; gas burns in a combustion chamber and the hot gas spins a gas turbine (no boiler or steam in open-cycle); falling water spins a turbine; wind spins blades; PV converts light straight to electricity with no moving parts. |
| Omitted: nuclear, geothermal, biomass | Left out to keep the comparison short. They are listed so the omission is honest. Nuclear is not generated in Australia at present. |

## Solar and battery model (`src/sim/solar.ts`)

| Figure | Basis |
|---|---|
| About 18 kWh a day, evening peak | Typical Australian household use is about 15 to 20 kWh a day (Australian Energy Regulator, Residential electricity price trends and AEMO). The hourly shape is a teaching profile with a morning bump and a 5 pm to 8 pm peak. |
| 4.5 kWh a day per kW of panels on a clear day, bell-shaped from 6 am to 6 pm | Typical clear-day yield for Australian rooftop solar is about 4 to 5.5 kWh per kW (Clean Energy Council; Australian PV Institute). The 12-hour sine shape is a simplification. |
| Battery 90 % round trip applied on charging, 0.5 C | Typical home lithium batteries have round-trip efficiency of about 85 to 95 % and can charge or discharge at about 0.5 C. Source: manufacturer data sheets and CSIRO. |
| Evening window 5 pm to 10 pm, import threshold 2 kWh | Game thresholds, not standards. |

## Chosen simplifications

- Globes have fixed resistance R = V² ÷ P (a real filament's resistance rises as it heats).
- 230 V mains is treated as steady, not AC.
- Small loads (phone charger, LED lamp) are treated with P = V × I in Job 3 for simplicity. Their real current depends on the electronics inside.
- Appliance hours and costs are teaching figures.
