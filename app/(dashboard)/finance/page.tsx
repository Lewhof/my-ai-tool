'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DollarSign, Plus, Trash2, Pencil, Upload, Loader2,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  Sparkles, X, ArrowUpCircle, ArrowDownCircle, Camera, Scan,
  FileText, AlertCircle, CheckCircle2,
} from 'lucide-react';

interface FinanceEntry {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  entry_date: string;
  type: 'expense' | 'income';
  created_at: string;
}

interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  suggested_category: string;
  raw_line?: string;
  import_hash?: string;
  duplicate_of?: string | null;
}

interface StatementParseResult {
  account_info: { holder?: string | null; last4?: string | null };
  period_start: string | null;
  period_end: string | null;
  currency: string;
  transactions: StatementTransaction[];
  stats: {
    total: number;
    expenses: number;
    income: number;
    duplicates: number;
    total_expense_amount: number;
    total_income_amount: number;
    model_used: string;
    parse_mode: 'text' | 'document';
  };
}

const CATEGORIES = [
  'Housing', 'Transport', 'Food', 'Entertainment',
  'Subscriptions', 'Business', 'Health', 'Education', 'Other',
];

const CATEGORY_COLORS: Record<string, string> = {
  Housing: 'var(--color-chart-1)',
  Transport: 'var(--color-chart-2)',
  Food: 'var(--color-chart-3)',
  Entertainment: 'var(--color-chart-4)',
  Subscriptions: 'var(--color-chart-5)',
  Business: 'oklch(0.58 0.16 200)',
  Health: 'oklch(0.60 0.18 145)',
  Education: 'oklch(0.55 0.15 310)',
  Other: 'oklch(0.50 0.08 55)',
};

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function formatMonthDisplay(month: string) {
  const [y, m] = month.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1);
  return d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

