import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { createSandbox, type Sandbox } from './sandbox.js';

// Streaming events sent from the sidecar to the dashboard.
export type StreamEvent =
  | { type: 'ready'; sessionId: string; cwd: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_request'; id: string; tool: string; input: unknown; requires_approval: boolean }
  | { type: 'tool_result'; id: string; output: unknown; ok: boolean }
  | { type: 'file_diff'; path: string; hunks: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; text: string }
  | { type: 'done'; exit_code: number; summary: string }
  | { type: 'error'; message: string };

// Inbound events from the dashboard to the sidecar.
export type ControlEvent =
  | { type: 'spawn'; prompt: string; allowed_tools?: string[]; budget_tokens?: number }
  | { type: 'tool_approve'; id: string }
  | { type: 'tool_deny'; id: string; reason?: string }
  | { type: 'cancel' };

export interface Session {
  id: string;
  sandbox: Sandbox;
  ws: WebSocket | null;
  spawnedAt: number;
  status: 'idle' | 'running' | 'completed' | 'errored';
  pendingApprovals: Map<string, { resolve: (approve: boolean) => void }>;
}

const sessions = new Map<string, Session>();

const TOOLS_REQUIRING_APPROVAL = new Set(['Bash', 'Edit', 'Write', 'WebFetch', 'NotebookEdit']);
const DEFAULT_ALLOWED_TOOLS = ['Read', 'Glob', 'Grep', 'Bash', 'Edit', 'Write', 'WebFetch', 'WebSearch'];

export async function createSession(opts: { repoUrl?: string; branch?: string } = {}): Promise<Session> {
  const id = randomUUID();
  const sandbox = await createSandbox(id, opts);
  const session: Session = {
    id,
    sandbox,
    ws: null,
    spawnedAt: Date.now(),
    status: 'idle',
    pendingApprovals: new Map(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export async function destroySession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (!s) return;
  try { s.ws?.close(); } catch { /* ignore */ }
  await s.sandbox.cleanup().catch(() => { /* best-effort */ });
  sessions.delete(id);
}

export function emit(session: Session, event: StreamEvent): void {
  if (session.ws && session.ws.readyState === 1) {
    session.ws.send(JSON.stringify(event));
  }
}

// Wait for the dashboard to approve or deny a destructive tool.
function awaitApproval(session: Session, id: string, timeoutMs = 5 * 60_000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      session.pendingApprovals.delete(id);
      resolve(false);
    }, timeoutMs);
    session.pendingApprovals.set(id, {
      resolve: (approve: boolean) => {
        clearTimeout(timer);
        resolve(approve);
      },
    });
  });
}

// Spawn the Agent SDK against the session sandbox. The SDK's async
// generator is consumed and translated into StreamEvents.
export async function runSession(session: Session, control: Extract<ControlEvent, { type: 'spawn' }>): Promise<void> {
  if (session.status !== 'idle') {
    emit(session, { type: 'error', message: 'Session already started' });
    return;
  }
  session.status = 'running';

  const allowed = control.allowed_tools ?? DEFAULT_ALLOWED_TOOLS;
  emit(session, { type: 'ready', sessionId: session.id, cwd: session.sandbox.cwd });

  try {
    // Lazy import keeps the SDK off the hot path until a session actually
    // spawns. The package is large and the WS server should boot fast.
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const query = (sdk as unknown as { query: (opts: unknown) => AsyncIterable<unknown> }).query;
    if (typeof query !== 'function') {
      throw new Error('claude-agent-sdk: query() not found at expected export');
    }

    const stream = query({
      prompt: control.prompt,
      cwd: session.sandbox.cwd,
      allowedTools: allowed,
      maxTokens: control.budget_tokens,
    });

    for await (const raw of stream) {
      const event = raw as Record<string, unknown>;
      const kind = String(event.type ?? '');

      if (kind === 'text' || kind === 'content_block_delta') {
        const text = String(event.text ?? (event as { delta?: { text?: string } }).delta?.text ?? '');
        if (text) emit(session, { type: 'text_delta', text });
      } else if (kind === 'tool_use' || kind === 'tool_request') {
        const toolName = String(event.name ?? '');
        const toolId = String(event.id ?? randomUUID());
        const requiresApproval = TOOLS_REQUIRING_APPROVAL.has(toolName);
        emit(session, {
          type: 'tool_request',
          id: toolId,
          tool: toolName,
          input: event.input ?? {},
          requires_approval: requiresApproval,
        });
        if (requiresApproval) {
          const approved = await awaitApproval(session, toolId);
          if (!approved) {
            emit(session, { type: 'tool_result', id: toolId, output: { denied: true }, ok: false });
            // Best-effort cancel — SDK's API for mid-stream tool denial varies.
            break;
          }
        }
      } else if (kind === 'tool_result') {
        emit(session, {
          type: 'tool_result',
          id: String(event.tool_use_id ?? event.id ?? ''),
          output: event.content ?? event.output ?? null,
          ok: event.is_error !== true,
        });
      } else if (kind === 'log') {
        emit(session, { type: 'log', level: 'info', text: String(event.text ?? '') });
      }
    }

    session.status = 'completed';
    emit(session, { type: 'done', exit_code: 0, summary: 'Session completed' });
  } catch (err) {
    session.status = 'errored';
    emit(session, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// Resolve an in-flight approval gate.
export function answerApproval(session: Session, id: string, approve: boolean): boolean {
  const pending = session.pendingApprovals.get(id);
  if (!pending) return false;
  session.pendingApprovals.delete(id);
  pending.resolve(approve);
  return true;
}
