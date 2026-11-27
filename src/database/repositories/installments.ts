import * as SQLite from "expo-sqlite";
import {
  assertMonthKey,
  getMonthDateRange,
  normalizeDateKey,
  toLocalDateKey,
} from "../dates";
import { DatabaseError } from "../errors";
import { fromCents, toPositiveCents } from "../money";
import { nowIsoUtc } from "../utils";

export type InstallmentStatus = "PENDING" | "PAID";

export interface Installment {
  id: string;
  transactionId: string;
  number: number;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  paidAt: string | null;
  status: InstallmentStatus;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPaymentInput {
  installmentId: string;
  amount: number;
  paidAt?: string;
}

export interface SettleInstallmentOptions {
  confirmed: boolean;
  paidAt?: string;
}

export interface RevertInstallmentOptions {
  confirmed: boolean;
}

export interface GroupSettlementOptions {
  confirmed: boolean;
  installmentNumber?: number;
  month?: string;
  paidAt?: string;
}

interface InstallmentRow {
  id: string;
  transaction_id: string;
  number: number;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_at: string | null;
  status: InstallmentStatus;
  created_at: string;
  updated_at: string;
}

function mapInstallmentRow(row: InstallmentRow, todayKey: string): Installment {
  const remainingCents = row.amount - row.paid_amount;

  return {
    id: row.id,
    transactionId: row.transaction_id,
    number: row.number,
    amount: fromCents(row.amount),
    paidAmount: fromCents(row.paid_amount),
    remainingAmount: fromCents(remainingCents),
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status,
    isOverdue: row.status === "PENDING" && row.due_date.slice(0, 10) < todayKey,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolvePaidAt(paidAt?: string): string {
  if (paidAt === undefined) {
    return nowIsoUtc();
  }

  const trimmed = paidAt.trim();
  normalizeDateKey(trimmed);
  return trimmed;
}

function validateRequiredId(id: string, message: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError("VALIDATION_ERROR", message);
  }

  return trimmed;
}

function assertConfirmed(confirmed: boolean, message: string): void {
  if (!confirmed) {
    throw new DatabaseError("VALIDATION_ERROR", message);
  }
}

async function getActiveInstallmentRow(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<InstallmentRow> {
  const row = await db.getFirstAsync<InstallmentRow>(
    `SELECT
       i.id,
       i.transaction_id,
       i.number,
       i.amount,
       i.paid_amount,
       i.due_date,
       i.paid_at,
       i.status,
       i.created_at,
       i.updated_at
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     WHERE i.id = ? AND i.deleted_at IS NULL AND t.deleted_at IS NULL`,
    id
  );

  if (!row) {
    throw new DatabaseError("NOT_FOUND", "Parcela não encontrada.");
  }

  return row;
}

function buildGroupFilter(
  groupId: string,
  options: GroupSettlementOptions
): { whereSql: string; params: (string | number)[] } {
  const trimmedGroupId = validateRequiredId(
    groupId,
    "O identificador do grupo é obrigatório."
  );

  const clauses: string[] = [
    "t.group_id = ?",
    "t.deleted_at IS NULL",
    "i.deleted_at IS NULL",
  ];
  const params: (string | number)[] = [trimmedGroupId];

  if (options.installmentNumber !== undefined) {
    if (
      !Number.isInteger(options.installmentNumber) ||
      options.installmentNumber < 1
    ) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "O número da parcela deve ser um inteiro maior ou igual a 1."
      );
    }

    clauses.push("i.number = ?");
    params.push(options.installmentNumber);
  }

  if (options.month !== undefined) {
    const validMonth = assertMonthKey(options.month);
    const range = getMonthDateRange(validMonth);
    clauses.push("substr(i.due_date, 1, 10) BETWEEN ? AND ?");
    params.push(range.start, range.end);
  }

  return {
    whereSql: clauses.join(" AND "),
    params,
  };
}

export async function getInstallmentById(
  db: SQLite.SQLiteDatabase,
  id: string,
  referenceDate: Date = new Date()
): Promise<Installment | null> {
  const row = await db.getFirstAsync<InstallmentRow>(
    `SELECT
       i.id,
       i.transaction_id,
       i.number,
       i.amount,
       i.paid_amount,
       i.due_date,
       i.paid_at,
       i.status,
       i.created_at,
       i.updated_at
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     WHERE i.id = ? AND i.deleted_at IS NULL AND t.deleted_at IS NULL`,
    id
  );

  if (!row) {
    return null;
  }

  return mapInstallmentRow(row, toLocalDateKey(referenceDate));
}

export async function listInstallmentsByTransaction(
  db: SQLite.SQLiteDatabase,
  transactionId: string,
  referenceDate: Date = new Date()
): Promise<Installment[]> {
  const txRow = await db.getFirstAsync<{ id: string }>(
    `SELECT id
     FROM transactions
     WHERE id = ? AND deleted_at IS NULL`,
    transactionId
  );

  if (!txRow) {
    throw new DatabaseError("NOT_FOUND", "Lançamento não encontrado.");
  }

  const rows = await db.getAllAsync<InstallmentRow>(
    `SELECT
       id,
       transaction_id,
       number,
       amount,
       paid_amount,
       due_date,
       paid_at,
       status,
       created_at,
       updated_at
     FROM installments
     WHERE transaction_id = ? AND deleted_at IS NULL
     ORDER BY number ASC`,
    transactionId
  );

  const todayKey = toLocalDateKey(referenceDate);
  return rows.map((row) => mapInstallmentRow(row, todayKey));
}

export async function registerInstallmentPayment(
  db: SQLite.SQLiteDatabase,
  input: RegisterPaymentInput
): Promise<Installment> {
  const installmentId = validateRequiredId(
    input.installmentId,
    "O identificador da parcela é obrigatório."
  );
  const paymentCents = toPositiveCents(input.amount);
  const resolvedPaidAt = resolvePaidAt(input.paidAt);
  let updatedRow: InstallmentRow | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await getActiveInstallmentRow(txn, installmentId);

    if (existing.status === "PAID") {
      throw new DatabaseError("CONFLICT", "Esta parcela já está quitada.");
    }

    const remainingCents = existing.amount - existing.paid_amount;
    if (paymentCents > remainingCents) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "O valor do pagamento excede o saldo restante da parcela."
      );
    }

    const nextPaidCents = existing.paid_amount + paymentCents;
    const isFullyPaid = nextPaidCents === existing.amount;
    const nextStatus: InstallmentStatus = isFullyPaid ? "PAID" : "PENDING";
    const nextPaidAt = isFullyPaid ? resolvedPaidAt : null;
    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE installments
       SET paid_amount = ?, status = ?, paid_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      nextPaidCents,
      nextStatus,
      nextPaidAt,
      timestamp,
      existing.id
    );

    updatedRow = {
      ...existing,
      paid_amount: nextPaidCents,
      status: nextStatus,
      paid_at: nextPaidAt,
      updated_at: timestamp,
    };
  });

  return mapInstallmentRow(
    updatedRow as unknown as InstallmentRow,
    toLocalDateKey()
  );
}

