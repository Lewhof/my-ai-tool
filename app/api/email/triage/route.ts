import { auth } from '@clerk/nextjs/server';
import { runEmailTriage } from '@/lib/email-triage';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const result = await runEmailTriage(userId);

  switch (result.kind) {
    case 'not_connected':
      return Response.json({ error: 'Not connected' }, { status: 400 });
    case 'no_unread':
      return Response.json({ triaged: [], summary: 'No unread emails.' });
    case 'ai_failed':
      return Response.json({ error: 'AI triage failed', raw: result.raw }, { status: 500 });
    case 'ok':
      return Response.json({ triaged: result.triaged, summary: result.summary });
  }
}
