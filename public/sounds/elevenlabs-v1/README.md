# Agent Deathmatch audio

All recordings in this pack were generated through the ElevenLabs MCP plugin.
All 21 spoken callouts use **Victor — Deep, Malevolent and Ancient**
(`cPoqAvGWCPfCfyPMwe4z`) with `eleven_v3`. Delivery tags direct each event's
emotion, from a sharp Headshot to an intense Godlike and a restrained Defeat.
Both historical announcer setting IDs resolve to this same voice.
Active speech lives in `announcer/victor/` so replacement recordings have fresh
URLs. The sound manifest and preview page identify Victor as the active voice.

Nonverbal weapon, movement, finisher, medal, ambience and interface recordings
use `eleven_text_to_sound_v2`. Map ambience and recharge hum are loop recordings.
Rail fire uses `weapon/crack/`: the original ElevenLabs discharge with its
opening 180 ms physically removed, starting at the strongest audible crack.
A 180 Hz high-pass, 55 ms decay and 220 ms length limit keep the onset clear.
Its generation ID is preserved; no new generation was needed. Import the
processing revision with `--asset-directory crack --merge
--require-complete`. Local shots queue audio when cooldown accepts the shot,
before hit tests and beam construction.
Hover and modal transitions use replacement recordings in `ui/refined/`: a
muted hover tick and warm rising/falling modal tones, with softer levels and
smooth fades. The [interface cue flow](https://elevenlabs.io/app/flows/AxtuoM6DwEYxzF88pJ5n)
contains four generated takes for each replacement. Import these with
`--asset-directory refined --merge --require-complete`.
Dash and boost use replacements in `movement/refined/`: a short air swish and
a fuller pressure burst. Jump and double jump use `movement/jump-foley/`:
a textured shoe push-off scuff and a fuller unpitched air whoosh. The jump cues
retain their natural texture and tails, with quiet lead-ins removed for prompt
playback. Their loading fallbacks follow the same direction without vocal grunts,
pitch chirps or energy buzz. The [movement cue flow](https://elevenlabs.io/app/flows/VXercKicesQJLsUy1ZpS)
contains the candidate takes; the session audit records each selected replacement.
The game retains spatial panning, distance filtering, room reverb, voice limits,
replay treatment, separate volume controls and ambience ducking.

The listening page uses decoded Web Audio buffers, warms short combat/movement
cues before Play, and preloads other recordings on hover or keyboard focus.
It retains seek, pause, loop, volume and playlist controls without restarting
a media-element download every time a recording is played.

The files are downloaded into the game; runtime playback needs no ElevenLabs
connection or API key. Nonverbal synthesis remains available while a recording
loads. Spoken events never fall back to device speech or another announcer.

`manifest.json` records the selected generation IDs and measured levels.
`docs/audio-generation.json` records prompts, model parameters and the editable
[ElevenLabs flow](https://elevenlabs.io/app/flows/BqtTzkB2pZXfG9quZbsY).
`scripts/process-elevenlabs-audio.py` trims leading silence, shapes optional decay, limits short cues,
crossfades loop boundaries, balances levels and encodes 44.1 kHz MP3 files.
It also regenerates gameplay's recording URLs from the selected manifest;
the shot alias shares that registry so preview and gameplay use the same take.
The [Victor announcer flow](https://elevenlabs.io/app/flows/uCosbkXovVcW6Su7mlNW)
contains the replacement voice takes. Use `--voice-directory victor --merge
--require-complete` when importing a complete announcer replacement while
retaining the rest of the pack.
