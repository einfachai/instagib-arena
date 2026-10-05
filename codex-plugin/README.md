# Agent Deathmatch plugin

The launcher opens the shared game at `https://agent-deathmatch.hi-fa2.workers.dev/play?agent=codex`, starts a local
companion, and pairs the browser using a single-use ticket. Press **Play** to join
a continuous arena. A completed Codex turn ends only your visit; personal results
wait five seconds before the companion brings Codex back to the foreground.

Use Node 24 and Python 3.11+ for notification configuration. Its MCP
configuration uses the installed plugin directory as its working directory;
it contains no developer-specific absolute paths. Local game development needs
Node 24, installed game dependencies and a built client. The companion introduces
no runtime npm dependencies.

## Distribution and automatic setup

This checkout is a local/marketplace plugin implementation. Publishing to the
universal directory needs a supported public HTTPS MCP endpoint or OpenAI's local
MCP support arrangement. A browser-only public MCP server cannot run a player's
local CLI or activate their desktop app. Do not advertise this package as a
zero-setup universal-directory release before resolving that requirement.

Opening the installed tool prepares a paired URL, starts the
companion, and installs a completion notification wrapper. It preserves and
forwards the previous notification command and original payload, backs up the
configuration, and preserves unrelated settings. Existing Codex sessions need
their normal reload/restart after notification configuration changes.

The two asynchronous attention observers emit no approval decision or input
response. They use `PermissionRequest` and `PreToolUse` for input requests.
Codex requires users to review and trust the exact hook definitions; installation
does not grant that trust. Completion-only is the main-menu default. Attention
mode also includes exposed terminal cloud errors. Tool failures and subagent
endings are ignored.

SSH is an activation gap for the downloadable release: the documented plugin
interface does not automatically deploy scripts to remote execution hosts or
provide a connected-host provisioning API. Manual per-host setup is not part of
the player flow. `pair-ssh.mjs` is retained as a developer diagnostic/provisioning
utility, not a required player instruction. Its tokens are scoped to one player
controller and one host. A supported automatic deployment path or a separately
authorized companion installer must be resolved before shipping SSH monitoring.

## Install from this checkout

```sh
codex plugin marketplace add ./codex-plugin
codex plugin add agent-deathmatch@agent-deathmatch-local
```

Run these commands from the repository root. Fully quit and reopen Codex after
installation/update, enable **Agent Deathmatch**, and ask **Open Agent Deathmatch**.
The first launch configures notifications and pairs the browser. Restart existing
Codex sessions after that setup, then reopen the game before testing completion.
The shared origin must run the companion-compatible backend in this checkout.

For personal catalog authoring, `node codex-plugin/register-personal.mjs` remains
available and preserves other entries. It prints the actual marketplace name;
use that name when installing from an existing personal catalog.

## Replace an earlier development installation

The product's plugin ID, MCP names, environment prefix, browser pairing key and
default data directory have changed. Reinstall and pair again:

1. Leave the game and disable the earlier plugin in Codex. Locate its data
   directory from the notification command's `--data` argument in your Codex
   configuration (or its configured `PLUGIN_DATA`).
2. Inspect the PID in that directory's `companion.lock`. Verify it belongs to the
   earlier companion before stopping that process; stop any helper the same way.
3. Restore the top-level `notify` command from that directory's
   `notify-chain.json`, or the installer backup, preserving subsequent unrelated
   configuration edits. If the saved command is an empty array, remove the old
   top-level `notify` entry. Remove only the earlier plugin's standalone hook
   entries, if any, and uninstall the earlier plugin through Codex.
4. Install using the commands above. Update custom settings to the
   `AGENT_DEATHMATCH_` names below, restart Codex, and open the new launcher to pair.
   Restart existing sessions once the new notification wrapper is installed.

Keep old data/backups until the new setup works. Game accounts and progression
use the same server database; this rename does not migrate or erase them.

Setup and runtime checks:

```sh
python3 codex-plugin/setup.py --check
node codex-plugin/check.mjs
node codex-plugin/validate-runtime.mjs
```

