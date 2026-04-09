-- Phase 3.1: Finance Tracker — finance_entries table
CREATE TABLE IF NOT EXISTS finance_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_user ON finance_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON finance_entries(user_id, entry_date);

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;
