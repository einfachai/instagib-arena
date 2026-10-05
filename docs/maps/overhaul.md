# Futuristic map overhaul

The playable registry contains Causeway and Reactor for FFA/TDM, Spaceport
(`containeryard`) and Extraction (`derrick`) for Duel, and Training Range.
Combat collision layouts are revision 2. Training collision and drill data
remain unchanged at revision 1. Lounge and Nuketown are retired.

Replay v5 stores the map revision in its header. Versions 1–4 decode as
revision 1. Playback resolves an exact ID/revision pair and explains when
that layout is unavailable; it does not substitute another arena. Stored
files and statistics are retained.

## Material assets

`public/textures/world/manifest.json` describes 54 KTX2 files: nine PBR sets,
2K and 1K, each with aligned color, normal and packed AO/roughness/metalness.
Every channel has a complete mip chain. Color is sRGB; normal and ORM are
linear. World UVs use the meter scale in each theme's asset descriptor.
The locally shipped Basis transcoder includes its Apache 2.0 license.

Photographic microdetail comes from ambientCG Metal032 and Concrete034
(CC0). Panel seams, bevels, fastening recesses and material treatments are
authored locally. License and source/archive/output hashes ship with the
assets. `scripts/maps/prepare-materials.py` regenerates the pack with the
official Khronos KTX-Software encoder. Source archives stay outside public/.

The synchronous map builder supplies procedural fallback materials. Adding
it to a scene starts an asynchronous material lease. A renderer-scoped cache
uses map ID, revision and quality, retains the active and next map, releases
idle packs and disposes evicted in-flight results on arrival. Generation
checks prevent a removed map or superseded quality load from mutating a
mesh. Game loading, replay loading and menu/levelshot captures await asset
readiness. Changing quality also warms the next map in that quality. Each
pack owns its texture objects even when the transcoder returns a shared
result, so evicting a prefetched pack cannot dispose the active map's textures.

## Review and verification

- `node --import tsx scripts/map-check.ts` checks every retained map. Combat
  openness is 25–26%, spawn visibility 13–21%, and spawn counts 8–16.
  Every raised surface is reachable and every spawn is supported. Apex
  headroom is 11–12 m; Training retains 9.5 m.
- `node --import tsx scripts/bot-sim.ts all --secs 60 --seed-runs 2` exercises
  the real navigation and combat code. No simulation errors were reported.
- `node --import tsx --test tests/maps.test.ts tests/shot-timing.test.ts`
  checks the roster, Duel symmetry, replay revisions, KTX2 mip chains,
  eviction of late loads, failed-load retry, shared-texture ownership, and
  shot dispatch. All 8 tests pass.
- Security tests pass 25/25, including movement rejection and blocked versus
  clear-line shots against revision 2's actual cargo cover. Arcade, network
  transport and scope regression tests pass 33/33; character tests pass 14/14.
- Frontend and server typechecks and production build pass. Lint reports
  zero errors and 15 warnings. The development photo route is absent from
  production chunks. Training collision, targets, gates, spawns and course
  timing have no source diff.
- Real browser keyboard checks on all four combat maps record jumps of
  1.65–1.68 m and floor boosts of 6.51–6.54 m without leaving the map bounds.
  Missing-material requests preserve the procedural fallback on every map.
  Switching through all retained maps loads the correct assets and revisions.

See the saved [layout checks](layout-checks.txt), [bot simulations](bot-checks.txt),
[movement checks](movement-checks.txt), [security tests](security-checks.txt),
[regression tests](regression-checks.txt), and [character tests](character-checks.txt).

The [comparison gallery](../../design/shots/futuristic/index.html) contains
30 wide, close-surface and combat captures, with both material qualities for
every retained map. The [timing summary](../../design/shots/futuristic/results.json)
records hardware-accelerated Chrome using ANGLE Metal on Apple M5 at 1920×1080.
Combat maps run seven bots and the local combatant; Training retains its drills
and runs without combat bots. Each sample runs for 20 seconds after warmup and
reports a rolling window of up to 600 actual rendered frame intervals.

| Map | 2K mean / p95 | 1K mean / p95 |
| --- | --- | --- |
| Causeway | 16.67 / 16.80 ms | 16.67 / 16.80 ms |
| Reactor | 16.86 / 16.70 ms | 16.67 / 16.70 ms |
| Spaceport | 16.67 / 16.70 ms | 16.67 / 16.70 ms |
| Extraction | 16.67 / 16.70 ms | 16.67 / 16.80 ms |
| Training Range | 16.67 / 16.80 ms | 16.67 / 16.70 ms |

All ten samples report approximately 60 FPS. A final post-cache-fix browser
run also reports 60 FPS and successful asset readiness across every map switch.

The development-only `/mapphoto?photo=1&map=causeway&quality=high` entry
bypasses the lobby and account/network flows. Controls select retained maps,
1K/2K materials and wide/surface/combat views. Seven bots plus the local
combatant run the real simulation. The diagnostics report actual rendered
frame intervals, not a separate UI animation timer.

Start the stable photo server with `node node_modules/vite/bin/vite.js
--config scripts/maps/photo.vite.config.ts`. It uses port 5174 with file
watching and live reload disabled, so other workspace edits cannot interrupt
the measurements. Then `node scripts/maps/capture-overhaul.mjs` captures all
three views of every retained map in both qualities at 1920×1080 and logs
20-second hardware-browser samples. Results and images live in
`design/shots/futuristic/`. Run `node scripts/maps/gallery.mjs` to generate
the image comparison gallery and a JSON summary of the timing samples.
`node scripts/shot.mjs --base http://127.0.0.1:5174 --solo causeway
--missing-assets --switch-check --shots wide` exercises fallback materials
and live map switches. Add `--movement-check --no-bots` to exercise jump
and floor boost through the real keyboard input. The photo entry also has
a Playtest control that releases the fixed camera for movement review.
Hidden development photo tabs render at 5 FPS to
avoid competing with an active benchmark.

Hardware measurements are a target check, not a promise of 60 FPS on every
machine. Check the recorded mean and p95 intervals before assessing that
target. A human movement/sightline play pass remains useful alongside the
geometry and real-bot simulation checks.
