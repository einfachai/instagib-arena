# Codex Android / 03

An independent Blender character for design review. The athletic pearl-white
body surrounds a graphite mechanical frame. A glossy white cloud-shaped head carries a
recessed indigo monitor and physical, luminous `>_` geometry. Small polycarbonate
inspection windows expose modeled circuitry. Neck, spine, elbow and knee cables
are attached to the existing animation skeleton. Curved chest and limb armor,
sculpted feet, exposed bearings and blue optical guides follow the updated
full-body reference supplied during the design review.

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

All three supplied images are packed into the Blender file. The primary reference
is `reference/orthographic-character-sheet.png`. The full-body concept and
earlier blue head image are also retained in `reference/`. The new character geometry is authored in Blender;
the references are used for design comparison.

## Review assets

- `renders/character-sheet.png`: front, right, back, left, top and head views in the rest pose.
- `renders/character-sheet.jpg`: compact preview of the same sheet.
- `renders/before-after.jpg`: first-pass and revised front views.
- `renders/hero.png`: three-quarter presentation.
- `renders/front.png`, `side.png`, `back.png`: full-body views.
- `renders/body-review.jpg`: front, side and back contact sheet.
- `renders/head.png`: head, bezel and monitor details.
- `renders/window.png`: forearm inspection window and circuitry.
- `renders/detail-review.jpg`: head and forearm close-ups together.
- `renders/pose-*.png`: idle, rifle aim, sprint, jump, dash and victory checks.
- `renders/pose-review.jpg`: six-pose contact sheet.
- `renders/turntable.mp4`: four-second camera orbit, 12 fps.
- `reports/build.json`: source rig signature, materials and action inventory.
- `reports/validation.json`: saved-file checks and sampled motion bounds.
- `reports/validation.md`: validation results and visual review notes.

The hero and inspection-window close-up use Cycles. The character sheet,
other shaded views and turntable use Eevee with the same materials and studio
lighting. Motion checks use Workbench studio shading. The head and internal
indicators have a restrained compositor glow in shaded renders. Runtime
material conversion and game integration remain a later phase.

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

Pearl polymer and the head are `#E7EBF0`; graphite is `#252D38`; monitor
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
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- views-eevee front side back head --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- orthographic --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- poses --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- turntable --cpu
ffmpeg -y -framerate 12 -i art/codex-android/renders/turntable-frames/%04d.png -c:v libx264 -crf 19 -pix_fmt yuv420p art/codex-android/renders/turntable.mp4
python3 scripts/character/package-android.py
```

On this machine Blender is `/Applications/Blender.app/Contents/MacOS/Blender`.
Its Metal initialization requires running outside the Codex filesystem sandbox.
The character scripts only write to `art/codex-android`. The package script
requires Pillow; the Blender scripts use Blender’s bundled Python.

## Provenance and scope

The skeleton and motion originate from Adobe Mixamo and retain the provenance
documented in `../ybot/README.md`. The new mechanical geometry and materials are
generated by `scripts/character/build-android.py`. The original body is retained
as a hidden art reference. This deliverable is a Blender design asset; no game
code, runtime model, collision geometry or animation files are replaced.
