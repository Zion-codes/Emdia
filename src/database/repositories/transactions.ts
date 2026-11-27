import * as SQLite from "expo-sqlite";
import {
  addMonthsToDateKey,
  assertMonthKey,
  getMonthDateRange,
  normalizeDateKey,
  toLocalDateKey,
} from "../dates";
import { DatabaseError } from "../errors";
import { distributeCents, fromCents, toPositiveCents } from "../money";
import { generateUuid, nowIsoUtc } from "../utils";
import type { Installment, InstallmentStatus } from "./installments";

export type TransactionType = "INCOME" | "EXPENSE";
export type AmountMode = "total" | "per_installment";
export type RemainderDistribution = "last" | "first";
export type TransactionSortBy = "overdue_first" | "due_date" | "name";
export type TransactionSortOrder = "asc" | "desc";

const MAX_INSTALLMENTS_COUNT = 360;

export interface Transaction {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  ownerId: string;
  invoiceId: string | null;
  groupId: string | null;
  installmentsCount: number;
  recurrence: boolean;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithInstallments extends Transaction {
  installments: Installment[];
}

export interface TransactionListItem {
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
  invoiceId: string | null;
  invoiceName: string | null;
  groupId: string | null;
  recurrence: boolean;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionInput {
  name: string;
  type: TransactionType;
  amount: number;
  dueDate: string;
  ownerId: string;
  categoryId?: string | null;
  invoiceId?: string | null;
  installmentsCount?: number;
  amountMode?: AmountMode;
  remainderDistribution?: RemainderDistribution;
  recurrence?: boolean;
  active?: boolean;
  notes?: string | null;
  allowDuplicate?: boolean;
}

export interface SplitPartInput {
  ownerId: string;
  amount: number;
  installmentsCount?: number;
  amountMode?: AmountMode;
  remainderDistribution?: RemainderDistribution;
}

export interface CreateSplitTransactionInput {
  name: string;
  type: TransactionType;
  totalAmount: number;
  dueDate: string;
  categoryId?: string | null;
  invoiceId?: string | null;
  notes?: string | null;
  allowDuplicate?: boolean;
  parts: SplitPartInput[];
}

export interface UpdateTransactionInput {
  name?: string;
  type?: TransactionType;
  categoryId?: string | null;
  ownerId?: string;
  invoiceId?: string | null;
  recurrence?: boolean;
  active?: boolean;
  notes?: string | null;
}

export interface DuplicateCheckInput {
  name: string;
  amount: number;
  dueDate: string;
  ownerId: string;
}

export interface TransactionListFilter {
  month?: string;
  includeOverdue?: boolean;
  categoryId?: string;
  ownerId?: string;
  invoiceId?: string;
  type?: TransactionType;
  status?: InstallmentStatus;
  groupId?: string;
  search?: string;
  sortBy?: TransactionSortBy;
  sortOrder?: TransactionSortOrder;
  referenceDate?: Date;
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

interface TransactionListRow {
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
  is_overdue: number;
  category_id: string | null;
  category_name: string | null;
  owner_id: string;
  owner_name: string;
  invoice_id: string | null;
  invoice_name: string | null;
  group_id: string | null;
  recurrence: number;
  active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PreparedTransaction {
  name: string;
  type: TransactionType;
  totalCents: number;
  installmentAmountsCents: number[];
  dueDateKey: string;
  ownerId: string;
  categoryId: string | null;
  invoiceId: string | null;
  groupId: string | null;
  installmentsCount: number;
  recurrence: boolean;
  active: boolean;
  notes: string | null;
  allowDuplicate: boolean;
}

function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    amount: fromCents(row.amount),
    categoryId: row.category_id,
    ownerId: row.owner_id,
    invoiceId: row.invoice_id,
    groupId: row.group_id,
    installmentsCount: row.installments_count,
    recurrence: row.recurrence === 1,
    active: row.active === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function validateTransactionName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O nome do lançamento é obrigatório."
    );
  }

  return trimmed;
}

function validateTransactionType(type: TransactionType): TransactionType {
  if (type !== "INCOME" && type !== "EXPENSE") {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O tipo do lançamento deve ser INCOME ou EXPENSE."
    );
  }

  return type;
}

