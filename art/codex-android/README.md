# Codex Android / 05

The Blender source for the game's Codex Android character. The athletic pearl-white
body surrounds a graphite mechanical frame. A periwinkle-blue cloud-shaped head carries a
recessed indigo monitor and physical, luminous `>_` geometry. Small polycarbonate
inspection windows expose modeled circuitry. Neck, spine, elbow and knee cables
are attached to the existing animation skeleton. Curved chest and limb armor,
sculpted feet, exposed bearings and blue optical guides follow the updated
full-body reference supplied during the design review.

## Revision 05 — closed torso and blue accents

Curved blue flank panels now connect the front and back pelvic armor on both
sides. Their lower arches clear the hip bearings, and all four panels follow
the same pelvis bone. The chest also has closed side gaskets between its front
and back shells. The head uses the supplied blue cloud mascot as its color
reference; cobalt joint covers and azure cable jackets carry that color through
the neck, arms, waist and legs. Main armor remains pearl white. The blue parts
retain their authored colors when white armor receives a team color or dye.
Revision 04, including its source, scripts and review assets, is preserved in
`revisions/04/`.

## Revision 04 — hands, shoulders and feet

The hand chassis now spans the actual metacarpal layout, with the palm width
across the finger row. Shaped titanium finger segments, recessed hinge caps,
black grip pads and a contoured dorsal plate replace the thin rods and box palm.
Shoulder caps wrap around smaller recessed bearings. Their curved lower edges
leave an actuator gap above the upper-arm shells. The boots have closed,
rounded toe boxes, a higher instep, layered armor, heel counters and shaped
outsoles with side tread. The existing foot and toe bones still articulate
separately. Revision 03 is preserved in `revisions/03/`.

## Revision 03 — orthographic character sheet

The supplied character sheet is the primary modeling reference. This pass uses
a longer tapered chest, compact shoulder caps, an exposed mechanical waist,
curved thigh and calf shells with deep joint openings, and cupped hip armor.
The head has unequal cloud lobes, a rounded rear volume and a wider terminal
screen. The back has a continuous white shell with a cloud mark and a blue
status strip. Earlier designs are preserved in `revisions/01/` and `revisions/02/`.
The unsaved desktop session from the first review was preserved as
`revisions/01/interactive-session.blend` before opening the revised model.

## Open and inspect

Open `codex-android.blend` in Blender 5.2 or later. The file opens in the hero
camera with **Breathing Idle** at frame 60. All 45 named source actions are local
and persistent. The 65-bone Mixamo skeleton retains its names, hierarchy, rest
matrices and original object transform.

Collections separate the animation rig, pearl shells, mechanical frame, cable
harnesses, inspection windows, monitor head, hardware and studio. The original
Y-bot is retained in the disabled reference collection. Enable the rig collection
and unhide the armature for pose editing. Shell bevels, thickness modifiers and
head subdivision remain editable.

All four supplied images are packed into the Blender file. The primary shape reference
is `reference/orthographic-character-sheet.png`. The full-body concept and
earlier blue head image are also retained in `reference/`. The new palette reference
is `reference/blue-cloud-mascot.png`. The character geometry is authored in Blender;
the references are used for design comparison.

## Review assets

- `renders/character-sheet.png`: front, right, back, left, top and head views in the rest pose.
- `renders/character-sheet.jpg`: compact preview of the same sheet.
- `renders/before-after.jpg`: previous and revised front views.
- `renders/component-comparison.jpg`: supplied reference and revised hand, shoulder and boot close-ups.
- `renders/component-review.jpg`: the three revised component close-ups.
- `renders/hero.png`: three-quarter presentation.
- `renders/front.png`, `side.png`, `back.png`: full-body views.
- `renders/body-review.jpg`: front, side and back contact sheet.
- `renders/head.png`: head, bezel and monitor details.
- `renders/torso-side.png`: connected pelvic side wall and waist cables.
- `renders/hands.png`, `shoulders.png`, `feet.png`: revised component close-ups.
- `renders/window.png`: forearm inspection window and circuitry.
- `renders/detail-review.jpg`: head and forearm close-ups together.
- `renders/pose-*.png`: idle, rifle aim, sprint, jump, dash and victory checks.
- `renders/pose-review.jpg`: six-pose contact sheet.
- `renders/turntable.mp4`: three-second camera orbit, 12 fps.
- `reports/build.json`: source rig signature, materials and action inventory.
- `reports/validation.json`: saved-file checks and sampled motion bounds.
- `reports/validation.md`: validation results and visual review notes.

