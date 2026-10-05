import { EMOTES, type EmoteKind } from './cosmetics';
import { characterAssets } from './character/assets';
import { compileClip, type Clip } from './character/clip';

// All inventory slots share Victory until individual emotes are refined.
// Keep the legacy timing metadata for taunts, replays and thumbnails.
export type ExtraEmoteKind = 'airguitar' | 'headbang' | 'robot' | 'kneel' | 'railspin' | 'laugh';
export type AnyEmoteKind = EmoteKind;
const metadata = new Map<string, Clip>();
export function emoteClip(kind: AnyEmoteKind): Clip {
  const id = kind === 'idle' ? 'idle.relaxed' : 'emote.placeholder';
  let clip = metadata.get(id);
  if (!clip) {
    const motion = characterAssets().clips.get(id);
    if (!motion) throw new Error('Missing emote motion: ' + id);
    clip = compileClip({ duration: motion.duration, loop: true, gun: false, keys: [{ t: 0 }], props: [] });
    metadata.set(id, clip);
  }
  return clip;
}

export const EMOTE_KINDS: EmoteKind[] = ['idle', ...EMOTES.map((e) => e.kind)];
export function isEmoteKind(kind: string): kind is AnyEmoteKind { return EMOTE_KINDS.includes(kind as EmoteKind); }
