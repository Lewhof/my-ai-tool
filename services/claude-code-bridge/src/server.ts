import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import { timingSafeEqual, createHmac } from 'node:crypto';
import { createSession, destroySession, emit, getSession, runSession, answerApproval, type ControlEvent } from './sessions.js';

const PORT = Number(process.env.PORT ?? 8787);
const SHARED_SECRET = process.env.BRIDGE_SECRET ?? '';

if (!SHARED_SECRET) {
  console.error('BRIDGE_SECRET env var is required.');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY env var is required.');
  process.exit(1);
}

// HMAC-Bearer auth. Dashboard signs `${timestamp}:${session_id}` with the
// shared secret; server verifies the signature and the freshness window.
function verifyAuth(req: IncomingMessage): boolean {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length);
  const [tsStr, sessionId, sigHex] = token.split(':');
  if (!tsStr || !sessionId || !sigHex) return false;

  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > 60_000) return false; // 1-min freshness

  const expected = createHmac('sha256', SHARED_SECRET).update(`${tsStr}:${sessionId}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sigHex));
  } catch {
    return false;
  }
}

function json(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const httpServer = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    json(res, 400, { error: 'bad request' });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, uptime_s: Math.round(process.uptime()) });
    return;
  }

  // POST /sessions — start a new sandboxed Agent SDK run.
  if (req.method === 'POST' && req.url === '/sessions') {
    if (!verifyAuth(req)) { json(res, 401, { error: 'unauthorized' }); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed: { repoUrl?: string; branch?: string } = {};
    try { parsed = JSON.parse(body || '{}'); } catch { /* ignore */ }
    try {
      const session = await createSession(parsed);
      json(res, 200, { session_id: session.id, cwd: session.sandbox.cwd });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : 'create failed' });
    }
    return;
  }

  // DELETE /sessions/:id — tear down a session and clean up its sandbox.
  if (req.method === 'DELETE' && req.url.startsWith('/sessions/')) {
    if (!verifyAuth(req)) { json(res, 401, { error: 'unauthorized' }); return; }
    const id = req.url.split('/')[2];
    await destroySession(id);
    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { error: 'not found' });
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  if (!req.url) { socket.destroy(); return; }
  // Path: /ws/:session_id
  const match = req.url.match(/^\/ws\/([^/?]+)/);
  if (!match) { socket.destroy(); return; }
  if (!verifyAuth(req)) { socket.destroy(); return; }

  const sessionId = match[1];
  const session = getSession(sessionId);
  if (!session) { socket.destroy(); return; }

  wss.handleUpgrade(req, socket, head, (ws) => {
    session.ws = ws;
    ws.on('message', async (raw) => {
      let event: ControlEvent;
      try { event = JSON.parse(raw.toString()); } catch { return; }
      if (event.type === 'spawn') {
        // Fire-and-forget; runSession owns the rest of the protocol.
        runSession(session, event).catch((err) => {
          emit(session, { type: 'error', message: err instanceof Error ? err.message : 'run failed' });
        });
      } else if (event.type === 'tool_approve') {
        answerApproval(session, event.id, true);
      } else if (event.type === 'tool_deny') {
        answerApproval(session, event.id, false);
      } else if (event.type === 'cancel') {
        destroySession(sessionId);
      }
    });
    ws.on('close', () => {
      session.ws = null;
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`claude-code-bridge listening on :${PORT}`);
});
