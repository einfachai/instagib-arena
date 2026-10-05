# Agent Deathmatch for Claude Code

Play a Claude robot in the shared browser arena while Claude Code works. The
launcher adds `?agent=claude` and a one-time pairing ticket. The game uses that
identity for the player model and the supplied orange artwork. Codex's package
adds `?agent=codex` and selects the blue robot and artwork. Direct web visits keep
the regular game branding. The parameter selects cosmetics only.

## Install

Use Node 24 or newer supported by the game. The companion itself has no npm
runtime dependencies and does not require Python or Codex.

From GitHub:

```sh
claude plugin marketplace add einfachai/instagib-arena
claude plugin install agent-deathmatch@agent-deathmatch
```

For a downloaded release, extract the Claude Code ZIP and run:

```sh
claude plugin marketplace add /absolute/path/to/agent-deathmatch-claude-code-v0.5.0
claude plugin install agent-deathmatch@agent-deathmatch
```

Restart your Claude Code session after installation, then use
`/agent-deathmatch:play`. The MCP tool opens the paired arena in your browser;
press Play there. For development from this checkout, use
`claude --plugin-dir /absolute/path/to/instagib-arena`.

## Events and return to work

The plugin's background hooks observe top-level `Stop` completion,
`Notification` permission prompts, and `PreToolUse` for `AskUserQuestion`.
`SessionStart` records hook availability. No hook emits a decision, reads a
transcript, sends prompts/tool arguments, changes settings, or handles
`SubagentStop`/tool failures. Completion is the default exit policy; choose
attention mode to also return for approval and questions. Notifications from
any enabled local Claude Code session can finish a visit, matching Codex's
controller-wide behavior. Claude cloud/SSH monitoring is not included.

Results display for five seconds. On macOS the companion returns focus to the
launching Terminal, iTerm, VS Code, WezTerm, Ghostty, or Claude app when identified;
on Windows it attempts to activate Windows Terminal, VS Code, or Claude. This
returns app focus, not a particular terminal tab or resumed session. Linux and
unsupported desktop contexts keep a manual-return action. Set
`AGENT_DEATHMATCH_RETURN_APP` to `terminal`, `iterm`, `vscode`, `wezterm`, `ghostty`,
or `claude` before launching Claude Code to select the return app explicitly.

The default controller and event queue live in
`~/.local/share/agent-deathmatch/live/claude`, separate from Codex. `AGENT_DEATHMATCH_DATA`
can override it; use different directories for each host and origin. Runtime
configuration never edits `~/.codex/config.toml` for a Claude launch.

The shared backend and game assets must be deployed together with this release.
Claude task notices are currently on-screen only: the connected ElevenLabs
account rejected their Victor recordings. Kill/streak/result recordings remain
Victor with the existing mute, volume and non-overlap behavior.

## Remove

```sh
claude plugin uninstall agent-deathmatch@agent-deathmatch
claude plugin marketplace remove agent-deathmatch
```

Stop the process identified by this plugin data directory's `companion.lock`
after verifying its identity. Preserve controller data if you intend to reinstall.
No Claude settings or prior notification command need restoring.
