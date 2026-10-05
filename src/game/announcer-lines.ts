// All callouts are recorded with the same deep male ElevenLabs announcer.
// Old pack IDs remain accepted for saved settings; both resolve to this voice.
import type { AnnouncerPackId, SoundClipName } from './audio';

export type AnnouncerLineSet = Partial<Record<SoundClipName, string[]>>;

const ARENA_LINES: AnnouncerLineSet = {
  'agent-entered': ['Another agent user entered the arena.'],
  'codex-entered': ['Codex user entered the arena.'],
  'codex-alone': ['All other Codex users left the arena.'],
  'codex-complete': ['Your Codex task is complete. Back to work.'],
  'codex-attention': ['Codex needs your attention.'],
  "first-blood": [
    "First blood!"
  ],
  "double-kill": [
    "Double kill!"
  ],
  "triple-kill": [
    "Triple kill!"
  ],
  "quad-kill": [
    "Quad kill!"
  ],
  "penta-kill": [
    "Penta kill!"
  ],
  "killing-spree": [
    "Killing spree!"
  ],
  "rampage": [
    "Rampage!"
  ],
  "dominating": [
    "Dominating!"
  ],
  "unstoppable": [
    "Unstoppable!"
  ],
  "godlike": [
    "Godlike!"
  ],
  "headshot": [
    "Headshot!"
  ],
  "humiliation": [
    "Humiliation!"
  ],
  "comeback": [
    "Comeback!"
  ],
  "match-point": [
    "Match point!"
  ],
  "victory": [
    "Victory!"
  ],
  "defeat": [
    "Defeat."
  ],
  "spawn": [
    "Back in the fight!"
  ]
};

export const ANNOUNCER_PACK_LINES: Record<AnnouncerPackId, AnnouncerLineSet> = {
  legacy: ARENA_LINES,
  kuon: ARENA_LINES,
};

export function announcerVariants(pack: AnnouncerPackId, clip: SoundClipName): string[] {
  return ANNOUNCER_PACK_LINES[pack]?.[clip] ?? [];
}

export function announcerVariantCount(pack: AnnouncerPackId, clip: SoundClipName): number {
  return announcerVariants(pack, clip).length;
}
