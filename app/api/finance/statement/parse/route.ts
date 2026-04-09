import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import crypto from 'crypto';

// POST /api/finance/statement/parse
//   multipart/form-data: { file: PDF }
//
// Flow:
//   1. Validate + upload PDF to statements/{userId}/{uuid}.pdf
//   2. pdf-parse → textContent (zero AI tokens)
//   3. If text > 500 chars → extract with smart model routing:
//        - < 15K chars: Haiku (fast, cheap)
//        - >= 15K chars: Sonnet (accurate long-context)
//   4. If text < 500 chars (scanned PDF): send PDF as document block to Sonnet
//   5. Compute import_hash per transaction + check existing DB → mark duplicates
//   6. Delete temp PDF from storage (retention policy: delete immediately)
//   7. Return { account_info, period_start, period_end, currency, transactions[], stats }

const VALID_CATEGORIES = [
  'Housing', 'Transport', 'Food', 'Entertainment',
  'Subscriptions', 'Business', 'Health', 'Education', 'Other',
];

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

type ParsedTransaction = {
  date: string;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  suggested_category: string;
  raw_line?: string;
  import_hash?: string;
  duplicate_of?: string | null; // existing entry id if duplicate
};

type ParseResult = {
  account_info: { holder?: string; last4?: string };
  period_start: string | null;
  period_end: string | null;
  currency: string;
  transactions: ParsedTransaction[];
};

function buildImportHash(userId: string, date: string, amount: number, description: string): string {
  // Normalize: lowercase, collapse whitespace, strip ref-number noise
  const normDesc = description
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(ref|reference|trn|txn|id)[:\s]*\w+\b/gi, '')
    .trim()
    .slice(0, 80);
  const canonical = `${userId}|${date}|${Math.abs(amount).toFixed(2)}|${normDesc}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function sanitizeTransaction(t: ParsedTransaction, userId: string): ParsedTransaction | null {
  if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return null;
  if (t.amount === null || t.amount === undefined || isNaN(Number(t.amount))) return null;
  const amount = Math.abs(Number(t.amount));
  if (amount === 0) return null;
  const description = (t.description || '').slice(0, 200).trim();
  if (!description) return null;

  const category = VALID_CATEGORIES.includes(t.suggested_category) ? t.suggested_category : 'Other';
  const type: 'expense' | 'income' = t.type === 'income' ? 'income' : 'expense';

  return {
    date: t.date,
    description,
    amount,
    type,
    suggested_category: category,
    raw_line: (t.raw_line || '').slice(0, 250),
    import_hash: buildImportHash(userId, t.date, amount, description),
  };
}

const EXTRACTION_PROMPT = (today: string) => `You are a bank statement parser. Today is ${today}.

Analyze this bank statement and extract EVERY transaction.

For each transaction, output:
- date: YYYY-MM-DD format
- description: vendor/merchant/memo, max 120 chars, strip obvious reference-number noise but keep the vendor identifiable
- amount: positive number, no currency symbol (always positive — sign is in 'type')
- type: "expense" or "income"
- suggested_category: one of [Housing, Transport, Food, Entertainment, Subscriptions, Business, Health, Education, Other]
- raw_line: the original line from the statement (max 200 chars)

Category guidance (South African context):
- Food: groceries, restaurants, takeaways, Uber Eats, Woolworths, Checkers, Pick n Pay, Spar, Food Lovers, Mr Delivery
- Transport: fuel/petrol (Sasol, BP, Engen, Shell, Total), Uber, Bolt, taxi, parking, e-tolls, SANRAL
- Subscriptions: Netflix, Spotify, DStv, Showmax, gym (Virgin Active, Planet Fitness), SaaS, Apple, Google
- Health: pharmacy, Dis-Chem, Clicks, Discovery, Momentum, medical aid, doctor, dentist
- Housing: rent, City of Cape Town / eThekwini / Tshwane, Eskom, bond payment, levy, rates
- Business: professional fees, B2B services, office supplies
- Entertainment: cinema, Ster-Kinekor, events, gaming, hobbies
- Education: courses, Udemy, books, training
- Other: ATM withdrawals, bank fees, SARB, internal transfers, FNB/ABSA/Capitec fees, unclassifiable items

Also extract these top-level fields:
- account_holder: name if visible, else null
- account_last4: last 4 digits of account number for reference (NEVER the full number)
- period_start: first transaction date (YYYY-MM-DD)
- period_end: last transaction date (YYYY-MM-DD)
- currency: ISO code (ZAR default for South African statements)

Return ONLY valid JSON matching:
{
  "account_info": { "holder": "string or null", "last4": "string or null" },
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "currency": "ZAR",
  "transactions": [
    { "date": "...", "description": "...", "amount": 0, "type": "expense", "suggested_category": "...", "raw_line": "..." }
  ]
}