export async function settleInstallment(
  db: SQLite.SQLiteDatabase,
  id: string,
  options: SettleInstallmentOptions
): Promise<Installment> {
  assertConfirmed(
    options.confirmed === true,
    "Confirmação explícita é obrigatória para quitar a parcela."
  );

  const validId = validateRequiredId(
    id,
    "O identificador da parcela é obrigatório."
  );
  const resolvedPaidAt = resolvePaidAt(options.paidAt);
  let updatedRow: InstallmentRow | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await getActiveInstallmentRow(txn, validId);

    if (existing.status === "PAID") {
      throw new DatabaseError("CONFLICT", "Esta parcela já está quitada.");
    }

    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE installments
       SET paid_amount = amount, status = 'PAID', paid_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      resolvedPaidAt,
      timestamp,
      existing.id
    );

    updatedRow = {
      ...existing,
      paid_amount: existing.amount,
      status: "PAID",
      paid_at: resolvedPaidAt,
      updated_at: timestamp,
    };
  });

  return mapInstallmentRow(
    updatedRow as unknown as InstallmentRow,
    toLocalDateKey()
  );
}

export async function revertInstallmentPayment(
  db: SQLite.SQLiteDatabase,
  id: string,
  options: RevertInstallmentOptions
): Promise<Installment> {
  assertConfirmed(
    options.confirmed === true,
    "Confirmação explícita é obrigatória para reverter o pagamento."
  );

  const validId = validateRequiredId(
    id,
    "O identificador da parcela é obrigatório."
  );
  let updatedRow: InstallmentRow | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await getActiveInstallmentRow(txn, validId);

    if (existing.status === "PENDING" && existing.paid_amount === 0) {
      throw new DatabaseError(
        "CONFLICT",
        "Esta parcela não possui pagamento para reverter."
      );
    }

    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE installments
       SET paid_amount = 0, status = 'PENDING', paid_at = NULL, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      timestamp,
      existing.id
    );

    updatedRow = {
      ...existing,
      paid_amount: 0,
      status: "PENDING",
      paid_at: null,
      updated_at: timestamp,
    };
  });

  return mapInstallmentRow(
    updatedRow as unknown as InstallmentRow,
    toLocalDateKey()
  );
}

