# R-01 railgun

The standard weapon now uses a Blender-authored mesh, a shared PBR texture set, and a deterministic mechanical recharge. The white ceramic armor, graphite chassis, copper windings, blue rails, open stock, skeletal grip, sight and rectangular muzzle follow the supplied sheet. The shooting simulation, damage, ammunition, audio and 1.2-second cooldown are unchanged.

## Files

- `r01.blend`: editable high/low source collections, three runtime assemblies, named sockets, animation and packed reference/material images.
- `reference/r01-design-sheet.png`: supplied design sheet.
- `textures/generated-atlas-v2.png`: generated copper, graphite and grip source artwork. Created using the built-in image generation tool; the exact prompt is in `textures/generation-prompt.txt`.
- `../../public/models/railgun-r01/`: runtime `high.glb`, `low.glb`, albedo (`detail.png`), normal, roughness, authoring height map and manifest.
- `renders/`: reference comparison renders and available captures.
- `reports/`: geometry manifest and validation logs.
- `review/index.html`: interactive review scene with actual game weapon, character and viewmodel components, finish controls, phase seeking, attachments, recording and eight-character comparison.

## Budgets and materials

| Tier | Previous triangles | R-01 triangles | Base draw calls |
| --- | ---: | ---: | ---: |
| First person / close preview | 12,476 | 7,400 | 4 |
| Character | 2,802 | 1,868 | 4 |

Three meshes represent the static body, charging carriage and locking sleeve. One shared, invisible render ticker samples the animation before the visible meshes. Optional muzzle flashes and cosmetic overlays are additional draws. Both meshes remain below the agreed 8,000 / 2,000 ceilings. The 6,000 / 1,500 targets were exceeded to retain the open frame, chamfers, layered rails and mechanism.

The shared atlas was increased from the initial 1024px target to 2048px in response to the close-view quality feedback. Source-image armor projections are registered to the mesh; generated material trims cover copper windings and grip surfaces. The authored height map keeps lettering flat while placing recesses at screws, vents and panel seams. Tangent normals and roughness supply lighting detail. This is normal-mapped relief, not geometric displacement or parallax occlusion mapping.

The game binds its finish-aware material to the runtime GLBs. The GLBs intentionally contain geometry, UVs, semantic `_gun` / `_r01` attributes, sockets and animation without embedded materials; use the Blender file for a self-contained textured asset. Shared cached geometry/textures survive individual instance disposal. Palettes and patterns remain shader-driven; copper retains its own surface. The stock inventory ID is unchanged. Special models retain their own builders and animation paths.

## Recharge

The `shot_cycle` clip is exactly 1.2 seconds. The carriage retracts, the sleeve opens, and both return exactly to rest. The game samples clip time from charge, including shortened training cooldowns and backward replay seeking. Rail emission, discharge and ready indication use the same phase. There is no input needed to reload and no second viewmodel recoil. `notifyFire()` also completes a cycle when used by a standalone preview or remote shot without a continuing explicit charge source.

Named sockets and their game-space coordinates are in `manifest.json`. Standard character mounting uses the grip/support positions; special models retain the prior mounting. Tracked counters seat on the receiver, festive wire fits the rectangular shroud, and the bow moves to the rear cheek plate.

## Rebuild

From the repository root, with Pillow and NumPy available:

```sh
python3 scripts/railgun/make-atlas.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python scripts/railgun/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 4 --python-exit-code 1 --python scripts/railgun/render.py -- side top front hero reload
node scripts/railgun/run-tests.mjs
node scripts/character/run-tests.mjs
npm run typecheck
npm run lint
npm run build
```

For interactive inspection, start `npm run dev:web -- --host 127.0.0.1`, run `node scripts/railgun/prepare-baseline.mjs`, and open `http://127.0.0.1:5173/art/railgun-r01/review/index.html`. The baseline source is extracted from Git HEAD and ignored by Git. The review harness is not shipped in the production application.

Optional local capture: run `node scripts/railgun/capture-server.mjs` and reload the review page. Its first connection runs a capture pass and saves generated PNG/WebM/JSON artifacts locally. The sink listens only on loopback, accepts only the review origin, restricts filenames and caps payload sizes. Stop the sink afterward. Without it, the review page behaves normally.

For a Blender-only motion preview, run `scripts/railgun/animate.py` with Blender and encode its numbered PNGs at 30fps. That preview is explicitly distinct from a gameplay recording.

See `reports/validation.md` for checks, rendering measurements and their limits.

## Animated scope

Hold right mouse to raise the sight over 0.5 seconds; release to reverse over 0.25 seconds. One reversible phase drives the camera FOV, weapon/hand pose, projected aperture, peripheral blur/darkness, reticle and whole-viewmodel fade. The authored `sight` socket marks the rear optic at `(0, 0.17, -0.1885)` in weapon space. Its aperture stays open during the approach. Special models use a centered fallback pose.

The fade composites the separate viewmodel layer, preserving opaque weapon materials and hand self-occlusion. Reduced effects and low-spec disable blur. Hidden-viewmodel still scopes. The mechanical reload and shooting cooldown are unchanged.

The review page's **Animate scope** button plays entry and release; **Aim** scrubs the shared phase. With the local capture sink running, **Save scope transition** writes phase screenshots, a short WebM with firing and reversals, and performance samples under `renders/`. The capture includes the live SVG plus equivalent masked Canvas2D blur. `review/scope.html?photo=1` runs integration checks against the real Game class.

```sh
node --import tsx --test tests/scope-transition.test.ts tests/scope-input.test.ts
```

See `reports/scope-transition-validation.md` for the scope validation details.
