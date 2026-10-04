# Agent Deathmatch — Distribution & Launch Kit

Everything you need to list the game on portals and seed communities. Automation
can't create accounts or submit on your behalf — those are identity-bound and
need your login/ToS acceptance — so this kit makes each one ~10 min of copy-paste.

URL: **https://instagib.win** · Genre: browser instagib arena FPS · Price: free

---

## ⚠️ Read first: the iframe blocker (CrazyGames / Poki)

The server currently sends `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`
on every response (`server/index.ts`). Portals that embed the game in an `<iframe>`
(CrazyGames, Poki) **cannot load it** until we allowlist their origin.

**Do not submit to CrazyGames/Poki until this is fixed.** When you have your
CrazyGames dev account + their embed origin, apply the frame-ancestors allowlist
— it is a ~15 min surgical change (allow portal origins on game routes,
keep DENY on /admin + auth). Directories that just link to your URL (itch link,
.io lists) are unaffected — do those now.

---

## Portal fit — do these in this order

| Portal | Fit | Effort | Embed? | Notes |
|---|---|---|---|---|
| **itch.io** | High | Low | No (link out) | Free, instant, no review. Backlink + devlog home. Do first. |
| **.io directories** | Med | Low | No (link) | iogames.space, iogames.onl, iogames.wiki, etc. Pure backlinks + niche traffic. |
| **CrazyGames** | High | Med | **Yes** | Biggest single lever. Needs iframe fix + QA review. The real prize. |
| **Newgrounds** | Med | Low | Yes (iframe) | Arena/Quake-adjacent audience. Optional. |
| **Product Hunt** | Med | Med | No | One-time launch event, not a portal. Good for a burst + backlink. |
| **Poki** | Low odds | Med | Yes | Curated/selective, prefers to host the game itself. Apply, don't count on it. |
| **GameDistribution / GameMonetize** | Skip for now | High | Hosted | Syndication networks; want their SDK + to host. Revisit later. |

Why this order: itch + .io directories are free instant backlinks (help SEO and
send the *right* niche traffic) and need no code changes. CrazyGames is the big
win but gated behind the iframe fix + review. Poki is a long shot.

---

## Reusable copy (paste into any portal)

**Name:** Agent Deathmatch

**Tagline (≤80 chars):**
> Kill time while your coding agent works.

**Short description (1–2 sentences):**
> Agent Deathmatch is a robot arena shooter for the wait while Codex works.
> When a monitored task finishes, you leave the arena, see your personal scoreboard,
> and return to work.

