# Deploy from GitHub to Cloudflare Workers

Cloudflare serves the Vite frontend and proxies `/api/*` and `/ws/*` to the
existing VPS. Browsers use one HTTPS `workers.dev` origin for assets, login
cookies, API requests, and the game WebSocket. The VPS runs the game simulation
and keeps its existing SQLite database.

## GitHub build settings

In Cloudflare **Workers & Pages → Create application → Import a repository**,
choose the existing `einfachai/instagib-arena` repository. An existing Worker can
be connected under **Settings → Builds → Connect**.

| Setting | Value |
| --- | --- |
| Worker name | `agent-deathmatch` (must match `wrangler.jsonc`) |
| Production branch | `codex/cloudflare-github` |
| Root directory | Repository root |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Node version | `24`, pinned by `.nvmrc` |

Cloudflare installs the locked npm dependencies before building. The build runs
the Worker type check and proxy tests, then generates the frontend in `dist`.
Wrangler uploads the Worker and its static assets together. Pushes to the
production branch automatically build and deploy. Disable other branch builds
until a separate preview backend is available. After merging the deployment
branch into `main`, change the Cloudflare production branch to `main`.

The result is `https://agent-deathmatch.<account-subdomain>.workers.dev/play`.
No purchased domain is required. Models, fonts, and the Victor audio recordings
are versioned under `public` and travel with each GitHub build. Generated ZIPs,
local credentials, runtime databases, and `.wrangler` state are excluded.

## Connect the VPS

`GAME_ORIGIN` in `wrangler.jsonc` is the provider-supplied HTTPS hostname
`https://vps-555375ab.vps.ovh.ca`. Set the Worker runtime secret `GAME_PROXY_KEY`
to the same random value as `ARENA_PROXY_KEY` in the VPS's root-readable
`/etc/agent-deathmatch-cloudflare.env`. Keep this key out of Git and build logs.
Use `wrangler secret put GAME_PROXY_KEY` to upload it through stdin.

The Caddy configuration is
[`deploy/vps/Caddyfile.cloudflare.example`](../deploy/vps/Caddyfile.cloudflare.example).
Its service override is
[`deploy/vps/caddy-cloudflare.conf`](../deploy/vps/caddy-cloudflare.conf).
Caddy obtains TLS for the provider hostname. On that hostname it accepts only
API/socket requests with the matching private Worker key, strips the key, and
uses the Worker's client IP for rate limits. It rewrites Origin to the existing
`APP_BASE_URL=http://51.222.25.178` only after authenticating the Worker. The
Worker first validates the browser's actual public origin, so cross-site writes
and game sockets remain forbidden. Direct IP guest play continues to use its
existing ingress and origin policy.

The Caddy override removes `--environ` from the packaged startup command so the
proxy key is never printed in the journal. Changes to this override require
`systemctl daemon-reload` and a Caddy restart.

## Verify a deployment

- `/play` and the laboratory routes must load the frontend, including a direct
  navigation to each route.
- `/api/health` must return JSON with `ok: true`, rather than the SPA HTML.
- Guest Play must join a live room and receive binary snapshots.
- Account requests must keep their secure, HttpOnly session cookie on the public
  Worker origin; API responses are never cached.
- Foreign browser origins and forged player/proxy headers must be rejected.

The proxy tests cover these routing and forwarding boundaries. The Worker
returns an upgraded WebSocket response directly so game frames use Cloudflare's
tunnel instead of a JavaScript message relay. Login/API redirects remain on the
public origin, and credentials are never followed to an external redirect.

An unconfigured proxy returns HTTP 503 for API/socket paths while the frontend
still loads. An unavailable VPS returns HTTP 502. Configure the runtime secret
before considering the game ready for players.

References: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/),
[build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[selective Worker routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
