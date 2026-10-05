#!/usr/bin/env python3
"""Build small, self-contained host packages from an explicit runtime allowlist."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = [
    'agent.mjs', 'adapters.mjs', 'connection.mjs', 'server.mjs', 'companion.mjs',
    'notify.mjs', 'claude-notify.mjs', 'play.html', 'setup.py',
    '.mcp.json', '.codex-plugin/plugin.json', 'assets/gun.svg', 'assets/gun-dark.svg',
]
CODEX_ONLY = ['README.md', 'check.mjs', 'register-personal.mjs', 'hooks/hooks.json', '.agents/plugins/marketplace.json']
CLAUDE_FILES = ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.mcp.json',
                'claude-plugin/hooks/hooks.json', 'claude-plugin/skills/play/SKILL.md', 'claude-plugin/README.md']


def build(destination: Path, tag: str | None = None):
    codex = json.loads((ROOT / 'codex-plugin/.codex-plugin/plugin.json').read_text())
    claude = json.loads((ROOT / '.claude-plugin/plugin.json').read_text())
    version = codex['version']
    if claude['version'] != version or not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', version):
        raise ValueError('Both plugin manifests must declare the same valid version')
    if tag and tag != f'plugin-v{version}':
        raise ValueError(f'Tag must match manifests: plugin-v{version}')
    destination.mkdir(parents=True, exist_ok=True)
    archives = []
    for host in ['codex', 'claude-code']:
        name = f'agent-deathmatch-{host}-v{version}'
        archive = destination / f'{name}.zip'
        entries = {}
        for relative in RUNTIME + (CODEX_ONLY if host == 'codex' else []):
            entries[relative if host == 'codex' else f'codex-plugin/{relative}'] = ROOT / 'codex-plugin' / relative
        if host == 'claude-code':
            entries.update({f: ROOT / f for f in CLAUDE_FILES})
        for f in ['LICENSE', 'SUPPORT.md']:
            if (ROOT / f).is_file():
                entries[f] = ROOT / f
        entries['INSTALL.md'] = ROOT / ('codex-plugin/README.md' if host == 'codex' else 'claude-plugin/README.md')
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as output:
            for relative, source in sorted(entries.items()):
                # Fixed metadata keeps builds reproducible; no caches, credentials or game assets.
                info = zipfile.ZipInfo(f'{name}/{relative}', (2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                output.writestr(info, source.read_bytes())
        archives.append(archive)
    checksums = ''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in archives)
    (destination / 'SHA256SUMS').write_text(checksums)
    return archives


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT / 'dist/plugins')
    parser.add_argument('--tag')
    args = parser.parse_args()
    for package in build(args.out, args.tag):
        print(package)
