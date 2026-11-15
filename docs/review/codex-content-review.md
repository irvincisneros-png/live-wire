1. **Unsafe “proved dead” assessment:** `src/job/house/j2logic.ts:122` accepts one active–neutral reading as proof of safety; line 130 even converts invalid readings to zero. **Fix:** reject non-finite readings; call this “training supply checked off”, and state: “This simplified check does not prove real wiring safe. Never test or work on mains wiring.” Real verification includes checking the tester before and after use. [SafeWork NSW](https://www.safework.nsw.gov.au/__data/assets/pdf_file/0010/50230/Managing-electrical-risks-in-the-workplace-COP.pdf)

2. **Repair animation contradicts isolation teaching:** `src/job/jobs/j1.ts:185` replaces globes, repairs wires and swaps switches while the supply remains on. **Fix:** visibly disconnect the training supply before any repair; restore it afterwards.

3. **Circuit protection presented as permission to exceed a socket rating:** `src/sim/powerboard.ts:21` gives the heater **2400 ÷ 230 = 10.43 A**, yet the plan approves it whenever the circuit stays below 16 A (`:67`). **Fix:** use a 2300 W heater for this 230 V scenario and explicitly distinguish socket/power-board ratings from circuit-breaker ratings.

4. **Upgrade answer key requires hidden information:** `src/job/jobs/j4.ts:156` displays upgrade names and prices but hides their power/hour changes; `src/sim/audit.ts:171` marks savings against an exact optimum. **Fix:** show each option’s resulting watts and running hours before submission, including the assumed reductions for showers, draught sealing and air conditioning.

5. **False trip feedback:** `src/job/jobs/j3.ts:145` says “Something tripped” whenever fewer than four appliances run, even when both breakers held. **Fix:** branch on `o.tripA || o.tripB`; otherwise say “Neither breaker tripped, but fewer than four main appliances ran.”

6. **Charge flows around an unpowered loop:** `src/stations/s1/logic.ts:104` says charge “went out and came back” when both globe connections reach the same battery terminal. **Fix:** “Both ends connect to the same battery terminal, so there is no potential difference across the globe and no sustained current.”

7. **Instantaneous electrical propagation:** `src/stations/s0/index.ts:106`; `src/stations/s1/index.ts:145,149` assert simultaneous motion/stopping everywhere. **Fix:** replace “at once”/“at the same moment” with “almost immediately”; add “The electrical signal travels rapidly around the circuit.”

8. **Resistance depends on ‘different metal’ in only one direction:** `src/stations/s0/logic.ts:46` says a “different metal has more” resistance. **Fix:** “For the same material and temperature, a longer or thinner wire has greater resistance. Different materials have different resistivities.”

9. **Open-switch answer teaches electrons cease all motion:** `src/stations/s0/logic.ts:30`; `src/stations/s0/index.ts:156`. **Fix:** “They stop drifting around the circuit but remain in the wire. Their random thermal motion continues.”

10. **Gap voltage overgeneralised:** `src/job/jobs/j1.ts:95`; `src/sim/faults.ts:166,201` say a gap always has the full supply voltage. This fails with multiple open switches or disconnected sections. **Fix:** qualify: “With every other switch closed and one gap in this circuit, approximately the full terminal voltage appears across that gap.”

11. **Simulated globe contradicts graph explanation:** `src/stations/s4/index.ts:121` says a globe does not produce a straight line, although the simulator’s fixed-resistance globe does. **Fix:** “A real filament globe usually gives a curved V–I graph as it heats. This simulator’s fixed-resistance globe gives a straight line.”

12. **Capacity factor confused with operating time:** `src/stations/s7/logic.ts:170` interprets higher capacity factor as producing power “for more of the year”. **Fix:** “Its annual output is a larger fraction of the energy it would produce at rated power all year.” Capacity factor also reflects partial output.

13. **Unconverted wind energy described as mostly heat:** `src/stations/s7/logic.ts:84`. **Fix:** “Energy not converted to electricity remains in the surroundings, for example as moving air, reflected light or thermal energy.”

14. **Wasted heat declared unusable:** `src/stations/s6/logic.ts:83` makes “we cannot use it” the correct answer. **Fix:** “It spreads into the surroundings as thermal energy. It still exists but does not provide the useful light output.”

15. **Solar misleadingly routed through a generator:** `src/stations/index.ts:41` includes sunlight in energy travelling “to the spinning generator”. **Fix:** “Follow energy transformations in coal, gas, hydro, wind and solar electricity generation.”

16. **Unqualified roof suitability:** `src/sim/sources.ts:105` says solar can sit on “any roof”. **Fix:** “It has no moving parts and can be installed on suitable roofs.”

17. **Em dashes in student displays:** `src/stations/s3/index.ts:137`, `src/stations/s4/logic.ts:102`, `src/stations/s5/model.ts:193,204`, `src/job/house/ui.ts:17`. **Fix:** replace `—` placeholders with “Not measured” or “Unavailable”, as appropriate.
