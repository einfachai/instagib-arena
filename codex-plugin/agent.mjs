// Only these two identities can enter the URL, select an adapter or app target.
const requested = process.argv.find(arg => arg.startsWith('--agent='))?.slice(8) ?? process.env.AGENT_DEATHMATCH_AGENT;
export const agent = requested === 'claude' ? 'claude' : 'codex';
export const agentName = agent === 'claude' ? 'Claude Code' : 'Codex';
export function arenaUrl(origin, host = agent, ticket) {
  const url = new URL('/play', origin);
  url.searchParams.set('agent', host === 'claude' ? 'claude' : 'codex');
  if (ticket) url.hash = new URLSearchParams({ pair: ticket }).toString();
  return url.href;
}
// Preserve the launching app, not a task-supplied arbitrary command or URL.
export function returnTarget(env = process.env) {
  const apps = { Apple_Terminal: 'terminal', 'iTerm.app': 'iterm', vscode: 'vscode', WezTerm: 'wezterm', ghostty: 'ghostty' };
  const overrides = ['terminal', 'iterm', 'vscode', 'wezterm', 'ghostty', 'claude'];
  if (overrides.includes(env.AGENT_DEATHMATCH_RETURN_APP)) return env.AGENT_DEATHMATCH_RETURN_APP;
  if (apps[env.TERM_PROGRAM]) return apps[env.TERM_PROGRAM];
  return env.WT_SESSION ? 'windows-terminal' : 'claude';
}
