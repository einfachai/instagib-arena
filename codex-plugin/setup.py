#!/usr/bin/env python3
"""Install scoped observers while preserving all existing Codex notification/hooks."""
import argparse
import json
import os
import pathlib
import re
import shlex
import shutil
import tomllib

p = argparse.ArgumentParser()
p.add_argument('--data', default=os.environ.get('PLUGIN_DATA') or os.environ.get('AGENT_DEATHMATCH_DATA') or os.path.expanduser('~/.local/share/agent-deathmatch'))
p.add_argument('--config', default=os.path.join(os.environ.get('CODEX_HOME', os.path.expanduser('~/.codex')), 'config.toml'))
p.add_argument('--node', default=shutil.which('node'))
p.add_argument('--install-hooks', action='store_true', help='Install observers on SSH hosts without the desktop plugin')
p.add_argument('--check', action='store_true')
args = p.parse_args()
if not args.node:
    raise SystemExit('Node is required on this execution host.')
plugin = pathlib.Path(__file__).resolve().parent
config = pathlib.Path(args.config).expanduser().resolve()
text = config.read_text() if config.exists() else ''
parsed = tomllib.loads(text)
data = pathlib.Path(args.data).expanduser().resolve()
wrapper = [args.node, str(plugin / 'notify.mjs'), '--data', str(data)]
current = parsed.get('notify', [])
hook_file = config.parent / 'hooks.json'
hook_command = ' '.join(shlex.quote(part) for part in wrapper + ['--hook'])

def hook_entries():
    h = json.loads(hook_file.read_text()) if hook_file.exists() else {'hooks': {}}
    entries = []
    for event, groups in h.get('hooks', {}).items():
        for i, group in enumerate(groups):
            for j, handler in enumerate(group.get('hooks', [])):
                if handler.get('command') == hook_command:
                    snake = re.sub(r'(?<!^)(?=[A-Z])', '_', event).lower()
                    entries.append((event, f'{hook_file}:{snake}:{i}:{j}'))
    return entries

if args.check:
    entries = hook_entries()
    state = parsed.get('hooks', {}).get('state', {})
    installed = current == wrapper and (data / 'controller.json').exists()
    print(json.dumps({'notificationInstalled': installed, 'hooksInstalled': len(entries) == 2,
                      'hookTrustRecords': all(state.get(key, {}).get('trusted_hash') for _, key in entries) if entries else False,
                      'hookTrustCheck': 'Use /hooks to verify the exact current definitions; presence of a trust record alone is not proof.',
                      'node': True}))
    raise SystemExit(0 if installed else 1)

data.mkdir(parents=True, exist_ok=True, mode=0o700)
if current != wrapper:
    # Upgrading our own wrapper must not chain it back into itself.
    ours = isinstance(current, list) and (str(plugin / 'notify.mjs') in current or ('--data' in current and str(data) in current and any(str(arg).endswith('/notify.mjs') for arg in current)))
    if not ours:
        chain = data / 'notify-chain.json'
        chain.write_text(json.dumps(current)); chain.chmod(0o600)
    # Top-level keys precede the first table. Never replace a profile's notify.
    first_table = re.search(r'^\s*\[', text, re.M)
    top_end = first_table.start() if first_table else len(text)
    match = re.search(r'^notify\s*=\s*', text[:top_end], re.M)
    if match:
        start, end = match.start(), match.end()
        depth, quote, escaped = 0, None, False
        while end < len(text):
            char = text[end]
            if quote:
                if escaped: escaped = False
                elif char == '\\' and quote == '"': escaped = True
                elif char == quote: quote = None
            elif char in "'\"": quote = char
            elif char == '#':
                end = text.find('\n', end)
                if end < 0: raise ValueError('Unterminated notify array')
            elif char == '[': depth += 1
            elif char == ']':
                depth -= 1
                if depth == 0:
                    end += 1; break
            end += 1
        text = text[:start] + 'notify = ' + json.dumps(wrapper) + text[end:]
    else:
        text = 'notify = ' + json.dumps(wrapper) + '\n' + text
    tomllib.loads(text)
    config.parent.mkdir(parents=True, exist_ok=True)
    backup = config.with_suffix('.toml.arena-backup')
    if config.exists() and not backup.exists(): shutil.copy2(config, backup)
    temporary = config.with_suffix('.arena-tmp')
    temporary.write_text(text); temporary.chmod(0o600); temporary.replace(config)

if args.install_hooks:
    hooks = json.loads(hook_file.read_text()) if hook_file.exists() else {'hooks': {}}
    existing = hooks.setdefault('hooks', {})
    for event, matcher in [('PermissionRequest', '*'), ('PreToolUse', 'request_user_input(_async)?$')]:
        groups = existing.setdefault(event, [])
        if not any(handler.get('command') == hook_command for group in groups for handler in group.get('hooks', [])):
            groups.append({'matcher': matcher, 'hooks': [{'type': 'command', 'command': hook_command, 'async': True, 'timeout': 10}]})
    if hook_file.exists() and not hook_file.with_suffix('.json.arena-backup').exists():
        shutil.copy2(hook_file, hook_file.with_suffix('.json.arena-backup'))
    temporary = hook_file.with_suffix('.arena-tmp')
    temporary.write_text(json.dumps(hooks, indent=2) + '\n'); temporary.chmod(0o600); temporary.replace(hook_file)
print('Notification wrapper installed; existing notification command preserved.')
print('Review the two background observers in Codex /hooks on this execution host. Existing approvals and input behavior remain in Codex.')
