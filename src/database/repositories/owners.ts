import * as SQLite from "expo-sqlite";
import { formatCurrency, toMonthKey } from "../../shared/utils/format";
import {
  addMonthsToMonthKey,
  getMonthDateRange,
  normalizeDateKey,
  toLocalDateKey,
} from "../dates";
import { DatabaseError } from "../errors";
import { fromCents } from "../money";
import { generateUuid, nowIsoUtc } from "../utils";

export interface Owner {
  id: string;
  name: string;
  isSelf: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOwnerInput {
  name: string;
}

export interface UpdateOwnerInput {
  name: string;
}

export type OwnerStatementPeriod =
  "current_month" | "next_month" | "range" | "all";

export type OwnerStatementTypeFilter = "INCOME" | "EXPENSE";

export interface OwnerStatementFilter {
  ownerId: string;
  period: OwnerStatementPeriod;
  from?: string;
  to?: string;
  type?: OwnerStatementTypeFilter;
  includeOverdue?: boolean;
  page?: number;
  pageSize?: number;
  referenceDate?: Date;
}

export interface OwnerStatementItem {
  installmentId: string;
  transactionId: string;
  transactionName: string;
  type: "INCOME" | "EXPENSE";
  number: number;
  installmentsCount: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paidAt: string | null;
  status: "PENDING" | "PAID";
  isOverdue: boolean;
  categoryName: string | null;
  invoiceName: string | null;
}

export interface OwnerStatementTotals {
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
  pendingTotal: number;
  paidTotal: number;
  overdueTotal: number;
  totalCount: number;
}

export interface OwnerStatement {
  owner: Owner;
  period: OwnerStatementPeriod;
  page: number;
  pageSize: number;
  totalPages: number;
  items: OwnerStatementItem[];
  totals: OwnerStatementTotals;
}

export interface BuildOwnerShareSummaryOptions {
  mode: "total" | "detailed";
  periodLabel: string;
}

interface OwnerRow {
  id: string;
  name: string;
  is_self: number;
  created_at: string;
  updated_at: string;
}

interface StatementItemRow {
  installment_id: string;
  transaction_id: string;
  transaction_name: string;
  type: "INCOME" | "EXPENSE";
  number: number;
  installments_count: number;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_at: string | null;
  status: "PENDING" | "PAID";
  is_overdue: number;
  category_name: string | null;
  invoice_name: string | null;
}

interface StatementTotalsRow {
  income_total: number;
  expense_total: number;
  pending_total: number;
  paid_total: number;
  overdue_total: number;
  total_count: number;
}

function mapOwnerRow(row: OwnerRow): Owner {
  return {
    id: row.id,
    name: row.name,
    isSelf: row.is_self === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateOwnerName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O nome do responsável é obrigatório."
    );
  }

  return trimmed;
}

async function assertOwnerExists(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<OwnerRow> {
  const row = await db.getFirstAsync<OwnerRow>(
    `SELECT id, name, is_self, created_at, updated_at
     FROM owners
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );

  if (!row) {
    throw new DatabaseError("NOT_FOUND", "Responsável não encontrado.");
  }

  return row;
}

export async function listOwners(db: SQLite.SQLiteDatabase): Promise<Owner[]> {
  const rows = await db.getAllAsync<OwnerRow>(
    `SELECT id, name, is_self, created_at, updated_at
     FROM owners
     WHERE deleted_at IS NULL
     ORDER BY is_self DESC, name COLLATE NOCASE ASC`
  );

  return rows.map(mapOwnerRow);
}

export async function getOwnerById(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<Owner | null> {
  const row = await db.getFirstAsync<OwnerRow>(
    `SELECT id, name, is_self, created_at, updated_at
     FROM owners
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );

  return row ? mapOwnerRow(row) : null;
}

export async function getSelfOwner(
  db: SQLite.SQLiteDatabase
): Promise<Owner | null> {
  const row = await db.getFirstAsync<OwnerRow>(
    `SELECT id, name, is_self, created_at, updated_at
     FROM owners
     WHERE is_self = 1 AND deleted_at IS NULL
     LIMIT 1`
  );

  return row ? mapOwnerRow(row) : null;
}

export async function createOwner(
  db: SQLite.SQLiteDatabase,
  input: CreateOwnerInput
): Promise<Owner> {
  const name = validateOwnerName(input.name);
  const id = generateUuid();
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `INSERT INTO owners (id, name, is_self, created_at, updated_at, deleted_at)
     VALUES (?, ?, 0, ?, ?, NULL)`,
    id,
    name,
    timestamp,
    timestamp
  );

  return {
    id,
    name,
    isSelf: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function updateOwner(
  db: SQLite.SQLiteDatabase,
  id: string,
  input: UpdateOwnerInput
): Promise<Owner> {
  const existing = await assertOwnerExists(db, id);
  const name = validateOwnerName(input.name);
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `UPDATE owners
     SET name = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    name,
    timestamp,
    id
  );

  return {
    id: existing.id,
    name,
    isSelf: existing.is_self === 1,
    createdAt: existing.created_at,
    updatedAt: timestamp,
  };
}

export async function updateSelfOwnerName(
  db: SQLite.SQLiteDatabase,
  name: string
): Promise<Owner> {
  const selfOwner = await getSelfOwner(db);

  if (!selfOwner) {
    throw new DatabaseError("NOT_FOUND", "Responsável padrão não encontrado.");
  }

  const trimmed = validateOwnerName(name);
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `UPDATE owners
     SET name = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    trimmed,
    timestamp,
    selfOwner.id
  );

  return {
    ...selfOwner,
    name: trimmed,
    updatedAt: timestamp,
  };
}

export async function deleteOwner(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await assertOwnerExists(txn, id);

    if (existing.is_self === 1) {
      throw new DatabaseError(
        "FORBIDDEN",
        'Não é possível excluir o responsável padrão "EU".'
      );
    }

    const linkedRow = (await txn.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM transactions
       WHERE owner_id = ? AND deleted_at IS NULL`,
      id
    )) as { total: number };

    if (linkedRow.total > 0) {
      throw new DatabaseError(
        "CONFLICT",
        "Não é possível excluir um responsável com lançamentos vinculados."
      );
    }

    const timestamp = nowIsoUtc();
    await txn.runAsync(
      `UPDATE owners
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      id
    );
  });
}

