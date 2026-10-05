"""Refresh the armor in the editable animation scene without rebaking motion.
Only use when the canonical rig signature is unchanged (as this script checks).
"""
import bpy,json,tempfile,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];ART=ROOT/'art/ybot'
report=json.loads((ART/'reports/rig-comparison.json').read_text())
assert report['passed'] and report['original']==report['resculpted']
bpy.ops.wm.open_mainfile(filepath=str(ART/'codex-ybot.blend'))
with tempfile.TemporaryDirectory() as temporary:
 # Accept an explicitly selected recovery copy when a prior save purged
 # unreferenced actions. All appended actions receive persistent fake users.
 import sys
 source=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else ART/'codex-ybot-animations.blend'
 library=Path(temporary)/'previous-actions.blend';shutil.copyfile(source,library)
 with bpy.data.libraries.load(str(library),link=False) as (available,loaded):loaded.actions=available.actions
for action in bpy.data.actions:action.use_fake_user=True
assert all(action.library is None for action in bpy.data.actions),'Linked motion data in editable source'
expected={entry['id'] for entry in json.loads((ART/'animation-sources.json').read_text())['clips']}
assert expected<={a.name for a in bpy.data.actions},'Missing editable actions'
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'codex-ybot-animations.blend'))
# Validate the saved file itself, including persistence after reopening.
bpy.ops.wm.open_mainfile(filepath=str(ART/'codex-ybot-animations.blend'))
assert expected<={a.name for a in bpy.data.actions},'Saved editable actions did not persist'
print('EDITABLE_SOURCE_REFRESHED',len(expected),'local actions; unchanged rig')