function validateInstallmentsCount(count?: number): number {
  const value = count ?? 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "A quantidade de parcelas deve ser um inteiro maior ou igual a 1."
    );
  }

  if (value > MAX_INSTALLMENTS_COUNT) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      `A quantidade de parcelas não pode exceder ${MAX_INSTALLMENTS_COUNT}.`
    );
  }

  return value;
}

function normalizeNotes(notes?: string | null): string | null {
  if (notes === undefined || notes === null) {
    return null;
  }

  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateRequiredId(id: string, message: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError("VALIDATION_ERROR", message);
  }

  return trimmed;
}

function resolveInstallmentPlan(
  amount: number,
  installmentsCount: number,
  amountMode: AmountMode = "total",
  remainderDistribution: RemainderDistribution = "last"
): { totalCents: number; installmentAmountsCents: number[] } {
  if (amountMode !== "total" && amountMode !== "per_installment") {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Modo de valor inválido. Use total ou per_installment."
    );
  }

  if (remainderDistribution !== "last" && remainderDistribution !== "first") {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Distribuição de centavos inválida. Use last ou first."
    );
  }

  const inputCents = toPositiveCents(amount);

  if (amountMode === "per_installment") {
    const totalCents = inputCents * installmentsCount;
    if (!Number.isSafeInteger(totalCents)) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "O valor total das parcelas excede o limite seguro."
      );
    }

    return {
      totalCents,
      installmentAmountsCents: Array.from(
        { length: installmentsCount },
        () => inputCents
      ),
    };
  }

  return {
    totalCents: inputCents,
    installmentAmountsCents: distributeCents(
      inputCents,
      installmentsCount,
      remainderDistribution
    ),
  };
}

async function assertForeignKeysExist(
  txn: SQLite.SQLiteDatabase,
  ownerId: string,
  categoryId: string | null,
  invoiceId: string | null
): Promise<void> {
  const owner = await txn.getFirstAsync<{ id: string }>(
    `SELECT id FROM owners WHERE id = ? AND deleted_at IS NULL`,
    ownerId
  );
  if (!owner) {
    throw new DatabaseError("NOT_FOUND", "Responsável não encontrado.");
  }

  if (categoryId !== null) {
    const category = await txn.getFirstAsync<{ id: string }>(
      `SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL`,
      categoryId
    );
    if (!category) {
      throw new DatabaseError("NOT_FOUND", "Categoria não encontrada.");
    }
  }

  if (invoiceId !== null) {
    const invoice = await txn.getFirstAsync<{ id: string }>(
      `SELECT id FROM invoices WHERE id = ? AND deleted_at IS NULL`,
      invoiceId
    );
    if (!invoice) {
      throw new DatabaseError("NOT_FOUND", "Fatura não encontrada.");
    }
  }
}

