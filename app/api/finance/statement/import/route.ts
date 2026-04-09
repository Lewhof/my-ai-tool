import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// POST /api/finance/statement/import
//   body: { transactions: [{ date, description, amount, category, type, import_hash }] }
//
// Uses the partial unique index on (user_id, import_hash) WHERE import_hash IS NOT NULL
// to dedupe at insert time. Returns counts for UI toast.

const VALID_CATEGORIES = [
  'Housing', 'Transport', 'Food', 'Entertainment',
  'Subscriptions', 'Business', 'Health', 'Education', 'Other',
];

type IncomingTransaction = {
  date: string;
  description: string;
  amount: number;
  category: string;
  type: 'expense' | 'income';
  import_hash: string;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body: { transactions?: IncomingTransaction[] };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const txns = body.transactions;
  if (!Array.isArray(txns) || txns.length === 0) {
    return Response.json({ error: 'transactions[] required' }, { status: 400 });
  }

  // Sanitize every row
  const rows: Array<{
    user_id: string;
    amount: number;
    category: string;
    description: string | null;
    entry_date: string;
    type: 'expense' | 'income';
    source: string;
    import_hash: string;
  }> = [];

  for (const t of txns) {
    if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue;
    const amt = Math.abs(Number(t.amount));
    if (!amt || isNaN(amt)) continue;
    if (!t.import_hash) continue;

    rows.push({
      user_id: userId,
      amount: amt,
      category: VALID_CATEGORIES.includes(t.category) ? t.category : 'Other',
      description: (t.description || '').slice(0, 200).trim() || null,
      entry_date: t.date,
      type: t.type === 'income' ? 'income' : 'expense',
      source: 'statement',
      import_hash: t.import_hash,
    });
  }

  if (rows.length === 0) {
    return Response.json({ error: 'No valid transactions after sanitization' }, { status: 400 });
  }

  // Bulk insert with ON CONFLICT via upsert + ignoreDuplicates
  // The partial unique index handles dedup at DB level — our job is just to not error.
  const { data, error } = await supabaseAdmin
    .from('finance_entries')
    .upsert(rows, { onConflict: 'user_id,import_hash', ignoreDuplicates: true })
    .select('id');

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const imported = data?.length ?? 0;
  const skipped = rows.length - imported;

  return Response.json({ imported, skipped, total: rows.length });
}
