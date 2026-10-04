import type { ExitPolicy } from './game/arcade';

const KEY = 'agent-deathmatch-controller';
let pairing: Promise<void> | undefined;
export async function pairBrowser() {
  if (pairing) return pairing;
  pairing = (async () => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const ticket = params.get('pair');
    if (!ticket) return;
    // Remove one-time credentials from history before making any other request.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const response = await fetch('/api/arena/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) });
    if (!response.ok) throw new Error('Pairing expired. Open Arena again from Codex.');
    const { token } = await response.json();
    window.sessionStorage.setItem(KEY, token);
  })();
  return pairing;
}
export function controllerToken() { return window.sessionStorage.getItem(KEY) ?? undefined; }
async function request(route: string, body?: object) {
  const token = controllerToken();
  if (!token) return null;
  const response = await fetch(`/api/arena${route}`, { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Codex integration HTTP ${response.status}`);
  return response.json();
}
function createAttemptId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Public HTTP/LAN origins lack randomUUID; getRandomValues still provides secure randomness.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function beginArena(policy: ExitPolicy) {
  const requestedAt = Date.now();
  try { await pairBrowser(); } catch { /* An unavailable monitor must not disable Play. */ }
  const attemptId = createAttemptId();
  const token = controllerToken();
  if (token) {
    try { await request('/begin', { attemptId, policy, requestedAt }); }
    catch (error) {
      if (error instanceof Error && error.message.endsWith('409')) throw new Error('This Codex controller already has an active visit.');
      return { attemptId, controllerToken: undefined };
    }
  }
  return { attemptId, controllerToken: token };
}
export async function integrationState() { await pairBrowser(); return request('/state'); }
export async function returnToCodex(visitId: string) {
  const result = await request('/handoff', { visitId });
  if (!result) throw new Error('Desktop companion unpaired');
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    const state = await request('/state');
    if (state?.active?.visitId !== visitId) throw new Error('A later visit replaced this return');
    if (state.active.handoffResult === 'complete') return result;
    if (state.active.handoffResult === 'failed') throw new Error('Desktop activation failed');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Desktop companion did not acknowledge return');
}
export async function endArena(attemptId: string) { return request('/end', { attemptId }); }
