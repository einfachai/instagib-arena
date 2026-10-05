import { parseAgent, type AgentKind } from './game/agent';

const KEY = 'agent-deathmatch-agent';
function readAgent(): AgentKind | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const requested = parseAgent(params.get('agent'));
  try {
    // A new explicit launch replaces the tab's previous host identity.
    if (params.has('agent')) {
      if (parseAgent(window.sessionStorage.getItem(KEY)) !== requested) window.sessionStorage.removeItem('agent-deathmatch-controller');
      if (requested) window.sessionStorage.setItem(KEY, requested);
      else window.sessionStorage.removeItem(KEY);
      return requested;
    }
    return parseAgent(window.sessionStorage.getItem(KEY));
  } catch { return requested; }
}
export const pluginAgent = readAgent();
export const playerAgent: AgentKind = pluginAgent ?? 'codex';
export const agentLabel = pluginAgent === 'claude' ? 'Claude Code' : 'Codex';
