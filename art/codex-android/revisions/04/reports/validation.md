# Codex Android 04 — review checks

Reviewed 3 October 2026 in Blender 5.2.2 LTS. The supplied orthographic character sheet is the primary reference for this revision.

## Saved asset

- Reopened `codex-android.blend` successfully in background Blender and the desktop application.
- All 65 bone names, parents, rest matrices and the rig object transform exactly match the source signature.
- All 45 named animation actions persist with fake users enabled.
- All 817 authored mesh objects have armature modifiers targeting the original skeleton. Every vertex has normalized skin weights.
- Materials and all three packed reference images persist. Review renders are generated from the reopened file.
- Shells, mechanisms, cable harnesses, windows, head, hardware, studio and the hidden original body have separate named collections.
- Shoulder bearings are recessed inside the cupped caps. Their hardware follows the clavicle bones while the caps and upper-arm shells follow the arm bones. A shaped opening separates each cap from its upper-arm shell.

## Movement checks

Automated checks sampled five points in each of six clips: relaxed idle, armed idle, sprint, rifle jump, right dash and the victory placeholder. All 30 evaluated poses have finite geometry bounds and zero detected head–shoulder surface intersections. Details are in `validation.json`.

The checks cover sampled poses. They do not establish collision-free motion for every shell, cable and animation frame. The six neutral studio renders provide a separate visual review of joint gaps and cable attachment.

The six rendered poses were visually inspected after the final shoulder-gap correction, with the revised hands, shoulder caps and boots. The head remains clear of the shoulders. Knees and elbows retain open gaps, and the visible cable runs show no obvious detachment or severe stretching in these views.

## Visual review

- The source finger row runs across the palm's Z axis in rest coordinates. The old box palm was built across Y. The revised chassis and dorsal plate now span all four metacarpals correctly.
- Each hand has 15 shaped finger segments, seated knuckles, hinge caps and grip pads. Each segment uses its original finger bone.
- The shoulder cap curves over a smaller joint; its lower front edge exposes the actuator above the upper-arm shell.
- Rounded toe boxes, raised instep plates, heel counters and shaped treaded soles replace the flat shoe shapes. Foot and toe geometry remain bound separately.

- The front, side, back, top and head views show the revised rest-pose silhouette from the saved model.
- The torso tapers into an exposed mechanical waist. The thigh and calf shells have deep openings around their proximal joints.
- The continuous white cloud housing has unequal lobes, a rounded rear volume, a recessed dark monitor and readable luminous `>_` geometry.
- The forearm close-up shows window edge thickness, a mounting rim and modeled circuitry through the tinted surface.
- Four evenly spaced turntable frames were inspected for full-body framing and consistent geometry and materials around the character.
- This is a simpler modeled interpretation with less mechanical detail and fewer panel transitions than the reference.

The hero and window close-up use Cycles. Other shaded stills, the orthographic sheet and the turntable use Eevee with the same physical materials and studio lights. Pose images use neutral Workbench studio shading with cast shadows disabled to avoid shadow-volume artifacts around open shells.

All three character scripts pass Python syntax parsing. The deliverables manifest records the model checksum and verifies that every packaged still and turntable frame was rendered after the latest model save. This phase delivers an editable Blender asset and review media; game integration remains a later phase.
