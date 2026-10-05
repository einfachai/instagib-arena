# Codex Y Bot validation

Validated locally on 3 October 2026. The implementation replaces the procedural body with a resculpted Mixamo Y Bot, 45 baked motion clips, independent character skeletons and mixers, and pose-derived rigid breakup pieces. All 23 inventory emotes use the single **Victory** placeholder requested for this iteration. Their inventory metadata and unlock rules remain unchanged.

## Model and export

- [Blender comparison](rig-comparison.json): passed. All 65 original bones retain their names, hierarchy, rest transforms and armature transform. Original topology, vertex order and skin-weight hashes match. Armor edits change 6,220 existing surface vertices; added visor, seams, accents and emblem bind to existing bones.
- [GLB comparison](glb-validation.json): passed. Canonical inverse bind matrices are identical. Original surface weights, joint indices and topology match through exported source vertex IDs. All 45 clips bind to the canonical rig, contain finite transforms and sample at 60 FPS, with stationary world roots.
- `codex-ybot.blend` contains the editable final armor and rig. `codex-ybot-animations.blend` contains the same final armor with 45 persistent baked actions; reopening the saved file confirms the actions remain available.
- Normalization uses a container with ground-level feet, 1.8 m height and forward −Z. The canonical rig itself is unchanged. Runtime geometry is shared; skeletons, animation mixers and materials are independent.
- Individual Mixamo exports use FBX Binary, 60 FPS, no keyframe reduction and no skin. The rifle pack supplied 30 FPS motion despite the export selection; those clips are resampled at 60 FPS. Source files and adaptations are retained in [animation-sources.json](../animation-sources.json) and the runtime manifest.
- Double-jump, boost and wall push-off use recorded Mixamo segments. No Kimodo generation was needed.

## Automated checks

| Check | Result |
| --- | --- |
| `node scripts/character/validate-assets.mjs` | Passed: original weights, rig, inverse binds and all 45 clips |
| `node scripts/character/run-tests.mjs` | 7 tests passed |
| `npm run typecheck` | Passed, client and server |
| `npm run lint` | Passed with 15 existing React warnings and no errors |
| `npm run build` | Passed, 335 modules |
| Security suite using the installed Node 24 runtime | 25 tests passed |
| `git diff --check` | Passed |

The character tests play every baked clip plus the internal inspection T-pose on independent clones; compare all 23 emote slots; check all directions and explicit movement cues; verify ordinary strafing never selects dash; reject expired and malformed cues; and exercise actual replay actors, seeking, slow motion, paused pose stability, respawn and v1–v3 playback. All **13 actual finisher IDs** are tested at full, reduced-effects and low-spec settings, including finite breakup transforms, respawn visibility and unchanged live inverse binds.

The original test and browser harness mistakenly read a nonexistent `finisher.style` field. This selected the default effect. Both now use `finisher.id`; the corrected CPU test passed. Earlier browser results are retained with explicit validity notes rather than presented as all-finisher coverage.

## Browser measurements

[Raw measurements](browser-validation.json) were captured in Chrome 154 at 1864 × 907, device pixel ratio 1. The scene uses eight characters, shared geometry, a floor and the same lighting. Each living case has 35 warm-up and 120 measured frames; death cases have 60 measured frames. The procedural baseline is from commit `c3b4e53e79b1f5cb58ea9461e7465e384e1fb325`.

| Quality / state | Old CPU P50 / P95 ms | Y Bot CPU P50 / P95 ms | Old / Y Bot frame P95 ms |
| --- | --- | --- | --- |
| Full / moving | 0.8 / 1.2 | 3.5 / 4.8 | 9.9 / 9.7 |
| Full / pulse deaths | 0.8 / 1.2 | 1.0 / 1.7 | 9.9 / 9.8 |
| Reduced / moving | 0.9 / 1.6 | 3.3 / 4.5 | 9.7 / 10.2 |
| Reduced / pulse deaths | 0.6 / 1.1 | 1.0 / 2.4 | 9.9 / 9.6 |
| Low / moving | 0.7 / 1.2 | 3.8 / 6.9 | 9.9 / 9.6 |
| Low / pulse deaths | 0.7 / 1.7 | 0.8 / 1.6 | 10.0 / 9.8 |

Moving scene draw calls remain 9, including the floor. Triangle count increases from 35,458 to 461,218. The full-quality living CPU median increases by about 2.7 ms for eight characters. These measurements demonstrate a higher animation and geometry cost; similar frame intervals on this host do not establish equivalent performance on slower hardware. Quality controls preserve finisher behavior but do not reduce the canonical character's polygon count.

These measurements precede the final visor, emblem, socket and paused-pose corrections. The original death cases used the default pulse effect because of the harness issue above. Final mixed-finisher GPU measurements and a complete final attachment/dye/podium visual sweep remain unverified: Chrome automation repeatedly timed out during the final rerun. A fresh final scene loaded the model and all clips successfully before the interruption. The corrected interactive harness includes every clip, all finisher IDs, appearance overrides, movement/recoil sequences and twelve old/new performance cases.

## Saved visual review

Final editable-source renders:

- [Relaxed idle](screenshots/idle.relaxed.png)
- [Victory placeholder](screenshots/emote.placeholder.png)

These are Blender renders of the delivered final model and motion, not screenshots of the game shader. The existing railgun, attachment controls, dye/highlight priorities, finisher material controls and first-person weapon system are integrated in the runtime. Final manual review of every attachment and moving grip should use `/lockerlab`, `/podiumlab` and `/art/ybot/validation/index.html` once Chrome automation is responsive.

No new runtime dependencies were added. Original Mixamo art and export provenance are retained separately from the code license. Unrelated workspace changes were preserved.
