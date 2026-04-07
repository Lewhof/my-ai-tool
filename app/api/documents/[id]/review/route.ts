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

  // Get all folder names for classification
  const { data: folders } = await supabaseAdmin
    .from('document_folders')
    .select('id, name, parent_id')
    .eq('user_id', userId);

  // Build folder paths
  const folderMap = new Map((folders ?? []).map((f) => [f.id, f]));
  const getFolderPath = (folderId: string): string => {
    const folder = folderMap.get(folderId);
    if (!folder) return '';
    if (folder.parent_id) return `${getFolderPath(folder.parent_id)} > ${folder.name}`;
    return folder.name;
  };

  const folderList = (folders ?? []).map((f) => ({
    id: f.id,
    path: getFolderPath(f.id),
  }));

  // Extract text for classification
  let textContent = '';
  if (doc.file_type === 'application/pdf') {
    try {
      const { data: fileData } = await supabaseAdmin.storage.from('documents').download(doc.file_path);
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const pdfParse = (await import('pdf-parse')).default;
        const pdf = await pdfParse(buffer);
        textContent = pdf.text.slice(0, 3000);
      }
    } catch { /* skip */ }
  }

  const classifyText = textContent || `File named: ${doc.name}`;
  const uploadComment = doc.upload_comment ? `\nUser comment: ${doc.upload_comment}` : '';

  const folderOptions = folderList.length > 0
    ? folderList.map((f) => `- "${f.path}" (id: ${f.id})`).join('\n')
    : 'No folders created yet. Suggest folder names to create.';

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Review this document and suggest the best folder for filing it. If no existing folder fits, suggest a new folder name.\n\nExisting folders:\n${folderOptions}\n\nFilename: ${doc.name}\nFile type: ${doc.file_type}${uploadComment}\nContent preview: ${classifyText}\n\nRespond in JSON: {"suggested_folder_id": "uuid or null", "suggested_folder_name": "name if new folder needed", "confidence": "high/medium/low", "reason": "brief explanation"}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON from response
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const suggestion = JSON.parse(jsonMatch[0]);
      return Response.json(suggestion);
    }
  } catch { /* fallback */ }

  return Response.json({
    suggested_folder_id: null,
    suggested_folder_name: 'Other',
    confidence: 'low',
    reason: text,
  });
}
