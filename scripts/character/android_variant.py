"""Paths and review metadata shared by the two independent android assets."""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def variant_options():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--variant', choices=('codex', 'claude'), default='codex')
    # Blender consumes its own flags before --; ordinary Python does not.
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ([] if 'bpy' in sys.modules else sys.argv[1:])
    options, remaining = parser.parse_known_args(argv)
    key = options.variant
    return {
        'key': key,
        'id': key + '-android',
        'name': key.title() + ' Android',
        'revision': 1 if key == 'claude' else 5,
        'out': ROOT / 'art' / (key + '-android'),
        'head': 'Head / Clawd terracotta housing' if key == 'claude' else 'Head / unified scalloped blue housing',
        'references': ['clawd-mascot.png', 'claude-robot-concept.png'] if key == 'claude' else
                      ['monitor-head.png', 'futuristic-cloud-robot.png', 'orthographic-character-sheet.png', 'blue-cloud-mascot.png'],
    }, remaining
