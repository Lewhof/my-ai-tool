import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

const ACTION_PROMPTS: Record<string, string> = {
  summarise: `Provide a concise 3-5 sentence summary of this document. Be factual, clear, and actionable.`,
  extract: `Extract the most important information from this document as structured bullet points:
- Key facts and figures
- Important names, dates, and amounts
- Critical decisions or action items
- Deadlines or time-sensitive information
Be comprehensive but concise.`,
};

async function extractText(doc: { file_path: string; file_type: string; name: string; file_size: number }): Promise<string> {
  let textContent = '';

  if (doc.file_type === 'application/pdf') {
    try {
      const { data: fileData } = await supabaseAdmin.storage.from('documents').download(doc.file_path);
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const pdfParse = (await import('pdf-parse')).default;
        const pdf = await pdfParse(buffer);
        textContent = pdf.text.slice(0, 8000);
      }
    } catch { /* skip */ }
  } else {
    try {
      const { data: fileData } = await supabaseAdmin.storage.from('documents').download(doc.file_path);
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        textContent = buffer.toString('utf-8').slice(0, 8000);
      }
    } catch { /* skip */ }
  }

  if (!textContent) {
    textContent = `File: ${doc.name}, Type: ${doc.file_type}, Size: ${doc.file_size} bytes. (Could not extract text content)`;
  }

  return textContent;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!doc) return new Response('Not found', { status: 404 });

  let body: { action?: string; prompt?: string } = {};
  try { body = await req.json(); } catch { /* default analyze */ }

  const action = body.action || 'summarise';
  const textContent = await extractText(doc);

  let systemInstruction: string;

  if (action === 'ask' && body.prompt) {
    systemInstruction = `You are a document analysis assistant. Answer the user's question based on the document content below. Be precise and reference specific parts of the document when possible.

Document: ${doc.name}
Content:
${textContent}

User's question: ${body.prompt}`;
  } else {
    const actionPrompt = ACTION_PROMPTS[action] || ACTION_PROMPTS.summarise;
    systemInstruction = `${actionPrompt}

Document: ${doc.name}
Content:
${textContent}`;
  }

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 1500,
    messages: [{ role: 'user', content: systemInstruction }],
  });

  const analysis = response.content[0].type === 'text' ? response.content[0].text : 'Analysis failed.';

  // Cache result for summarise/extract
  if (action !== 'ask') {
    try {
      await supabaseAdmin
        .from('documents')
        .update({ [`ai_${action}`]: analysis })
        .eq('id', id);
    } catch { /* column may not exist yet */ }
  }

  return Response.json({ analysis });
}