async function findDuplicatesInTxn(
  db: SQLite.SQLiteDatabase,
  name: string,
  amountCents: number,
  dueDateKey: string,
  ownerId: string
): Promise<Transaction[]> {
  const normalizedTarget = name.trim().toLocaleLowerCase("pt-BR");

  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT
       t.id,
       t.name,
       t.type,
       t.amount,
       t.category_id,
       t.owner_id,
       t.invoice_id,
       t.group_id,
       t.installments_count,
       t.recurrence,
       t.active,
       t.notes,
       t.created_at,
       t.updated_at
     FROM transactions t
     INNER JOIN installments i
       ON i.transaction_id = t.id
      AND i.number = 1
      AND i.deleted_at IS NULL
     WHERE t.owner_id = ?
       AND t.amount = ?
       AND substr(i.due_date, 1, 10) = ?
       AND t.deleted_at IS NULL
     ORDER BY t.created_at ASC`,
    ownerId,
    amountCents,
    dueDateKey
  );

  return rows
    .filter(
      (row) => row.name.trim().toLocaleLowerCase("pt-BR") === normalizedTarget
    )
    .map(mapTransactionRow);
}

async function createTransactionInTxn(
  txn: SQLite.SQLiteDatabase,
  prepared: PreparedTransaction
): Promise<TransactionWithInstallments> {
  await assertForeignKeysExist(
    txn,
    prepared.ownerId,
    prepared.categoryId,
    prepared.invoiceId
  );

  if (!prepared.allowDuplicate) {
    const duplicates = await findDuplicatesInTxn(
      txn,
      prepared.name,
      prepared.totalCents,
      prepared.dueDateKey,
      prepared.ownerId
    );

    if (duplicates.length > 0) {
      throw new DatabaseError(
        "CONFLICT",
        "Já existe um lançamento semelhante para este responsável, valor e vencimento."
      );
    }
  }

  const transactionId = generateUuid();
  const timestamp = nowIsoUtc();

  await txn.runAsync(
    `INSERT INTO transactions (
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
       updated_at,
       deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    transactionId,
    prepared.name,
    prepared.type,
    prepared.totalCents,
    prepared.categoryId,
    prepared.ownerId,
    prepared.invoiceId,
    prepared.groupId,
    prepared.installmentsCount,
    prepared.recurrence ? 1 : 0,
    prepared.active ? 1 : 0,
    prepared.notes,
    timestamp,
    timestamp
  );

  const todayKey = toLocalDateKey();
  const installments: Installment[] = [];

  for (let index = 0; index < prepared.installmentsCount; index += 1) {
    const installmentId = generateUuid();
    const installmentNumber = index + 1;
    const installmentAmountCents = prepared.installmentAmountsCents[index];
    const installmentDueDate = addMonthsToDateKey(prepared.dueDateKey, index);

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
      transactionId,
      installmentNumber,
      installmentAmountCents,
      installmentDueDate,
      timestamp,
      timestamp
    );

    installments.push({
      id: installmentId,
      transactionId,
      number: installmentNumber,
      amount: fromCents(installmentAmountCents),
      paidAmount: 0,
      remainingAmount: fromCents(installmentAmountCents),
      dueDate: installmentDueDate,
      paidAt: null,
      status: "PENDING",
      isOverdue: installmentDueDate < todayKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return {
    id: transactionId,
    name: prepared.name,
    type: prepared.type,
    amount: fromCents(prepared.totalCents),
    categoryId: prepared.categoryId,
    ownerId: prepared.ownerId,
    invoiceId: prepared.invoiceId,
    groupId: prepared.groupId,
    installmentsCount: prepared.installmentsCount,
    recurrence: prepared.recurrence,
    active: prepared.active,
    notes: prepared.notes,
    createdAt: timestamp,
    updatedAt: timestamp,
    installments,
  };
}

export async function findDuplicateTransactions(
  db: SQLite.SQLiteDatabase,
  input: DuplicateCheckInput
): Promise<Transaction[]> {
  const name = validateTransactionName(input.name);
  const amountCents = toPositiveCents(input.amount);
  const dueDateKey = normalizeDateKey(input.dueDate);
  const ownerId = validateRequiredId(
    input.ownerId,
    "O responsável é obrigatório."
  );

  return findDuplicatesInTxn(db, name, amountCents, dueDateKey, ownerId);
}

export async function createTransaction(
  db: SQLite.SQLiteDatabase,
  input: CreateTransactionInput
): Promise<TransactionWithInstallments> {
  const name = validateTransactionName(input.name);
  const type = validateTransactionType(input.type);
  const dueDateKey = normalizeDateKey(input.dueDate);
  const ownerId = validateRequiredId(
    input.ownerId,
    "O responsável é obrigatório."
  );
  const installmentsCount = validateInstallmentsCount(input.installmentsCount);
  const recurrence = input.recurrence ?? false;
  const active = input.active ?? true;

  if (recurrence && installmentsCount > 1) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Lançamentos recorrentes não podem ser parcelados."
    );
  }

  const plan = resolveInstallmentPlan(
    input.amount,
    installmentsCount,
    input.amountMode,
    input.remainderDistribution
  );

  let created: TransactionWithInstallments | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    created = await createTransactionInTxn(txn, {
      name,
      type,
      totalCents: plan.totalCents,
      installmentAmountsCents: plan.installmentAmountsCents,
      dueDateKey,
      ownerId,
      categoryId: input.categoryId ?? null,
      invoiceId: input.invoiceId ?? null,
      groupId: null,
      installmentsCount,
      recurrence,
      active,
      notes: normalizeNotes(input.notes),
      allowDuplicate: input.allowDuplicate ?? false,
    });
  });

  return created as unknown as TransactionWithInstallments;
}

