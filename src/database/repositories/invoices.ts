import * as SQLite from "expo-sqlite";
import { toMonthKey } from "../../shared/utils/format";
import {
  assertMonthKey,
  getMonthDateRange,
  normalizeDateKey,
  toLocalDateKey,
} from "../dates";
import { DatabaseError } from "../errors";
import { fromCents, toCents, toPositiveCents } from "../money";
import { generateUuid, nowIsoUtc } from "../utils";
import type { InstallmentStatus } from "./installments";
import type { TransactionType } from "./transactions";

export interface Invoice {
  id: string;
  name: string;
  limitAmount: number;
  usedLimit: number;
  availableLimit: number;
  monthTotal: number;
  monthPaid: number;
  monthPending: number;
  color: string | null;
  dueDay: number;
  closingDay: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceInput {
  name: string;
  limitAmount?: number;
  color?: string | null;
  dueDay: number;
  closingDay?: number | null;
}

export interface UpdateInvoiceInput {
  name?: string;
  limitAmount?: number;
  color?: string | null;
  dueDay?: number;
  closingDay?: number | null;
}

export interface InvoiceQueryOptions {
  month?: string;
  referenceDate?: Date;
}

export interface InvoiceInstallmentItem {
  installmentId: string;
  transactionId: string;
  name: string;
  type: TransactionType;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  number: number;
  installmentsCount: number;
  dueDate: string;
  paidAt: string | null;
  status: InstallmentStatus;
  isOverdue: boolean;
  categoryId: string | null;
  categoryName: string | null;
  ownerId: string;
  ownerName: string;
}

export interface InvoiceMonthSummary {
  invoice: Invoice;
  month: string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueCount: number;
  installments: InvoiceInstallmentItem[];
}

export interface PayInvoiceInput {
  invoiceId: string;
  month: string;
  amount?: number;
  paidAt?: string;
}

export interface PayInvoiceUpdatedInstallment {
  installmentId: string;
  transactionId: string;
  number: number;
  allocatedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: InstallmentStatus;
}

export interface PayInvoiceResult {
  invoiceId: string;
  month: string;
  paidAmount: number;
  remainingMonthAmount: number;
  settledCount: number;
  partiallyPaidCount: number;
  updatedInstallments: PayInvoiceUpdatedInstallment[];
}

interface InvoiceBaseRow {
  id: string;
  name: string;
  limit_amount: number;
  color: string | null;
  due_day: number;
  closing_day: number | null;
  created_at: string;
  updated_at: string;
}

interface InvoiceRow extends InvoiceBaseRow {
  used_cents: number;
  month_total_cents: number;
  month_paid_cents: number;
  month_pending_cents: number;
}

interface InvoiceInstallmentRow {
  installment_id: string;
  transaction_id: string;
  name: string;
  type: TransactionType;
  amount: number;
  paid_amount: number;
  number: number;
  installments_count: number;
  due_date: string;
  paid_at: string | null;
  status: InstallmentStatus;
  category_id: string | null;
  category_name: string | null;
  owner_id: string;
  owner_name: string;
}

interface PendingInstallmentForPaymentRow {
  id: string;
  transaction_id: string;
  number: number;
  amount: number;
  paid_amount: number;
}

const INVOICE_SELECT_FROM = `SELECT
  inv.id,
  inv.name,
  inv.limit_amount,
  inv.color,
  inv.due_day,
  inv.closing_day,
  inv.created_at,
  inv.updated_at,
  COALESCE((
    SELECT SUM(i.amount - i.paid_amount)
    FROM installments i
    INNER JOIN transactions t ON t.id = i.transaction_id
    WHERE t.invoice_id = inv.id
      AND t.type = 'EXPENSE'
      AND t.deleted_at IS NULL
      AND i.deleted_at IS NULL
      AND i.status = 'PENDING'
  ), 0) AS used_cents,
  COALESCE((
    SELECT SUM(i.amount)
    FROM installments i
    INNER JOIN transactions t ON t.id = i.transaction_id
    WHERE t.invoice_id = inv.id
      AND t.deleted_at IS NULL
      AND i.deleted_at IS NULL
      AND substr(i.due_date, 1, 10) BETWEEN ? AND ?
  ), 0) AS month_total_cents,
  COALESCE((
    SELECT SUM(i.paid_amount)
    FROM installments i
    INNER JOIN transactions t ON t.id = i.transaction_id
    WHERE t.invoice_id = inv.id
      AND t.deleted_at IS NULL
      AND i.deleted_at IS NULL
      AND substr(i.due_date, 1, 10) BETWEEN ? AND ?
  ), 0) AS month_paid_cents,
  COALESCE((
    SELECT SUM(i.amount - i.paid_amount)
    FROM installments i
    INNER JOIN transactions t ON t.id = i.transaction_id
    WHERE t.invoice_id = inv.id
      AND t.deleted_at IS NULL
      AND i.deleted_at IS NULL
      AND substr(i.due_date, 1, 10) BETWEEN ? AND ?
  ), 0) AS month_pending_cents
FROM invoices inv`;

function mapInvoiceRow(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    name: row.name,
    limitAmount: fromCents(row.limit_amount),
    usedLimit: fromCents(row.used_cents),
    availableLimit: fromCents(row.limit_amount - row.used_cents),
    monthTotal: fromCents(row.month_total_cents),
    monthPaid: fromCents(row.month_paid_cents),
    monthPending: fromCents(row.month_pending_cents),
    color: row.color,
    dueDay: row.due_day,
    closingDay: row.closing_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInvoiceInstallmentRow(
  row: InvoiceInstallmentRow,
  todayKey: string
): InvoiceInstallmentItem {
  const remainingCents = row.amount - row.paid_amount;

  return {
    installmentId: row.installment_id,
    transactionId: row.transaction_id,
    name: row.name,
    type: row.type,
    amount: fromCents(row.amount),
    paidAmount: fromCents(row.paid_amount),
    remainingAmount: fromCents(remainingCents),
    number: row.number,
    installmentsCount: row.installments_count,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status,
    isOverdue: row.status === "PENDING" && row.due_date.slice(0, 10) < todayKey,
    categoryId: row.category_id,
    categoryName: row.category_name,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
  };
}

function resolveTargetMonth(options?: InvoiceQueryOptions): string {
  if (options?.month !== undefined) {
    return assertMonthKey(options.month);
  }

  return toMonthKey(options?.referenceDate ?? new Date());
}

function validateInvoiceName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O nome da fatura é obrigatório."
    );
  }

  return trimmed;
}

