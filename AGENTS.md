# Game audio

- Use ElevenLabs **Victor — Deep, Malevolent and Ancient** as the single announcer for every spoken game event, including kill medals, headshots, streaks, match results, respawn, and Codex notices.
- Victor's verified voice ID is `cPoqAvGWCPfCfyPMwe4z`. Generate spoken callouts with text-to-speech through the ElevenLabs MCP and `eleven_v3` so each event can have suitable emotion and delivery tags.
- Keep the same deep male voice throughout. Use energetic, forceful delivery for kills and streaks, triumphant delivery for victory, restrained delivery for defeat, and clear, confident delivery for notices.
- Ship recordings locally and preserve the game's announcer volume, mute, and non-overlap behavior. Do not mix in other announcers or browser speech synthesis.
- Keep the audio manifest, generation provenance, settings label, and sound preview page consistent with the selected announcer.