export async function createSplitTransaction(
  db: SQLite.SQLiteDatabase,
  input: CreateSplitTransactionInput
): Promise<TransactionWithInstallments[]> {
  const name = validateTransactionName(input.name);
  const type = validateTransactionType(input.type);
  const totalCents = toPositiveCents(input.totalAmount);
  const dueDateKey = normalizeDateKey(input.dueDate);

  if (input.parts.length < 2 || input.parts.length > 10) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "A divisão de contas exige entre 2 e 10 responsáveis."
    );
  }

  const seenOwners = new Set<string>();
  const groupId = generateUuid();
  const preparedParts: PreparedTransaction[] = [];
  let sumPartsCents = 0;

  for (const part of input.parts) {
    const ownerId = validateRequiredId(
      part.ownerId,
      "O responsável da parte é obrigatório."
    );

    if (seenOwners.has(ownerId)) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "Os responsáveis da divisão devem ser distintos."
      );
    }
    seenOwners.add(ownerId);

    const installmentsCount = validateInstallmentsCount(part.installmentsCount);
    const plan = resolveInstallmentPlan(
      part.amount,
      installmentsCount,
      part.amountMode,
      part.remainderDistribution
    );

    sumPartsCents += plan.totalCents;
    if (!Number.isSafeInteger(sumPartsCents)) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "A soma das partes excede o limite seguro."
      );
    }

    preparedParts.push({
      name,
      type,
      totalCents: plan.totalCents,
      installmentAmountsCents: plan.installmentAmountsCents,
      dueDateKey,
      ownerId,
      categoryId: input.categoryId ?? null,
      invoiceId: input.invoiceId ?? null,
      groupId,
      installmentsCount,
      recurrence: false,
      active: true,
      notes: normalizeNotes(input.notes),
      allowDuplicate: input.allowDuplicate ?? false,
    });
  }

  if (sumPartsCents !== totalCents) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "A soma das partes deve ser exatamente igual ao valor total."
    );
  }

  const createdTransactions: TransactionWithInstallments[] = [];

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const prepared of preparedParts) {
      const created = await createTransactionInTxn(txn, prepared);
      createdTransactions.push(created);
    }
  });

  return createdTransactions;
}

async function fetchInstallmentsByTransactionId(
  db: SQLite.SQLiteDatabase,
  transactionId: string,
  todayKey: string
): Promise<Installment[]> {
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

  return rows.map((row) => mapInstallmentRow(row, todayKey));
}

