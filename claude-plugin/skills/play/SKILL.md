---
name: play
description: Open Agent Deathmatch while Claude Code works and return when the task finishes.
---
Call the Agent Deathmatch MCP tool `open_agent_deathmatch` once with no arguments.
It starts the companion and opens the paired arena in the browser. Tell the user to
press Play there, then continue their coding task. If the browser could not open,
show the URL returned by the tool. Do not include pairing links in repository files.
Do not run or install Codex, alter Claude settings, or approve anything for the user.
