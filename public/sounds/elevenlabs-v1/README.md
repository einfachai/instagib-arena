# Agent Deathmatch audio

The pack combines ElevenLabs MCP recordings with user-supplied rail, death and jump sounds.
All spoken callouts use **Victor — Deep, Malevolent and Ancient**
(`cPoqAvGWCPfCfyPMwe4z`) with `eleven_v3`. Delivery tags direct each event's
emotion, from a sharp Headshot to an intense Godlike and a restrained Defeat.
Both historical announcer setting IDs resolve to this same voice.
Active speech lives in `announcer/victor/` so replacement recordings have fresh
URLs. The sound manifest and preview page identify Victor as the active voice.

Generated weapon, movement, finisher, medal, ambience and interface recordings
use `eleven_text_to_sound_v2`. Map ambience and recharge hum are loop recordings.
Rail fire uses `weapon/energy-gun-39409/`, trimmed from the supplied
`freesound_community-sci-fi-energy-gun-39409.mp3`. The retained source span is
190–800 ms: one shot with its natural decay. A 0.25 ms entrance fade and 12 ms
exit fade avoid clicks; normalization matches the game's weapon levels.
The original is archived in `art/audio/sources/`; its SHA-256 and import recipe
are recorded in `art/audio/imports/rail-fire-energy-gun-39409.json`. Import that
recipe with `--asset-directory energy-gun-39409 --merge --require-complete`.
Local shots queue audio when cooldown accepts the shot,
before hit tests and beam construction.
The supplied `dragon-studio-heavy-object-falling-515261.mp3` is archived in
`art/audio/sources/`. Its `death-impact` recording retains exactly 280–2950 ms,
with a 0.25 ms entrance fade, a 12 ms exit fade and the weapon processing targets
of −18 dB RMS / −8 dB peak (the peak ceiling limits the measured RMS).
The source hash and recipe live in `art/audio/imports/death-impact-heavy-object-515261.json`;
import with `--asset-directory death-impact --merge --require-complete`.
One downward ground collision of a visible body fragment triggers the recording,
including the local victim's prewarmed simulation and forward replay playback.
Later bounces stay silent. Its inverse distance profile uses reference distance 5,
rolloff 1.2 and a 70-unit cutoff; SFX and master volume both apply.

The complete supplied Kiravale song lives in `public/sounds/music/`, outside the
short-effect pack. `catalog.json` records its original filename, hash and duration.
It streams and loops only during active gameplay, through an independent music
bus under master volume and Victor's ducking envelope. Both menus share saved
Music on/off and volume settings (on at 30% by default). Pause, focus loss and
tab hiding retain the position; leaving a match resets it. Menus, results,
spectating and post-match replays remain silent.
Hover and modal transitions use replacement recordings in `ui/refined/`: a
muted hover tick and warm rising/falling modal tones, with softer levels and
smooth fades. The [interface cue flow](https://elevenlabs.io/app/flows/AxtuoM6DwEYxzF88pJ5n)
contains four generated takes for each replacement. Import these with
`--asset-directory refined --merge --require-complete`.
Dash and boost use replacements in `movement/refined/`: a short air swish and
a fuller pressure burst. Jump and double jump use the supplied recordings in
`movement/whoosh-382724-376875/`. Jump retains 95–420 ms of
`dragon-studio-simple-whoosh-382724.mp3` (about 0.325 seconds); double jump retains
800–1650 ms of `dragon-studio-whoosh-cinematic-376875.mp3` (0.85 seconds).
The cinematic cue starts on the strong sweep so its long build-up does not delay
the jump feedback. Both retain natural pitch and texture with 2 ms entrance and
12 ms exit fades. RMS targets are −25 dB for jump and −24 dB for double jump,
with a −9 dB peak ceiling. Originals and SHA-256 hashes are archived under
`art/audio/sources/` and `art/audio/imports/jump-whooshes-382724-376875.json`.
Import the recipe with `--asset-directory whoosh-382724-376875 --merge --require-complete`.
The [movement cue flow](https://elevenlabs.io/app/flows/VXercKicesQJLsUy1ZpS)
contains earlier generated candidates; the session audit retains that history
and records the supplied replacements.
The game retains spatial panning, distance filtering, room reverb, voice limits,
replay treatment, separate volume controls and ambience ducking.

The listening page uses decoded Web Audio buffers, warms short combat/movement
cues before Play, and preloads other recordings on hover or keyboard focus.
It retains seek, pause, loop, volume and playlist controls without restarting
a media-element download every time a recording is played.

The files are downloaded into the game; runtime playback needs no ElevenLabs
connection or API key. Nonverbal synthesis remains available while a recording
loads. Spoken events never fall back to device speech or another announcer.

`manifest.json` records selected generations or supplied-file hashes and measured levels.
`docs/audio-generation.json` records supplied sources, prompts, model parameters and the editable
[ElevenLabs flow](https://elevenlabs.io/app/flows/BqtTzkB2pZXfG9quZbsY).
`scripts/process-elevenlabs-audio.py` trims leading silence, shapes optional decay, limits short cues,
crossfades loop boundaries, balances levels and encodes 44.1 kHz MP3 files.
It also regenerates gameplay's recording URLs from the selected manifest;
the shot alias shares that registry so preview and gameplay use the same take.
The [Victor announcer flow](https://elevenlabs.io/app/flows/uCosbkXovVcW6Su7mlNW)
contains the replacement voice takes. Use `--voice-directory victor --merge
--require-complete` when importing a complete announcer replacement while
retaining the rest of the pack.
