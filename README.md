# Live Wire

A 3D electricity simulator for Year 9 Science (NSW Science 7–10 syllabus, Stage 5 focus area **Energy**, SC5-EGY-01).

Live: https://irvincisneros-png.github.io/live-wire/ · Teacher notes: https://irvincisneros-png.github.io/live-wire/teacher.html

## What it is

- **Learn: trade school.** Eight stations, each with a guided tour, free play and short checks that award a ticket.
  0. What is electricity? (zoomed-in picture of charge, current, voltage, resistance, energy and power)
  1. Complete circuits (1.3.1)
  2. Build and draw (1.3.2)
  3. Series and parallel (1.3.3)
  4. Ohm's law (1.3.4)
  5. Power and energy (1.3.5, 1.3.6)
  6. Efficiency (1.1.1–1.1.3)
  7. Sources (1.2.1–1.2.3)
- **Circuit lab.** An open bench with every part, starter circuits, a live circuit diagram and electron flow on both the board and the diagram.
- **The Job: assessment day.** Five summative jobs as a first-year apprentice at a 12 V training house: fault call-out, install a new power point, the tripping power board, energy audit, solar and battery. Scored, no hints, with a printable job sheet.

Electrons (the dots) always move from the negative terminal to the positive terminal. All hands-on wiring is on a 12 V training house; nothing in the app is a mains procedure.

## Develop

```bash
npm install
npm run dev     # http://localhost:8530
npm test        # vitest
npm run build   # type-check + production build to dist/
```

Pushing to `main` builds, tests and deploys to GitHub Pages (`.github/workflows/deploy-pages.yml`).

## Layout

- `src/sim/` pure logic (circuit solver, appliances, efficiency, sources, job models and scorers); see `src/sim/README.md`
- `src/kit/` three.js stage, materials and part models; see `src/kit/README.md`
- `src/bench/` the interactive circuit bench, x-ray charge flow and live circuit diagram
- `src/lens/` the deep-zoom scene used by Station 0
- `src/stations/s0…s7/`, `src/job/` stations and jobs
- `src/ui/` shell, coach, checks, dashboard, progress
- `docs/specs/` design spec; `docs/review/` Codex adversarial reviews; `docs/DATA-SOURCES.md` where the numbers come from

No accounts, no tracking, no network calls. Progress stays in the browser.
