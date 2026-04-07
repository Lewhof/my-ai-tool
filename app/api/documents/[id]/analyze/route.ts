import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // Extract text
  let textContent = '';
  if (doc.file_type === 'application/pdf') {
    try {
      const { data: fileData } = await supabaseAdmin.storage.from('documents').download(doc.file_path);
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const pdfParse = (await import('pdf-parse')).default;
        const pdf = await pdfParse(buffer);
        textContent = pdf.text.slice(0, 5000);
      }
    } catch { /* skip */ }
  } else {
    try {
      const { data: fileData } = await supabaseAdmin.storage.from('documents').download(doc.file_path);
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        textContent = buffer.toString('utf-8').slice(0, 5000);
      }
    } catch { /* skip */ }
  }

  if (!textContent) {
    textContent = `File: ${doc.name}, Type: ${doc.file_type}, Size: ${doc.file_size} bytes`;
  }

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Analyze this document and provide a structured analysis in markdown format.

Include:
## Summary
Brief 2-3 sentence summary

## Key Points
- Bulleted list of important points

## Entities
People, organisations, dates, amounts mentioned

## Document Type
What kind of document this is

## Recommendations
Any actions or follow-ups suggested by the content

Document: ${doc.name}
Content:
${textContent}`,
    }],
  });

  const analysis = response.content[0].type === 'text' ? response.content[0].text : 'Analysis failed.';
  return Response.json({ analysis });
}
