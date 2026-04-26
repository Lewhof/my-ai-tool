import { auth } from '@clerk/nextjs/server';
import { createBridgeSession, bridgeConfigured } from '@/lib/claude-code-bridge';

// Browser → Next.js → bridge. Returns the WebSocket URL + a short-lived
// bearer token the browser can use to connect directly to the sidecar.
// We sign the bearer here so the shared secret never leaves the server.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  if (!bridgeConfigured()) {
    return Response.json({
      error: 'Claude Code bridge not configured. Set CLAUDE_CODE_BRIDGE_URL and CLAUDE_CODE_BRIDGE_SECRET.',
    }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const repoUrl = typeof body.repoUrl === 'string' ? body.repoUrl : undefined;
  const branch = typeof body.branch === 'string' ? body.branch : undefined;

  try {
    const session = await createBridgeSession({ repoUrl, branch });
    return Response.json(session);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to create session' },
      { status: 502 }
    );
  }
}
