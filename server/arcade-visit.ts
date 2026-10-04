import { randomUUID } from 'node:crypto';
import { newVisit, type VisitStats } from '../src/game/arcade';

export class ArcadeVisit {
  readonly stats: VisitStats;
  private tickAt: number;
  private streaks = { human: 0, bot: 0 };
  ended = false;
  constructor(now = Date.now(), visitId = randomUUID()) { this.stats = newVisit(visitId, now); this.tickAt = now; }
  advance(now: number, connected: boolean, humanCombat: boolean) {
    const elapsed = Math.max(0, now - this.tickAt);
    this.tickAt = now;
    if (!connected || this.ended) return;
    this.stats.durationMs += elapsed;
    if (humanCombat) this.stats.humanDurationMs += elapsed;
  }
  shot(humanCombat: boolean) {
    if (this.ended) return;
    this.stats.shots++; this.stats[humanCombat ? 'human' : 'bot'].shots++;
  }
  kill(victimIsHuman: boolean, headshot: boolean) {
    if (this.ended) return;
    const s = this.stats, bucket = s[victimIsHuman ? 'human' : 'bot'];
    s.kills++; s.hits++; bucket.kills++; bucket.hits++;
    s.currentStreak++; s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
    const kind = victimIsHuman ? 'human' : 'bot';
    this.streaks[kind]++;
    this.streaks[victimIsHuman ? 'bot' : 'human'] = 0;
    bucket.bestStreak = Math.max(bucket.bestStreak, this.streaks[kind]);
    if (headshot) { s.headshots++; bucket.headshots++; }
  }
  death(killerIsHuman: boolean) {
    if (this.ended) return;
    this.stats.deaths++; this.stats[killerIsHuman ? 'human' : 'bot'].deaths++;
    this.stats.currentStreak = 0;
    this.streaks = { human: 0, bot: 0 };
  }
  freeze() { this.ended = true; return structuredClone(this.stats); }
}

export function desiredBots(connectedHumans: number) { return connectedHumans === 1 ? 3 : 0; }
