# Codex Android — review checks

Reviewed 3 October 2026 in Blender 5.2.2 LTS.

## Saved asset

- Reopened `codex-android.blend` successfully in background Blender and the desktop application.
- All 65 bone names, parents, rest matrices and the rig object transform exactly match the source signature.
- All 45 named animation actions persist with fake users enabled.
- All 594 new mesh objects have armature modifiers targeting the original skeleton. Every vertex has normalized skin weights.
- Materials and both packed reference images persist. Presentation renders were generated from the reopened file.
- Shells, mechanisms, cable harnesses, windows, head, hardware, studio and the hidden original body have separate named collections.

## Movement review

Automated checks sampled five points in each of six clips: relaxed idle, armed idle, sprint, rifle jump, right dash and the victory placeholder. All 30 evaluated poses have finite geometry bounds and zero detected head–shoulder surface intersections.

The six representative poses in `renders/pose-review.jpg` were also visually inspected. The head clears the shoulders; limb shells retain joint gaps; the cable runs remain attached without obvious separation or severe stretching in these views. These are sampled design checks rather than an exhaustive collision test over all animation frames.

## Visual review

- Inspected front, side, back and three-quarter presentation renders and the head and forearm close-ups.
- The white cloud silhouette and terminal face remain readable at reduced contact-sheet size.
- The head has a continuous glossy housing, recessed dark screen and rounded emissive glyphs.
- The forearm close-up shows the window edge thickness, mounting rim and internal circuit board through the tinted surface.
- Neutral studio pose views expose shell edges and cable routes. Workbench shadow-volume streaks were removed from these review images by disabling cast shadows.
- Inspected four evenly spaced turntable views for framing and material consistency.

The six presentation stills use Cycles. Technical pose images use Workbench studio shading. The turntable uses Eevee with the presentation materials and lighting.

Both character scripts pass Python syntax parsing. This phase delivers an editable Blender design asset and review media; game integration remains the next design-review phase.
