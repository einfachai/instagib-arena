# Claude Android / 01 — asset review

Validated with Blender 5.2.2 LTS and the repository's Three.js loader.

## Design

The head follows the supplied orange robot concept: a broad chamfered shell,
separate rounded side housings, a layered back, larger black square eye inserts,
and four short rounded prongs that taper in depth. There is no white sticker
border. The pixel Clawd graphic is retained as the small chest and back emblem.
The head connects to the original neck bearing through a graphite spindle and
orange locking collar. Pearl body armor and neutral machinery are inherited;
deliberately blue and purple accents use the documented warm palette.

## Saved source

- Reopened the final `claude-android.blend` successfully.
- All 65 bone names, parents, rest matrices and the rig object transform match
  the source signature exactly.
- All 45 named actions persist with fake users enabled.
- All 834 authored meshes have the canonical armature modifier and normalized
  skin weights. The 820 inherited body meshes retain their geometry and weights.
- Both supplied references are packed. The material inventory persists, both
  eye inserts are black and non-emissive, and the head uses no pearl border.
- Thirty sampled poses cover relaxed idle, armed idle, sprint, rifle jump,
  right dash and the victory placeholder. Bounds are finite and the complete
  head assembly, including its side housings and mount, has no detected
  head–shoulder triangle intersections in those samples.

## Runtime export

- 66,830 triangles; 39,300 vertices; 2,166,628 bytes.
- Under the 75,000-triangle and 3,000,000-byte ceilings.
- Joint hierarchy and rest transforms match the canonical original GLB;
  inverse bind matrices are byte-identical.
- All 45 existing animation clips load against the new model. All bone tracks
  resolve; all skinned vertices remain finite in 225 sampled poses, without
  excessive deformation bounds.
- The model normalizes to 1.8 metres. The manifest references the existing
  shared clips rather than duplicating them.
- Export processes parts in an isolated transient collection to avoid repeated
  dependency-graph rebuilds for the whole source. It never saves the reduced
  geometry over the editable Blender file.

## Visual inspection and limits

The hero, head close-up, front/side/back views, orthographic sheet and detail
views, all six motion stills and four quarter-turn views were inspected for
shape, palette, neck connection and framing. The head
has the sculpted construction requested in the latest design feedback. The
orange cable routes and joint lights remain visible around the white armor.

Motion and intersection checks sample poses; they do not prove that every
surface is collision-free at every frame. Render grain in transmissive windows
is an Eevee review-render limitation; their thickness and modeled internals
remain in the source and export. Game selection and gameplay are not changed.

The editable Codex source retains its original checksum. Codex-derived review
media, reports and runtime exports were updated concurrently during this task;
those changes were retained. See `codex-preservation.json` for the recorded
baseline comparison. Claude model outputs are written to separate directories.

## Reproduce the checks

```sh
blender --background --python-exit-code 1 --python scripts/character/review-android.py -- validate --variant claude --cpu
node scripts/character/validate-android.mjs --variant claude
python3 scripts/character/package-android.py --variant claude
```

Detailed results are in `validation.json`, `glb-validation.json`,
`runtime-export.json` and the final `deliverables.json` freshness report.
