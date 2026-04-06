import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { decrypt, encrypt, maskValue } from '@/lib/crypto';
import { VAULT_CATEGORIES } from '@/lib/vault-categories';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data } = await supabaseAdmin
    .from('vault_keys')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!data) return new Response('Not found', { status: 404 });

  // Decrypt fields
  const decryptedFields: Record<string, string> = {};
  if (data.fields) {
    for (const [key, val] of Object.entries(data.fields as Record<string, string>)) {
      try {
        decryptedFields[key] = decrypt(val);
      } catch {
        decryptedFields[key] = val; // Fallback if not encrypted
      }
    }
  }

  // Also decrypt legacy value field
  let decryptedValue = data.value;
  if (decryptedValue) {
    try {
      decryptedValue = decrypt(decryptedValue);
    } catch { /* not encrypted */ }
  }

  return Response.json({
    id: data.id,
    name: data.name,
    service: data.service,
    category: data.category,
    fields: decryptedFields,
    value: decryptedValue,
    created_at: data.created_at,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { name, category, fields: rawFields } = await req.json();
  const updates: Record<string, unknown> = {};

  if (name) updates.name = name;
  if (category) updates.category = category;

  if (rawFields) {
    const catDef = VAULT_CATEGORIES.find((c) => c.key === (category || ''));
    const encryptedFields: Record<string, string> = {};
    let maskedValue = '';

    for (const [key, val] of Object.entries(rawFields as Record<string, string>)) {
      if (val) {
        encryptedFields[key] = encrypt(val);
        if (!maskedValue) {
          const fieldDef = catDef?.fields.find((f) => f.key === key);
          if (fieldDef && (fieldDef.type === 'password' || fieldDef.type === 'pin')) {
            maskedValue = maskValue(val, fieldDef.maskType);
          }
        }
      }
    }

    updates.fields = encryptedFields;
    if (maskedValue) updates.masked_value = maskedValue;
  }

  const { error } = await supabaseAdmin
    .from('vault_keys')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('vault_keys')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
