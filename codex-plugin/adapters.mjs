import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const id = value => typeof value === 'string' && /^[\w:./-]{1,200}$/.test(value) ? value : null;

// Never forward prompts, transcripts, tool arguments, cwd, or CLI credentials.
export function normalizeNotification(payload, source = 'local', now = Date.now()) {
  if (payload?.type !== 'agent-turn-complete' || payload.subagent || payload['parent-thread-id']) return null;
  const taskId = id(payload['thread-id']);
  const turnId = id(payload['turn-id']);
  if (!taskId || !turnId) return null;
  return { eventId: `${source}:${taskId}:${turnId}:completion`, source, taskId,
    category: 'completion', occurredAt: now,
    ...(source === 'local' ? { taskLink: `codex://threads/${taskId}` } : {}) };
}

export function normalizeHook(payload, source = 'local', now = Date.now()) {
  if (!payload || payload.subagent || payload.parent_thread_id) return null;
  const taskId = id(payload.session_id ?? payload.thread_id);
  const turnId = id(payload.turn_id);
  if (!taskId || !turnId) return null;
  let category;
  if (payload.hook_event_name === 'PermissionRequest') category = 'approval-required';
  if (payload.hook_event_name === 'PreToolUse' &&
      /(^|__|\.)request_user_input(_async)?$/.test(payload.tool_name ?? '')) category = 'input-required';
  // Stop, SubagentStop, PostToolUse and individual nonzero tool exits are deliberately ignored.
  if (!category) return null;
  return { eventId: `${source}:${taskId}:${turnId}:${category}:${id(payload.tool_use_id) ?? ''}`,
    source, taskId, category, occurredAt: now,
    ...(source === 'local' ? { taskLink: `codex://threads/${taskId}` } : {}) };
}

export function cloudCategory(status) {
  // The CLI serializes TaskStatus as these lowercase values; unknown values degrade
  // gracefully instead of interpreting an intermediate state as completion.
  if (['ready', 'completed', 'complete'].includes(status)) return 'completion';
  if (['error', 'failed'].includes(status)) return 'terminal-error';
  if (['waiting_for_approval', 'approval_required'].includes(status)) return 'approval-required';
  if (['waiting_for_input', 'input_required', 'needs_attention'].includes(status)) return 'input-required';
  return null;
}

export class CloudMonitor {
  previous = new Map();
  baseline = false;
  scanning = false;
  constructor({ run = execute, cli = 'codex', onEvent = async () => {}, onStatus = () => {} } = {}) {
    Object.assign(this, { run, cli, onEvent, onStatus });
  }
  async scan() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const tasks = [];
      let cursor;
      const seenCursors = new Set();
      do {
        const args = ['cloud', 'list', '--json', '--limit', '20'];
        if (cursor) args.push('--cursor', cursor);
        const { stdout } = await this.run(this.cli, args, { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
        const page = JSON.parse(stdout);
        if (!Array.isArray(page.tasks)) throw new Error('Unsupported Cloud CLI response');
        tasks.push(...page.tasks);
        cursor = page.cursor;
        if (cursor && (typeof cursor !== 'string' || seenCursors.has(cursor))) throw new Error('Repeated Cloud cursor');
        if (cursor) seenCursors.add(cursor);
        if (seenCursors.size > 500) throw new Error('Cloud pagination limit');
      } while (cursor);
      const next = new Map();
      for (const task of tasks) {
        const taskId = id(task.id);
        if (!taskId || typeof task.status !== 'string') continue;
        const revision = `${task.status}:${task.updated_at ?? ''}:${task.attempt_total ?? ''}`;
        const prior = this.previous.get(taskId);
        next.set(taskId, { revision, status: task.status, attempt: task.attempt_total });
        const category = cloudCategory(task.status);
        if (!this.baseline || !category || prior?.revision === revision) continue;
        // Editing a completed task's metadata isn't another completion. A new
        // attempt, or a transition from running/to another attention category is.
        if (prior && cloudCategory(prior.status) === category && prior.attempt === task.attempt_total) continue;
        const occurredAt = Date.parse(task.updated_at);
        if (!Number.isFinite(occurredAt)) continue;
        const taskLink = typeof task.url === 'string' && /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(task.url) ? task.url : undefined;
        await this.onEvent({ eventId: `cloud:${taskId}:${revision}`, source: 'cloud', taskId, category, occurredAt,
          ...(taskLink ? { taskLink } : {}) });
      }
      // Commit a baseline only after every page succeeds. Failed scans cannot
      // make historical completions look like new ones on recovery.
      this.previous = next;
      this.baseline = true;
      this.onStatus('healthy');
    } catch (error) {
      this.onStatus('degraded', error.message);
    } finally { this.scanning = false; }
  }
}

export function normalizeClaudeHook(payload, now = Date.now(), nonce = String(now)) {
  if (!payload || payload.agent_id || payload.subagent || payload.parent_thread_id) return null;
  const taskId = id(payload.session_id);
  if (!taskId) return null;
  let category;
  if (payload.hook_event_name === 'Stop' && !payload.stop_hook_active) category = 'completion';
  if (payload.hook_event_name === 'Notification' && payload.notification_type === 'permission_prompt') category = 'approval-required';
  if (payload.hook_event_name === 'PreToolUse' && payload.tool_name === 'AskUserQuestion') category = 'input-required';
  if (!category) return null;
  return { eventId: `claude:${taskId}:${nonce}:${category}`, source: 'local', taskId, category, occurredAt: now };
}

export function handoffCommand(event, platform = process.platform, host = 'codex', target = 'claude') {
  if (host === 'claude') {
    if (platform === 'darwin') {
      const bundles = { terminal: 'com.apple.Terminal', iterm: 'com.googlecode.iterm2', vscode: 'com.microsoft.VSCode',
        wezterm: 'com.github.wez.wezterm', ghostty: 'com.mitchellh.ghostty', claude: 'com.anthropic.claudefordesktop' };
      if (!bundles[target]) throw new Error('Unsupported Claude return app');
      return ['open', ['-b', bundles[target]]];
    }
    if (platform === 'win32') {
      const title = target === 'vscode' ? 'Visual Studio Code' : target === 'claude' ? 'Claude' : 'Windows Terminal';
      return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$app = New-Object -ComObject WScript.Shell; if (-not $app.AppActivate('${title}')) { exit 1 }`]];
    }
    // Linux desktop environments have no universal window activation API.
    // Report failure and keep the manual-return action available.
    throw new Error('Automatic Claude return is unavailable on this desktop');
  }
  const localLink = event?.source === 'local' && /^codex:\/\/threads\/[\w-]+$/.test(event.taskLink ?? '') ? event.taskLink : null;
  if (platform === 'darwin') return ['open', localLink ? [localLink] : ['-b', 'com.openai.codex']];
  if (platform === 'win32') return ['cmd.exe', ['/d', '/c', 'start', '', localLink ?? 'codex://']];
  return ['xdg-open', [localLink ?? 'codex://']];
}
