import * as SQLite from "expo-sqlite";
import { Migration } from "./types";

const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS category_budgets (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  is_self INTEGER NOT NULL DEFAULT 0 CHECK (is_self IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  limit_amount INTEGER NOT NULL DEFAULT 0 CHECK (limit_amount >= 0),
  color TEXT,
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  closing_day INTEGER CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  group_id TEXT,
  installments_count INTEGER NOT NULL DEFAULT 1 CHECK (installments_count >= 1),
  recurrence INTEGER NOT NULL DEFAULT 0 CHECK (recurrence IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS installments (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number >= 1),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  paid_amount INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount),
  due_date TEXT NOT NULL,
  paid_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY NOT NULL,
  since TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  institution TEXT,
  current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS investment_contributions (
  id TEXT PRIMARY KEY NOT NULL,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  contributed_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_category_budgets_category_month
  ON category_budgets(category_id, month DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_category_budgets_unique_active
  ON category_budgets(category_id, month)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_owners_is_self
  ON owners(is_self);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_unique_self_active
  ON owners(is_self)
  WHERE is_self = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_owner_id
  ON transactions(owner_id);

CREATE INDEX IF NOT EXISTS idx_transactions_category_id
  ON transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id
  ON transactions(invoice_id);

CREATE INDEX IF NOT EXISTS idx_transactions_group_id
  ON transactions(group_id);

CREATE INDEX IF NOT EXISTS idx_transactions_recurring_active
  ON transactions(recurrence, active)
  WHERE recurrence = 1 AND active = 1 AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_installments_transaction_number
  ON installments(transaction_id, number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_installments_due_date_pending
  ON installments(due_date)
  WHERE status = 'PENDING' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_goals_since
  ON goals(since DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_unique_since_active
  ON goals(since)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_investment_contributions_investment_date
  ON investment_contributions(investment_id, contributed_at DESC);
`;

export const migration001InitialSchema: Migration = {
  version: 1,
  name: "initial_schema",
  async up(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(INITIAL_SCHEMA_SQL);
  },
};
