// Cosmetic events only. They carry no position or authoritative movement state.
export const MOVEMENT_CUE_KINDS = ['jump', 'double-jump', 'wall-jump', 'boost', 'dash', 'landing'] as const;
export type MovementCueKind = typeof MOVEMENT_CUE_KINDS[number];
export type MovementCue = { kind: MovementCueKind; direction?: { x: number; z: number }; impact?: number; age?: number };
export function isMovementCue(value: unknown): value is MovementCue {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<MovementCue>;
  return MOVEMENT_CUE_KINDS.includes(c.kind as MovementCueKind)
    && (c.impact === undefined || (Number.isFinite(c.impact) && c.impact >= 0 && c.impact <= 100))
    && (c.direction === undefined || (c.direction !== null && typeof c.direction === 'object' && Number.isFinite(c.direction.x) && Number.isFinite(c.direction.z) && Math.hypot(c.direction.x, c.direction.z) <= 1.01))
    && (c.age === undefined || (Number.isFinite(c.age) && c.age >= 0 && c.age <= 2));
}

// Copy only cosmetic fields across the network/replay boundary. Client payloads
// cannot smuggle position, timing, or gameplay state into a broadcast.
export function copyMovementCue(cue: MovementCue): MovementCue {
  return { kind: cue.kind, ...(cue.direction ? { direction: { x: cue.direction.x, z: cue.direction.z } } : {}), ...(cue.impact === undefined ? {} : { impact: cue.impact }) };
}

export type TimedMovementCue = { actorId: string; t: number; cue: MovementCue };
export class MovementCueTimeline {
  private queue: TimedMovementCue[] = [];
  enqueue(actorId: string, t: number, cue: MovementCue): void {
    if (!Number.isFinite(t) || !isMovementCue(cue)) return;
    const event = { actorId, t, cue: copyMovementCue(cue) };
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, event);
    if (this.queue.length > 256) this.queue.shift();
  }
  consume(renderTimeMs: number, emit: (actorId: string, cue: MovementCue) => void): void {
    while (this.queue.length && this.queue[0].t <= renderTimeMs) {
      const event = this.queue.shift()!;
      const age = (renderTimeMs - event.t) / 1000;
      if (age <= 0.5) emit(event.actorId, { ...event.cue, age });
    }
  }
  clear(actorId?: string): void {
    if (actorId === undefined) this.queue.length = 0;
    else this.queue = this.queue.filter((e) => e.actorId !== actorId);
  }
}
