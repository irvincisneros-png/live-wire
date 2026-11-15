# Live Wire 3D kit

## Units and axes

- **1 unit = 10 cm.** Bench posts are 1 unit apart, so a D-cell (61 mm) is 0.6 units long.
- **y is up.** The circuit panel's top surface is y = 0; the timber bench top is y = −0.05 (`BENCH_Y`).
- The post grid is centred on the origin in the XZ plane. Column 0 is on the left (−x), row 0 is at the back (−z, the top of the diagram). `postId(col,row) = row * cols + col`; posts are named `A1` (col letter, row number).
- The default camera looks from +z toward −z, tilted down (`pitch` ≈ 0.9 rad on landscape, 1.12 on portrait).

## Part models (`parts/*.ts`)

Every edge part is built in its own frame: origin at the edge midpoint on the board, terminal **a** at x = −0.5, terminal **b** at x = +0.5 (the bench rotates it about y so +x points from post a to post b). For a battery, a is the negative terminal. Brass lugs clamp round the post stems at `DIM.lugY`; banana plugs stack on the cap tops at `DIM.postTop + level × DIM.plugH`.

Meters and the adjustable bench power supply always face the student (+z) and reach their posts with leads (`userData.connect(pa, pb, levelA, levelB, ground)`).

Model `userData` contract (see `PartModelData` in `parts/common.ts`): `update(state, dt)`, `flowPath` (`{ pts, u }` in local space, a → b; `u` is the potential fraction 0 at a, 1 at b, so the x-ray glow can drop inside the component), optional `hotSpot` (where energy packets leave).

## Resources

- `materials.ts` and the geometry cache in `parts/common.ts` return **shared** objects (`userData.shared = true`). `disposeTree(obj)` in `dispose.ts` skips anything shared; everything else under a model is owned by it.
- `bakeStatic(group, skip)` merges static meshes that share a material into one mesh per material (cuts draw calls about 40 %). Call it at the end of building a model.
- Textures are procedural canvases (`textures.ts`); there are no external assets.

## Stage extras (`KitStage`, beyond the `Stage` contract)

`mood`, `setHome(view, moveNow)`, `userMoved`, `onResize(cb)`, `keyLight`, `setPanBounds(...)`, `toScreen(worldPoint)`. `contactShadow(w, d, opacity)` is exported from `stage.ts`.

## Quality tiers

| | low | medium | high |
|---|---|---|---|
| pixel ratio cap | 1 | 1.5 | 2 |
| shadows | off (blob contact shadows only) | 1024 PCF | 2048 PCF |
| bloom | off | on (MSAA ×2 target) | on (MSAA ×4 target) |
| glass | fresnel shell | fresnel shell | transmission |
| globe point lights | 0 | 2 (pooled) | 3 (pooled) |
| x-ray dot spacing | 0.13 | 0.095 | 0.075 |
