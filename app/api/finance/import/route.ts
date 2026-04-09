import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const VALID_CATEGORIES = [
  'Housing', 'Transport', 'Food', 'Entertainment',
  'Subscriptions', 'Business', 'Health', 'Education', 'Other',
];

// POST: Import transactions from CSV text
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { csv } = await req.json();
  if (!csv?.trim()) return Response.json({ error: 'CSV data required' }, { status: 400 });

  const lines = csv.trim().split('\n');
  if (lines.length < 2) return Response.json({ error: 'CSV must have header + at least 1 row' }, { status: 400 });

  // Parse header to determine column mapping
  const header = lines[0].toLowerCase().split(',').map((h: string) => h.trim().replace(/"/g, ''));

  const dateIdx = header.findIndex((h: string) => ['date', 'entry_date', 'transaction_date', 'trans_date'].includes(h));
  const amountIdx = header.findIndex((h: string) => ['amount', 'value', 'debit', 'total'].includes(h));
  const descIdx = header.findIndex((h: string) => ['description', 'desc', 'details', 'narrative', 'reference', 'memo'].includes(h));
  const categoryIdx = header.findIndex((h: string) => ['category', 'cat', 'type'].includes(h));

  if (amountIdx === -1) {
    return Response.json({ error: 'CSV must have an "amount" column' }, { status: 400 });
  }

  const entries: Array<{
    user_id: string;
    amount: number;
    category: string;
    description: string | null;
    entry_date: string;
    type: 'expense' | 'income';
  }> = [];

  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length <= amountIdx) { skipped++; continue; }

    const rawAmount = parseFloat(values[amountIdx].replace(/[^-\d.]/g, ''));
    if (isNaN(rawAmount) || rawAmount === 0) { skipped++; continue; }

    // Parse date (try multiple formats)
    let entryDate = new Date().toISOString().split('T')[0];
    if (dateIdx !== -1 && values[dateIdx]) {
      const parsed = parseFlexibleDate(values[dateIdx].trim());
      if (parsed) entryDate = parsed;
    }

    const desc = descIdx !== -1 ? values[descIdx]?.trim() || null : null;
    const cat = categoryIdx !== -1 ? values[categoryIdx]?.trim() : null;
    const category = cat && VALID_CATEGORIES.includes(cat) ? cat : 'Other';

    entries.push({
      user_id: userId,
      amount: Math.abs(rawAmount),
      category,
      description: desc,
      entry_date: entryDate,
      type: rawAmount < 0 ? 'expense' : 'income',
    });
  }

  if (entries.length === 0) {
    return Response.json({ error: 'No valid rows found in CSV' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('finance_entries').insert(entries);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ imported: entries.length, skipped });
}

// Parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse dates in multiple formats
function parseFlexibleDate(raw: string): string | null {
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (mdy) {
    const month = parseInt(mdy[1]);
    if (month > 12) {
      // It's actually DD/MM/YYYY, already handled above
      return null;
    }
  }

  // Try JS Date parser as fallback
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return null;
}
