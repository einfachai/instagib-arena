# Claude Android / 01

A separate Clawd-headed robot derived from the saved Codex Android / 05 source.
The pearl armor, mechanical body, hands, feet, original 65-bone Mixamo skeleton,
skin weights, and 45 named actions are retained. The sculpted terracotta head
has a chamfered forehead and cheeks, larger black square eye inserts, separate
rounded side housings, and four short prongs that taper in depth. A layered
rear shell adds a manufactured finish. It has no white sticker border.
A short graphite spindle and orange locking collar connect the head recess to
the original neck bearing without reshaping the inherited neck.

The supplied orange robot concept controls the head shape and manufactured
finish. The graphic Clawd screenshot guides the small armor insignias. Both are copied
under `reference/` and packed into the editable Blender file. Their hashes and
the source model hash are recorded in `reports/build.json`.

## Files and review

- `claude-android.blend`: editable source, opening in the hero camera at relaxed idle.
- `../../public/models/claude-android/model.glb`: reduced, skinned runtime model.
- `../../public/models/claude-android/manifest.json`: existing manifest schema and shared animation clip URLs.
- `renders/hero.png`: full-body studio view.
- `renders/character-sheet.jpg`: front, side, back, top and head views.
- `renders/detail-review.jpg`: Clawd head and warm inspection-window details.
- `renders/component-review.jpg`: hands, shoulders and feet.
- `renders/torso-side.png`: closed flank armor and orange waist cable detail.
- `renders/pose-review.jpg`: idle, aim, sprint, jump, dash and victory checks.
- `renders/turntable.mp4`: three-second camera orbit, 36 frames at 12 fps.
- `reports/validation.json`: reopened source, skeleton, materials, weights and sampled head-clearance checks.
- `reports/glb-validation.json`: actual exported GLB loaded with all 45 shared animation clips.
- `reports/runtime-export.json`: runtime budgets and per-part geometry counts.
- `reports/deliverables.json`: saved-model/render freshness and checksums.

## Materials

| Role | sRGB |
| --- | --- |
| Head, mascot markings and colored armor | `#D97757` |
| Joint enamel | `#BB542D` |
| Cable jackets | `#E58449` |
| Gaskets | `#663323` |
| Optical fibres | `#FF8A38` |
| Phosphor indicators | `#FFC079` |
| Connector polymer | `#DBA078` |
| Inspection windows | `#F5E7DC` |
| Circuit substrate | `#302720` |
| Eye inserts, non-emissive | `#080807` |

Pearl armor and neutral mechanical materials retain their source colors and
surface settings. All deliberately blue/purple accent materials become warm
tones. Inherited body object names remain stable so geometry and skin weights
can be checked directly against the source. New materials carry the `CL /`
prefix. The `Pearl ceramic` material role is preserved for future armor dyeing.

## Rebuild

Built with Blender 5.2.2 LTS. On the authoring Mac it is located at
`/Applications/Blender.app/Contents/MacOS/Blender`; substitute that executable
for `blender` below if it is not on PATH. Run from the repository root:

```sh
blender --background --python-exit-code 1 --python scripts/character/build-claude-android.py
blender --background --python-exit-code 1 --python scripts/character/export-android.py -- --variant claude
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- validate --variant claude
node scripts/character/validate-android.mjs --variant claude
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- views-eevee hero head front side back window hands shoulders feet torso-side --variant claude --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- orthographic --variant claude --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- poses --variant claude --cpu
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- turntable --variant claude --cpu
ffmpeg -y -framerate 12 -i art/claude-android/renders/turntable-frames/%04d.png -c:v libx264 -crf 19 -pix_fmt yuv420p art/claude-android/renders/turntable.mp4
python3 scripts/character/package-android.py --variant claude
```

Packaging requires Pillow; rendering uses Blender's bundled Python. Blender's
Metal initialization may require running outside the Codex filesystem sandbox,
including for CPU rendering. Export changes geometry only in its transient
Blender process and never saves over the editable source. Export and review
commands default to Codex unless `--variant claude` is supplied.

The builder reads `art/codex-android/codex-android.blend` and writes only the
Claude source/reports. Hashes identify the exact source used; the validator
rejects a changed source until the Claude asset is rebuilt. The GLB reuses the
45 clips under `public/models/codex-ybot/clips` without copying them. Its budgets
are fewer than 75,000 triangles and 3,000,000 bytes.

## Integration boundary

This asset is supplied for model review and later game integration. The game's
current character loader and selection remain unchanged. The requested future
default is automatic selection by coding agent: Claude Code uses Clawd and
Codex uses the existing robot. No locker selection, networking or gameplay
changes are included here. Rig and animation provenance remain as documented
in `../ybot/README.md`.
