import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const VALID_CATEGORIES = [
  'Housing', 'Transport', 'Food', 'Entertainment',
  'Subscriptions', 'Business', 'Health', 'Education', 'Other',
];

// GET: List finance entries for a month
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM format
  const limit = parseInt(searchParams.get('limit') || '200', 10);

  let query = supabaseAdmin
    .from('finance_entries')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(limit);

  if (month) {
    const start = `${month}-01`;
    const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0);
    const end = `${month}-${endDate.getDate().toString().padStart(2, '0')}`;
    query = query.gte('entry_date', start).lte('entry_date', end);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ entries: data ?? [] });
}

// POST: Create a new finance entry
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { amount, category, description, entry_date, type } = await req.json();

  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return Response.json({ error: 'Valid amount required' }, { status: 400 });
  }

  if (type && !['expense', 'income'].includes(type)) {
    return Response.json({ error: 'Type must be expense or income' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('finance_entries')
    .insert({
      user_id: userId,
      amount: Number(amount),
      category: VALID_CATEGORIES.includes(category) ? category : 'Other',
      description: description?.trim() || null,
      entry_date: entry_date || new Date().toISOString().split('T')[0],
      type: type || 'expense',
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entry: data });
}

// PATCH: Update a finance entry
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, amount, category, description, entry_date, type } = await req.json();
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (amount !== undefined) updates.amount = Number(amount);
  if (category !== undefined) updates.category = VALID_CATEGORIES.includes(category) ? category : 'Other';
  if (description !== undefined) updates.description = description?.trim() || null;
  if (entry_date !== undefined) updates.entry_date = entry_date;
  if (type !== undefined) updates.type = ['expense', 'income'].includes(type) ? type : 'expense';

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No updates provided' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('finance_entries')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entry: data });
}

// DELETE: Remove a finance entry
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await supabaseAdmin
    .from('finance_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  return Response.json({ ok: true });
}
