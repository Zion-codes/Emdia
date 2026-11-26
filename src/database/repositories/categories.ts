import * as SQLite from "expo-sqlite";
import { toMonthKey } from "../../shared/utils/format";
import { assertMonthKey } from "../dates";
import { DatabaseError } from "../errors";
import { fromCents, toCents, toPositiveCents } from "../money";
import { generateUuid, nowIsoUtc } from "../utils";

export interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  budget: number | null;
  transactionsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryBudget {
  id: string;
  categoryId: string;
  month: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  color?: string | null;
  icon?: string | null;
  budget?: number | null;
  month?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string | null;
  icon?: string | null;
}

export interface CategoryQueryOptions {
  month?: string;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  budget_cents: number | null;
  transactions_count: number;
  created_at: string;
  updated_at: string;
}

interface CategoryBudgetRow {
  id: string;
  category_id: string;
  month: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

function mapCategoryRow(row: CategoryRow): Category {
  const budget =
    row.budget_cents !== null && row.budget_cents > 0
      ? fromCents(row.budget_cents)
      : null;

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    budget,
    transactionsCount: row.transactions_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategoryBudgetRow(row: CategoryBudgetRow): CategoryBudget {
  return {
    id: row.id,
    categoryId: row.category_id,
    month: row.month,
    amount: fromCents(row.amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveTargetMonth(options?: CategoryQueryOptions): string {
  if (options?.month !== undefined) {
    return assertMonthKey(options.month);
  }

  return toMonthKey(new Date());
}

function validateCategoryName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O nome da categoria é obrigatório."
    );
  }

  return trimmed;
}

async function assertCategoryExists(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<{
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
}> {
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, color, icon, created_at, updated_at
     FROM categories
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );

  if (!row) {
    throw new DatabaseError("NOT_FOUND", "Categoria não encontrada.");
  }

  return row;
}

export async function listCategories(
  db: SQLite.SQLiteDatabase,
  options?: CategoryQueryOptions
): Promise<Category[]> {
  const month = resolveTargetMonth(options);
  const rows = await db.getAllAsync<CategoryRow>(
    `SELECT
       c.id,
       c.name,
       c.color,
       c.icon,
       c.created_at,
       c.updated_at,
       (
         SELECT COUNT(*)
         FROM transactions t
         WHERE t.category_id = c.id AND t.deleted_at IS NULL
       ) AS transactions_count,
       (
         SELECT cb.amount
         FROM category_budgets cb
         WHERE cb.category_id = c.id
           AND cb.month <= ?
           AND cb.deleted_at IS NULL
         ORDER BY cb.month DESC
         LIMIT 1
       ) AS budget_cents
     FROM categories c
     WHERE c.deleted_at IS NULL
     ORDER BY c.name COLLATE NOCASE ASC`,
    month
  );

  return rows.map(mapCategoryRow);
}

export async function getCategoryById(
  db: SQLite.SQLiteDatabase,
  id: string,
  options?: CategoryQueryOptions
): Promise<Category | null> {
  const month = resolveTargetMonth(options);
  const row = await db.getFirstAsync<CategoryRow>(
    `SELECT
       c.id,
       c.name,
       c.color,
       c.icon,
       c.created_at,
       c.updated_at,
       (
         SELECT COUNT(*)
         FROM transactions t
         WHERE t.category_id = c.id AND t.deleted_at IS NULL
       ) AS transactions_count,
       (
         SELECT cb.amount
         FROM category_budgets cb
         WHERE cb.category_id = c.id
           AND cb.month <= ?
           AND cb.deleted_at IS NULL
         ORDER BY cb.month DESC
         LIMIT 1
       ) AS budget_cents
     FROM categories c
     WHERE c.id = ? AND c.deleted_at IS NULL`,
    month,
    id
  );

  return row ? mapCategoryRow(row) : null;
}

export async function createCategory(
  db: SQLite.SQLiteDatabase,
  input: CreateCategoryInput
): Promise<Category> {
  const name = validateCategoryName(input.name);
  const color = input.color ?? null;
  const icon = input.icon ?? null;
  const month = resolveTargetMonth({ month: input.month });
  const budgetCents =
    input.budget !== undefined && input.budget !== null
      ? toCents(input.budget)
      : null;

  const id = generateUuid();
  const timestamp = nowIsoUtc();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO categories (id, name, color, icon, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      id,
      name,
      color,
      icon,
      timestamp,
      timestamp
    );

    if (budgetCents !== null && budgetCents > 0) {
      await txn.runAsync(
        `INSERT INTO category_budgets (id, category_id, month, amount, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        generateUuid(),
        id,
        month,
        budgetCents,
        timestamp,
        timestamp
      );
    }
  });

  return {
    id,
    name,
    color,
    icon,
    budget:
      budgetCents !== null && budgetCents > 0 ? fromCents(budgetCents) : null,
    transactionsCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function updateCategory(
  db: SQLite.SQLiteDatabase,
  id: string,
  input: UpdateCategoryInput
): Promise<Category> {
  const existing = await assertCategoryExists(db, id);
  const name =
    input.name !== undefined ? validateCategoryName(input.name) : existing.name;
  const color = input.color !== undefined ? input.color : existing.color;
  const icon = input.icon !== undefined ? input.icon : existing.icon;
  const timestamp = nowIsoUtc();

  await db.runAsync(
    `UPDATE categories
     SET name = ?, color = ?, icon = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    name,
    color,
    icon,
    timestamp,
    id
  );

  return (await getCategoryById(db, id)) as Category;
}

export async function deleteCategory(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await assertCategoryExists(txn, id);
    const timestamp = nowIsoUtc();

    await txn.runAsync(
      `UPDATE transactions
       SET category_id = NULL, updated_at = ?
       WHERE category_id = ? AND deleted_at IS NULL`,
      timestamp,
      id
    );

    await txn.runAsync(
      `UPDATE category_budgets
       SET deleted_at = ?, updated_at = ?
       WHERE category_id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      id
    );

    await txn.runAsync(
      `UPDATE categories
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      id
    );
  });
}

export async function getCategoryBudgetForMonth(
  db: SQLite.SQLiteDatabase,
  categoryId: string,
  month: string
): Promise<number | null> {
  const validMonth = assertMonthKey(month);
  const row = await db.getFirstAsync<{ amount: number }>(
    `SELECT amount
     FROM category_budgets
     WHERE category_id = ? AND month <= ? AND deleted_at IS NULL
     ORDER BY month DESC
     LIMIT 1`,
    categoryId,
    validMonth
  );

  if (!row || row.amount === 0) {
    return null;
  }

  return fromCents(row.amount);
}

export async function setCategoryBudget(
  db: SQLite.SQLiteDatabase,
  categoryId: string,
  month: string,
  amount: number
): Promise<number> {
  const validMonth = assertMonthKey(month);
  const newAmountCents = toPositiveCents(amount);

  await db.withExclusiveTransactionAsync(async (txn) => {
    await assertCategoryExists(txn, categoryId);
    const timestamp = nowIsoUtc();

    const previousRow = await txn.getFirstAsync<{ amount: number }>(
      `SELECT amount
       FROM category_budgets
       WHERE category_id = ? AND month < ? AND deleted_at IS NULL
       ORDER BY month DESC
       LIMIT 1`,
      categoryId,
      validMonth
    );
    const previousEffectiveCents = previousRow?.amount ?? 0;

    const currentRow = await txn.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM category_budgets
       WHERE category_id = ? AND month = ? AND deleted_at IS NULL`,
      categoryId,
      validMonth
    );

    if (currentRow) {
      if (newAmountCents === previousEffectiveCents) {
        await txn.runAsync(
          `UPDATE category_budgets
           SET deleted_at = ?, updated_at = ?
           WHERE id = ?`,
          timestamp,
          timestamp,
          currentRow.id
        );
      } else {
        await txn.runAsync(
          `UPDATE category_budgets
           SET amount = ?, updated_at = ?
           WHERE id = ?`,
          newAmountCents,
          timestamp,
          currentRow.id
        );
      }
      return;
    }

    if (newAmountCents !== previousEffectiveCents) {
      await txn.runAsync(
        `INSERT INTO category_budgets (id, category_id, month, amount, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        generateUuid(),
        categoryId,
        validMonth,
        newAmountCents,
        timestamp,
        timestamp
      );
    }
  });