function resolvePeriodRange(
  filter: OwnerStatementFilter,
  referenceDate: Date
): { start: string; end: string } | null {
  if (filter.period === "all") {
    return null;
  }

  if (filter.period === "current_month") {
    return getMonthDateRange(toMonthKey(referenceDate));
  }

  if (filter.period === "next_month") {
    return getMonthDateRange(addMonthsToMonthKey(toMonthKey(referenceDate), 1));
  }

  if (!filter.from || !filter.to) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Informe as datas inicial e final do período."
    );
  }

  const start = normalizeDateKey(filter.from);
  const end = normalizeDateKey(filter.to);

  if (start > end) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "A data inicial não pode ser maior que a data final."
    );
  }

  return { start, end };
}

export async function getOwnerStatement(
  db: SQLite.SQLiteDatabase,
  filter: OwnerStatementFilter
): Promise<OwnerStatement> {
  const ownerRow = await assertOwnerExists(db, filter.ownerId);
  const owner = mapOwnerRow(ownerRow);

  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;

  if (!Number.isInteger(page) || page < 1) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "A página deve ser um número inteiro maior ou igual a 1."
    );
  }

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O tamanho da página deve ser um número inteiro maior ou igual a 1."
    );
  }

  const referenceDate = filter.referenceDate ?? new Date();
  const todayKey = toLocalDateKey(referenceDate);
  const range = resolvePeriodRange(filter, referenceDate);

  const whereClauses: string[] = [
    "t.owner_id = ?",
    "t.deleted_at IS NULL",
    "i.deleted_at IS NULL",
  ];
  const whereParams: (string | number)[] = [owner.id];

  if (filter.type !== undefined) {
    whereClauses.push("t.type = ?");
    whereParams.push(filter.type);
  }

  if (range !== null) {
    if (filter.includeOverdue) {
      whereClauses.push(
        "(substr(i.due_date, 1, 10) BETWEEN ? AND ? OR (i.status = 'PENDING' AND substr(i.due_date, 1, 10) < ?))"
      );
      whereParams.push(range.start, range.end, todayKey);
    } else {
      whereClauses.push("substr(i.due_date, 1, 10) BETWEEN ? AND ?");
      whereParams.push(range.start, range.end);
    }
  }

  const whereSql = whereClauses.join(" AND ");

  const totalsRow = (await db.getFirstAsync<StatementTotalsRow>(
    `SELECT
       COUNT(*) AS total_count,
       COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN i.amount ELSE 0 END), 0) AS income_total,
       COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN i.amount ELSE 0 END), 0) AS expense_total,
       COALESCE(SUM(CASE WHEN i.status = 'PENDING' THEN i.amount - i.paid_amount ELSE 0 END), 0) AS pending_total,
       COALESCE(SUM(i.paid_amount), 0) AS paid_total,
       COALESCE(SUM(CASE WHEN i.status = 'PENDING' AND substr(i.due_date, 1, 10) < ? THEN i.amount - i.paid_amount ELSE 0 END), 0) AS overdue_total
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     WHERE ${whereSql}`,
    todayKey,
    ...whereParams
  )) as StatementTotalsRow;

  const offset = (page - 1) * pageSize;
  const itemRows = await db.getAllAsync<StatementItemRow>(
    `SELECT
       i.id AS installment_id,
       t.id AS transaction_id,
       t.name AS transaction_name,
       t.type AS type,
       i.number AS number,
       t.installments_count AS installments_count,
       i.amount AS amount,
       i.paid_amount AS paid_amount,
       i.due_date AS due_date,
       i.paid_at AS paid_at,
       i.status AS status,
       CASE
         WHEN i.status = 'PENDING' AND substr(i.due_date, 1, 10) < ? THEN 1
         ELSE 0
       END AS is_overdue,
       c.name AS category_name,
       inv.name AS invoice_name
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
     LEFT JOIN invoices inv ON inv.id = t.invoice_id AND inv.deleted_at IS NULL
     WHERE ${whereSql}
     ORDER BY is_overdue DESC, i.due_date ASC, i.number ASC
     LIMIT ? OFFSET ?`,
    todayKey,
    ...whereParams,
    pageSize,
    offset
  );

  const items: OwnerStatementItem[] = itemRows.map((row) => ({
    installmentId: row.installment_id,
    transactionId: row.transaction_id,
    transactionName: row.transaction_name,
    type: row.type,
    number: row.number,
    installmentsCount: row.installments_count,
    amount: fromCents(row.amount),
    paidAmount: fromCents(row.paid_amount),
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status,
    isOverdue: row.is_overdue === 1,
    categoryName: row.category_name,
    invoiceName: row.invoice_name,
  }));

  const netCents = totalsRow.income_total - totalsRow.expense_total;
  const totalPages = Math.max(1, Math.ceil(totalsRow.total_count / pageSize));

  return {
    owner,
    period: filter.period,
    page,
    pageSize,
    totalPages,
    items,
    totals: {
      incomeTotal: fromCents(totalsRow.income_total),
      expenseTotal: fromCents(totalsRow.expense_total),
      netTotal: fromCents(netCents),
      pendingTotal: fromCents(totalsRow.pending_total),
      paidTotal: fromCents(totalsRow.paid_total),
      overdueTotal: fromCents(totalsRow.overdue_total),
      totalCount: totalsRow.total_count,
    },
  };
}

