import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

// GET: AI-generated financial insight for a given month
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  if (!month) return Response.json({ error: 'month required (YYYY-MM)' }, { status: 400 });

  const start = `${month}-01`;
  const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0);
  const end = `${month}-${endDate.getDate().toString().padStart(2, '0')}`;

  // Get current month entries
  const { data: entries } = await supabaseAdmin
    .from('finance_entries')
    .select('amount, category, type')
    .eq('user_id', userId)
    .gte('entry_date', start)
    .lte('entry_date', end);

  if (!entries?.length) {
    return Response.json({ insight: 'Add some transactions to see AI insights about your spending.' });
  }

  // Get previous month entries for comparison
  const prevDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]) - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, '0')}`;
  const prevStart = `${prevMonth}-01`;
  const prevEndDate = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0);
  const prevEnd = `${prevMonth}-${prevEndDate.getDate().toString().padStart(2, '0')}`;

  const { data: prevEntries } = await supabaseAdmin
    .from('finance_entries')
    .select('amount, category, type')
    .eq('user_id', userId)
    .gte('entry_date', prevStart)
    .lte('entry_date', prevEnd);

  // Summarize by category
  const summarize = (items: typeof entries) => {
    const totals: Record<string, number> = {};
    let totalExpense = 0;
    let totalIncome = 0;
    for (const e of items) {
      if (e.type === 'expense') {
        totals[e.category] = (totals[e.category] || 0) + Number(e.amount);
        totalExpense += Number(e.amount);
      } else {
        totalIncome += Number(e.amount);
      }
    }
    return { totals, totalExpense, totalIncome };
  };

  const current = summarize(entries);
  const prev = prevEntries?.length ? summarize(prevEntries) : null;

  const prompt = `You are a personal finance assistant. Analyze this spending data and give ONE concise insight (1-2 sentences max). Be specific with numbers and percentages. Use ZAR (R) currency.

Current month (${month}):
- Total expenses: R${current.totalExpense.toFixed(2)}
- Total income: R${current.totalIncome.toFixed(2)}
- By category: ${Object.entries(current.totals).map(([c, a]) => `${c}: R${a.toFixed(2)}`).join(', ')}
${prev ? `
Previous month (${prevMonth}):
- Total expenses: R${prev.totalExpense.toFixed(2)}
- Total income: R${prev.totalIncome.toFixed(2)}
- By category: ${Object.entries(prev.totals).map(([c, a]) => `${c}: R${a.toFixed(2)}`).join(', ')}` : '(No previous month data)'}

Return ONLY the insight text, no markdown or formatting.`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return Response.json({ insight: text });
  } catch {
    return Response.json({ insight: `This month: R${current.totalExpense.toFixed(2)} expenses, R${current.totalIncome.toFixed(2)} income across ${entries.length} transactions.` });
  }
}
