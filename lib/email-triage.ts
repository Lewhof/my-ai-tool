import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { getMicrosoftToken } from '@/lib/microsoft-token';

export type TriagedEmail = {
  id: string;
  subject: string;
  from: string;
  accountLabel: string;
  category: 'IMPORTANT' | 'CAN_WAIT' | 'FYI';
  summary: string;
  date: string;
};

export type TriageResult =
  | { kind: 'ok'; triaged: TriagedEmail[]; summary: string }
  | { kind: 'not_connected' }
  | { kind: 'no_unread' }
  | { kind: 'ai_failed'; raw: string };

export async function runEmailTriage(userId: string): Promise<TriageResult> {
  const { data: accounts } = await supabaseAdmin
    .from('calendar_accounts')
    .select('id, label, alias, provider')
    .eq('user_id', userId)
    .in('provider', ['microsoft', 'microsoft-work']);

  if (!accounts || accounts.length === 0) return { kind: 'not_connected' };

  type RawEmail = {
    id: string;
    subject: string;
    from?: { emailAddress?: { name?: string; address?: string } };
    bodyPreview?: string;
    receivedDateTime: string;
    accountLabel: string;
  };

  const perAccount = Math.max(8, Math.floor(20 / accounts.length));
  const results = await Promise.all(
    accounts.map(async (account): Promise<RawEmail[]> => {
      try {
        const token = await getMicrosoftToken(userId, account.id);
        if (!token) return [];

        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${perAccount}&$filter=isRead eq false&$orderby=receivedDateTime desc&$select=id,subject,from,bodyPreview,importance,receivedDateTime`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return [];
        const data = await res.json();
        const label = account.alias || account.label || 'Email';
        return (data.value ?? []).map((e: Record<string, unknown>) => ({
          ...e,
          accountLabel: label,
        })) as RawEmail[];
      } catch {
        return [];
      }
    })
  );

  const emails = results.flat()
    .sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime())
    .slice(0, 20);

  if (emails.length === 0) return { kind: 'no_unread' };

  const emailList = emails.map((e, i) => {
    const from = e.from?.emailAddress;
    return `${i + 1}. [${e.accountLabel}] From: ${from?.name || from?.address || 'unknown'} | Subject: ${e.subject} | Preview: ${(e.bodyPreview ?? '').slice(0, 100)}`;
  }).join('\n');

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Triage these emails into categories. For each email return its index and category.

Categories:
- IMPORTANT: Needs immediate attention (action required, urgent requests, from boss/client)
- CAN_WAIT: Needs attention but not urgent (updates, follow-ups, non-critical requests)
- FYI: Informational only (newsletters, notifications, auto-emails, marketing)

Also provide a one-line summary for each email.

Emails:
${emailList}

Respond with ONLY valid JSON array: [{"index": 1, "category": "IMPORTANT", "summary": "..."}]`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON');

    const triaged = JSON.parse(jsonMatch[0]) as Array<{ index: number; category: string; summary: string }>;

    const result = triaged.map((t): TriagedEmail | null => {
      const email = emails[t.index - 1];
      if (!email) return null;
      const from = email.from?.emailAddress;
      const category = (t.category === 'IMPORTANT' || t.category === 'CAN_WAIT' || t.category === 'FYI')
        ? t.category
        : 'FYI';
      return {
        id: email.id,
        subject: email.subject,
        from: from?.name || from?.address || 'unknown',
        accountLabel: email.accountLabel,
        category,
        summary: t.summary,
        date: email.receivedDateTime,
      };
    }).filter((r): r is TriagedEmail => r !== null);

    const important = result.filter((r) => r.category === 'IMPORTANT').length;
    const canWait = result.filter((r) => r.category === 'CAN_WAIT').length;
    const fyi = result.filter((r) => r.category === 'FYI').length;

    return {
      kind: 'ok',
      triaged: result,
      summary: `${emails.length} unread across ${accounts.length} account${accounts.length !== 1 ? 's' : ''}: ${important} important, ${canWait} can wait, ${fyi} FYI`,
    };
  } catch {
    return { kind: 'ai_failed', raw: text };
  }
}