**Long description:**
> Give Codex a task. Grab a railgun. Agent Deathmatch turns the wait into a
> continuous multiplayer deathmatch: one shot, one kill, with strafing, dashing,
> double-jumps and wall-jumps. Three bots keep you company when you're alone and
> step out when another player joins.
>
> Your robot represents the coding agent you launched from. Codex is the only
> supported agent today. Install the local Codex plugin from the repository,
> open the launcher, and pair its companion to enable automatic task monitoring.
> When a task completes, your personal scoreboard appears for five seconds before
> the companion brings Codex forward.
>
> Join the community on [Discord](https://discord.gg/uMKsq3ESGs) and follow
> [@einfachai on X](https://x.com/einfachai). Installation instructions are in the
> [README](../README.md#install-in-codex).

**Controls:**
> WASD move · Mouse aim · Left click fire (railgun) · Space jump (double / wall) ·
> Shift dash. Playable on desktop with mouse + keyboard.

**Tags / keywords:**
> instagib, fps, first-person-shooter, arena-shooter, shooter, multiplayer, io,
> browser, webgl, quake, railgun, deathmatch, 1v1, duel, free, action, ranked

**Category:** Action → Shooter → FPS / .io / Multiplayer

---

## Assets you need to capture (gameplay captures need a human at the controls)

- **Cover / thumbnail — 16:9, ≥1280×720.** Clean gameplay shot, minimal text,
  readable at small size. CrazyGames leans on this hard for click-through.
- **Screenshots — 3–5, 16:9, 1920×1080.** Show: a railgun frag, the arena/map,
  the HUD, a ranked/scoreboard screen, cosmetics.
- **Square icon/logo — 512×512** (itch, directories, Product Hunt).
- **Gameplay trailer — 15–30s (optional but huge for conversion).** You already
  have a **replay system** — use it: record a clean run, export, screen-capture
  the first-person replay into a short montage. This doubles as TikTok/Shorts
  content. Highest-leverage asset you can make.
- **og-agent-deathmatch.png** already exists (1731×909) and is now wired up correctly.

---

## Per-portal quick steps

### itch.io (do first — 10 min)
1. Create account → Dashboard → "Create new project".
2. Kind of project: **HTML** but set "This game will be played in browser" OFF if
   you can't upload a self-contained build (multiplayer needs your backend). Use
   the **external link** approach: add a prominent link/button to https://instagib.win,
   or upload a tiny HTML that redirects. Simplest: project page + big "Play now" link.
3. Paste name, tagline, long description, tags. Upload cover + screenshots.
4. Set pricing to **Free**. Publish. Post a short **devlog** (itch surfaces these).

### .io directories (15 min total)
Submit your URL + short description to: iogames.space, iogames.onl, iogames.wiki,
iogames.fun, and any "add your game" form you find searching `"submit" io game`.
Pure backlinks — low effort, compounding SEO + trickle of the exact audience.

### CrazyGames (after the iframe fix)
1. developer.crazygames.com → register as a developer.
2. Submit a new game → provide your hosted URL (https://instagib.win) — they iframe it.
3. **Get their embed origin**, then add it to the CSP allowlist (server/index.ts) + deploy.
4. Integrate the CrazyGames SDK if you want ads/featuring (optional for first submit).
5. Fill name/desc/controls/tags from this kit. Upload thumbnail + screenshots.
6. Submit for QA. They test gameplay, loading, mobile/responsive behavior.

### Newgrounds (optional)
Account → Submit → Game → embed via iframe (also needs framing allowed). Use same copy.

### Product Hunt (launch event)
Schedule a launch (Tue–Thu, 12:01am PT). Tagline + gallery + first comment telling
the build story. Rally your X following to upvote early. One-time spike + backlink.

---

## Reddit seeding (you're doing these)

Best-fit subs (read each sub's self-promo rules first — most require you be a
participant, not a drive-by):
- **r/iogames**, **r/WebGames**, **r/playmygame**, **r/IndieGaming**, **r/IndieDev**
- **r/arenafps** (your core audience), **r/Quake** (be respectful — purists; frame
  it as "Quake instagib in the browser, made by a fan", not a competitor).

What works on these subs:
- Lead with a **clip/GIF**, not a wall of text. A satisfying rail frag in the first 2s.
- Title formula: `[game] I built a free browser Quake-instagib FPS — one shot one kill, no download`.
- Be present in comments for the first 2 hours (the engagement window).
- Time it so a few friends are online — a multiplayer game with an empty server
  on launch day kills the thread. Coordinate a concurrency burst (see below).

---

## The concurrency problem (most important growth note)

A multiplayer game is only fun with players online *at the same time*. Every
channel here sends visitors; if they land on an empty server they bounce forever.
Two mitigations:

1. **Funnel empty-server visitors straight into bots.** Make "Warm up vs bots"
   the obvious first action when no humans are online — you already built offline
   bot modes; surface them so nobody ever sees a dead lobby. This converts the
   exact trickle traffic SEO/portals send.
2. **Manufacture concurrency bursts.** Announce a play time ("8pm ET tonight, hop
   on") on X/Discord before any big post or stream goes live. A burst > a trickle.

---

## Launch sequence (suggested)

1. ✅ Technical SEO (done): OG cards absolute, canonical, JSON-LD, robots, sitemap, noscript.
2. Social metadata uses `@einfachai`; keep it consistent with the community links.
3. Capture assets (cover, screenshots, 20s trailer from a replay).
4. List on itch.io + .io directories (no code needed).
5. Do the iframe-allowlist fix → submit to CrazyGames.
6. Coordinate a concurrency burst, then: Reddit posts + your friend's YouTube
   footage + your X clips, ideally clustered in the same week.
7. Product Hunt launch as a capstone once the above is humming.
