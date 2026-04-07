import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return Response.json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${userId}/${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from('notes')
    .upload(fileName, buffer, { contentType: file.type });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: signed } = await supabaseAdmin.storage
    .from('notes')
    .createSignedUrl(fileName, 31536000); // 1 year

  return Response.json({
    url: signed?.signedUrl ?? null,
    path: fileName,
  });
}
