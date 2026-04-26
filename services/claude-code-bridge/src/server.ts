import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import { timingSafeEqual, createHmac } from 'node:crypto';
import { createSession, destroySession, emit, getSession, runSession, answerApproval, listSessions, type ControlEvent } from './sessions.js';

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
//
// Token transport priority:
//  1. Authorization: Bearer <token>   — used by HTTP POST/DELETE
//  2. Sec-WebSocket-Protocol: bearer.<token>  — used by browser WS upgrade
//     (browsers cannot set Authorization on `new WebSocket()`; subprotocol
//      values aren't logged by default by most reverse proxies, unlike
//      query strings)
function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);

  // Subprotocol form: "bearer.<ts>.<sid>.<sig>" — dots not colons because
  // the WebSocket protocol forbids some token characters.
  const proto = req.headers['sec-websocket-protocol'];
  if (typeof proto === 'string') {
    const protocols = proto.split(',').map(p => p.trim());
    const bearer = protocols.find(p => p.startsWith('bearer.'));
    if (bearer) return bearer.slice('bearer.'.length).replace(/\./g, ':');
  }
  return null;
}

function verifyAuth(req: IncomingMessage): boolean {
  const token = extractToken(req);
  if (!token) return false;
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

// Validate a git repo URL before passing to `git clone`. Blocks file://,
// ext::, ssh:// and CVE-2017-1000117-family URL forms; allowlists the
// hosts we expect users to actually clone from.
function isAllowedRepoUrl(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  const allowed = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org'];
  return allowed.some(h => host === h || host.endsWith('.' + h));
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
    if (parsed.repoUrl && !isAllowedRepoUrl(parsed.repoUrl)) {
      json(res, 400, { error: 'repoUrl not allowed (https only, github/gitlab/bitbucket/codeberg)' });
      return;
    }
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

// `handleProtocols` echoes the client's bearer subprotocol back so the
// browser's `new WebSocket(url, [protocol])` call completes the handshake.
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => {
    for (const p of protocols) {
      if (p.startsWith('bearer.')) return p;
    }
    return false;
  },
});

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

    // Heartbeat: ping every 30s, terminate if no pong twice in a row.
    let alive = true;
    ws.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => {
      if (!alive) {
        try { ws.terminate(); } catch { /* ignore */ }
        clearInterval(heartbeat);
        return;
      }
      alive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }, 30_000);

    ws.on('message', async (raw) => {
      let event: ControlEvent;
      try { event = JSON.parse(raw.toString()); } catch { return; }
      if (event.type === 'spawn') {
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
      clearInterval(heartbeat);
      session.ws = null;
      // If the run already finished, free the sandbox. Otherwise the idle
      // reaper will clean it up after the inactivity window.
      if (session.status === 'completed' || session.status === 'errored') {
        destroySession(sessionId).catch(() => { /* best-effort */ });
      }
    });
  });
});

// Idle-session reaper. Sessions that haven't touched the WS in 30 minutes
// get torn down so disk + UUIDs don't leak forever.
const IDLE_TIMEOUT_MS = 30 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const s of listSessions()) {
    if (s.ws) continue;                             // active connection
    if (s.status === 'running') continue;           // mid-spawn but no WS
    if (now - s.spawnedAt > IDLE_TIMEOUT_MS) {
      void destroySession(s.id).catch(() => { /* ignore */ });
    }
  }
}, 5 * 60_000);

httpServer.listen(PORT, () => {
  console.log(`claude-code-bridge listening on :${PORT}`);
});