export async function getTransactionById(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<TransactionWithInstallments | null> {
  const validId = validateRequiredId(
    id,
    "O identificador do lançamento é obrigatório."
  );

  const row = await db.getFirstAsync<TransactionRow>(
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

  if (!row) {
    return null;
  }

  const installments = await fetchInstallmentsByTransactionId(
    db,
    row.id,
    toLocalDateKey()
  );

  return {
    ...mapTransactionRow(row),
    installments,
  };
}

export async function getTransactionGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string
): Promise<TransactionWithInstallments[]> {
  const validGroupId = validateRequiredId(
    groupId,
    "O identificador do grupo é obrigatório."
  );

  const transactionRows = await db.getAllAsync<TransactionRow>(
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
     WHERE group_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC, id ASC`,
    validGroupId
  );

  if (transactionRows.length === 0) {
    return [];
  }

  const todayKey = toLocalDateKey();
  const result: TransactionWithInstallments[] = [];

  for (const row of transactionRows) {
    const installments = await fetchInstallmentsByTransactionId(
      db,
      row.id,
      todayKey
    );
    result.push({
      ...mapTransactionRow(row),
      installments,
    });
  }

  return result;
}

export async function updateTransaction(
  db: SQLite.SQLiteDatabase,
  id: string,
  input: UpdateTransactionInput
): Promise<TransactionWithInstallments> {
  const validId = validateRequiredId(
    id,
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

    const nextName =
      input.name !== undefined
        ? validateTransactionName(input.name)
        : existing.name;
    const nextType =
      input.type !== undefined
        ? validateTransactionType(input.type)
        : existing.type;
    const nextOwnerId =
      input.ownerId !== undefined
        ? validateRequiredId(input.ownerId, "O responsável é obrigatório.")
        : existing.owner_id;
    const nextCategoryId =
      input.categoryId !== undefined ? input.categoryId : existing.category_id;
    const nextInvoiceId =
      input.invoiceId !== undefined ? input.invoiceId : existing.invoice_id;
    const nextRecurrence =
      input.recurrence !== undefined
        ? input.recurrence
        : existing.recurrence === 1;
    const nextActive =
      input.active !== undefined ? input.active : existing.active === 1;
    const nextNotes =
      input.notes !== undefined ? normalizeNotes(input.notes) : existing.notes;

    if (nextRecurrence && existing.installments_count > 1) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "Lançamentos recorrentes não podem ser parcelados."
      );
    }

    await assertForeignKeysExist(
      txn,
      nextOwnerId,
      nextCategoryId,
      nextInvoiceId
    );

    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE transactions
       SET
         name = ?,
         type = ?,
         category_id = ?,
         owner_id = ?,
         invoice_id = ?,
         recurrence = ?,
         active = ?,
         notes = ?,
         updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      nextName,
      nextType,
      nextCategoryId,
      nextOwnerId,
      nextInvoiceId,
      nextRecurrence ? 1 : 0,
      nextActive ? 1 : 0,
      nextNotes,
      timestamp,
      existing.id
    );

    const installments = await fetchInstallmentsByTransactionId(
      txn,
      existing.id,
      toLocalDateKey()
    );

    updated = {
      id: existing.id,
      name: nextName,
      type: nextType,
      amount: fromCents(existing.amount),
      categoryId: nextCategoryId,
      ownerId: nextOwnerId,
      invoiceId: nextInvoiceId,
      groupId: existing.group_id,
      installmentsCount: existing.installments_count,
      recurrence: nextRecurrence,
      active: nextActive,
      notes: nextNotes,
      createdAt: existing.created_at,
      updatedAt: timestamp,
      installments,
    };
  });

  return updated as unknown as TransactionWithInstallments;
}

export async function deleteTransaction(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<void> {
  const validId = validateRequiredId(
    id,
    "O identificador do lançamento é obrigatório."
  );

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM transactions
       WHERE id = ? AND deleted_at IS NULL`,
      validId
    );

    if (!existing) {
      throw new DatabaseError("NOT_FOUND", "Lançamento não encontrado.");
    }

    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE installments
       SET deleted_at = ?, updated_at = ?
       WHERE transaction_id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      validId
    );

    await txn.runAsync(
      `UPDATE transactions
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      validId
    );
  });
}

export async function deleteTransactionGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string
): Promise<void> {
  const validGroupId = validateRequiredId(
    groupId,
    "O identificador do grupo é obrigatório."
  );

  await db.withExclusiveTransactionAsync(async (txn) => {
    const groupRow = await txn.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM transactions
       WHERE group_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      validGroupId
    );

    if (!groupRow) {
      throw new DatabaseError(
        "NOT_FOUND",
        "Grupo de lançamentos não encontrado."
      );
    }

    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE installments
       SET deleted_at = ?, updated_at = ?
       WHERE transaction_id IN (
         SELECT id
         FROM transactions
         WHERE group_id = ? AND deleted_at IS NULL
       )
       AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      validGroupId
    );

    await txn.runAsync(
      `UPDATE transactions
       SET deleted_at = ?, updated_at = ?
       WHERE group_id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      validGroupId
    );
  });
}

function resolveOrderBySql(
  sortBy: TransactionSortBy,
  sortOrder: TransactionSortOrder
): string {
  if (
    sortBy !== "overdue_first" &&
    sortBy !== "due_date" &&
    sortBy !== "name"
  ) {
    throw new DatabaseError("VALIDATION_ERROR", "Campo de ordenação inválido.");
  }

  if (sortOrder !== "asc" && sortOrder !== "desc") {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Direção de ordenação inválida. Use asc ou desc."
    );
  }

  const direction = sortOrder === "desc" ? "DESC" : "ASC";

  if (sortBy === "due_date") {
    return `i.due_date ${direction}, t.name COLLATE NOCASE ${direction}, i.number ${direction}`;
  }

  if (sortBy === "name") {
    return `t.name COLLATE NOCASE ${direction}, i.due_date ${direction}, i.number ${direction}`;
  }

  const overdueDirection = sortOrder === "desc" ? "ASC" : "DESC";
  return `is_overdue ${overdueDirection}, i.due_date ${direction}, t.name COLLATE NOCASE ${direction}, i.number ${direction}`;
}

