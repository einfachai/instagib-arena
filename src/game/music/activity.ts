export type MusicActivity = {
  started: boolean;
  arenaReady: boolean;
  locked: boolean;
  focused: boolean;
  hidden: boolean;
  spectator: boolean;
  matchOver: boolean;
  voting: boolean;
  postMatchReplay: boolean;
  networkReady: boolean;
  photoMode: boolean;
};

// Warmup and ordinary death/respawn do not change the match's music activity.
export function gameplayMusicActive(s: MusicActivity): boolean {
  return s.started && s.arenaReady && s.locked && s.focused && !s.hidden &&
    !s.spectator && !s.matchOver && !s.voting && !s.postMatchReplay &&
    s.networkReady && !s.photoMode;
}
