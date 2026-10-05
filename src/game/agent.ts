/** Cosmetic identity only; never grants capabilities or changes combat rules. */
export type AgentKind = 'codex' | 'claude';
export function parseAgent(value: unknown): AgentKind | undefined {
  return value === 'codex' || value === 'claude' ? value : undefined;
}
