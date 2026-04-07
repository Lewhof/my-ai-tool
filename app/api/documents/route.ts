import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const [docsRes, foldersRes] = await Promise.all([
    supabaseAdmin
      .from('documents')
      .select('id, name, file_type, file_size, folder, folder_id, upload_comment, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('document_folders')
      .select('id, name, parent_id, color, sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true }),
  ]);

  return Response.json({
    documents: docsRes.data ?? [],
    folders: foldersRes.data ?? [],
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const comment = formData.get('comment') as string | null;
  const folderId = formData.get('folder_id') as string | null;

  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

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
      folder_id: folderId || null,
      upload_comment: comment || null,
    })
    .select()
    .single();

  if (dbError) return Response.json({ error: dbError.message }, { status: 500 });

  // AI classification in background (only if no folder_id specified)
  if (!folderId) {
    after(async () => {
      try {
        // Get folders for classification
        const { data: folders } = await supabaseAdmin
          .from('document_folders')
          .select('id, name, parent_id')
          .eq('user_id', userId);

        const folderNames = (folders ?? []).map((f) => f.name);
        const defaultFolders = ['Legal', 'Finance', 'Personal', 'Business', 'Contracts', 'Reports', 'Other'];
        const allFolders = [...new Set([...folderNames, ...defaultFolders])];

        let textContent = '';
        if (file.type === 'application/pdf') {
          try {
            const pdfParse = (await import('pdf-parse')).default;
            const pdf = await pdfParse(buffer);
            textContent = pdf.text.slice(0, 2000);
          } catch { /* skip */ }
        } else if (file.type.startsWith('image/')) {
          textContent = `Image file named: ${file.name}`;
        } else {
          try { textContent = buffer.toString('utf-8').slice(0, 2000); } catch { /* skip */ }
        }

        const classifyText = textContent || `File named: ${file.name}`;
        const commentContext = comment ? `\nUser note: ${comment}` : '';

        const response = await anthropic.messages.create({
          model: MODELS.fast,
          max_tokens: 50,
          messages: [{
            role: 'user',
            content: `Classify this document into exactly one folder. Respond with ONLY the folder name.\n\nFolders: ${allFolders.join(', ')}\n\nFilename: ${file.name}${commentContext}\nContent: ${classifyText}`,
          }],
        });

        const folderName = response.content[0].type === 'text' ? response.content[0].text.trim() : 'Other';
        const validFolder = allFolders.includes(folderName) ? folderName : 'Other';

        // Find matching folder_id
        const matchingFolder = (folders ?? []).find((f) => f.name === validFolder);

        await supabaseAdmin
          .from('documents')
          .update({
            folder: validFolder,
            folder_id: matchingFolder?.id ?? null,
          })
          .eq('id', docId);
      } catch { /* classification failed */ }
    });
  }

  return Response.json(data);
}
