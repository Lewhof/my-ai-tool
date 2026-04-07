import { auth } from '@clerk/nextjs/server';
import { getMicrosoftToken } from '@/lib/microsoft-token';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const token = await getMicrosoftToken(userId);
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 });

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${id}?$select=id,subject,from,toRecipients,receivedDateTime,body,importance,hasAttachments`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return Response.json({ error: 'Failed to fetch email' }, { status: res.status });

  const email = await res.json();
  return Response.json({
    id: email.id,
    subject: email.subject,
    from: {
      name: email.from?.emailAddress?.name || '',
      email: email.from?.emailAddress?.address || '',
    },
    to: (email.toRecipients ?? []).map((r: Record<string, Record<string, string>>) => ({
      name: r.emailAddress?.name || '',
      email: r.emailAddress?.address || '',
    })),
    date: email.receivedDateTime,
    body: email.body?.content || '',
    bodyType: email.body?.contentType || 'text',
    importance: email.importance,
    hasAttachments: email.hasAttachments,
  });
}