function normalizeOptionalColor(
  color: string | null | undefined
): string | null {
  if (color === undefined || color === null) {
    return null;
  }

  const trimmed = color.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateDayOfMonth(day: number, label: string): number {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      `${label} deve ser um inteiro entre 1 e 31.`
    );
  }

  return day;
}

function validateOptionalDayOfMonth(
  day: number | null | undefined,
  label: string
): number | null {
  if (day === undefined || day === null) {
    return null;
  }

  return validateDayOfMonth(day, label);
}

function validateRequiredInvoiceId(invoiceId: string): string {
  const trimmed = invoiceId.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O identificador da fatura é obrigatório."
    );
  }

  return trimmed;
}

function resolvePaidAt(paidAt?: string): string {
  if (paidAt === undefined) {
    return nowIsoUtc();
  }

  const trimmed = paidAt.trim();
  normalizeDateKey(trimmed);
  return trimmed;
}

async function assertInvoiceExists(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<InvoiceBaseRow> {
  const row = await db.getFirstAsync<InvoiceBaseRow>(
    `SELECT
       id,
       name,
       limit_amount,
       color,
       due_day,
       closing_day,
       created_at,
       updated_at
     FROM invoices
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );

  if (!row) {
    throw new DatabaseError("NOT_FOUND", "Fatura não encontrada.");
  }

  return row;
}

export async function listInvoices(
  db: SQLite.SQLiteDatabase,
  options?: InvoiceQueryOptions
): Promise<Invoice[]> {
  const month = resolveTargetMonth(options);
  const range = getMonthDateRange(month);

  const rows = await db.getAllAsync<InvoiceRow>(
    `${INVOICE_SELECT_FROM}
     WHERE inv.deleted_at IS NULL
     ORDER BY inv.name COLLATE NOCASE ASC`,
    range.start,
    range.end,
    range.start,
    range.end,
    range.start,
    range.end
  );

  return rows.map(mapInvoiceRow);
}

export async function getInvoiceById(
  db: SQLite.SQLiteDatabase,
  id: string,
  options?: InvoiceQueryOptions
): Promise<Invoice | null> {
  const month = resolveTargetMonth(options);
  const range = getMonthDateRange(month);

  const row = await db.getFirstAsync<InvoiceRow>(
    `${INVOICE_SELECT_FROM}
     WHERE inv.id = ? AND inv.deleted_at IS NULL`,
    range.start,
    range.end,
    range.start,
    range.end,
    range.start,
    range.end,
    id
  );

  return row ? mapInvoiceRow(row) : null;
}

export async function createInvoice(
  db: SQLite.SQLiteDatabase,
  input: CreateInvoiceInput
): Promise<Invoice> {
  const name = validateInvoiceName(input.name);
  const limitCents =
    input.limitAmount !== undefined ? toCents(input.limitAmount) : 0;
  const color = normalizeOptionalColor(input.color);
  const dueDay = validateDayOfMonth(input.dueDay, "O dia de vencimento");
  const closingDay = validateOptionalDayOfMonth(
    input.closingDay,
    "O dia de fechamento"
  );

  const id = generateUuid();
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `INSERT INTO invoices (
       id,
       name,
       limit_amount,
       color,
       due_day,
       closing_day,
       created_at,
       updated_at,
       deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    id,
    name,
    limitCents,
    color,
    dueDay,
    closingDay,
    timestamp,
    timestamp
  );

  return {
    id,
    name,
    limitAmount: fromCents(limitCents),
    usedLimit: 0,
    availableLimit: fromCents(limitCents),
    monthTotal: 0,
    monthPaid: 0,
    monthPending: 0,
    color,
    dueDay,
    closingDay,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function updateInvoice(
  db: SQLite.SQLiteDatabase,
  id: string,
  input: UpdateInvoiceInput
): Promise<Invoice> {
  const existing = await assertInvoiceExists(db, id);
  const name =
    input.name !== undefined ? validateInvoiceName(input.name) : existing.name;
  const limitCents =
    input.limitAmount !== undefined
      ? toCents(input.limitAmount)
      : existing.limit_amount;
  const color =
    input.color !== undefined
      ? normalizeOptionalColor(input.color)
      : existing.color;
  const dueDay =
    input.dueDay !== undefined
      ? validateDayOfMonth(input.dueDay, "O dia de vencimento")
      : existing.due_day;
  const closingDay =
    input.closingDay !== undefined
      ? validateOptionalDayOfMonth(input.closingDay, "O dia de fechamento")
      : existing.closing_day;
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `UPDATE invoices
     SET name = ?,
         limit_amount = ?,
         color = ?,
         due_day = ?,
         closing_day = ?,
         updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    name,
    limitCents,
    color,
    dueDay,
    closingDay,
    timestamp,
    id
  );

  return (await getInvoiceById(db, id)) as Invoice;
}

export async function deleteInvoice(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await assertInvoiceExists(txn, id);
    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE transactions
       SET invoice_id = NULL, updated_at = ?
       WHERE invoice_id = ? AND deleted_at IS NULL`,
      timestamp,
      id
    );

    await txn.runAsync(
      `UPDATE invoices
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      id
    );
  });
}

export async function getInvoiceMonthSummary(
  db: SQLite.SQLiteDatabase,
  invoiceId: string,
  month: string,
  referenceDate: Date = new Date()
): Promise<InvoiceMonthSummary> {
  const validMonth = assertMonthKey(month);
  const invoice = await getInvoiceById(db, invoiceId, {
    month: validMonth,
    referenceDate,
  });

  if (!invoice) {
    throw new DatabaseError("NOT_FOUND", "Fatura não encontrada.");
  }

  const range = getMonthDateRange(validMonth);
  const todayKey = toLocalDateKey(referenceDate);

  const rows = await db.getAllAsync<InvoiceInstallmentRow>(
    `SELECT
       i.id AS installment_id,
       t.id AS transaction_id,
       t.name,
       t.type,
       i.amount,
       i.paid_amount,
       i.number,
       t.installments_count,
       i.due_date,
       i.paid_at,
       i.status,
       t.category_id,
       c.name AS category_name,
       t.owner_id,
       o.name AS owner_name
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     INNER JOIN owners o ON o.id = t.owner_id
     LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
     WHERE t.invoice_id = ?
       AND t.deleted_at IS NULL
       AND i.deleted_at IS NULL
       AND substr(i.due_date, 1, 10) BETWEEN ? AND ?
     ORDER BY substr(i.due_date, 1, 10) ASC, i.number ASC, i.id ASC`,
    invoiceId,
    range.start,
    range.end
  );

  let totalCents = 0;
  let paidCents = 0;
  let pendingCents = 0;
  let overdueCount = 0;

  const installments = rows.map((row) => {
    totalCents += row.amount;
    paidCents += row.paid_amount;
    pendingCents += row.amount - row.paid_amount;

    const item = mapInvoiceInstallmentRow(row, todayKey);
    if (item.isOverdue) {
      overdueCount += 1;
    }

    return item;
  });

  return {
    invoice,
    month: validMonth,
    totalAmount: fromCents(totalCents),
    paidAmount: fromCents(paidCents),
    pendingAmount: fromCents(pendingCents),
    overdueCount,
    installments,
  };
}

export async function payInvoice(
  db: SQLite.SQLiteDatabase,
  input: PayInvoiceInput
): Promise<PayInvoiceResult> {
  const invoiceId = validateRequiredInvoiceId(input.invoiceId);
  const validMonth = assertMonthKey(input.month);
  const resolvedPaidAt = resolvePaidAt(input.paidAt);
  const requestedCents =
    input.amount !== undefined ? toPositiveCents(input.amount) : null;
  const range = getMonthDateRange(validMonth);

  let result!: PayInvoiceResult;

  await db.withExclusiveTransactionAsync(async (txn) => {
    await assertInvoiceExists(txn, invoiceId);

    const pendingRows = await txn.getAllAsync<PendingInstallmentForPaymentRow>(
      `SELECT
         i.id,
         i.transaction_id,
         i.number,
         i.amount,
         i.paid_amount
       FROM installments i
       INNER JOIN transactions t ON t.id = i.transaction_id
       WHERE t.invoice_id = ?
         AND t.deleted_at IS NULL
         AND i.deleted_at IS NULL
         AND i.status = 'PENDING'
         AND substr(i.due_date, 1, 10) BETWEEN ? AND ?
       ORDER BY substr(i.due_date, 1, 10) ASC, i.number ASC, i.id ASC`,
      invoiceId,
      range.start,
      range.end
    );

    if (pendingRows.length === 0) {
      throw new DatabaseError(
        "CONFLICT",
        "Não há parcelas pendentes nesta fatura para o mês informado."
      );
    }

    const totalPendingCents = pendingRows.reduce(
      (sum, row) => sum + (row.amount - row.paid_amount),
      0
    );
    const paymentCents =
      requestedCents === null ? totalPendingCents : requestedCents;

    if (paymentCents > totalPendingCents) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "O valor do pagamento excede o saldo pendente da fatura no mês."
      );
    }

    let remaining = paymentCents;
    let settledCount = 0;
    let partiallyPaidCount = 0;
    const updatedInstallments: PayInvoiceUpdatedInstallment[] = [];
    const timestamp = nowIsoUtc();

    for (const row of pendingRows) {
      if (remaining === 0) {
        break;
      }

      const rowPending = row.amount - row.paid_amount;
      const allocated = Math.min(remaining, rowPending);
      const nextPaid = row.paid_amount + allocated;
      const isSettled = nextPaid === row.amount;
      const nextStatus: InstallmentStatus = isSettled ? "PAID" : "PENDING";
      const nextPaidAt = isSettled ? resolvedPaidAt : null;

      await txn.runAsync(
        `UPDATE installments
         SET paid_amount = ?, status = ?, paid_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        nextPaid,
        nextStatus,
        nextPaidAt,
        timestamp,
        row.id
      );

      if (isSettled) {
        settledCount += 1;
      } else {
        partiallyPaidCount += 1;
      }

      updatedInstallments.push({
        installmentId: row.id,
        transactionId: row.transaction_id,
        number: row.number,
        allocatedAmount: fromCents(allocated),
        paidAmount: fromCents(nextPaid),
        remainingAmount: fromCents(row.amount - nextPaid),
        status: nextStatus,
      });

      remaining -= allocated;
    }

    result = {
      invoiceId,
      month: validMonth,
      paidAmount: fromCents(paymentCents),
      remainingMonthAmount: fromCents(totalPendingCents - paymentCents),
      settledCount,
      partiallyPaidCount,
      updatedInstallments,
    };
  });

  return result;
}
