# Live Wire builder brief (read first, every builder)

Project: `~/Documents/Local Projects/Science Simulator Website/live-wire`. Spec: `docs/specs/2026-11-15-live-wire-design.md`. Contracts: `src/types.ts`.

## Rules

1. **Stay in your lane.** Only create/edit files in the folders your task names. Other builders are working in the same checkout at the same time. Never edit `src/types.ts`, `package.json`, `vite.config.ts` or another builder's folder; if you need a change there, say so in your report.
2. **No git commands that change state** (no commit, add, stash, checkout, reset). The orchestrator commits.
3. **No new dependencies.** three.js `^0.187` is installed; import addons from `three/addons/...`.
4. TypeScript strict. `npx tsc --noEmit` must be clean for your files before you report (errors in other builders' unfinished folders are not yours; say which were present).
5. `npm test` (vitest, `tests/**/*.test.ts`) must pass for tests you add. Put tests in `tests/<your-area>.*.test.ts`.
6. **Dispose everything.** Any scene you mount must remove its listeners, cancel its frame callbacks and dispose geometries, materials, textures and render targets on `dispose()`.
7. No network calls, no external assets, no AI-generated images. Textures are procedural (canvas or shader).
8. Australian English, Year 9 reading level, short sentences. No em dashes in student-facing text. Never write "simply" or "just".
9. Electrons (the dots) move from the negative terminal to the positive terminal. Never show or describe dots moving the other way.
10. Quantity colours and symbols come from `Q` in `src/types.ts`; never show a quantity by colour alone (always symbol + unit). CSS classes `q-current`, `q-voltage`, `q-resistance`, `q-energy`, `q-power` exist in `src/ui/styles.css`.
11. Must work with touch and at 375 px wide. Pointer events, not mouse events. Tap targets ≥ 40 px.
12. Three quality tiers (`low | medium | high`) from `host.quality` / `stage.quality`. Low = no bloom, no shadows, fewer particles.

## Visual bar

Polished and real-looking, not primitives with flat colours: PBR materials with roughness variation, bevelled edges (no razor-sharp boxes), believable proportions, soft shadows, emissive glow where things are hot or lit. If a part would look like a toy, add the detail that makes it read as the real object (terminals, screws, labels, seams, knurling).

## Checking your work in a browser

Dev server: `npm run dev` (port 8530, strict). It may already be running; do not start a second one on another port, reuse it.
Screenshots (run ONE at a time, never in parallel):

```bash
node tools/shot.mjs http://localhost:8530/ shots <route1,route2> 3000 1280x800
node tools/shot.mjs http://localhost:8530/ shots <route> 3000 375x812
```

Routes are hash routes (`home`, `s1`, `s1/free`, `s1/checks`, `job`, `job/j2`). Look at the screenshots with the Read tool and fix what looks wrong before reporting. The tool prints console errors; there must be none.

## Report format

When finished, reply with: files created; any additions you made beyond the contracts; anything not done or not verified; anything another builder must know.
