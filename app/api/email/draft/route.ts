import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { getMicrosoftToken } from '@/lib/microsoft-token';

// POST: Generate AI draft reply for an email
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { emailId, accountId, tone } = await req.json();
  if (!emailId) return Response.json({ error: 'emailId required' }, { status: 400 });

  // Fetch the original email
  const token = await getMicrosoftToken(userId, accountId);
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 });

  const emailRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${emailId}?$select=subject,from,toRecipients,body,bodyPreview`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!emailRes.ok) return Response.json({ error: 'Failed to fetch email' }, { status: 500 });
  const email = await emailRes.json();

  const fromName = email.from?.emailAddress?.name || '';
  const fromEmail = email.from?.emailAddress?.address || '';
  const subject = email.subject || '';
  const body = email.bodyPreview || email.body?.content?.slice(0, 1500) || '';

  // Load tone profile
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('tone_profile')
    .eq('user_id', userId)
    .single();

  const toneProfile = settings?.tone_profile;
  const toneInstruction = toneProfile
    ? `Write in the user's voice based on this profile:
- Tone: ${toneProfile.tone}
- Formality: ${toneProfile.formality}
- Length: ${toneProfile.avg_length}
- Style: ${toneProfile.style_notes}
- Greeting style: ${toneProfile.greeting_style || 'Standard'}
- Closing style: ${toneProfile.closing_style || 'Standard'}
- Common phrases: ${(toneProfile.vocabulary || []).join(', ')}`
    : `Write in a ${tone || 'professional'} tone.`;

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Draft a reply to this email. ${toneInstruction}

From: ${fromName} <${fromEmail}>
Subject: ${subject}
Body: ${body}

Rules:
- Keep it concise (under 150 words unless the topic requires more)
- Match the formality level of the original email
- Be actionable — if a question was asked, answer it
- Don't use generic filler ("I hope this email finds you well")
- If you're unsure about specifics, add [PLACEHOLDER] markers

Return ONLY valid JSON: {"subject": "Re: ...", "body": "...", "tone_used": "..."}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const draft = JSON.parse(jsonMatch[0]);

    return Response.json({
      draft: {
        subject: draft.subject || `Re: ${subject}`,
        body: draft.body || '',
        tone_used: draft.tone_used || tone || 'professional',
        to: fromEmail,
        toName: fromName,
      },
    });
  } catch {
    return Response.json({ error: 'Could not generate draft' }, { status: 500 });
  }
}