Use the launcher's `PLUGIN_DATA` directory with `--data` if testing separately
from the host. `setup.py --check` reports installation and trust-record presence;
review `/hooks` for the exact current definitions. `check.mjs` verifies pairing,
hook support and connectivity. The optional `--completion-probe` on the runtime
validator needs an interactive terminal: the installed Codex runtime's
`codex exec` does not emit the notification.

## Monitoring, privacy and desktop return

The signed-in local CLI scans `codex cloud list --json` every ten seconds,
without overlapping scans. It follows pagination and establishes a historical
baseline before detecting new transitions. Credentials, prompts and task contents
stay on the computer; only IDs, categories, timestamps and safe task links reach
the backend. Delivery retries retain original timestamps, and stale events cannot
end a later visit. Degraded monitoring leaves Play and manual exit available.

After the countdown, the browser requests a handoff scoped to its ended visit.
The companion claims it and activates Codex. Local completions use the supported
`codex://threads/<id>` link. Cloud results retain available task links while
returning app focus. Claims prevent a new Play racing native activation; a stale
countdown cannot interrupt a later visit.

The default data directory is `~/.local/share/agent-deathmatch/live`. `PLUGIN_DATA` or
`AGENT_DEATHMATCH_DATA` overrides it. Credentials/outbox files are owner-readable only.
Use a separate data directory when switching origin; credentials belong to their
issuing backend. Companion/helper logs stay on the execution host.

## Local game preview

Set `AGENT_DEATHMATCH_ORIGIN=http://localhost:8787` for development. If the installed
plugin copy is separate from the game checkout, also set `AGENT_DEATHMATCH_GAME_DIR`
and `AGENT_DEATHMATCH_NODE` to the checkout and its Node 24 executable. Non-local game
origins require HTTPS.

First run `npm ci` and `npm run build` with Node 24 from the game checkout.
The launcher starts the local production server if it is not already running.

```sh
AGENT_DEATHMATCH_ORIGIN=http://localhost:8787 AGENT_DEATHMATCH_DATA=/tmp/arena-dev node codex-plugin/server.mjs --preview
```

The launcher preview is `http://localhost:8790/`; the game opens in a normal
browser tab for pointer lock. Every launcher opening issues a fresh pairing
ticket with a three-minute expiry. The game removes it from the URL when claimed.
For Codex, the tool returns the paired URL and instructs the assistant to open it with `open_in_codex` in an in-app browser tab. It has no attached MCP launcher card and never auto-opens an external browser. Claude Code retains its native browser launch. The HTML preview is a development diagnostic only.

## Remove

```sh
codex plugin remove agent-deathmatch@agent-deathmatch-local
codex plugin marketplace remove agent-deathmatch-local
node codex-plugin/register-personal.mjs --remove
```

The final command is only needed if you used personal catalog registration.
Stop the companion/helper recorded in its own lock file. Restore the prior
notification command from `notify-chain.json` or the installer backup while
preserving later config edits. Remove only Arena entries from any standalone SSH
hooks file and restart Codex. Do not remove other observers.

See [implementation and validation notes](../docs/arcade.md),
[plugin packaging requirements](https://developers.openai.com/plugins/build/plugins),
[notification configuration](https://learn.chatgpt.com/docs/config-file/config-advanced),
[hooks](https://learn.chatgpt.com/docs/hooks), and
[desktop commands](https://learn.chatgpt.com/docs/reference/commands).

## Release downloads

Run `npm run package:plugins` from the repository root to create both host ZIPs
and SHA-256 checksums in `dist/plugins`. The manifests share version 0.5.0.
Pushing `plugin-v0.5.0` runs validation and publishes these files to a GitHub
Release. Future tags must match both manifest versions.

Extract the Codex ZIP, then use `codex plugin marketplace add /absolute/path/to/agent-deathmatch-codex-v0.5.0`
and `codex plugin add agent-deathmatch@agent-deathmatch-local`. The repo root also
provides the `agent-deathmatch` marketplace for GitHub installations.
The blue artwork and Codex robot are selected by the agent URL parameter and
persist within that browser tab across reloads. The Claude Code package uses
its own hooks and controller data; see [Claude Code instructions](../claude-plugin/README.md).