async function listGroupInstallmentRows(
  db: SQLite.SQLiteDatabase,
  whereSql: string,
  params: (string | number)[]
): Promise<InstallmentRow[]> {
  return db.getAllAsync<InstallmentRow>(
    `SELECT
       i.id,
       i.transaction_id,
       i.number,
       i.amount,
       i.paid_amount,
       i.due_date,
       i.paid_at,
       i.status,
       i.created_at,
       i.updated_at
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     WHERE ${whereSql}
     ORDER BY i.due_date ASC, i.number ASC, i.id ASC`,
    ...params
  );
}

export async function settleTransactionGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  options: GroupSettlementOptions
): Promise<Installment[]> {
  assertConfirmed(
    options.confirmed === true,
    "Confirmação explícita é obrigatória para quitar o grupo."
  );

  const filter = buildGroupFilter(groupId, options);
  const resolvedPaidAt = resolvePaidAt(options.paidAt);
  let rows: InstallmentRow[] = [];

  await db.withExclusiveTransactionAsync(async (txn) => {
    const groupRow = await txn.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM transactions
       WHERE group_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      groupId.trim()
    );

    if (!groupRow) {
      throw new DatabaseError(
        "NOT_FOUND",
        "Grupo de lançamentos não encontrado."
      );
    }

    const matchingRows = await listGroupInstallmentRows(
      txn,
      filter.whereSql,
      filter.params
    );

    if (matchingRows.length === 0) {
      throw new DatabaseError(
        "NOT_FOUND",
        "Nenhuma parcela encontrada para os critérios informados."
      );
    }

    const timestamp = nowIsoUtc();
    const ids = matchingRows
      .filter((row) => row.status === "PENDING")
      .map((row) => row.id);

    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(", ");
      await txn.runAsync(
        `UPDATE installments
         SET paid_amount = amount, status = 'PAID', paid_at = ?, updated_at = ?
         WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        resolvedPaidAt,
        timestamp,
        ...ids
      );
    }

    rows = await listGroupInstallmentRows(txn, filter.whereSql, filter.params);
  });

  const todayKey = toLocalDateKey();
  return rows.map((row) => mapInstallmentRow(row, todayKey));
}

export async function revertTransactionGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  options: GroupSettlementOptions
): Promise<Installment[]> {
  assertConfirmed(
    options.confirmed === true,
    "Confirmação explícita é obrigatória para reverter o grupo."
  );

  const filter = buildGroupFilter(groupId, options);
  let rows: InstallmentRow[] = [];

  await db.withExclusiveTransactionAsync(async (txn) => {
    const groupRow = await txn.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM transactions
       WHERE group_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      groupId.trim()
    );

    if (!groupRow) {
      throw new DatabaseError(
        "NOT_FOUND",
        "Grupo de lançamentos não encontrado."
      );
    }

    const matchingRows = await listGroupInstallmentRows(
      txn,
      filter.whereSql,
      filter.params
    );

    if (matchingRows.length === 0) {
      throw new DatabaseError(
        "NOT_FOUND",
        "Nenhuma parcela encontrada para os critérios informados."
      );
    }

    const timestamp = nowIsoUtc();
    const ids = matchingRows
      .filter((row) => row.status === "PAID" || row.paid_amount > 0)
      .map((row) => row.id);

    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(", ");
      await txn.runAsync(
        `UPDATE installments
         SET paid_amount = 0, status = 'PENDING', paid_at = NULL, updated_at = ?
         WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        timestamp,
        ...ids
      );
    }

    rows = await listGroupInstallmentRows(txn, filter.whereSql, filter.params);
  });

  const todayKey = toLocalDateKey();
  return rows.map((row) => mapInstallmentRow(row, todayKey));
}
