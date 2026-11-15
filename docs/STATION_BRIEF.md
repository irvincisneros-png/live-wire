# Station and job builder brief

Read, in this order: `docs/BUILDER_BRIEF.md` (rules), the spec `docs/specs/2026-11-15-live-wire-design.md` (sections 2, 4, 5, 6, 9, 12 matter most), `src/types.ts`, `src/kit/README.md`, `src/sim/README.md`, `src/stations/benchCommon.ts`, and the placeholder you are replacing (it shows the exact module shape).

## What exists

- **Shell** (`src/ui`): routes, station page (phase tabs Guided / Free play / Checks), coach, checks, dashboard, job page, results, job sheet. You only supply a module:
  - station: `export function mount(host: StationHost): StationInstance` in `src/stations/sN/index.ts` (returns `{ steps, tasks, onPhase, dispose }`)
  - job: `export function mount(host: JobHost): JobInstance` in `src/job/jobs/jN.ts`; call `host.finish(result)` exactly once when done.
- **Page DOM**: `host.view` is `position:absolute; inset:0` inside the main area (the 3D canvas goes here; you may also add absolutely positioned overlay controls to it). The coach card sits top-left over the view, so keep that corner clear. `host.side` (stations) / `host.panel` (jobs) is a padded column beside the view on wide screens and a pull-up sheet under it on phones: put diagrams, graphs, tables, questions there. The dashboard strip is above the view; call `host.dashboard.show(reading)`.
- **Kit** (`src/kit`): `createStage(container, quality, { mood })` → `KitStage` (orbit camera, lights, env, bloom, `onFrame`, `flyTo`, `pick`, `dispose`); shared PBR materials (`materials.ts`), procedural textures, `labelTexture`, `createLcd`, part models in `kit/parts`, `disposeTree`, `contactShadow`, `rbox`, `mesh`, `glowSprite`, `blackbody`, `bakeStatic`. Scale: 1 unit = 10 cm, y up.
- **Bench** (`src/bench`): `mountBench(host, benchOptions)` from `src/stations/benchCommon.ts` gives `{ stage, bench, dispose }` with the dashboard and an X-ray toggle already wired. `Bench` API is in `src/types.ts` (getParts/setParts/editPart, solution, onChange, onEvent, highlight, setTray, setReadOnly, energyOf, diagram, postId…). `TRAY` presets and `anyGlobeLit`, `partsOf`, `readingFor` are in `benchCommon.ts`. `src/dev-bench.ts` shows working circuits as `Part[]` on the grid. `createDiagramEditor` and `sameTopology` are exported from `src/bench/diagram.ts`.
- **Sim** (`src/sim`): solver, units/formatting, appliances, labels, efficiency/lamps, sources, power board, audit, solar, faults, outlet, scorers. Use these; do not re-derive numbers in UI code.
- CSS: shell variables `--lw-bg`, `--lw-panel`, `--lw-ink`, `--lw-muted`, `--lw-accent`, `--lw-line`, `--lw-radius`; quantity classes `.q-current` etc. Put your own CSS in a `.css` file in your folder, imported by your module, with class names prefixed by your id (`.s5-…`, `.j2-…`).

## Teaching rules

- Guided steps: 4–7, each one action in the scene with a `done()` that detects it. One or two sentences each. The student does things; they do not read walls of text. Use the quantity spans: `<span class="q-current">current (I)</span>`.
- `onPhase('guided')` must reset the scene to the guided start; `'free'` unlocks everything; `'checks'` sets up for the tasks (each task's `onStart` can load a specific scene).
- Checks: 3–4 tasks per station mixing `do`, `number` and `choice`. Every `number` answer must be computed from the same sim values shown on screen, never typed in by hand. `explain` text teaches the idea in one or two sentences.
- Feedback explains; it never only says "wrong".
- Jobs give no hints, record every answer as a `JobAnswer`, and use the scorer from `src/sim`.
- Dots (x-ray) are for the low-voltage DC bench and the 12 V training house only. Household 230 V content uses energy packets, meters and Sankey diagrams.
- Year 9 reading level, Australian English, no em dashes, never "simply" or "just".

## Tests

Add `tests/<your-id>.test.ts` (node env): every check validator / answer you can express as a pure function gets a known-good and known-bad case. Keep pure logic in DOM-free files so it is testable.

## Verify

Dev server is running at http://localhost:8530/ (do not start another). Routes: `#s3`, `#s3/free`, `#s3/checks`, `#job/j2`. Screenshot at 1280x800 and 375x812 with `tools/shot.mjs` (the 6th argument is JavaScript to run before each shot, e.g. to drive your scene through `window.__livewire` or a debug handle you expose on `window.__sN`). ONE shot run at a time; other builders are also using this machine's GPU, so keep runs short and few. Look at every screenshot and fix what looks wrong or cramped. No console errors. `npx tsc --noEmit` clean for your files and `npm test` green for your tests.

Expose `window.__<id>` (e.g. `__s3`, `__j2`) with whatever handles help a tester drive the scene (the bench, a `complete()` that performs the guided actions, a `solve()` for jobs).
