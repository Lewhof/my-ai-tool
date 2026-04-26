import { createHmac } from 'node:crypto';

// Server-side helpers for talking to the Xneelo-hosted claude-code-bridge.
// Browser code never imports this — the dashboard proxies through
// /api/cerebro/build/* so the shared HMAC secret stays in Vercel's env.

const BRIDGE_URL = process.env.CLAUDE_CODE_BRIDGE_URL?.replace(/\/$/, '') ?? '';
const BRIDGE_SECRET = process.env.CLAUDE_CODE_BRIDGE_SECRET ?? '';

export function bridgeConfigured(): boolean {
  return !!(BRIDGE_URL && BRIDGE_SECRET);
}

export function signedToken(sessionId: string): string {
  if (!BRIDGE_SECRET) throw new Error('CLAUDE_CODE_BRIDGE_SECRET not set');
  const ts = Date.now();
  const sig = createHmac('sha256', BRIDGE_SECRET).update(`${ts}:${sessionId}`).digest('hex');
  return `${ts}:${sessionId}:${sig}`;
}

export interface CreateSessionResult {
  session_id: string;
  cwd: string;
  ws_url: string;
  bearer: string;
}

export async function createBridgeSession(opts: { repoUrl?: string; branch?: string } = {}): Promise<CreateSessionResult> {
  if (!bridgeConfigured()) throw new Error('Bridge not configured (CLAUDE_CODE_BRIDGE_URL/SECRET)');
  // We don't yet have a session id at this point — the bridge issues one.
  // For the create call we sign against an empty session id.
  const initBearer = signedToken('init');
  const res = await fetch(`${BRIDGE_URL}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${initBearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Bridge /sessions failed: ${res.status} ${await res.text().catch(() => '')}`);
  const data = await res.json() as { session_id: string; cwd: string };

  const wsBase = BRIDGE_URL.replace(/^http/, 'ws');
  const wsBearer = signedToken(data.session_id);
  return {
    session_id: data.session_id,
    cwd: data.cwd,
    ws_url: `${wsBase}/ws/${data.session_id}`,
    bearer: wsBearer,
  };
}

export async function destroyBridgeSession(sessionId: string): Promise<void> {
  if (!bridgeConfigured()) return;
  const bearer = signedToken(sessionId);
  await fetch(`${BRIDGE_URL}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${bearer}` },
  }).catch(() => { /* best-effort cleanup */ });
}