Critical rules:
- Skip running-balance rows, opening balance, closing balance, page headers, column headers
- Only include lines that are actual transactions you can see
- Do NOT invent transactions
- Fee rows ARE transactions → category: Other, type: expense
- Interest earned → type: income
- If a debit/credit column structure is used, a value in the DEBIT column = expense, CREDIT column = income
- If only one amount column is used, negative = expense, positive = income
- Preserve chronological order
- ZAR is the default currency unless you see USD/EUR/GBP symbols
- Return ONLY the JSON object, no commentary, no markdown fences`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Parse multipart
  let file: File | null = null;
  try {
    const formData = await req.formData();
    const maybeFile = formData.get('file');
    if (maybeFile instanceof File) file = maybeFile;
  } catch {
    return Response.json({ error: 'Invalid multipart body' }, { status: 400 });
  }
  if (!file) return Response.json({ error: 'file field required (PDF)' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: `File too large (${Math.round(file.size / 1024 / 1024)}MB, max 10MB)` }, { status: 400 });
  if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    return Response.json({ error: 'Only PDF files are supported' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const tempKey = `statements/${userId}/${crypto.randomUUID()}.pdf`;

  // Upload to storage (temporary — deleted after parse)
  try {
    await supabaseAdmin.storage.from('documents').upload(tempKey, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });
  } catch {
    // Upload is best-effort — not strictly required for parsing since we have the buffer
  }

  // Try pdf-parse first
  let textContent = '';
  let parseMode: 'text' | 'document' = 'text';
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const pdf = await pdfParse(buffer);
    textContent = (pdf.text || '').trim();
  } catch {
    // pdf-parse failed — fall through to document mode
  }

  // Decide extraction path
  const hasGoodText = textContent.length >= 500;
  if (!hasGoodText) {
    parseMode = 'document';
  }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = EXTRACTION_PROMPT(today);

  // Pick model: Haiku for short text, Sonnet for long or document mode
  const useSmartModel = parseMode === 'document' || textContent.length >= 15000;
  const model = useSmartModel ? MODELS.smart : MODELS.fast;

  let extractedJson: ParseResult | null = null;
  let extractionError: string | null = null;

  try {
    if (parseMode === 'text') {
      // Text path — send as text content
      const response = await anthropic.messages.create({
        model,
        max_tokens: 8000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `${prompt}\n\n<statement>\n${textContent.slice(0, 180000)}\n</statement>`,
        }],
      });
      const textBlock = response.content[0];
      const raw = textBlock.type === 'text' ? textBlock.text : '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in model response');
      extractedJson = JSON.parse(jsonMatch[0]) as ParseResult;
    } else {
      // Document path — send PDF directly as document block
      const base64 = buffer.toString('base64');
      // Anthropic SDK supports document blocks for PDFs; cast the content array
      // because the type export varies across SDK versions.
      const documentContent = [
        {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        },
        { type: 'text' as const, text: prompt },
      ];
      const response = await anthropic.messages.create({
        model: MODELS.smart, // always Sonnet for document mode (vision-heavy)
        max_tokens: 8000,
        temperature: 0,
        messages: [{
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: documentContent as any,
        }],
      });
      const textBlock = response.content[0];
      const raw = textBlock.type === 'text' ? textBlock.text : '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in model response');
      extractedJson = JSON.parse(jsonMatch[0]) as ParseResult;
    }
  } catch (err) {
    extractionError = err instanceof Error ? err.message : 'Extraction failed';
  }

  // Clean up temp PDF (retention: delete immediately)
  try {
    await supabaseAdmin.storage.from('documents').remove([tempKey]);
  } catch { /* best-effort */ }

  if (extractionError || !extractedJson) {
    return Response.json({
      error: extractionError || 'Unable to extract transactions from this PDF',
      hint: parseMode === 'document'
        ? 'The PDF appears to be scanned. Try uploading a digital export from your bank instead.'
        : 'Try a clearer PDF or a different bank export format.',
    }, { status: 500 });
  }

  // Sanitize + hash every transaction
  const sanitized: ParsedTransaction[] = [];
  for (const raw of extractedJson.transactions || []) {
    const clean = sanitizeTransaction(raw, userId);
    if (clean) sanitized.push(clean);
  }

  // Bulk duplicate check
  const hashes = sanitized.map((t) => t.import_hash!).filter(Boolean);
  const dupMap = new Map<string, string>(); // hash → existing entry id
  if (hashes.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from('finance_entries')
      .select('id, import_hash')
      .eq('user_id', userId)
      .in('import_hash', hashes);
    for (const row of existing ?? []) {
      if (row.import_hash) dupMap.set(row.import_hash, row.id);
    }
  }

  for (const t of sanitized) {
    t.duplicate_of = t.import_hash ? (dupMap.get(t.import_hash) ?? null) : null;
  }

  const stats = {
    total: sanitized.length,
    expenses: sanitized.filter((t) => t.type === 'expense').length,
    income: sanitized.filter((t) => t.type === 'income').length,
    duplicates: sanitized.filter((t) => t.duplicate_of).length,
    total_expense_amount: sanitized.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    total_income_amount: sanitized.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    model_used: model,
    parse_mode: parseMode,
  };

  return Response.json({
    account_info: extractedJson.account_info || {},
    period_start: extractedJson.period_start || null,
    period_end: extractedJson.period_end || null,
    currency: extractedJson.currency || 'ZAR',
    transactions: sanitized,
    stats,
  });
}
