import { matchXpLines, PER_MATCH_XP_CAP, XP_BASE, type MatchXpInput, type XpLine } from './progression';
import type { CombatTotals } from './arcade';

export function arcadeXpLines(input: { human: MatchXpInput; bot: CombatTotals; durationMs: number; humanDurationMs: number; recordable?: boolean }, practiceLeft?: number) {
  const presence = input.recordable === false ? 0 : Math.min(1, Math.max(0, input.durationMs / 180_000));
  const humanShare = input.durationMs > 0 ? Math.min(1, input.humanDurationMs / input.durationMs) : 0;
  const base = Math.round(XP_BASE * presence);
  const humanBase = Math.round(base * humanShare);
  const human = matchXpLines({ ...input.human, won: false, presence: humanBase / XP_BASE }, { offline: false, firstWin: false });
  const bot = matchXpLines({ kills: input.bot.kills, headshots: input.bot.headshots, bestStreak: input.bot.bestStreak,
    shotsFired: input.bot.shots, accuracy: input.bot.shots ? input.bot.hits * 100 / input.bot.shots : 0,
    won: false, presence: (base - humanBase) / XP_BASE }, { offline: true, firstWin: false, offlineXpLeft: practiceLeft });
  const lines: XpLine[] = [{ key: 'base', label: 'Visit participation', xp: human.lines[0].xp + bot.lines[0].xp }];
  lines.push(...human.lines.slice(1).map(l => ({ ...l, label: `Human combat · ${l.label}` })));
  lines.push(...bot.lines.slice(1).map(l => ({ ...l, label: `Practice · ${l.label}` })));
  const practiceXp = Math.min(bot.xp, PER_MATCH_XP_CAP - human.xp);
  if (practiceXp < bot.xp) lines.push({ key: 'cap', label: 'Visit cap', xp: practiceXp - bot.xp });
  return { xp: human.xp + practiceXp, practiceXp, lines };
}
