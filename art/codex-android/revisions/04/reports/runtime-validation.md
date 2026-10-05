# Android + R-01 game integration

Validated on 3 October 2026.

## Assets

- The runtime character is revision 04 of `codex-android.blend`.
- Editable source SHA-256 remains `bd3e2ef38a08f9a9a3ecf0d63194bc28d06683dc9264fcee1f94cc1a16297dcb`.
- Export SHA-256: `c8a2b3e9b240e885f1f7f7cd53ddb2766bc9dc0d91467d49d10cf1d3436d67e2`.
- 70,265 triangles; 2,196,940 bytes; two body material draws.
- Original 65-bone names, hierarchy and rest matrices retained. All 45 existing
  motion files load, plus the runtime rest-pose clip.
- Standard R-01 is already connected to first-person and third-person weapon
  builders. This integration uses that existing gun implementation.
- Production build contains the new model and manifest.

## Automated checks

- Character runtime suite: **9/9 passed**. Covers the approved model URL,
  canonical rig, triangle ceiling, skin weights, normalized height/floor,
  visible terminal geometry, window uniforms, R-01 lifecycle, independent
  animation state, movement, emotes, every finisher and replay seeking.
- R-01 runtime suite: **7/7 passed**. Covers LODs, sockets, recharge timing,
  backward seeking, independent mechanisms, finishes and reduced effects.
- Typecheck: passed.
- Production build: passed.
- Lint: no errors; 15 existing warnings in `InstagibClient.tsx`, `auth.tsx`
  and `main.tsx`.

## Browser review

The actual runtime components were inspected in Chrome through
`art/codex-android/runtime/index.html`. Combat grip, relaxed idle, sprint,
jump, dash and victory were viewed. The cloud silhouette and terminal face
remain readable; hands, boots, shoulder gaps and internal cables persist.
Eight armed characters rendered together at 49 draws / 577,170 triangles
including the weapons and floor. The preview displayed 120 fps after warm-up
on this machine; this is a local observation, not a cross-device benchmark.
No application errors appeared in the preview console.

The game lobby visibly uses the new android holding the R-01. A local arena
loaded to 100% and connected with bots. Automated pointer lock was rejected
with the game's “mouse capture needed” message, so interactive movement and
shooting in the live match were not verified. Weapon firing/recharge and
character behavior were verified through their runtime tests and previews.
The browser debugging connection subsequently detached; no new screenshot
file was saved. The interactive review page remains available locally.

## Runtime tradeoffs

Inspection windows use alpha blending instead of Cycles transmission; their
modeled thickness and internals remain. Small hardware and the monitor are
excluded from aggressive reduction. An initial reduction distorted the thin
monitor and occluded its glyphs; the exporter now protects it, and a regression
test checks that the glyphs sit in front of the screen.


## Grip correction — 2026-10-04

The old firing wrist pointed its fingers down, and the imported rifle finger poses did not fit the R-01. The right palm now follows the slanted rubber pistol grip; the support palm is offset below the receiver, with a dedicated finger and thumb wrap. An analytic two-bone arm solve replaces the approximate three-pass reach. Both targets share the weapon aim and recoil transform.

The new regression checks the firing palm against the 47 mm handle width, the support knuckles against the receiver flank, and wrist contact during movement, recoil and aim from −70° to +70°. Paused frames and replay seeks preserve the finger pose. Ten character tests and seven weapon tests pass; typecheck and production build pass. Lint reports no errors and the same 15 existing warnings.

The runtime review adds right/left grip close-ups and aim-angle controls. Browser automation became unavailable during close-up capture, so the additional grip images were rendered in Blender from the actual deformed runtime mesh and gun transforms, with neutral materials. These are geometry checks, not browser screenshots.

Final geometry views: `../renders/grip-final-right.png` and `../renders/grip-final-left.png`.

## First-person grip and live network death — 2026-10-04

- The first-person weapon now includes the Android forearms and hands. Their
  vertices are posed with the same combat animator as third person, then baked
  into weapon space. Two material draws and one identity bone preserve the
  character shading without a second full-body animator in the viewmodel.
  Both hands follow recoil, sway, zoom and inspection together with the gun.
- The default carry moves inward/up and further from the camera. The game was
  visually inspected through its existing `?photo=1` development mode; both
  arms appeared in the actual arena renderer. Interactive aiming and a manual
  confirmed kill were not completed through browser automation.
- The R-01 handle is longer and slightly wider. The trigger has a thicker
  curved blade with a plain steel finish; the guard opening is larger. The
  firing index curls into the guard instead of stretching along the receiver.
  The editable `art/railgun-r01/r01.blend` and both exported LODs were rebuilt.
  Triangle counts remain 7,444 high / 1,880 low.
- Root cause of missing network breakup: the server intentionally omits dead
  players from movement snapshots during their killcam. Game previously
  disposed every remote absent from those snapshots. It now advances and
  retains the corpse until the death window and breakup finish. Returning
  snapshots restore the living body. Duplicate kill notifications are ignored,
  and the authoritative hit position anchors the death if snapshots race ahead.
- The review page's **Test network death** uses RemotePlayer.apply/markDead,
  then advances the body with no movement snapshots. It pauses after ten frames
  so the separated pieces can be inspected; Play continues the burst.

Validation: all 12 character tests and all 7 weapon tests pass. Tests include
visible skinned-vertex separation during omitted snapshots, early respawn
positions, duplicate notifications, corpse cleanup, restored living skin,
first-person recoil/movement contact, and third-person aim/palm/trigger contact.
Typecheck and production build pass. Lint: zero errors, 15 existing warnings.
The first-person review draws 26,704 triangles including the gun and floor.

Browser captures: `../renders/first-person-grip-runtime.png` and
`../renders/network-breakup-runtime.png`.

## Close first-person carry and connected inspect arms — 2026-10-04

This revision supersedes the forearm-only first-person setup above.

- The default carry moves 38 cm closer to the camera. The stock sits behind the
  eye; the barrel and receiver enter the lower-right portion of the view.
- The first-person mesh now contains both complete upper arms, elbows,
  forearms and hands. Five compact bones replace the previous single rigid
  transform. Both shoulders stay behind the camera while two-bone IK reaches
  the weapon's authored wrist targets. Existing joint cable weights are kept.
- Inspect pushes the gun forward before showing its side and rolling its top
  toward the viewer. Hands remain fixed on the grips; elbow bends follow the
  moving wrist targets. The default motion needs no arm stretching. Extreme
  user-defined viewmodel offsets can extend the arms to preserve contact.
- Game and runtime review call the same arm update after weapon motion. The
  review now includes Inspect weapon and held raise/side/top/return frames.
- All 12 character tests pass. The first-person regression samples full and
  reduced inspect, movement, firing cancellation, landing and zoom. It checks
  both grip vertices, shoulder anchors, wrist and elbow continuity, arm lengths,
  camera rotation independence, and the stock's position behind the eye.
- Browser review at 16:9 verified carry, side inspect and rolled inspect. The
  complete arms, weapon and floor total 34,992 triangles in this preview.
  A subsequent live arena check was interrupted by browser automation timeouts.

Saved browser renders: `../renders/first-person-inspect-side-runtime.png` and
`../renders/first-person-inspect-top-runtime.png`.

Final checks: client/server TypeScript checks and production build pass.
Targeted ESLint reports zero errors; the review page is excluded by the
repository's lint configuration. The 12 character regression tests pass.
