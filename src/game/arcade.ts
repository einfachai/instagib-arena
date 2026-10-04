/** Shared wire types. Counters travel as JSON numbers, independently of u16 snapshots. */
export type ExitPolicy = 'completion' | 'attention';
export type CodexCategory = 'completion' | 'approval-required' | 'input-required' | 'terminal-error';
export type CodexEvent = { eventId: string; source: 'local' | 'ssh' | 'cloud'; taskId: string;
  category: CodexCategory; occurredAt: number; taskLink?: string };
export type CombatTotals = { kills: number; deaths: number; shots: number; hits: number; headshots: number; bestStreak: number };
export type VisitStats = CombatTotals & { visitId: string; startedAt: number; durationMs: number; humanDurationMs: number;
  currentStreak: number; human: CombatTotals; bot: CombatTotals };
export type VisitRow = VisitStats & { id: string; name: string; actor: 'human' | 'bot' };
export type ExitReason = 'manual' | 'disconnected' | 'idle' | CodexCategory;
export type ArenaNotice = { type: 'arena-notice'; id: string; text: string; clip: 'codex-entered' | 'codex-alone' };
export function emptyCombat(): CombatTotals { return { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0, bestStreak: 0 }; }
export function newVisit(visitId: string, now: number): VisitStats {
  return { ...emptyCombat(), visitId, startedAt: now, durationMs: 0, humanDurationMs: 0, currentStreak: 0, human: emptyCombat(), bot: emptyCombat() };
}
