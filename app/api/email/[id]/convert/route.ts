import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getMicrosoftToken } from '@/lib/microsoft-token';

type ConvertBody = { target: 'task' | 'whiteboard' };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as ConvertBody;
  if (body.target !== 'task' && body.target !== 'whiteboard') {
    return Response.json({ error: 'target must be "task" or "whiteboard"' }, { status: 400 });
  }

  // Fetch email from Graph — iterate through all Microsoft accounts until one returns it
  const { data: accounts } = await supabaseAdmin
    .from('calendar_accounts')
    .select('id, provider')
    .eq('user_id', userId)
    .in('provider', ['microsoft', 'microsoft-work']);

  if (!accounts || accounts.length === 0) {
    return Response.json({ error: 'No Microsoft account connected' }, { status: 400 });
  }

  let emailData: {
    subject?: string;
    from?: { emailAddress?: { name?: string; address?: string } };
    bodyPreview?: string;
    body?: { content?: string; contentType?: string };
    webLink?: string;
  } | null = null;

  for (const account of accounts) {
    const token = await getMicrosoftToken(userId, account.id);
    if (!token) continue;
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${id}?$select=subject,from,bodyPreview,body,webLink`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      emailData = await res.json();
      break;
    }
  }

  if (!emailData) {
    return Response.json({ error: 'Email not found in any connected account' }, { status: 404 });
  }

  const subject = (emailData.subject ?? '(no subject)').slice(0, 200);
  const fromName = emailData.from?.emailAddress?.name ?? emailData.from?.emailAddress?.address ?? 'unknown';
  const preview = (emailData.bodyPreview ?? '').slice(0, 500);
  const description = `From: ${fromName}\n\n${preview}`.trim();

  if (body.target === 'task') {
    const { data, error } = await supabaseAdmin.from('todos').insert({
      user_id: userId,
      title: subject,
      description,
      status: 'todo',
      priority: 'medium',
      bucket: 'Email',
      tags: ['email'],
    }).select('id, title').single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ id: data.id, title: data.title });
  }

  // whiteboard
  const { data, error } = await supabaseAdmin.from('whiteboard').insert({
    user_id: userId,
    title: subject,
    description,
    tags: ['email'],
  }).select('id, title').single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: data.id, title: data.title });
}