  return fromCents(newAmountCents);
}

export async function removeCategoryBudget(
  db: SQLite.SQLiteDatabase,
  categoryId: string,
  month: string
): Promise<void> {
  const validMonth = assertMonthKey(month);

  await db.withExclusiveTransactionAsync(async (txn) => {
    await assertCategoryExists(txn, categoryId);
    const timestamp = nowIsoUtc();

    const previousRow = await txn.getFirstAsync<{ amount: number }>(
      `SELECT amount
       FROM category_budgets
       WHERE category_id = ? AND month < ? AND deleted_at IS NULL
       ORDER BY month DESC
       LIMIT 1`,
      categoryId,
      validMonth
    );
    const previousEffectiveCents = previousRow?.amount ?? 0;

    const currentRow = await txn.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM category_budgets
       WHERE category_id = ? AND month = ? AND deleted_at IS NULL`,
      categoryId,
      validMonth
    );

    if (previousEffectiveCents > 0) {
      if (currentRow) {
        await txn.runAsync(
          `UPDATE category_budgets
           SET amount = 0, updated_at = ?
           WHERE id = ?`,
          timestamp,
          currentRow.id
        );
      } else {
        await txn.runAsync(
          `INSERT INTO category_budgets (id, category_id, month, amount, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, 0, ?, ?, NULL)`,
          generateUuid(),
          categoryId,
          validMonth,
          timestamp,
          timestamp
        );
      }
      return;
    }

    if (currentRow) {
      await txn.runAsync(
        `UPDATE category_budgets
         SET deleted_at = ?, updated_at = ?
         WHERE id = ?`,
        timestamp,
        timestamp,
        currentRow.id
      );
    }
  });
}

export async function listCategoryBudgetHistory(
  db: SQLite.SQLiteDatabase,
  categoryId: string
): Promise<CategoryBudget[]> {
  await assertCategoryExists(db, categoryId);
  const rows = await db.getAllAsync<CategoryBudgetRow>(
    `SELECT id, category_id, month, amount, created_at, updated_at
     FROM category_budgets
     WHERE category_id = ? AND deleted_at IS NULL
     ORDER BY month DESC`,
    categoryId
  );

  return rows.map(mapCategoryBudgetRow);
}
