import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { encrypt, decrypt } from '@/lib/crypto';

// One-shot: re-encrypt all vault_keys.fields for the signed-in user
// from legacy ciphertext (SUPABASE_SERVICE_ROLE_KEY-derived) to v2 format
// (VAULT_ENCRYPTION_KEY). Scoped to the caller's own rows. Idempotent —
// rows already in v2 format are skipped.
//
// Prerequisites:
//   - VAULT_ENCRYPTION_KEY set in env (base64, 32 bytes)
//   - SUPABASE_SERVICE_ROLE_KEY still set to the value used when the legacy
//     ciphertext was written (i.e. run this BEFORE rotating service role)
const V2_PREFIX = 'v2:';

type FieldMap = Record<string, string>;
type RowReport = {
  id: string;
  status: 'skipped-empty' | 'already-v2' | 'converted' | 'error' | 'update-failed';
  fieldsConverted?: number;
  error?: string;
};

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  if (!process.env.VAULT_ENCRYPTION_KEY) {
    return Response.json(
      { error: 'VAULT_ENCRYPTION_KEY not set — add it to env before running this migration' },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('vault_keys')
    .select('id, fields')
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const report: RowReport[] = [];
  let fieldsConvertedTotal = 0;

  for (const row of data ?? []) {
    const fields = row.fields as FieldMap | null;
    if (!fields || Object.keys(fields).length === 0) {
      report.push({ id: row.id, status: 'skipped-empty' });
      continue;
    }

    const newFields: FieldMap = {};
    let changed = 0;
    try {
      for (const [key, val] of Object.entries(fields)) {
        if (typeof val !== 'string') {
          newFields[key] = val;
          continue;
        }
        if (val.startsWith(V2_PREFIX)) {
          newFields[key] = val;
          continue;
        }
        // decrypt() auto-detects legacy format and uses the legacy seed;
        // encrypt() always writes v2.
        const plain = decrypt(val);
        newFields[key] = encrypt(plain);
        changed++;
      }
    } catch (e) {
      report.push({
        id: row.id,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    if (changed === 0) {
      report.push({ id: row.id, status: 'already-v2' });
      continue;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('vault_keys')
      .update({ fields: newFields })
      .eq('id', row.id)
      .eq('user_id', userId);
    if (updateErr) {
      report.push({ id: row.id, status: 'update-failed', error: updateErr.message });
      continue;
    }

    report.push({ id: row.id, status: 'converted', fieldsConverted: changed });
    fieldsConvertedTotal += changed;
  }

  return Response.json({
    ok: true,
    userId,
    rowsScanned: data?.length ?? 0,
    fieldsConvertedTotal,
    report,
  });
}
