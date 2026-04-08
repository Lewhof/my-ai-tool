import { auth } from '@clerk/nextjs/server';
import { getMicrosoftToken } from '@/lib/microsoft-token';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const folder = url.searchParams.get('folder') || 'inbox';
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const accountId = url.searchParams.get('account_id') || undefined;

  const token = await getMicrosoftToken(userId, accountId);
  if (!token) return Response.json({ connected: false, emails: [] });

  // Get account info for display
  let accountInfo: { label: string; alias: string; email: string } | null = null;
  if (accountId) {
    const { data } = await supabaseAdmin
      .from('calendar_accounts')
      .select('label, alias, email')
      .eq('id', accountId)
      .single();
    accountInfo = data;
  }

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

    return Response.json({ connected: true, emails, account: accountInfo });
  } catch {
    return Response.json({ connected: true, emails: [], error: 'Failed to fetch emails' });
  }
}
