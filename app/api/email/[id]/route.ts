import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getMicrosoftToken } from '@/lib/microsoft-token';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const url = new URL(req.url);
  const accountIdParam = url.searchParams.get('account_id') || undefined;

  // Helper: try to fetch the email with a given account's token
  async function tryFetch(accountId?: string): Promise<Response | null> {
    const token = await getMicrosoftToken(userId!, accountId);
    if (!token) return null;
    return fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${id}?$select=id,subject,from,toRecipients,receivedDateTime,body,importance,hasAttachments`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  // 1. If accountId was provided, try that first
  let res: Response | null = null;
  if (accountIdParam) {
    res = await tryFetch(accountIdParam);
  }

  // 2. If no accountId or it failed (e.g. email is from another account),
  //    iterate through all Microsoft accounts until we find one that has the email
  if (!res || !res.ok) {
    const { data: accounts } = await supabaseAdmin
      .from('calendar_accounts')
      .select('id, provider')
      .eq('user_id', userId)
      .in('provider', ['microsoft', 'microsoft-work']);

    for (const account of accounts ?? []) {
      if (account.id === accountIdParam) continue; // already tried
      const candidate = await tryFetch(account.id);
      if (candidate && candidate.ok) {
        res = candidate;
        break;
      }
    }
  }

  if (!res || !res.ok) {
    return Response.json({ error: 'Email not found in any connected account' }, { status: 404 });
  }

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
