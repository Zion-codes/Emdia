import * as SQLite from "expo-sqlite";
import { addMonthsToDateKey, toLocalDateKey } from "./dates";
import { DatabaseError } from "./errors";
import { fromCents } from "./money";
import type {
  Installment,
  InstallmentStatus,
} from "./repositories/installments";
import type {
  TransactionType,
  TransactionWithInstallments,
} from "./repositories/transactions";
import { generateUuid, nowIsoUtc } from "./utils";

export interface EnsureRecurringInstallmentsResult {
  createdInstallmentsCount: number;
  deactivatedTransactionsCount: number;
}

interface TransactionRow {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
  owner_id: string;
  invoice_id: string | null;
  group_id: string | null;
  installments_count: number;
  recurrence: number;
  active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

interface RecurrenceInstallmentRow {
  id: string;
  number: number;
  amount: number;
  due_date: string;
}

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new DatabaseError("VALIDATION_ERROR", "Data de referência inválida.");
  }
}

function validateRequiredId(id: string, message: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError("VALIDATION_ERROR", message);
  }

  return trimmed;
}

function mapInstallmentRow(row: InstallmentRow, todayKey: string): Installment {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    number: row.number,
    amount: fromCents(row.amount),
    paidAmount: fromCents(row.paid_amount),
    remainingAmount: fromCents(row.amount - row.paid_amount),
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status,
    isOverdue: row.status === "PENDING" && row.due_date.slice(0, 10) < todayKey,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureRecurringInstallmentsInTransaction(
  txn: SQLite.SQLiteDatabase,
  now: Date
): Promise<EnsureRecurringInstallmentsResult> {
  assertValidDate(now);

  const todayKey = toLocalDateKey(now);
  const currentMonthKey = todayKey.slice(0, 7);
  const timestamp = nowIsoUtc();
  let createdInstallmentsCount = 0;
  let deactivatedTransactionsCount = 0;

  const recurringTransactions = await txn.getAllAsync<{ id: string }>(
    `SELECT id
     FROM transactions
     WHERE recurrence = 1
       AND active = 1
       AND deleted_at IS NULL`
  );

  for (const tx of recurringTransactions) {
    const firstInstallment = await txn.getFirstAsync<RecurrenceInstallmentRow>(
      `SELECT id, number, amount, due_date
         FROM installments
         WHERE transaction_id = ? AND deleted_at IS NULL
         ORDER BY number ASC
         LIMIT 1`,
      tx.id
    );

    if (!firstInstallment) {
      continue;
    }

    const lastInstallment = (await txn.getFirstAsync<RecurrenceInstallmentRow>(
      `SELECT id, number, amount, due_date
         FROM installments
         WHERE transaction_id = ? AND deleted_at IS NULL
         ORDER BY number DESC
         LIMIT 1`,
      tx.id
    )) as RecurrenceInstallmentRow;

    let nextNumber = lastInstallment.number + 1;
    let nextDueDate = addMonthsToDateKey(
      firstInstallment.due_date,
      nextNumber - 1
    );

    while (nextDueDate.slice(0, 7) <= currentMonthKey) {
      await txn.runAsync(
        `INSERT INTO installments (
           id,
           transaction_id,
           number,
           amount,
           paid_amount,
           due_date,
           paid_at,
           status,
           created_at,
           updated_at,
           deleted_at
         ) VALUES (?, ?, ?, ?, 0, ?, NULL, 'PENDING', ?, ?, NULL)`,
        generateUuid(),
        tx.id,
        nextNumber,
        lastInstallment.amount,
        nextDueDate,
        timestamp,
        timestamp
      );

      createdInstallmentsCount += 1;
      nextNumber += 1;
      nextDueDate = addMonthsToDateKey(
        firstInstallment.due_date,
        nextNumber - 1
      );
    }
  }

  const toDeactivate = await txn.getAllAsync<{ id: string }>(
    `SELECT t.id
     FROM transactions t
     INNER JOIN installments i
       ON i.transaction_id = t.id
      AND i.deleted_at IS NULL
     WHERE t.recurrence = 0
       AND t.active = 1
       AND t.deleted_at IS NULL
     GROUP BY t.id, t.installments_count
     HAVING COUNT(i.id) >= t.installments_count
        AND MAX(substr(i.due_date, 1, 10)) <= ?`,
    todayKey
  );

  for (const row of toDeactivate) {
    await txn.runAsync(
      `UPDATE transactions
       SET active = 0, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      timestamp,
      row.id
    );
    deactivatedTransactionsCount += 1;
  }

  return {
    createdInstallmentsCount,
    deactivatedTransactionsCount,
  };
}

export async function ensureRecurringInstallments(
  db: SQLite.SQLiteDatabase,
  now: Date = new Date()
): Promise<EnsureRecurringInstallmentsResult> {
  assertValidDate(now);

  let result: EnsureRecurringInstallmentsResult | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    result = await ensureRecurringInstallmentsInTransaction(txn, now);
  });

  return result as unknown as EnsureRecurringInstallmentsResult;
}

export async function stopRecurrence(
  db: SQLite.SQLiteDatabase,
  transactionId: string
): Promise<TransactionWithInstallments> {
  const validId = validateRequiredId(
    transactionId,
    "O identificador do lançamento é obrigatório."
  );

  let updated: TransactionWithInstallments | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<TransactionRow>(
      `SELECT
         id,
         name,
         type,
         amount,
         category_id,
         owner_id,
         invoice_id,
         group_id,
         installments_count,
         recurrence,
         active,
         notes,
         created_at,
         updated_at
       FROM transactions
       WHERE id = ? AND deleted_at IS NULL`,
      validId
    );

    if (!existing) {
      throw new DatabaseError("NOT_FOUND", "Lançamento não encontrado.");
    }

    if (existing.recurrence !== 1) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "Este lançamento não é recorrente."
      );
    }

    if (existing.active !== 1) {
      throw new DatabaseError(
        "CONFLICT",
        "Esta recorrência já está encerrada."
      );
    }

    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE transactions
       SET active = 0, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      timestamp,
      existing.id
    );

    const installmentRows = await txn.getAllAsync<InstallmentRow>(
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
      existing.id
    );

    const todayKey = toLocalDateKey();

    updated = {
      id: existing.id,
      name: existing.name,
      type: existing.type,
      amount: fromCents(existing.amount),
      categoryId: existing.category_id,
      ownerId: existing.owner_id,
      invoiceId: existing.invoice_id,
      groupId: existing.group_id,
      installmentsCount: existing.installments_count,
      recurrence: true,
      active: false,
      notes: existing.notes,
      createdAt: existing.created_at,
      updatedAt: timestamp,
      installments: installmentRows.map((row) =>
        mapInstallmentRow(row, todayKey)
      ),
    };
  });

  return updated as unknown as TransactionWithInstallments;
}

export async function advanceRecurringInstallment(
  db: SQLite.SQLiteDatabase,
  transactionId: string,
  referenceDate: Date = new Date()
): Promise<Installment> {
  assertValidDate(referenceDate);
  const validId = validateRequiredId(
    transactionId,
    "O identificador do lançamento é obrigatório."
  );

  let created: Installment | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{
      id: string;
      recurrence: number;
      active: number;
    }>(
      `SELECT id, recurrence, active
       FROM transactions
       WHERE id = ? AND deleted_at IS NULL`,
      validId
    );

    if (!existing) {
      throw new DatabaseError("NOT_FOUND", "Lançamento não encontrado.");
    }

    if (existing.recurrence !== 1) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "Este lançamento não é recorrente."
      );
    }

    if (existing.active !== 1) {
      throw new DatabaseError(
        "CONFLICT",
        "Esta recorrência já está encerrada."
      );
    }

    const firstInstallment = await txn.getFirstAsync<RecurrenceInstallmentRow>(
      `SELECT id, number, amount, due_date
       FROM installments
       WHERE transaction_id = ? AND deleted_at IS NULL
       ORDER BY number ASC
       LIMIT 1`,
      existing.id
    );

    if (!firstInstallment) {
      throw new DatabaseError(
        "CONFLICT",
        "Lançamento recorrente sem parcela base."
      );
    }

    const lastInstallment = (await txn.getFirstAsync<RecurrenceInstallmentRow>(
      `SELECT id, number, amount, due_date
       FROM installments
       WHERE transaction_id = ? AND deleted_at IS NULL
       ORDER BY number DESC
       LIMIT 1`,
      existing.id
    )) as RecurrenceInstallmentRow;

    const nextNumber = lastInstallment.number + 1;
    const nextDueDate = addMonthsToDateKey(
      firstInstallment.due_date,
      nextNumber - 1
    );
    const installmentId = generateUuid();
    const timestamp = nowIsoUtc();
    const todayKey = toLocalDateKey(referenceDate);

    await txn.runAsync(
      `INSERT INTO installments (
         id,
         transaction_id,
         number,
         amount,
         paid_amount,
         due_date,
         paid_at,
         status,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, 0, ?, NULL, 'PENDING', ?, ?, NULL)`,
      installmentId,
      existing.id,
      nextNumber,
      lastInstallment.amount,
      nextDueDate,
      timestamp,
      timestamp
    );

    created = {
      id: installmentId,
      transactionId: existing.id,
      number: nextNumber,
      amount: fromCents(lastInstallment.amount),
      paidAmount: 0,
      remainingAmount: fromCents(lastInstallment.amount),
      dueDate: nextDueDate,
      paidAt: null,
      status: "PENDING",
      isOverdue: nextDueDate.slice(0, 10) < todayKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  return created as unknown as Installment;
}
