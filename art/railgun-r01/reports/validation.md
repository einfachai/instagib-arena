# R-01 validation

Validated 2026-10-03 against the current working tree. Existing unrelated changes were preserved. This task was not committed, deployed, or pushed.

## Asset and appearance

- High: **7,444 triangles**, below the 8,000 ceiling (above the 6,000 target).
- Low: **1,880 triangles**, below the 2,000 ceiling (above the 1,500 target).
- Three rigid visible assemblies, one material per instance and one shared invisible ticker: **four base draws** per weapon. Flashes and optional cosmetics are additional.
- `_gun`, `_r01`, UV and normal attributes verified on both exported GLBs. Muzzle, grip, support and tracker sockets verified.
- `shot_cycle` is 1.2 seconds and binds to the carriage/sleeve. First and last poses are identical. Every instance owns its mixer and material, while geometry and textures are shared.
- The shared texture set is **2048px**, increased after the user requested a substantially more detailed close-view result. Small hardware, engraved seams and coil winding detail use authored normal/roughness maps and reference/generated albedo. This is normal-mapped relief, not a parallax shader.
- Blender side, top, front and three-quarter renders were inspected. Front framing was widened to show the complete vertical silhouette. The muzzle receives its own front projection; the opposite receiver legend is corrected in the runtime material.
- The actual game weapon, viewmodel motion, arena and character components were rendered in the local review fixture. Captures cover stock, Hazard, Sovereign Regalia, tracked/festive/killstreak attachments, character grip, reduced effects, recharge phases and eight characters. This was a renderer/component validation, not a full network match playthrough.
- The first-person camera was checked at a 16:9 canvas, including a 1280×720 view during interactive inspection. Saved capture dimensions and the measured rendering comparison are recorded in `../renders/r01-capture-report.json`.

## Behavior

`node scripts/railgun/run-tests.mjs`: **7/7 passing**. Checks exported budgets, semantic attributes, sockets, animation binding/rest poses, independent players, shared-resource disposal, ordinary finish changes, the preserved Sovereign model, remote sampling, shot acceptance, cooldown blocking, a 0.4-second training recharge, `notifyFire()` without manual reload, reverse/paused charge sampling, and reduced flash with unchanged mechanical movement.

`node scripts/character/run-tests.mjs`: **7/7 passing**. Includes actual ReplayPlayer/RemotePlayer integration: seeking into a recorded shot restores the mechanical pose and first-person shot age, paused playback holds it, reverse seeking reproduces it, and timeline reset/respawn returns the weapon to rest. Existing character motion, breakup, emote and older replay compatibility checks also pass.

The replay adapter samples recent recorded shots for every actor and clears the previous life's recharge on death. Live remote shots retain their automatic cycle. Returning actors from replay resets their weapon charge. Local firing acceptance, damage, ammo, server cooldown and audio code are unchanged.

## Build checks

- `npm run typecheck`: passed (client and server).
- `npm run lint`: passed with 15 warnings and no errors. Warnings are in the application hooks, auth fast-refresh exports and main entry's existing component declarations; none are in the railgun implementation.
- `npm run build`: passed. See `build.log` for the complete output.
- `git diff --check`: checked for whitespace issues.

## Rendering comparison

The review harness renders the same eight current characters with either the previous gun extracted from Git HEAD or the R-01. The manifest and capture JSON are the authoritative counts. In the final captured run (1546 × 870 render pixels):

| Whole scene | Previous gun | R-01 |
| --- | ---: | ---: |
| Draw calls | 24 | 40 |
| Submitted triangles | 489,648 | 482,280 |
| CPU submission median | 1.5 ms | 2.0 ms |
| CPU submission p95 | 2.9 ms | 2.7 ms |

The extra 16 calls come from two additional draws per weapon. Geometry savings are about 40% for the high gun and 33% for the low gun. The timing samples measure synchronous JavaScript/renderer submission, **not GPU frame time or FPS**. Other local build/render processes ran during this session, so these timings do not support a claim of improved frame rate. The final capture JSON records its own resolution and timings.

## Deliverables

- `../r01.blend`: editable, packed source.
- `../../../public/models/railgun-r01/`: both GLBs, shared maps and manifest.
- `../renders/reference-comparison.png`: supplied side/top reference beside the built model.
- `../renders/r01-ingame-*.png`: game-renderer review captures.
- `../renders/r01-fire-reload.webm` and `.mp4`: two automatic shot/recharge cycles, captured from the first-person game-renderer fixture, without audio.
- `../renders/r01-blender-cycle.mp4`: separate Blender mechanism preview.

The in-app browser download API stalled during capture. The authored review fixture subsequently saved the captures through a loopback-only artifact sink; no external service received the capture data. The sink is a temporary authoring utility, not part of the production server.

Scope-transition follow-up (2026-10-04): see `scope-transition-validation.md` for current tests and captures. Opening the physical sight reduced the final geometry to 7,400 / 1,868 triangles; earlier measurements above describe the previous asset revision.
