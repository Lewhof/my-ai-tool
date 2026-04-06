import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

const DEFAULT_FOLDERS = ['Legal', 'Finance', 'Personal', 'Business', 'Contracts', 'Reports', 'Other'];

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('id, name, file_type, file_size, folder, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ documents: data, folders: DEFAULT_FOLDERS });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

  const allowedTypes = [
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: 'File type not allowed.' }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: 'File too large. Max 10MB.' }, { status: 400 });
  }

  const docId = crypto.randomUUID();
  const filePath = `${userId}/${docId}/${file.name}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(filePath, buffer, { contentType: file.type });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  // Insert with default folder first, then classify async
  const { data, error: dbError } = await supabaseAdmin
    .from('documents')
    .insert({
      id: docId,
      user_id: userId,
      name: file.name,
      file_path: filePath,
      file_type: file.type,
      file_size: file.size,
      folder: 'Other',
    })
    .select()
    .single();

  if (dbError) return Response.json({ error: dbError.message }, { status: 500 });

  // AI classification in background
  after(async () => {
    try {
      let textContent = '';

      // Extract text for classification
      if (file.type === 'application/pdf') {
        try {
          const pdfParse = (await import('pdf-parse')).default;
          const pdf = await pdfParse(buffer);
          textContent = pdf.text.slice(0, 2000);
        } catch { /* skip */ }
      } else if (file.type.startsWith('image/')) {
        // Use filename for images since we can't OCR cheaply
        textContent = `Image file named: ${file.name}`;
      } else {
        // Try reading as text
        try {
          textContent = buffer.toString('utf-8').slice(0, 2000);
        } catch { /* skip */ }
      }

      // If we have content or a meaningful filename, classify
      const classifyText = textContent || `File named: ${file.name}`;

      const response = await anthropic.messages.create({
        model: MODELS.fast,
        max_tokens: 20,
        messages: [{
          role: 'user',
          content: `Classify this document into exactly one folder. Respond with ONLY the folder name, nothing else.\n\nFolders: ${DEFAULT_FOLDERS.join(', ')}\n\nFilename: ${file.name}\nContent preview: ${classifyText}`,
        }],
      });

      const folder = response.content[0].type === 'text'
        ? response.content[0].text.trim()
        : 'Other';

      // Validate the folder is in our list
      const validFolder = DEFAULT_FOLDERS.includes(folder) ? folder : 'Other';

      await supabaseAdmin
        .from('documents')
        .update({ folder: validFolder })
        .eq('id', docId);
    } catch {
      // Classification failed, keep as Other
    }
  });

  return Response.json(data);
}