export async function listTransactions(
  db: SQLite.SQLiteDatabase,
  filter: TransactionListFilter = {}
): Promise<TransactionListItem[]> {
  const referenceDate = filter.referenceDate ?? new Date();
  const todayKey = toLocalDateKey(referenceDate);

  const whereClauses: string[] = [
    "t.deleted_at IS NULL",
    "i.deleted_at IS NULL",
  ];
  const whereParams: (string | number)[] = [];

  if (filter.month !== undefined) {
    const validMonth = assertMonthKey(filter.month);
    const range = getMonthDateRange(validMonth);

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

  if (filter.categoryId !== undefined) {
    whereClauses.push("t.category_id = ?");
    whereParams.push(filter.categoryId);
  }

  if (filter.ownerId !== undefined) {
    whereClauses.push("t.owner_id = ?");
    whereParams.push(filter.ownerId);
  }

  if (filter.invoiceId !== undefined) {
    whereClauses.push("t.invoice_id = ?");
    whereParams.push(filter.invoiceId);
  }

  if (filter.type !== undefined) {
    whereClauses.push("t.type = ?");
    whereParams.push(validateTransactionType(filter.type));
  }

  if (filter.status !== undefined) {
    if (filter.status !== "PENDING" && filter.status !== "PAID") {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "Status da parcela inválido. Use PENDING ou PAID."
      );
    }

    whereClauses.push("i.status = ?");
    whereParams.push(filter.status);
  }

  if (filter.groupId !== undefined) {
    whereClauses.push("t.group_id = ?");
    whereParams.push(filter.groupId);
  }

  if (filter.search !== undefined) {
    const trimmedSearch = filter.search.trim();
    if (trimmedSearch.length > 0) {
      const escapedSearch = trimmedSearch.replace(/[\\%_]/g, "\\$&");
      whereClauses.push("LOWER(t.name) LIKE LOWER(?) ESCAPE '\\'");
      whereParams.push(`%${escapedSearch}%`);
    }
  }

  const orderBySql = resolveOrderBySql(
    filter.sortBy ?? "overdue_first",
    filter.sortOrder ?? "asc"
  );

  const rows = await db.getAllAsync<TransactionListRow>(
    `SELECT
       i.id AS installment_id,
       t.id AS transaction_id,
       t.name AS name,
       t.type AS type,
       i.amount AS amount,
       i.paid_amount AS paid_amount,
       i.number AS number,
       t.installments_count AS installments_count,
       i.due_date AS due_date,
       i.paid_at AS paid_at,
       i.status AS status,
       CASE
         WHEN i.status = 'PENDING' AND substr(i.due_date, 1, 10) < ? THEN 1
         ELSE 0
       END AS is_overdue,
       t.category_id AS category_id,
       c.name AS category_name,
       t.owner_id AS owner_id,
       o.name AS owner_name,
       t.invoice_id AS invoice_id,
       inv.name AS invoice_name,
       t.group_id AS group_id,
       t.recurrence AS recurrence,
       t.active AS active,
       t.notes AS notes,
       t.created_at AS created_at,
       t.updated_at AS updated_at
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     INNER JOIN owners o ON o.id = t.owner_id
     LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
     LEFT JOIN invoices inv ON inv.id = t.invoice_id AND inv.deleted_at IS NULL
     WHERE ${whereClauses.join(" AND ")}
     ORDER BY ${orderBySql}`,
    todayKey,
    ...whereParams
  );

  return rows.map((row) => ({
    installmentId: row.installment_id,
    transactionId: row.transaction_id,
    name: row.name,
    type: row.type,
    amount: fromCents(row.amount),
    paidAmount: fromCents(row.paid_amount),
    remainingAmount: fromCents(row.amount - row.paid_amount),
    number: row.number,
    installmentsCount: row.installments_count,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status,
    isOverdue: row.is_overdue === 1,
    categoryId: row.category_id,
    categoryName: row.category_name,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    invoiceId: row.invoice_id,
    invoiceName: row.invoice_name,
    groupId: row.group_id,
    recurrence: row.recurrence === 1,
    active: row.active === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