The current shaded views, character sheet and turntable use Eevee with the
same materials and studio lighting. Orthographic and turntable views use
direct studio lighting. Earlier Cycles studies are retained in `revisions/04/`.
Motion checks use Workbench studio shading. The head and internal
indicators have a restrained compositor glow in shaded renders.

## Game integration

`public/models/codex-android/model.glb` is the reduced runtime export of revision
05: **71,535 triangles, 2,236,848 bytes**, with the same 65 bones. The manifest
reuses all 45 existing 60 Hz animation files under `codex-ybot/clips`; it does not
download the old Y-bot body. The shared character loader serves the android to
matches, bots, remote players, replays, the lobby, locker, thumbnails and podium.

The game batches the authored colors, roughness and metalness into one opaque
surface group and one window group. Windows use lightly tinted alpha blending
to avoid a full-scene transmission pass for each player. Their thickness and
modeled internals remain. Team colors and dyes affect the white shells; the
screen stays dark and its terminal bars glow. Finisher effects and rigid breakup
use the new geometry. The standard R-01 remains the first-person and
third-person weapon, including its deterministic 1.2-second recharge.

Run `scripts/character/export-android.py` with Blender to rebuild only the game
model. It never saves over the editable Blender file. Curved shells and the
cloud housing are reduced; thin hardware and the terminal face are protected.
The export enforces a 75,000-triangle / 3 MB ceiling. Export provenance and
per-part counts are in `reports/runtime-export.json`.

With the Vite dev server running, open
`http://127.0.0.1:5173/art/codex-android/runtime/index.html` for the actual game
character and R-01 together. It includes motion, team/highlight, camera and
eight-character views. This review page is not included in the production app.

Validation: `node scripts/character/run-tests.mjs`,
`node scripts/railgun/run-tests.mjs`, `npm run typecheck`, `npm run lint`,
and `npm run build`. The character suite verifies the original rig transforms,
normalized height, skin weights, terminal visibility, independent animations,
weapon lifecycle, all finishers and replay seeking.

## Design references

- User-supplied orthographic sheet: proportions, open waist, shoulder and leg
  cutaways, rear armor and cloud-head volume.
- User-supplied full-body robot image: glossy white cloud head, dark monitor,
  sculpted white armor, exposed dark machinery, and luminous blue wiring.
- Earlier monitor-head image: cloud silhouette and the terminal expression.
- [Codex product page](https://openai.com/codex/): blue–lavender atmosphere and
  restrained digital presentation, reviewed 3 October 2026.
- [OpenAI design guidelines](https://openai.com/brand/): precise geometry with
  approachable curves. The material palette is an interpretation for this
  character, not an official OpenAI color specification.

Pearl polymer is `#E7EBF0`; the head and hip flanks are `#507FDC`; joint enamel
is `#315FC0`; cable jackets are `#528CE8`; graphite is `#252D38`; monitor
glass is `#040A15`; the luminous face is `#96D9FF`. Inspection panels use actual
thickness, transmission and an IOR of 1.46. Internal boards, controller chips,
pins and copper traces are separate geometry.

## Rebuild

From the repository root:

```sh
blender --background --python-exit-code 1 --python scripts/character/build-android.py
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- validate
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- preview
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- finals hero window --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- views-eevee hands shoulders feet front side back head --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- orthographic --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- poses --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- turntable --cpu
ffmpeg -y -framerate 12 -i art/codex-android/renders/turntable-frames/%04d.png -c:v libx264 -crf 19 -pix_fmt yuv420p art/codex-android/renders/turntable.mp4
python3 scripts/character/package-android.py
```

On this machine Blender is `/Applications/Blender.app/Contents/MacOS/Blender`.
Its Metal initialization requires running outside the Codex filesystem sandbox.
The design review scripts only write to `art/codex-android`; the runtime exporter
also writes to `public/models/codex-android`. The package script
requires Pillow; the Blender scripts use Blender’s bundled Python.

## Provenance and scope

The skeleton and motion originate from Adobe Mixamo and retain the provenance
documented in `../ybot/README.md`. The new mechanical geometry and materials are
generated by `scripts/character/build-android.py`. The original body is retained
as a hidden art reference. Game integration replaces the visible character;
collision geometry, gameplay rules and the existing animation files are unchanged.
