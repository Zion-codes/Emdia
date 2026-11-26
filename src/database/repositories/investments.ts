import * as SQLite from "expo-sqlite";
import { normalizeDateKey } from "../dates";
import { DatabaseError } from "../errors";
import { fromCents, toCents, toPositiveCents } from "../money";
import { generateUuid, nowIsoUtc } from "../utils";

export interface Investment {
  id: string;
  name: string;
  type: string | null;
  institution: string | null;
  currentBalance: number;
  totalContributed: number;
  contributionsCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentContribution {
  id: string;
  investmentId: string;
  amount: number;
  contributedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvestmentInput {
  name: string;
  type?: string | null;
  institution?: string | null;
  currentBalance?: number;
  notes?: string | null;
}

export interface UpdateInvestmentInput {
  name?: string;
  type?: string | null;
  institution?: string | null;
  currentBalance?: number;
  notes?: string | null;
}

export interface CreateContributionInput {
  investmentId: string;
  amount: number;
  contributedAt: string;
  notes?: string | null;
}

export interface UpdateContributionInput {
  amount?: number;
  contributedAt?: string;
  notes?: string | null;
}

interface InvestmentRow {
  id: string;
  name: string;
  type: string | null;
  institution: string | null;
  current_balance: number;
  total_contributed: number;
  contributions_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ContributionRow {
  id: string;
  investment_id: string;
  amount: number;
  contributed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapInvestmentRow(row: InvestmentRow): Investment {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    institution: row.institution,
    currentBalance: fromCents(row.current_balance),
    totalContributed: fromCents(row.total_contributed),
    contributionsCount: row.contributions_count,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContributionRow(row: ContributionRow): InvestmentContribution {
  return {
    id: row.id,
    investmentId: row.investment_id,
    amount: fromCents(row.amount),
    contributedAt: row.contributed_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateInvestmentName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O nome do investimento é obrigatório."
    );
  }

  return trimmed;
}

async function assertInvestmentExists(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<{
  id: string;
  name: string;
  type: string | null;
  institution: string | null;
  current_balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}> {
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    type: string | null;
    institution: string | null;
    current_balance: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, type, institution, current_balance, notes, created_at, updated_at
     FROM investments
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );

  if (!row) {
    throw new DatabaseError("NOT_FOUND", "Investimento não encontrado.");
  }

  return row;
}

async function assertContributionExists(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<ContributionRow> {
  const row = await db.getFirstAsync<ContributionRow>(
    `SELECT id, investment_id, amount, contributed_at, notes, created_at, updated_at
     FROM investment_contributions
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );

  if (!row) {
    throw new DatabaseError("NOT_FOUND", "Aporte não encontrado.");
  }

  return row;
}

export async function listInvestments(
  db: SQLite.SQLiteDatabase
): Promise<Investment[]> {
  const rows = await db.getAllAsync<InvestmentRow>(
    `SELECT
       i.id,
       i.name,
       i.type,
       i.institution,
       i.current_balance,
       i.notes,
       i.created_at,
       i.updated_at,
       COALESCE(SUM(c.amount), 0) AS total_contributed,
       COUNT(c.id) AS contributions_count
     FROM investments i
     LEFT JOIN investment_contributions c
       ON c.investment_id = i.id AND c.deleted_at IS NULL
     WHERE i.deleted_at IS NULL
     GROUP BY i.id
     ORDER BY i.name COLLATE NOCASE ASC`
  );

  return rows.map(mapInvestmentRow);
}

export async function getInvestmentById(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<Investment | null> {
  const row = await db.getFirstAsync<InvestmentRow>(
    `SELECT
       i.id,
       i.name,
       i.type,
       i.institution,
       i.current_balance,
       i.notes,
       i.created_at,
       i.updated_at,
       COALESCE(SUM(c.amount), 0) AS total_contributed,
       COUNT(c.id) AS contributions_count
     FROM investments i
     LEFT JOIN investment_contributions c
       ON c.investment_id = i.id AND c.deleted_at IS NULL
     WHERE i.id = ? AND i.deleted_at IS NULL
     GROUP BY i.id`,
    id
  );

  return row ? mapInvestmentRow(row) : null;
}

export async function createInvestment(
  db: SQLite.SQLiteDatabase,
  input: CreateInvestmentInput
): Promise<Investment> {
  const name = validateInvestmentName(input.name);
  const type = input.type ?? null;
  const institution = input.institution ?? null;
  const currentBalanceCents = toCents(input.currentBalance ?? 0);
  const notes = input.notes ?? null;
  const id = generateUuid();
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `INSERT INTO investments (id, name, type, institution, current_balance, notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    id,
    name,
    type,
    institution,
    currentBalanceCents,
    notes,
    timestamp,
    timestamp
  );

  return {
    id,
    name,
    type,
    institution,
    currentBalance: fromCents(currentBalanceCents),
    totalContributed: 0,
    contributionsCount: 0,
    notes,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function updateInvestment(
  db: SQLite.SQLiteDatabase,
  id: string,
  input: UpdateInvestmentInput
): Promise<Investment> {
  const existing = await assertInvestmentExists(db, id);
  const name =
    input.name !== undefined
      ? validateInvestmentName(input.name)
      : existing.name;
  const type = input.type !== undefined ? input.type : existing.type;
  const institution =
    input.institution !== undefined ? input.institution : existing.institution;
  const currentBalanceCents =
    input.currentBalance !== undefined
      ? toCents(input.currentBalance)
      : existing.current_balance;
  const notes = input.notes !== undefined ? input.notes : existing.notes;
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `UPDATE investments
     SET name = ?, type = ?, institution = ?, current_balance = ?, notes = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    name,
    type,
    institution,
    currentBalanceCents,
    notes,
    timestamp,
    id
  );

  return (await getInvestmentById(db, id)) as Investment;
}

export async function deleteInvestment(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await assertInvestmentExists(txn, id);
    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE investment_contributions
       SET deleted_at = ?, updated_at = ?
       WHERE investment_id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      id
    );

    await txn.runAsync(
      `UPDATE investments
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      id
    );
  });
}

export async function listContributions(
  db: SQLite.SQLiteDatabase,
  investmentId: string
): Promise<InvestmentContribution[]> {
  await assertInvestmentExists(db, investmentId);
  const rows = await db.getAllAsync<ContributionRow>(
    `SELECT id, investment_id, amount, contributed_at, notes, created_at, updated_at
     FROM investment_contributions
     WHERE investment_id = ? AND deleted_at IS NULL
     ORDER BY contributed_at DESC, created_at DESC`,
    investmentId
  );

  return rows.map(mapContributionRow);
}

export async function getContributionById(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<InvestmentContribution | null> {
  const row = await db.getFirstAsync<ContributionRow>(
    `SELECT id, investment_id, amount, contributed_at, notes, created_at, updated_at
     FROM investment_contributions
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );

  return row ? mapContributionRow(row) : null;
}

export async function createContribution(
  db: SQLite.SQLiteDatabase,
  input: CreateContributionInput
): Promise<InvestmentContribution> {
  await assertInvestmentExists(db, input.investmentId);
  const amountCents = toPositiveCents(input.amount);
  const contributedAt = normalizeDateKey(input.contributedAt);
  const notes = input.notes ?? null;
  const id = generateUuid();
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `INSERT INTO investment_contributions (id, investment_id, amount, contributed_at, notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    id,
    input.investmentId,
    amountCents,
    contributedAt,
    notes,
    timestamp,
    timestamp
  );

  return {
    id,
    investmentId: input.investmentId,
    amount: fromCents(amountCents),
    contributedAt,
    notes,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function updateContribution(
  db: SQLite.SQLiteDatabase,
  id: string,
  input: UpdateContributionInput
): Promise<InvestmentContribution> {
  const existing = await assertContributionExists(db, id);
  const amountCents =
    input.amount !== undefined
      ? toPositiveCents(input.amount)
      : existing.amount;
  const contributedAt =
    input.contributedAt !== undefined
      ? normalizeDateKey(input.contributedAt)
      : existing.contributed_at;
  const notes = input.notes !== undefined ? input.notes : existing.notes;
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `UPDATE investment_contributions
     SET amount = ?, contributed_at = ?, notes = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    amountCents,
    contributedAt,
    notes,
    timestamp,
    id
  );

  return {
    id: existing.id,
    investmentId: existing.investment_id,
    amount: fromCents(amountCents),
    contributedAt,
    notes,
    createdAt: existing.created_at,
    updatedAt: timestamp,
  };
}

export async function deleteContribution(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<void> {
  await assertContributionExists(db, id);
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `UPDATE investment_contributions
     SET deleted_at = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    timestamp,
    timestamp,
    id
  );
}
