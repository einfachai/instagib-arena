# Agent Deathmatch: continuous arenas

## Gameplay

The public Play flow joins the fullest arena with an available human slot or
creates an eight-human FFA arena with a random existing FFA map. That map lasts
until the arena is reaped. Arcade visits have no shared frag limit, map vote,
victory screen or automatic replay.

Connected, non-spectating humans determine bot population: zero humans stops
simulation and removes bots, one gets three medium bots, and two through eight
get none. Empty rooms retain the existing 30-second grace period. Server bots
reuse the shared brain, navigation, map geometry and collision modules and use
normal authoritative movement, shooting, deaths and respawns. Network clients
render them as ordinary actors with bot metadata.

The second human's join removes bots before a protected spawn. Removing bots
cancels their actions and awards no counters, progression or medals. The
incumbent keeps position, health, respawn state and visit counters. Returning to
one human restores bots at safe positions. Disconnected players do not count as
connected humans or accrue playtime; their capacity reservation and visit remain
available during the existing 20-second reconnect window.

## Independent visits and settlement

`server/arcade-visit.ts` owns UUID visits and full counters for duration, kills,
deaths, shots, hits, headshots and streaks, with separate human/bot totals and
human-arena duration. The one-second stats channel publishes complete scoreboard
rows independently of compact snapshots' 16-bit score fields. Other players'
arrivals, departures and bot transitions never reset a human's counters. Play
after leaving starts fresh counters, even when selecting the same arena.

`session-ended` freezes personal results and removes combat participation before
settlement. Controller state and reconnect tombstones let disconnected clients
recover those results. Manual exits return to the menu; relevant task events
show personal results and a five-second countdown.

`arena_completed_visits` stores settled account visits and rewards keyed by visit
and account identity. Mixed combat settles in one SQLite transaction. Retries
return the stored result rather than paying twice; transient database failures
retain results and retry while the server is alive.

Displayed stats include all combat. Competitive career counters, combat
challenges and strange-weapon kills include protected human combat only. Bot XP
uses the existing 30% practice scale and daily practice cap. Participation is
allocated once across both phases, and mixed XP retains the overall match cap.
Short empty visits do not farm participation/career games. Arcade visits award
no wins, losses, forfeits or first-win bonuses. Historical career data remains.

New `daily:human-playtime` and `weekly:human-playtime` challenges replace active
win challenges with 600 and 3,600 human-arena seconds. Rewards remain 110 XP/60
credits and 420 XP/300 credits; former IDs retain their historical records.

## Integration and announcements

`server/arena-controller.ts` hashes scoped companion/browser/helper capabilities.
Single-use tickets pair browsers to their companion. Each controller has one
active attempt. A Play timestamp recorded before pairing catches completion
during pairing or matchmaking; original event timestamps, attempt IDs and
deduplication prevent delayed events ending later visits. The browser can affect
its own visit, helpers can submit only their controller's SSH events, and only
the companion can claim native handoff. Expiring heartbeats report degraded
monitoring without blocking Play.

The companion observes local completion notifications and optional attention
hooks. Cloud polling uses the signed-in local CLI, a paginated historical
baseline and non-overlapping ten-second scans. Handoff claims check the ended
visit and protect native activation from a racing new visit. Only normalized IDs,
categories, timestamps and safe links leave the computer; credentials and task
contents remain local. See the [plugin guide](../codex-plugin/README.md).

Only the one-to-two human transition announces an arrival, and only the
multiple-to-one transition announces that the other humans left. The first human,
solo reconnects, additional arrivals and departures while two humans remain are
silent. These transitions publish matching text and audio events.
Speech is deduplicated, queued without overlap, expires if late and respects
announcer settings. Task announcements take priority over stale arena notices.

Connection handling uses a bounded movement burst budget with the existing
150-message/second sustained ceiling, drops obsolete pose uploads under transport
backpressure, and rejects callbacks from superseded sockets. Transport pongs
keep background browsers alive; stale sweeps and heartbeat cleanup defer a pass
after a long server stall so queued I/O can be processed. Reconnect grace remains
20 seconds. Development file watchers still restart the server when backend
code changes; use a production build for uninterrupted play during source edits.

Personal results use a full-screen CSS debrief with an angular performance strip,
accuracy dial, combat breakdown and rewards. Task exits retain the five-second
countdown and desktop handoff; reduced-effects preferences suppress the reveal
animation and countdown interpolation.

Victor/`eleven_v3` recordings for all four Codex notices are bundled with
provenance, including arrival and task completion. They use the same deep male
announcer as kill, streak, and match callouts. See `audio-generation.json`.

## Validation and remaining activation

Targeted tests cover the human-count sequence, simultaneous joins, safe bot
movement/shots/despawn, reconnect timing, staggered visits, full counters, mixed
rewards, idempotency, helper isolation, event timing/deduplication, five-second
handoff gating and empty-room cleanup. Adapter/setup tests cover cloud baselines,
pagination, metadata changes, failed scans, non-overlap, ignored subagent/tool
events, preserved notification/hooks and idempotent installation.

A real interactive turn on installed Codex CLI 0.154.0 emitted
`agent-turn-complete`. Signed-in cloud JSON listing, enabled hook support and the
macOS Codex bundle/deep-link registration were checked. Automatic approval review
rejected trusting the project directory for a live attention-hook probe, so that
live signal check remains outstanding. Synthetic observers do not replace it.

Two actual browser clients verified one-human/three-bot and same-room
two-human/no-bot states. Headless medium bots traversed and fired on all six FFA
maps. A paired browser completion ended its visit, and the local companion
activated the macOS Codex app and acknowledged the handoff after the countdown.
The final browser check verified personal results, the human/bot breakdown and
fresh visit duration without the legacy victory/defeat or replay overlay.
Typecheck and production build passed; lint passed with zero errors and 15
warnings. Lifecycle, adapter, setup, audio and security tests passed, and the
dependency audit reported zero vulnerabilities. No production deployment or
actual SSH installation was performed.

Manual per-host installation is excluded from the downloadable player flow.
Codex's documented plugin API does not automatically deploy scripts to SSH
hosts. Automatic provisioning needs a supported host interface or a separately
authorized companion installer. Public directory distribution also requires a
public HTTPS MCP endpoint or OpenAI support for this local MCP component. These
requirements must be resolved before claiming zero-setup public distribution.

Run typecheck, lint, build, `test:arcade`, `test:security` and the dependency audit
before rollout. Use Node 24 when SQLite was built with Node 24. Deploy one server
instance with persistent SQLite storage; the Docker image includes shared bot
modules. Existing sessions need reload/restart after notification changes.
