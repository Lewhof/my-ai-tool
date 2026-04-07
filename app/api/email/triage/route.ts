import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { getMicrosoftToken } from '@/lib/microsoft-token';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const token = await getMicrosoftToken(userId);
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 });

  // Get latest unread emails
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=15&$filter=isRead eq false&$orderby=receivedDateTime desc&$select=id,subject,from,bodyPreview,importance,receivedDateTime',
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return Response.json({ error: 'Failed to fetch emails' }, { status: 500 });

  const data = await res.json();
  const emails = data.value ?? [];

  if (emails.length === 0) return Response.json({ triaged: [], summary: 'No unread emails.' });

  const emailList = emails.map((e: Record<string, unknown>, i: number) => {
    const from = (e.from as Record<string, Record<string, string>>)?.emailAddress;
    return `${i + 1}. From: ${from?.name || from?.address || 'unknown'} | Subject: ${e.subject} | Preview: ${(e.bodyPreview as string)?.slice(0, 100)}`;
  }).join('\n');

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 800,
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

    const result = triaged.map((t) => {
      const email = emails[t.index - 1];
      if (!email) return null;
      const from = (email.from as Record<string, Record<string, string>>)?.emailAddress;
      return {
        id: email.id,
        subject: email.subject,
        from: from?.name || from?.address || 'unknown',
        category: t.category,
        summary: t.summary,
        date: email.receivedDateTime,
      };
    }).filter(Boolean);

    const important = result.filter((r) => r?.category === 'IMPORTANT').length;
    const canWait = result.filter((r) => r?.category === 'CAN_WAIT').length;
    const fyi = result.filter((r) => r?.category === 'FYI').length;

    return Response.json({
      triaged: result,
      summary: `${emails.length} unread: ${important} important, ${canWait} can wait, ${fyi} FYI`,
    });
  } catch {
    return Response.json({ error: 'AI triage failed', raw: text }, { status: 500 });
  }
}
