import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('id, name, file_type, file_size, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ documents: data });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: 'File type not allowed. Use PDF, PNG, JPG, or WEBP.' }, { status: 400 });
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

  const { data, error: dbError } = await supabaseAdmin
    .from('documents')
    .insert({
      id: docId,
      user_id: userId,
      name: file.name,
      file_path: filePath,
      file_type: file.type,
      file_size: file.size,
    })
    .select()
    .single();

  if (dbError) return Response.json({ error: dbError.message }, { status: 500 });
  return Response.json(data);
}
