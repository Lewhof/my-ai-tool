import { auth } from '@clerk/nextjs/server';
import { getMicrosoftToken } from '@/lib/microsoft-token';
import { listInboxMessages } from '@/lib/google-gmail';
import { supabaseAdmin } from '@/lib/supabase-server';

// MIME parsing for Gmail bodies uses Node Buffer — pin the route to Node
// runtime so it doesn't accidentally land on Edge.
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const folder = (url.searchParams.get('folder') || 'inbox') as 'inbox' | 'sent' | 'drafts' | 'archive';
  // Cap the requested limit so a stray client (or hostile caller) can't
  // amplify into hundreds of Gmail GET calls per request.
  const rawLimit = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 20, 50));
  const accountId = url.searchParams.get('account_id') || undefined;

  // Look up the account row so we can branch on provider.
  let account: { id: string; provider: string; label: string; alias: string | null; email: string } | null = null;
  if (accountId) {
    const { data } = await supabaseAdmin
      .from('calendar_accounts')
      .select('id, provider, label, alias, email')
      .eq('id', accountId)
      .eq('user_id', userId)
      .maybeSingle();
    account = data;
  }

  const provider = account?.provider;

  if (provider === 'google') {
    const messages = await listInboxMessages(userId, account!.id, { folder, limit });
    if (messages === null) {
      return Response.json({ connected: false, emails: [], error: 'Gmail not connected for this account' });
    }
    return Response.json({
      connected: true,
      emails: messages,
      account: account ? { label: account.label, alias: account.alias, email: account.email } : null,
    });
  }

  // Default + 'microsoft' / 'microsoft-work' branch (existing path).
  const token = await getMicrosoftToken(userId, accountId);
  if (!token) return Response.json({ connected: false, emails: [] });

  const folderMap: Record<string, string> = {
    inbox: 'inbox',
    sent: 'sentitems',
    drafts: 'drafts',
    archive: 'archive',
  };
  const graphFolder = folderMap[folder] || 'inbox';

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/${graphFolder}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,bodyPreview,importance,hasAttachments`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      return Response.json({ connected: true, emails: [], error: `Graph API error ${res.status}` });
    }

    const data = await res.json();
    const emails = (data.value ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      subject: e.subject || '(no subject)',
      from: {
        name: (e.from as Record<string, Record<string, string>>)?.emailAddress?.name || '',
        email: (e.from as Record<string, Record<string, string>>)?.emailAddress?.address || '',
      },
      date: e.receivedDateTime,
      isRead: e.isRead,
      preview: e.bodyPreview,
      importance: e.importance,
      hasAttachments: e.hasAttachments,
    }));

    return Response.json({
      connected: true,
      emails,
      account: account ? { label: account.label, alias: account.alias, email: account.email } : null,
    });
  } catch {
    return Response.json({ connected: true, emails: [], error: 'Failed to fetch emails' });
  }
}