function getItemStatusLabel(item: OwnerStatementItem): string {
  if (item.status === "PAID") {
    return "Pago";
  }

  if (item.isOverdue) {
    return "Em atraso";
  }

  return "Pendente";
}

function formatDayMonthFromDateKey(dueDate: string): string {
  const [, month, day] = normalizeDateKey(dueDate).split("-");
  return `${day}/${month}`;
}

export function buildOwnerShareSummary(
  statement: OwnerStatement,
  options: BuildOwnerShareSummaryOptions
): string {
  const lines: string[] = [
    `Resumo de ${statement.owner.name} (${options.periodLabel})`,
    "",
  ];

  if (statement.totals.incomeTotal > 0) {
    lines.push(`Receitas: ${formatCurrency(statement.totals.incomeTotal)}`);
  }

  if (statement.totals.expenseTotal > 0) {
    lines.push(`Despesas: ${formatCurrency(statement.totals.expenseTotal)}`);
  }

  lines.push(`Pago: ${formatCurrency(statement.totals.paidTotal)}`);
  lines.push(`Pendente: ${formatCurrency(statement.totals.pendingTotal)}`);

  if (statement.totals.overdueTotal > 0) {
    lines.push(`Em atraso: ${formatCurrency(statement.totals.overdueTotal)}`);
  }

  lines.push(`Saldo líquido: ${formatCurrency(statement.totals.netTotal)}`);

  if (options.mode === "detailed") {
    lines.push("");
    if (statement.items.length === 0) {
      lines.push("Nenhum lançamento no período.");
    } else {
      lines.push("Lançamentos:");
      for (const item of statement.items) {
        const installmentLabel =
          item.installmentsCount > 1
            ? ` (${item.number}/${item.installmentsCount})`
            : "";
        const sign = item.type === "INCOME" ? "+" : "-";
        const statusLabel = getItemStatusLabel(item);
        lines.push(
          `• ${formatDayMonthFromDateKey(item.dueDate)} - ${item.transactionName}${installmentLabel}: ${sign}${formatCurrency(item.amount)} (${statusLabel})`
        );
      }
    }
  }

  return lines.join("\n");
}