export default function FinancePage() {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => getMonthStr(new Date()));
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('Other');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formType, setFormType] = useState<'expense' | 'income'>('expense');
  const [saving, setSaving] = useState(false);

  // CSV import
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Receipt scanning
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [receiptConfidence, setReceiptConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const receiptFileRef = useRef<HTMLInputElement>(null);
  const receiptCameraRef = useRef<HTMLInputElement>(null);

  // Bank statement upload
  const [statementUploading, setStatementUploading] = useState(false);
  const [statementResult, setStatementResult] = useState<StatementParseResult | null>(null);
  const [statementImporting, setStatementImporting] = useState(false);
  const [statementSelected, setStatementSelected] = useState<Set<number>>(new Set());
  const statementFileRef = useRef<HTMLInputElement>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
      }
    } catch {
      toast.error('Failed to load transactions');
    }
    setLoading(false);
  }, [month]);

  const fetchInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      const res = await fetch(`/api/finance/insight?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setInsight(data.insight || '');
      }
    } catch {
      setInsight('');
    }
    setInsightLoading(false);
  }, [month]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { fetchInsight(); }, [fetchInsight]);

  // Derived calculations
  const totalExpense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = entries.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0);
  const netFlow = totalIncome - totalExpense;

  const categoryTotals = entries
    .filter(e => e.type === 'expense')
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
      return acc;
    }, {});

  const maxCategoryAmount = Math.max(...Object.values(categoryTotals), 1);

  // Month navigation
  const changeMonth = (offset: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + offset);
    setMonth(getMonthStr(d));
  };

  const isCurrentMonth = month === getMonthStr(new Date());

  // Form handlers
  const resetForm = () => {
    setFormAmount('');
    setFormCategory('Other');
    setFormDesc('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormType('expense');
    setEditingId(null);
    setShowForm(false);
    setReceiptConfidence(null);
  };

  const startEdit = (entry: FinanceEntry) => {
    setEditingId(entry.id);
    setFormAmount(entry.amount.toString());
    setFormCategory(entry.category);
    setFormDesc(entry.description || '');
    setFormDate(entry.entry_date);
    setFormType(entry.type);
    setShowForm(true);
  };

  // Receipt scanning — read image, send to /api/finance/receipt, prefill form
  const scanReceipt = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large (max 10MB)');
      return;
    }

    setScanningReceipt(true);
    setReceiptConfidence(null);
    try {
      // Convert to base64 data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/finance/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Could not parse receipt');
        return;
      }

      const { parsed } = await res.json();

      // Pre-fill the form
      if (!showForm) setShowForm(true);
      if (parsed.amount !== null) setFormAmount(String(parsed.amount));
      if (parsed.category) setFormCategory(parsed.category);
      if (parsed.description) setFormDesc(parsed.description);
      if (parsed.entry_date) setFormDate(parsed.entry_date);
      if (parsed.type) setFormType(parsed.type);
      setReceiptConfidence(parsed.confidence);

      const msg = parsed.confidence === 'high'
        ? 'Receipt scanned — review and save'
        : parsed.confidence === 'medium'
          ? 'Receipt scanned — please verify the details'
          : 'Receipt unclear — please check all fields';
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt scan failed');
    } finally {
      setScanningReceipt(false);
    }
  };

  // Handle paste of an image into the page (works while the form is open)
  useEffect(() => {
    if (!showForm) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            scanReceipt(file);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const saveEntry = async () => {
    if (!formAmount || isNaN(Number(formAmount))) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        amount: Number(formAmount),
        category: formCategory,
        description: formDesc || null,
        entry_date: formDate,
        type: formType,
      };

      const res = await fetch('/api/finance', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(editingId ? 'Transaction updated' : 'Transaction added');
        resetForm();
        fetchEntries();
        fetchInsight();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save transaction');
    }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    try {
      const res = await fetch(`/api/finance?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== id));
        toast.success('Deleted');
        fetchInsight();
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  // CSV import
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  // Bank statement upload handlers
  const parseStatement = async (file: File) => {
    setStatementUploading(true);
    setStatementResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/finance/statement/parse', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Statement parse failed');
        if (data.hint) toast(data.hint);
        return;
      }
      setStatementResult(data);
      // Default selection: all non-duplicates
      const selected = new Set<number>();
      (data.transactions || []).forEach((t: StatementTransaction, i: number) => {
        if (!t.duplicate_of) selected.add(i);
      });
      setStatementSelected(selected);
      const dupNote = data.stats.duplicates > 0 ? ` (${data.stats.duplicates} already imported)` : '';
      toast.success(`Found ${data.stats.total} transactions${dupNote}`);
    } catch {
      toast.error('Upload failed');
    } finally {
      setStatementUploading(false);
    }
  };

  const handleStatementSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('PDF too large (max 10MB)');
      return;
    }
    parseStatement(file);
    // Reset file input so the same file can be re-uploaded after cancel
    if (statementFileRef.current) statementFileRef.current.value = '';
  };

  const toggleStatementRow = (i: number) => {
    setStatementSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleStatementAll = () => {
    if (!statementResult) return;
    setStatementSelected((prev) => {
      const allNonDupe = statementResult.transactions
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => !t.duplicate_of)
        .map(({ i }) => i);
      if (prev.size === allNonDupe.length) return new Set();
      return new Set(allNonDupe);
    });
  };

  const updateStatementCategory = (i: number, category: string) => {
    if (!statementResult) return;
    const next = { ...statementResult };
    next.transactions = next.transactions.map((t, idx) => idx === i ? { ...t, suggested_category: category } : t);
    setStatementResult(next);
  };

  const importStatement = async () => {
    if (!statementResult || statementSelected.size === 0) {
      toast.error('Select at least one transaction');
      return;
    }
    setStatementImporting(true);
    try {
      const rows = Array.from(statementSelected)
        .map((i) => {
          const t = statementResult.transactions[i];
          return {
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.type,
            category: t.suggested_category,
            import_hash: t.import_hash,
          };
        });

      const res = await fetch('/api/finance/statement/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: rows }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Imported ${data.imported} new transaction${data.imported === 1 ? '' : 's'}${data.skipped ? ` (${data.skipped} skipped as duplicate)` : ''}`);
        setStatementResult(null);
          setStatementSelected(new Set());
        fetchEntries();
        fetchInsight();
      } else {
        toast.error(data.error || 'Import failed');
      }
    } catch {
      toast.error('Import failed');
    } finally {
      setStatementImporting(false);
    }
  };

  const cancelStatement = () => {
    setStatementResult(null);
    setStatementSelected(new Set());
  };

  const doImport = async () => {
    if (!csvText.trim()) { toast.error('Paste or upload CSV data'); return; }
    setImporting(true);
    try {
      const res = await fetch('/api/finance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Imported ${data.imported} transactions${data.skipped ? ` (${data.skipped} skipped)` : ''}`);
        setCsvText('');
        setShowImport(false);
        fetchEntries();
        fetchInsight();
      } else {
        toast.error(data.error || 'Import failed');
      }
    } catch {
      toast.error('Import failed');
    }
    setImporting(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={() => changeMonth(-1)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setMonth(getMonthStr(new Date()))}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors', isCurrentMonth ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary')}
            >
              {formatMonthDisplay(month)}
            </button>
            <button onClick={() => changeMonth(1)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={statementFileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleStatementSelect}
            className="hidden"
          />
          <button
            onClick={() => statementFileRef.current?.click()}
            disabled={statementUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {statementUploading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
            {statementUploading ? 'Parsing…' : 'Upload Statement'}
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-secondary transition-colors"
          >
            <Upload size={12} />
            Import CSV
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={12} />
            Add Transaction
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={24} className="animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Loading transactions...</p>
          </div>
        ) : (
          <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* AI Insight Banner */}
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {insightLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground text-sm">Analyzing your finances...</span>
                  </div>
                ) : (
                  <p className="text-foreground text-sm leading-relaxed">{insight || 'Add transactions to get AI insights.'}</p>
                )}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownCircle size={14} className="text-red-400" />
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Expenses</p>
                </div>
                <p className="text-foreground text-xl font-bold">R{totalExpense.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowUpCircle size={14} className="text-green-400" />
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Income</p>
                </div>
                <p className="text-foreground text-xl font-bold">R{totalIncome.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  {netFlow >= 0 ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-red-400" />}
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Net Flow</p>
                </div>
                <p className={cn('text-xl font-bold', netFlow >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {netFlow >= 0 ? '+' : ''}R{netFlow.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={14} className="text-primary" />
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Transactions</p>
                </div>
                <p className="text-foreground text-xl font-bold">{entries.length}</p>
              </div>
            </div>

            {/* Bar Chart by Category */}
            {Object.keys(categoryTotals).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-foreground font-semibold text-sm mb-4">Expenses by Category</h3>
                <div className="space-y-3">
                  {CATEGORIES.filter(c => categoryTotals[c]).map((cat) => {
                    const amount = categoryTotals[cat];
                    const pct = (amount / maxCategoryAmount) * 100;
                    const pctOfTotal = totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(0) : '0';
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs w-28 shrink-0 truncate">{cat}</span>
                        <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                          <div
                            className="h-full rounded-md transition-all duration-500 ease-out flex items-center px-2"
                            style={{
                              width: `${Math.max(pct, 4)}%`,
                              background: CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other,
                            }}
                          >
                            {pct > 20 && (
                              <span className="text-[10px] font-medium text-white/90 truncate">
                                R{amount.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-muted-foreground text-xs w-10 text-right shrink-0">{pctOfTotal}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CSV Import Panel */}
            {showImport && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-foreground font-semibold text-sm">Import CSV</h3>
                  <button onClick={() => setShowImport(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
                <p className="text-muted-foreground text-xs mb-3">
                  Upload a CSV with columns: date, amount, description, category. Negative amounts are treated as expenses.
                </p>
                <div className="flex gap-2 mb-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    Choose File
                  </button>
                </div>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Or paste CSV data here..."
                  rows={5}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-xs font-mono placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex justify-end mt-3">
                  <button
                    onClick={doImport}
                    disabled={importing || !csvText.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    Import
                  </button>
                </div>
              </div>
            )}

            {/* Add/Edit Form */}
            {showForm && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-foreground font-semibold text-sm">
                    {editingId ? 'Edit Transaction' : 'Add Transaction'}
                  </h3>
                  <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
                {/* Receipt scan toolbar (only on Add, not Edit) */}
                {!editingId && (
                  <div className="mb-3 flex items-center gap-2 flex-wrap">
                    <input
                      ref={receiptFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) scanReceipt(f);
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={receiptCameraRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) scanReceipt(f);
                        e.target.value = '';
                      }}
                    />

                    <button
                      onClick={() => receiptCameraRef.current?.click()}
                      disabled={scanningReceipt}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors disabled:opacity-50 sm:hidden"
                    >
                      <Camera size={12} />
                      Snap Receipt
                    </button>

                    <button
                      onClick={() => receiptFileRef.current?.click()}
                      disabled={scanningReceipt}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {scanningReceipt
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Scan size={12} />
                      }
                      {scanningReceipt ? 'Scanning...' : 'Scan Receipt'}
                    </button>

                    <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                      Or paste an image (Ctrl+V) to auto-fill
                    </span>

                    {receiptConfidence && (
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto',
                        receiptConfidence === 'high' && 'bg-green-500/10 text-green-400',
                        receiptConfidence === 'medium' && 'bg-yellow-500/10 text-yellow-400',
                        receiptConfidence === 'low' && 'bg-red-500/10 text-red-400',
                      )}>
                        AI confidence: {receiptConfidence}
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Type toggle */}
                  <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
                    <button
                      onClick={() => setFormType('expense')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                        formType === 'expense'
                          ? 'border-red-500/50 bg-red-500/10 text-red-400'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                      )}
                    >
                      <ArrowDownCircle size={14} />
                      Expense
                    </button>
                    <button
                      onClick={() => setFormType('income')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                        formType === 'income'
                          ? 'border-green-500/50 bg-green-500/10 text-green-400'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                      )}
                    >
                      <ArrowUpCircle size={14} />
                      Income
                    </button>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1 block">Amount (R)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1 block">Category</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Date */}
                  <div>
                    <label className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1 block">Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Description */}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1 block">Description</label>
                    <input
                      type="text"
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="e.g. Groceries at Checkers"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={resetForm}
                    className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEntry}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    {editingId ? 'Update' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            {/* Transaction List */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-foreground font-semibold text-sm">Transactions</h3>
                <span className="text-muted-foreground text-xs">{entries.length} entries</span>
              </div>
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <DollarSign size={32} className="text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">No transactions this month</p>
                  <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={12} />
                    Add First Transaction
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/50 transition-colors group">
                      {/* Type indicator */}
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          entry.type === 'expense' ? 'bg-red-500/10' : 'bg-green-500/10'
                        )}
                      >
                        {entry.type === 'expense'
                          ? <ArrowDownCircle size={14} className="text-red-400" />
                          : <ArrowUpCircle size={14} className="text-green-400" />
                        }
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-sm font-medium truncate">
                          {entry.description || entry.category}
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              background: `color-mix(in oklch, ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.Other} 15%, transparent)`,
                              color: CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.Other,
                            }}
                          >
                            {entry.category}
                          </span>
                          <span className="text-muted-foreground/60 text-[10px]">
                            {new Date(entry.entry_date + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>

                      {/* Amount */}
                      <span className={cn(
                        'text-sm font-bold shrink-0',
                        entry.type === 'expense' ? 'text-red-400' : 'text-green-400'
                      )}>
                        {entry.type === 'expense' ? '-' : '+'}R{Number(entry.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => startEdit(entry)}
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Statement Preview Modal ── */}
      {statementResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-foreground font-bold text-lg flex items-center gap-2">
                  <FileText size={18} className="text-primary" />
                  Bank Statement Preview
                </h3>
                <div className="text-muted-foreground text-xs mt-1 flex items-center gap-3 flex-wrap">
                  {statementResult.account_info?.holder && <span>{statementResult.account_info.holder}</span>}
                  {statementResult.account_info?.last4 && <span className="font-mono">••••{statementResult.account_info.last4}</span>}
                  {statementResult.period_start && statementResult.period_end && (
                    <span>{statementResult.period_start} → {statementResult.period_end}</span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary">{statementResult.currency}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">{statementResult.stats.model_used}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{statementResult.stats.parse_mode}</span>
                </div>
              </div>
              <button onClick={cancelStatement} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Stats strip */}
            <div className="px-6 py-3 border-b border-border bg-surface-1/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center shrink-0">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Transactions</p>
                <p className="text-foreground font-bold">{statementResult.stats.total}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Expenses</p>
                <p className="text-red-400 font-bold">{statementResult.stats.expenses}</p>
                <p className="text-muted-foreground text-[10px]">R{statementResult.stats.total_expense_amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Income</p>
                <p className="text-green-400 font-bold">{statementResult.stats.income}</p>
                <p className="text-muted-foreground text-[10px]">R{statementResult.stats.total_income_amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Already imported</p>
                <p className="text-yellow-400 font-bold">{statementResult.stats.duplicates}</p>
              </div>
            </div>

            {/* Select-all bar */}
            <div className="px-6 py-2 border-b border-border flex items-center justify-between shrink-0">
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={statementSelected.size > 0 && statementSelected.size === statementResult.transactions.filter(t => !t.duplicate_of).length}
                  onChange={toggleStatementAll}
                  className="w-3.5 h-3.5"
                />
                Select all non-duplicates
              </label>
              <span className="text-muted-foreground text-xs">{statementSelected.size} selected</span>
            </div>

            {/* Transaction table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[600px] text-xs">
                <thead className="sticky top-0 bg-background border-b border-border">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-semibold uppercase tracking-wider">Date</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-semibold uppercase tracking-wider">Description</th>
                    <th className="px-3 py-2 text-right text-muted-foreground font-semibold uppercase tracking-wider">Amount</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-semibold uppercase tracking-wider">Category</th>
                    <th className="px-3 py-2 text-center text-muted-foreground font-semibold uppercase tracking-wider">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {statementResult.transactions.map((t, i) => {
                    const isDupe = !!t.duplicate_of;
                    const isSelected = statementSelected.has(i);
                    return (
                      <tr
                        key={i}
                        className={cn(
                          'hover:bg-surface-2/30 transition-colors',
                          isDupe && 'bg-yellow-500/5',
                          isSelected && !isDupe && 'bg-primary/5'
                        )}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleStatementRow(i)}
                            disabled={isDupe}
                            className="w-3.5 h-3.5 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{t.date}</td>
                        <td className="px-3 py-2 max-w-xs">
                          <p className="text-foreground truncate" title={t.raw_line || t.description}>
                            {t.description}
                          </p>
                          {isDupe && (
                            <p className="text-yellow-400 text-[10px] flex items-center gap-1 mt-0.5">
                              <AlertCircle size={10} />
                              Already imported
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium">
                          <span className={t.type === 'expense' ? 'text-red-400' : 'text-green-400'}>
                            {t.type === 'expense' ? '−' : '+'}R{t.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={t.suggested_category}
                            onChange={(e) => updateStatementCategory(i, e.target.value)}
                            disabled={isDupe}
                            className="bg-secondary border border-border rounded px-2 py-0.5 text-xs text-foreground disabled:opacity-40"
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {t.type === 'expense'
                            ? <ArrowDownCircle size={14} className="text-red-400 inline" />
                            : <ArrowUpCircle size={14} className="text-green-400 inline" />
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between shrink-0">
              <p className="text-muted-foreground text-xs flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-primary" />
                Duplicates are auto-unchecked. Edit categories inline before importing.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelStatement}
                  className="px-4 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={importStatement}
                  disabled={statementImporting || statementSelected.size === 0}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs bg-primary text-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {statementImporting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  Import {statementSelected.size} transaction{statementSelected.size === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
