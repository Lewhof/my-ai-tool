import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getMicrosoftToken } from '@/lib/microsoft-token';
import { getMessageDetail } from '@/lib/google-gmail';

// MIME parsing for Gmail bodies uses Node Buffer.
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const url = new URL(req.url);
  const accountIdParam = url.searchParams.get('account_id') || undefined;

  // If accountId was provided, branch on its provider directly. Otherwise we
  // need to iterate connected accounts to find which one owns this message id.
  let providerHint: string | null = null;
  if (accountIdParam) {
    const { data } = await supabaseAdmin
      .from('calendar_accounts')
      .select('provider')
      .eq('id', accountIdParam)
      .eq('user_id', userId)
      .maybeSingle();
    providerHint = data?.provider ?? null;
  }

  // ── Gmail branch ──
  if (providerHint === 'google') {
    const detail = await getMessageDetail(userId, accountIdParam!, id);
    if (!detail) return Response.json({ error: 'Email not found' }, { status: 404 });
    return Response.json({
      id: detail.id,
      subject: detail.subject,
      from: detail.from,
      to: detail.to,
      date: detail.date,
      body: detail.body,
      bodyType: detail.bodyType,
      importance: detail.importance,
      hasAttachments: detail.hasAttachments,
    });
  }

  // ── Microsoft branch (existing) ──
  async function tryFetchMicrosoft(accountId?: string): Promise<Response | null> {
    const token = await getMicrosoftToken(userId!, accountId);
    if (!token) return null;
    return fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${id}?$select=id,subject,from,toRecipients,receivedDateTime,body,importance,hasAttachments`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  // Gmail message ids are 16 hex chars (e.g. `19a8b3c4d5e6f7a8`); Microsoft
  // Graph ids are long base64-ish blobs. Skip the Graph fallback iteration
  // for Gmail-shaped ids — saves wasted token refreshes + Graph 404s.
  const looksLikeGmail = /^[0-9a-f]{14,20}$/i.test(id);

  let res: Response | null = null;
  if (!looksLikeGmail) {
    if (accountIdParam && (providerHint === 'microsoft' || providerHint === 'microsoft-work')) {
      res = await tryFetchMicrosoft(accountIdParam);
    }

    // Iterate Microsoft accounts (the email may belong to a different connected
    // mailbox than the active inbox — happens with the All Inboxes view).
    if (!res || !res.ok) {
      const { data: accounts } = await supabaseAdmin
        .from('calendar_accounts')
        .select('id, provider')
        .eq('user_id', userId)
        .in('provider', ['microsoft', 'microsoft-work']);

      for (const account of accounts ?? []) {
        if (account.id === accountIdParam) continue;
        const candidate = await tryFetchMicrosoft(account.id);
        if (candidate && candidate.ok) {
          res = candidate;
          break;
        }
      }
    }
  }

  // ── Gmail fallback (account_id wasn't provided / wasn't Google) ──
  // If we didn't have an account_id but the message id belongs to Gmail,
  // iterate Google accounts that have gmail.readonly scope.
  if (!res || !res.ok) {
    const { data: googleAccounts } = await supabaseAdmin
      .from('calendar_accounts')
      .select('id, scopes')
      .eq('user_id', userId)
      .eq('provider', 'google');

    for (const acc of googleAccounts ?? []) {
      const scopes = (acc.scopes as string[] | null) ?? [];
      if (!scopes.includes('https://www.googleapis.com/auth/gmail.readonly')) continue;
      const detail = await getMessageDetail(userId, acc.id, id);
      if (detail) {
        return Response.json({
          id: detail.id,
          subject: detail.subject,
          from: detail.from,
          to: detail.to,
          date: detail.date,
          body: detail.body,
          bodyType: detail.bodyType,
          importance: detail.importance,
          hasAttachments: detail.hasAttachments,
        });
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
