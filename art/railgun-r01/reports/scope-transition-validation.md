# Animated scope validation — 2026-10-04

The standard R-01 now raises and approaches the eye over 0.5 seconds, reversing over 0.25 seconds. `ScopeTransition` supplies a single reversible phase for weapon/hand placement, FOV, projected aperture, masked peripheral blur/darkness, reticle, and the whole-viewmodel fade. The gameplay presentation clock uses elapsed wall time independently of the simulation's capped delta. Firing and the 1.2-second automatic recharge are unchanged.

The scope source is vector graphics; no generated raster asset is necessary. The final optic graphic is preserved. The blur mask keeps both the moving sight and the authoritative center of aim clear. The physical sight has an open aperture, and both exported LODs plus the Blender source contain a named rear sight attachment. Its weapon-space position is `(0, 0.17, -0.1885)`. Current geometry is 7,400 / 1,868 triangles and four base draws in both LODs. The authoritative manifest is `public/models/railgun-r01/manifest.json`.

## Verification

- 15 input/controller/pose tests pass: exact 0.5 / 0.25 seconds at 30, 60, 120 and 144fps; intermediate reversal and re-press; invalid delta handling; interruption reset; staged visibility; sight alignment despite custom offsets and transformed world cameras; fallback models; hold-to-scope and input cleanup.
- 7 weapon tests pass against the rebuilt GLBs: sight binding, triangle/surface/socket budgets, animation binding, deterministic automatic recharge, accelerated cooldowns, blocked shots, replay sampling, finishes and independent instance disposal.
- 12 character tests pass, including first-person arm grips, respawn lifecycle, replay seeking/pause and motion bindings.
- 29 actual `Game` fixture checks pass: transition visibility/FOV, firing during the approach, scoped firing, blocked shots, recharge, early reversal, sensitivity, hip reticle handoff, focus loss, reduced effects, hidden viewmodel, low-spec, custom offsets, movement, replacement and special-model fallback, spectator/chat entry, death and respawn. Results are saved in `renders/r01-scope-checks.json`.
- Typecheck passes for browser and server. Production build passes. Lint passes with 15 pre-existing React dependency/refresh warnings and zero errors. `git diff --check` passes.
- Viewed the real Game scope and scrubbed the review pose through approach/handoff. The sight is centered and open, hands remain attached, and fade preserves mesh self-occlusion without modifying shared materials. The brief overlap of physical housing and optic is the intended crossfade; the aim marker remains centered.

## Captures

`renders/r01-scope-transition-{0,20,40,60,80,90,100}.png` show entry phases. `renders/r01-scope-transition.webm` is a 3.3-second VP9 capture at 1265 × 712, including a shot, automatic recharge, release, and a rapid reversal. These use the game's weapon, arm rig, viewmodel layer, transition and scope components in the authoring scene. The capture composites the live SVG with equivalent Canvas2D masked blur because WebGL canvas recording alone excludes DOM overlays. Actual DOM blur was also inspected in the browser.

Reproduce by running the local capture sink and selecting **Save scope transition** in the weapon review page. **Aim** scrubs the exact shared phase and **Animate scope** plays it. The real Game checks are at `art/railgun-r01/review/scope.html?photo=1`.

## Temporary rendering cost

Warmed local browser sample, 45 frames per state, 1265 × 712:

| State | Draw calls | CPU submission median | Median frame interval |
| --- | ---: | ---: | ---: |
| Hip | 17 | 1.0 ms | 8.3 ms |
| Handoff + blur | 18 | 1.1 ms | 8.5 ms |
| Handoff without blur | 18 | 1.1 ms | 8.5 ms |
| Fully scoped | 11 | 0.7 ms | 8.2 ms |

The fade adds one full-screen draw during its brief handoff; normal hip rendering uses the original direct viewmodel path. Fully scoped skips drawing the weapon. Blur is limited to entry/exit and disabled in reduced-effects and low-spec settings. The half-float fade target is cached and disposed with the viewmodel layer. Full samples are in `renders/r01-scope-performance.json`.

These are CPU submission and browser frame-pacing measurements, not isolated GPU/compositor timestamps. Local builds and other machine activity affect them; they establish no cross-device performance guarantee. No dedicated replay-viewer visual capture was made for this scope change; replay entry disables the local scope and existing replay tests pass.
