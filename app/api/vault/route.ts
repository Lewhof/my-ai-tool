import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { encrypt, maskValue } from '@/lib/crypto';
import { VAULT_CATEGORIES } from '@/lib/vault-categories';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('vault_keys')
    .select('id, name, service, category, masked_value, fields, created_at, updated_at')
    .eq('user_id', userId)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Build masked fields for display
  const entries = (data ?? []).map((entry) => {
    const catDef = VAULT_CATEGORIES.find((c) => c.key === entry.category);
    const maskedFields: Record<string, string> = {};

    if (entry.fields && catDef) {
      for (const field of catDef.fields) {
        const raw = (entry.fields as Record<string, string>)[field.key];
        if (raw) {
          maskedFields[field.key] = maskValue('x'.repeat(8), field.maskType);
        }
      }
    }

    return { ...entry, maskedFields };
  });

  return Response.json({ entries, categories: VAULT_CATEGORIES });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { name, category, fields: rawFields } = await req.json();
  if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 });

  const catDef = VAULT_CATEGORIES.find((c) => c.key === category);
  if (!catDef) return Response.json({ error: 'Invalid category' }, { status: 400 });

  // Encrypt all field values
  const encryptedFields: Record<string, string> = {};
  let maskedValue = '';

  for (const field of catDef.fields) {
    const val = rawFields?.[field.key];
    if (val) {
      encryptedFields[field.key] = encrypt(val);
      // Use first password/sensitive field for the masked_value summary
      if (!maskedValue && (field.type === 'password' || field.type === 'pin')) {
        maskedValue = maskValue(val, field.maskType);
      }
    }
  }

  if (!maskedValue) maskedValue = '****';

  // Legacy service field — derive from category or fields
  const service = rawFields?.service || rawFields?.bank || rawFields?.provider || rawFields?.wallet_name || category;

  const { data, error } = await supabaseAdmin
    .from('vault_keys')
    .insert({
      user_id: userId,
      name,
      service,
      category,
      value: '', // No longer used for structured entries
      masked_value: maskedValue,
      fields: encryptedFields,
    })
    .select('id, name, service, category, masked_value, created_at, updated_at')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
