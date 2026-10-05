#!/usr/bin/env python3
"""Take a consistent online SQLite backup and retain the latest 14 copies."""

from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

data_dir = Path("/var/lib/agent-deathmatch")
backup_dir = data_dir / "backups"
backup_dir.mkdir(mode=0o700, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
destination = backup_dir / f"instagib-{stamp}.sqlite"
temporary = destination.with_suffix(".tmp")

try:
    with closing(sqlite3.connect(f"file:{data_dir}/instagib.sqlite?mode=ro", uri=True)) as source:
        with closing(sqlite3.connect(temporary)) as target:
            source.backup(target)
            if target.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise RuntimeError("SQLite backup integrity check failed")
    temporary.chmod(0o600)
    temporary.replace(destination)
finally:
    temporary.unlink(missing_ok=True)

for expired in sorted(backup_dir.glob("instagib-*.sqlite"), reverse=True)[14:]:
    expired.unlink()
print(f"Saved {destination}")
