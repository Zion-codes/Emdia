import * as SQLite from "expo-sqlite";
import { isValidDateKey, isValidMonthKey } from "./dates";
import { DatabaseError } from "./errors";
import { getDatabaseVersion, MIGRATIONS } from "./migrations";
import {
  ensureRecurringInstallmentsInTransaction,
  type EnsureRecurringInstallmentsResult,
} from "./recurrence";
import { nowIsoUtc } from "./utils";

export const BACKUP_APP = "emdia" as const;
export const BACKUP_FORMAT = "emdia-backup" as const;
export const BACKUP_VERSION = 1 as const;
export const MAX_BACKUP_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MIN_BACKUP_DATE_YEAR = 1970;
const MAX_BACKUP_DATE_YEAR = 2100;
const ISO_TIMESTAMP_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

export interface BackupCategoryRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupOwnerRow {
  id: string;
  name: string;
  is_self: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupInvoiceRow {
  id: string;
  name: string;
  limit_amount: number;
  color: string | null;
  due_day: number;
  closing_day: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupGoalRow {
  id: string;
  since: string;
  amount: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupInvestmentRow {
  id: string;
  name: string;
  type: string | null;
  institution: string | null;
  current_balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupAppSettingRow {
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupCategoryBudgetRow {
  id: string;
  category_id: string;
  month: string;
  amount: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupTransactionRow {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
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
  deleted_at: string | null;
}

export interface BackupInstallmentRow {
  id: string;
  transaction_id: string;
  number: number;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_at: string | null;
  status: "PENDING" | "PAID";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupInvestmentContributionRow {
  id: string;
  investment_id: string;
  amount: number;
  contributed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupTablesV1 {
  categories: BackupCategoryRow[];
  owners: BackupOwnerRow[];
  invoices: BackupInvoiceRow[];
  goals: BackupGoalRow[];
  investments: BackupInvestmentRow[];
  app_settings: BackupAppSettingRow[];
  category_budgets: BackupCategoryBudgetRow[];
  transactions: BackupTransactionRow[];
  installments: BackupInstallmentRow[];
  investment_contributions: BackupInvestmentContributionRow[];
}

export interface BackupPayloadV1 {
  app: typeof BACKUP_APP;
  format: typeof BACKUP_FORMAT;
  backupVersion: typeof BACKUP_VERSION;
  schemaVersion: number;
  exportedAt: string;
  data: BackupTablesV1;
}

export interface BackupTableCounts {
  categories: number;
  owners: number;
  invoices: number;
  goals: number;
  investments: number;
  app_settings: number;
  category_budgets: number;
  transactions: number;
  installments: number;
  investment_contributions: number;
}

export interface BackupSummary {
  exportedAt: string;
  schemaVersion: number;
  backupVersion: number;
  totalRecords: number;
  counts: BackupTableCounts;
}

export interface RestoreBackupResult {
  schemaVersion: number;
  restoredCounts: BackupTableCounts;
  recurrence: EnsureRecurringInstallmentsResult;
}

export interface RestoreBackupOptions {
  referenceDate?: Date;
}

const BACKUP_TABLE_NAMES: readonly (keyof BackupTablesV1)[] = [
  "categories",
  "owners",
  "invoices",
  "goals",
  "investments",
  "app_settings",
  "category_budgets",
  "transactions",
  "installments",
  "investment_contributions",
];

function validationError(message: string): never {
  throw new DatabaseError("VALIDATION_ERROR", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    validationError(`Campo obrigatório inválido: ${field}.`);
  }
  return value;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    validationError(`Campo texto inválido: ${field}.`);
  }
  return value;
}

function assertNullableString(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") {
    validationError(`Campo texto opcional inválido: ${field}.`);
  }
  return value;
}

function assertMonthKeyField(value: unknown, field: string): string {
  const text = assertNonEmptyString(value, field);
  if (!isValidMonthKey(text)) {
    validationError(`Mês inválido em ${field}.`);
  }
  return text;
}

function assertBoundedDateKey(value: unknown, field: string): string {
  const text = assertNonEmptyString(value, field);
  if (!isValidDateKey(text)) {
    validationError(`Data inválida em ${field}.`);
  }
  const year = Number(text.slice(0, 4));
  if (year < MIN_BACKUP_DATE_YEAR || year > MAX_BACKUP_DATE_YEAR) {
    validationError(`Ano fora do intervalo permitido em ${field}.`);
  }
  return text;
}

function assertIsoTimestamp(value: unknown, field: string): string {
  const text = assertNonEmptyString(value, field);
  if (
    !ISO_TIMESTAMP_REGEX.test(text) ||
    !isValidDateKey(text.slice(0, 10)) ||
    Number.isNaN(Date.parse(text))
  ) {
    validationError(`Timestamp ISO inválido em ${field}.`);
  }
  return text;
}

function assertNullableIsoTimestamp(
  value: unknown,
  field: string
): string | null {
  if (value === null) {
    return null;
  }
  return assertIsoTimestamp(value, field);
}

function assertInteger(
  value: unknown,
  field: string,
  min?: number,
  max?: number
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    validationError(`Campo inteiro inválido: ${field}.`);
  }
  if (min !== undefined && value < min) {
    validationError(`Valor abaixo do mínimo em ${field}.`);
  }
  if (max !== undefined && value > max) {
    validationError(`Valor acima do máximo em ${field}.`);
  }
  return value;
}

function assertBinaryFlag(value: unknown, field: string): number {
  if (value !== 0 && value !== 1) {
    validationError(`Campo booleano numérico inválido em ${field}.`);
  }
  return value;
}

function assertTableArray(
  data: Record<string, unknown>,
  tableName: keyof BackupTablesV1
): Record<string, unknown>[] {
  const table = data[tableName];
  if (!Array.isArray(table)) {
    validationError(`Tabela ausente ou inválida no backup: ${tableName}.`);
  }
  return table.map((row, index) => {
    if (!isRecord(row)) {
      validationError(`Registro inválido em ${tableName}[${index}].`);
    }
    return row;
  });
}

function validateCategoryRow(
  row: Record<string, unknown>,
  index: number
): BackupCategoryRow {
  const prefix = `categories[${index}]`;
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    name: assertNonEmptyString(row.name, `${prefix}.name`),
    color: assertNullableString(row.color, `${prefix}.color`),
    icon: assertNullableString(row.icon, `${prefix}.icon`),
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateOwnerRow(
  row: Record<string, unknown>,
  index: number
): BackupOwnerRow {
  const prefix = `owners[${index}]`;
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    name: assertNonEmptyString(row.name, `${prefix}.name`),
    is_self: assertBinaryFlag(row.is_self, `${prefix}.is_self`),
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateInvoiceRow(
  row: Record<string, unknown>,
  index: number
): BackupInvoiceRow {
  const prefix = `invoices[${index}]`;
  const closingDay =
    row.closing_day === null
      ? null
      : assertInteger(row.closing_day, `${prefix}.closing_day`, 1, 31);
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    name: assertNonEmptyString(row.name, `${prefix}.name`),
    limit_amount: assertInteger(row.limit_amount, `${prefix}.limit_amount`, 0),
    color: assertNullableString(row.color, `${prefix}.color`),
    due_day: assertInteger(row.due_day, `${prefix}.due_day`, 1, 31),
    closing_day: closingDay,
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateGoalRow(
  row: Record<string, unknown>,
  index: number
): BackupGoalRow {
  const prefix = `goals[${index}]`;
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    since: assertMonthKeyField(row.since, `${prefix}.since`),
    amount: assertInteger(row.amount, `${prefix}.amount`, 0),
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateInvestmentRow(
  row: Record<string, unknown>,
  index: number
): BackupInvestmentRow {
  const prefix = `investments[${index}]`;
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    name: assertNonEmptyString(row.name, `${prefix}.name`),
    type: assertNullableString(row.type, `${prefix}.type`),
    institution: assertNullableString(row.institution, `${prefix}.institution`),
    current_balance: assertInteger(
      row.current_balance,
      `${prefix}.current_balance`,
      0
    ),
    notes: assertNullableString(row.notes, `${prefix}.notes`),
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateAppSettingRow(
  row: Record<string, unknown>,
  index: number
): BackupAppSettingRow {
  const prefix = `app_settings[${index}]`;
  return {
    key: assertNonEmptyString(row.key, `${prefix}.key`),
    value: assertString(row.value, `${prefix}.value`),
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateCategoryBudgetRow(
  row: Record<string, unknown>,
  index: number
): BackupCategoryBudgetRow {
  const prefix = `category_budgets[${index}]`;
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    category_id: assertNonEmptyString(row.category_id, `${prefix}.category_id`),
    month: assertMonthKeyField(row.month, `${prefix}.month`),
    amount: assertInteger(row.amount, `${prefix}.amount`, 0),
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateTransactionRow(
  row: Record<string, unknown>,
  index: number
): BackupTransactionRow {
  const prefix = `transactions[${index}]`;
  if (row.type !== "INCOME" && row.type !== "EXPENSE") {
    validationError(`Tipo de lançamento inválido em ${prefix}.type.`);
  }
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    name: assertNonEmptyString(row.name, `${prefix}.name`),
    type: row.type,
    amount: assertInteger(row.amount, `${prefix}.amount`, 1),
    category_id: assertNullableString(row.category_id, `${prefix}.category_id`),
    owner_id: assertNonEmptyString(row.owner_id, `${prefix}.owner_id`),
    invoice_id: assertNullableString(row.invoice_id, `${prefix}.invoice_id`),
    group_id: assertNullableString(row.group_id, `${prefix}.group_id`),
    installments_count: assertInteger(
      row.installments_count,
      `${prefix}.installments_count`,
      1
    ),
    recurrence: assertBinaryFlag(row.recurrence, `${prefix}.recurrence`),
    active: assertBinaryFlag(row.active, `${prefix}.active`),
    notes: assertNullableString(row.notes, `${prefix}.notes`),
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateInstallmentRow(
  row: Record<string, unknown>,
  index: number
): BackupInstallmentRow {
  const prefix = `installments[${index}]`;
  if (row.status !== "PENDING" && row.status !== "PAID") {
    validationError(`Status de parcela inválido em ${prefix}.status.`);
  }
  const amount = assertInteger(row.amount, `${prefix}.amount`, 0);
  const paidAmount = assertInteger(
    row.paid_amount,
    `${prefix}.paid_amount`,
    0,
    amount
  );
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    transaction_id: assertNonEmptyString(
      row.transaction_id,
      `${prefix}.transaction_id`
    ),
    number: assertInteger(row.number, `${prefix}.number`, 1),
    amount,
    paid_amount: paidAmount,
    due_date: assertBoundedDateKey(row.due_date, `${prefix}.due_date`),
    paid_at: assertNullableIsoTimestamp(row.paid_at, `${prefix}.paid_at`),
    status: row.status,
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function validateInvestmentContributionRow(
  row: Record<string, unknown>,
  index: number
): BackupInvestmentContributionRow {
  const prefix = `investment_contributions[${index}]`;
  return {
    id: assertNonEmptyString(row.id, `${prefix}.id`),
    investment_id: assertNonEmptyString(
      row.investment_id,
      `${prefix}.investment_id`
    ),
    amount: assertInteger(row.amount, `${prefix}.amount`, 1),
    contributed_at: assertIsoTimestamp(
      row.contributed_at,
      `${prefix}.contributed_at`
    ),
    notes: assertNullableString(row.notes, `${prefix}.notes`),
    created_at: assertIsoTimestamp(row.created_at, `${prefix}.created_at`),
    updated_at: assertIsoTimestamp(row.updated_at, `${prefix}.updated_at`),
    deleted_at: assertNullableIsoTimestamp(
      row.deleted_at,
      `${prefix}.deleted_at`
    ),
  };
}

function collectUniqueIds(
  rows: readonly { id: string }[],
  tableName: string
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) {
      validationError(`Identificador duplicado em ${tableName}: ${row.id}.`);
    }
    ids.add(row.id);
  }
  return ids;
}

function validateReferentialIntegrity(tables: BackupTablesV1): void {
  const categoryIds = collectUniqueIds(tables.categories, "categories");
  const ownerIds = collectUniqueIds(tables.owners, "owners");
  const invoiceIds = collectUniqueIds(tables.invoices, "invoices");
  collectUniqueIds(tables.goals, "goals");
  const investmentIds = collectUniqueIds(tables.investments, "investments");
  collectUniqueIds(tables.category_budgets, "category_budgets");
  const transactionIds = collectUniqueIds(tables.transactions, "transactions");
  collectUniqueIds(tables.installments, "installments");
  collectUniqueIds(tables.investment_contributions, "investment_contributions");

  const settingKeys = new Set<string>();
  for (const setting of tables.app_settings) {
    if (settingKeys.has(setting.key)) {
      validationError(`Chave duplicada em app_settings: ${setting.key}.`);
    }
    settingKeys.add(setting.key);
  }

  const activeSelfOwners = tables.owners.filter(
    (owner) => owner.is_self === 1 && owner.deleted_at === null
  );
  if (activeSelfOwners.length !== 1) {
    validationError(
      "O backup precisa conter exatamente um responsável principal ativo."
    );
  }

  const activeGoalSinces = new Set<string>();
  for (const goal of tables.goals) {
    if (goal.deleted_at === null) {
      if (activeGoalSinces.has(goal.since)) {
        validationError(`Meta mensal ativa duplicada para ${goal.since}.`);
      }
      activeGoalSinces.add(goal.since);
    }
  }

  const activeBudgetKeys = new Set<string>();
  for (const budget of tables.category_budgets) {
    if (!categoryIds.has(budget.category_id)) {
      validationError(
        `Orçamento ${budget.id} referencia categoria inexistente: ${budget.category_id}.`
      );
    }
    if (budget.deleted_at === null) {
      const key = `${budget.category_id}::${budget.month}`;
      if (activeBudgetKeys.has(key)) {
        validationError(
          `Orçamento ativo duplicado para categoria ${budget.category_id} no mês ${budget.month}.`
        );
      }
      activeBudgetKeys.add(key);
    }
  }

  for (const transaction of tables.transactions) {
    if (!ownerIds.has(transaction.owner_id)) {
      validationError(
        `Lançamento ${transaction.id} referencia responsável inexistente: ${transaction.owner_id}.`
      );
    }
    if (
      transaction.category_id !== null &&
      !categoryIds.has(transaction.category_id)
    ) {
      validationError(
        `Lançamento ${transaction.id} referencia categoria inexistente: ${transaction.category_id}.`
      );
    }
    if (
      transaction.invoice_id !== null &&
      !invoiceIds.has(transaction.invoice_id)
    ) {
      validationError(
        `Lançamento ${transaction.id} referencia cartão inexistente: ${transaction.invoice_id}.`
      );
    }
  }

  const activeInstallmentKeys = new Set<string>();
  for (const installment of tables.installments) {
    if (!transactionIds.has(installment.transaction_id)) {
      validationError(
        `Parcela ${installment.id} referencia lançamento inexistente: ${installment.transaction_id}.`
      );
    }
    if (installment.deleted_at === null) {
      const key = `${installment.transaction_id}::${installment.number}`;
      if (activeInstallmentKeys.has(key)) {
        validationError(
          `Parcela ativa duplicada para lançamento ${installment.transaction_id} número ${installment.number}.`
        );
      }
      activeInstallmentKeys.add(key);
    }
  }

  for (const contribution of tables.investment_contributions) {
    if (!investmentIds.has(contribution.investment_id)) {
      validationError(
        `Aporte ${contribution.id} referencia investimento inexistente: ${contribution.investment_id}.`
      );
    }
  }
}

export function buildBackupCounts(tables: BackupTablesV1): BackupTableCounts {
  return {
    categories: tables.categories.length,
    owners: tables.owners.length,
    invoices: tables.invoices.length,
    goals: tables.goals.length,
    investments: tables.investments.length,
    app_settings: tables.app_settings.length,
    category_budgets: tables.category_budgets.length,
    transactions: tables.transactions.length,
    installments: tables.installments.length,
    investment_contributions: tables.investment_contributions.length,
  };
}

export function summarizeBackup(payload: BackupPayloadV1): BackupSummary {
  const counts = buildBackupCounts(payload.data);
  const totalRecords = BACKUP_TABLE_NAMES.reduce(
    (sum, tableName) => sum + counts[tableName],
    0
  );

  return {
    exportedAt: payload.exportedAt,
    schemaVersion: payload.schemaVersion,
    backupVersion: payload.backupVersion,
    totalRecords,
    counts,
  };
}

export async function exportDatabaseBackup(
  db: SQLite.SQLiteDatabase
): Promise<BackupPayloadV1> {
  const schemaVersion = await getDatabaseVersion(db);

  const [
    categories,
    owners,
    invoices,
    goals,
    investments,
    app_settings,
    category_budgets,
    transactions,
    installments,
    investment_contributions,
  ] = await Promise.all([
    db.getAllAsync<BackupCategoryRow>(
      `SELECT id, name, color, icon, created_at, updated_at, deleted_at
       FROM categories`
    ),
    db.getAllAsync<BackupOwnerRow>(
      `SELECT id, name, is_self, created_at, updated_at, deleted_at
       FROM owners`
    ),
    db.getAllAsync<BackupInvoiceRow>(
      `SELECT id, name, limit_amount, color, due_day, closing_day, created_at, updated_at, deleted_at
       FROM invoices`
    ),
    db.getAllAsync<BackupGoalRow>(
      `SELECT id, since, amount, created_at, updated_at, deleted_at
       FROM goals`
    ),
    db.getAllAsync<BackupInvestmentRow>(
      `SELECT id, name, type, institution, current_balance, notes, created_at, updated_at, deleted_at
       FROM investments`
    ),
    db.getAllAsync<BackupAppSettingRow>(
      `SELECT key, value, created_at, updated_at, deleted_at
       FROM app_settings`
    ),
    db.getAllAsync<BackupCategoryBudgetRow>(
      `SELECT id, category_id, month, amount, created_at, updated_at, deleted_at
       FROM category_budgets`
    ),
    db.getAllAsync<BackupTransactionRow>(
      `SELECT id, name, type, amount, category_id, owner_id, invoice_id, group_id, installments_count, recurrence, active, notes, created_at, updated_at, deleted_at
       FROM transactions`
    ),
    db.getAllAsync<BackupInstallmentRow>(
      `SELECT id, transaction_id, number, amount, paid_amount, due_date, paid_at, status, created_at, updated_at, deleted_at
       FROM installments`
    ),
    db.getAllAsync<BackupInvestmentContributionRow>(
      `SELECT id, investment_id, amount, contributed_at, notes, created_at, updated_at, deleted_at
       FROM investment_contributions`
    ),
  ]);

  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion,
    exportedAt: nowIsoUtc(),
    data: {
      categories,
      owners,
      invoices,
      goals,
      investments,
      app_settings,
      category_budgets,
      transactions,
      installments,
      investment_contributions,
    },
  };
}

export function parseAndValidateBackup(
  rawJson: string,
  maxSupportedSchemaVersion: number = MIGRATIONS.length
): BackupPayloadV1 {
  if (typeof rawJson !== "string" || rawJson.trim().length === 0) {
    validationError("O arquivo de backup está vazio.");
  }

  if (rawJson.length > MAX_BACKUP_FILE_SIZE_BYTES) {
    validationError(
      "O arquivo de backup excede o tamanho máximo permitido de 20 MB."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    validationError("O arquivo de backup não contém um JSON válido.");
  }

  if (!isRecord(parsed)) {
    validationError("Estrutura de backup inválida.");
  }

  if (parsed.app !== BACKUP_APP) {
    validationError("Arquivo não pertence ao aplicativo Em Dia.");
  }

  if (parsed.format !== BACKUP_FORMAT) {
    validationError("Formato de backup incompatível.");
  }

  if (parsed.backupVersion !== BACKUP_VERSION) {
    validationError("Versão de arquivo de backup não suportada.");
  }

  const schemaVersion = assertInteger(
    parsed.schemaVersion,
    "schemaVersion",
    1,
    maxSupportedSchemaVersion
  );

  const exportedAt = assertIsoTimestamp(parsed.exportedAt, "exportedAt");

  if (!isRecord(parsed.data)) {
    validationError("Bloco de dados do backup ausente ou inválido.");
  }

  const dataRecord = parsed.data;
  const tables: BackupTablesV1 = {
    categories: assertTableArray(dataRecord, "categories").map(
      validateCategoryRow
    ),
    owners: assertTableArray(dataRecord, "owners").map(validateOwnerRow),
    invoices: assertTableArray(dataRecord, "invoices").map(validateInvoiceRow),
    goals: assertTableArray(dataRecord, "goals").map(validateGoalRow),
    investments: assertTableArray(dataRecord, "investments").map(
      validateInvestmentRow
    ),
    app_settings: assertTableArray(dataRecord, "app_settings").map(
      validateAppSettingRow
    ),
    category_budgets: assertTableArray(dataRecord, "category_budgets").map(
      validateCategoryBudgetRow
    ),
    transactions: assertTableArray(dataRecord, "transactions").map(
      validateTransactionRow
    ),
    installments: assertTableArray(dataRecord, "installments").map(
      validateInstallmentRow
    ),
    investment_contributions: assertTableArray(
      dataRecord,
      "investment_contributions"
    ).map(validateInvestmentContributionRow),
  };

  validateReferentialIntegrity(tables);

  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion,
    exportedAt,
    data: tables,
  };
}

export async function restoreDatabaseBackup(
  db: SQLite.SQLiteDatabase,
  payload: BackupPayloadV1,
  options?: RestoreBackupOptions
): Promise<RestoreBackupResult> {
  const { data } = payload;
  let recurrence: EnsureRecurringInstallmentsResult | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      DELETE FROM investment_contributions;
      DELETE FROM installments;
      DELETE FROM transactions;
      DELETE FROM category_budgets;
      DELETE FROM app_settings;
      DELETE FROM investments;
      DELETE FROM goals;
      DELETE FROM invoices;
      DELETE FROM owners;
      DELETE FROM categories;
    `);

    for (const row of data.categories) {
      await txn.runAsync(
        `INSERT INTO categories (id, name, color, icon, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.color,
        row.icon,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.owners) {
      await txn.runAsync(
        `INSERT INTO owners (id, name, is_self, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.is_self,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.invoices) {
      await txn.runAsync(
        `INSERT INTO invoices (id, name, limit_amount, color, due_day, closing_day, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.limit_amount,
        row.color,
        row.due_day,
        row.closing_day,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.goals) {
      await txn.runAsync(
        `INSERT INTO goals (id, since, amount, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        row.id,
        row.since,
        row.amount,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.investments) {
      await txn.runAsync(
        `INSERT INTO investments (id, name, type, institution, current_balance, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.type,
        row.institution,
        row.current_balance,
        row.notes,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.app_settings) {
      await txn.runAsync(
        `INSERT INTO app_settings (key, value, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?)`,
        row.key,
        row.value,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.category_budgets) {
      await txn.runAsync(
        `INSERT INTO category_budgets (id, category_id, month, amount, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.category_id,
        row.month,
        row.amount,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.transactions) {
      await txn.runAsync(
        `INSERT INTO transactions (id, name, type, amount, category_id, owner_id, invoice_id, group_id, installments_count, recurrence, active, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.type,
        row.amount,
        row.category_id,
        row.owner_id,
        row.invoice_id,
        row.group_id,
        row.installments_count,
        row.recurrence,
        row.active,
        row.notes,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.installments) {
      await txn.runAsync(
        `INSERT INTO installments (id, transaction_id, number, amount, paid_amount, due_date, paid_at, status, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.transaction_id,
        row.number,
        row.amount,
        row.paid_amount,
        row.due_date,
        row.paid_at,
        row.status,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    for (const row of data.investment_contributions) {
      await txn.runAsync(
        `INSERT INTO investment_contributions (id, investment_id, amount, contributed_at, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.investment_id,
        row.amount,
        row.contributed_at,
        row.notes,
        row.created_at,
        row.updated_at,
        row.deleted_at
      );
    }

    recurrence = await ensureRecurringInstallmentsInTransaction(
      txn,
      options?.referenceDate ?? new Date()
    );
  });

  return {
    schemaVersion: payload.schemaVersion,
    restoredCounts: buildBackupCounts(data),
    recurrence: recurrence as unknown as EnsureRecurringInstallmentsResult,
  };
}
