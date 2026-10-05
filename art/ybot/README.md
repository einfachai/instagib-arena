# Codex Y Bot

The runtime uses a resculpted Mixamo Y Bot with its original 65-bone rig and skin weights. The helmet, chest, shoulders, forearms and shins have compact shell edits; added visor framing, panel seams, lavender shin accents and the Arena emblem use existing bones. The game palette is white `#f6f7fc`, blue `#7d9bff`, lavender `#aa8eff` and graphite `#101521`.

## Delivered assets

| File | Purpose |
| --- | --- |
| `codex-ybot.blend` | Editable armor, original skinning and rest rig |
| `codex-ybot-animations.blend` | Same armor and rig, with 45 persistent baked actions |
| `source/original-ybot.blend` | Imported original character for comparison |
| `source/mixamo/` | Original FBX downloads and rifle pack |
| `animation-sources.json` | Source files, clip segments, mirroring and export settings |
| `../../public/models/codex-ybot/model.glb` | Runtime body |
| `../../public/models/codex-ybot/clips/` | 45 geometry-free animation GLBs |
| `../../public/models/codex-ybot/manifest.json` | Runtime mapping, duration, frame count and source provenance |
| `reports/rig-comparison.json` | Original versus edited Blender rig, topology and weight hashes |
| `reports/glb-validation.json` | Exported bone, inverse-bind, source-vertex, weight and clip checks |
| `reports/browser-validation.json` | Rendered finisher and eight-character measurements |
| `reports/validation.md` | Verified results, performance comparison and remaining visual QA limits |

Every one of the 23 existing inventory emotes currently plays **Victory**, the single Mixamo placeholder requested for this iteration. Inventory IDs, names, ownership, rarity, prices and unlock rules remain intact. Breathing Idle remains the relaxed menu/locker pose. The original T-pose is retained internally for rig inspection.

## Acquisition and processing

The character and motions were downloaded through the logged-in Chrome Mixamo session. Requested settings were FBX Binary, 60 FPS and no keyframe reduction; individual motion exports omitted the skin. The rifle pack supplied 30 FPS files despite the 60 FPS selection. All runtime clips are resampled at 60 FPS without runtime retargeting or duplicate geometry.

The rifle pack provides eight walking, running and sprinting directions, armed idle, turning and airborne phases. Separate downloads provide start/stop transitions, rifle jump, landing, four directional standing dodges, wall run, breathing idle and Victory. Double-jump uses the rifle jump's airborne tuck/extension; boost uses the jump-up launch/recovery; wall push-off is trimmed from Wall Run and mirrored for the other side. Segment fractions are recorded in `animation-sources.json`. These adaptations cover the movement gaps, so Kimodo generation was unnecessary and the existing beachgame2 setup was left intact.

Movement clips remove shared horizontal root displacement and ballistic lift from the complete pose before baking. Local pelvis motion is limited to 5 cm for movement. Gameplay owns world position, gravity and collision. Dash playback is explicitly cued and lasts 0.15 seconds; ordinary strafing uses locomotion.

Original vertices are never reordered, merged, subdivided or reweighted in the editable model. `_source_vertex_id` survives export so original weights can be compared exactly even where glTF splits vertices for normals/UVs. Added details are separate meshes weighted to existing bones. A shared runtime container alone sets feet to ground, standing height to 1.8 m and forward to −Z. Bone names, parents, rest matrices and inverse binds remain canonical.

Each character clones its skeleton and owns its mixer and material. Shared geometry is merged at load time to retain one body draw per character. Existing logical bones remain a socket and breakup facade; finisher simulation moves an independent rigid skeleton, never the live Mixamo rig. The railgun uses procedural aim, recoil and arm/wrist correction while preserving authored finger rotations. Socket offsets are refitted in the normalized logical frame.

Cosmetic movement cues use a separate JSON message and the existing server interpolation clock. The binary position packet and movement rules are unchanged. Replay v4 records cues; versions 1–3 continue to decode and infer motion. Seeking clears stale animation and restores the overlapping cue phase. Paused replay poses remain stable under the procedural aim layer.

## Rebuilding

Run from the repository root with the installed Blender executable:

```sh
blender --background --python scripts/character/build-model.py
blender --background --python scripts/character/build-clips.py
node scripts/character/validate-assets.mjs
node scripts/character/run-tests.mjs
npm run typecheck
npm run lint
npm run build
```

On this host Blender is `/Applications/Blender.app/Contents/MacOS/Blender`. `build-clips.py` caches exports by script, model, source and mapping hashes. When only armor details change and the rig signature remains identical, `refresh-editable-source.py` refreshes the editable animation scene without rebaking the compatible motion. It reopens the saved file to verify action persistence. Export validation must pass after every edit.

For the dev-only eight-character comparison, run `node scripts/character/prepare-baseline.mjs`, start Vite, and open `/art/ybot/validation/index.html`. The generated baseline comes from commit `c3b4e53e79b1f5cb58ea9461e7465e384e1fb325` and is excluded from Git and the production entrypoint. The scene includes individual clip playback, a movement cue sequence, appearance overrides, all-finisher checks and old/new frame-time comparisons. Blender export batches are excluded from Vite watch to prevent partial asset reloads; reload the preview after an export completes.

## Asset provenance

Y Bot and its source animations originate from [Adobe Mixamo](https://www.mixamo.com/). The processed meshes and motion retain that provenance. These third-party art assets are kept separate from the repository's code license; this document does not relicense them. Original provider files and export settings are retained here. No new runtime dependencies or generated emotes were added.
