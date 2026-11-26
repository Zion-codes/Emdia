import * as SQLite from "expo-sqlite";
import { assertMonthKey } from "../dates";
import { fromCents, toPositiveCents } from "../money";
import { generateUuid, nowIsoUtc } from "../utils";

export interface Goal {
  id: string;
  since: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

interface GoalRow {
  id: string;
  since: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

function mapGoalRow(row: GoalRow): Goal {
  return {
    id: row.id,
    since: row.since,
    amount: fromCents(row.amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getGoalForMonth(
  db: SQLite.SQLiteDatabase,
  month: string
): Promise<number | null> {
  const validMonth = assertMonthKey(month);
  const row = await db.getFirstAsync<{ amount: number }>(
    `SELECT amount
     FROM goals
     WHERE since <= ? AND deleted_at IS NULL
     ORDER BY since DESC
     LIMIT 1`,
    validMonth
  );

  if (!row || row.amount === 0) {
    return null;
  }

  return fromCents(row.amount);
}

export async function setGoalForMonth(
  db: SQLite.SQLiteDatabase,
  month: string,
  amount: number
): Promise<number> {
  const validMonth = assertMonthKey(month);
  const newAmountCents = toPositiveCents(amount);

  await db.withExclusiveTransactionAsync(async (txn) => {
    const timestamp = nowIsoUtc();

    const previousRow = await txn.getFirstAsync<{ amount: number }>(
      `SELECT amount
       FROM goals
       WHERE since < ? AND deleted_at IS NULL
       ORDER BY since DESC
       LIMIT 1`,
      validMonth
    );
    const previousEffectiveCents = previousRow?.amount ?? 0;

    const currentRow = await txn.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM goals
       WHERE since = ? AND deleted_at IS NULL`,
      validMonth
    );

    if (currentRow) {
      if (newAmountCents === previousEffectiveCents) {
        await txn.runAsync(
          `UPDATE goals
           SET deleted_at = ?, updated_at = ?
           WHERE id = ?`,
          timestamp,
          timestamp,
          currentRow.id
        );
      } else {
        await txn.runAsync(
          `UPDATE goals
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
        `INSERT INTO goals (id, since, amount, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        generateUuid(),
        validMonth,
        newAmountCents,
        timestamp,
        timestamp
      );
    }
  });

  return fromCents(newAmountCents);
}

export async function removeGoalFromMonth(
  db: SQLite.SQLiteDatabase,
  month: string
): Promise<void> {
  const validMonth = assertMonthKey(month);

  await db.withExclusiveTransactionAsync(async (txn) => {
    const timestamp = nowIsoUtc();

    const previousRow = await txn.getFirstAsync<{ amount: number }>(
      `SELECT amount
       FROM goals
       WHERE since < ? AND deleted_at IS NULL
       ORDER BY since DESC
       LIMIT 1`,
      validMonth
    );
    const previousEffectiveCents = previousRow?.amount ?? 0;

    const currentRow = await txn.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM goals
       WHERE since = ? AND deleted_at IS NULL`,
      validMonth
    );

    if (previousEffectiveCents > 0) {
      if (currentRow) {
        await txn.runAsync(
          `UPDATE goals
           SET amount = 0, updated_at = ?
           WHERE id = ?`,
          timestamp,
          currentRow.id
        );
      } else {
        await txn.runAsync(
          `INSERT INTO goals (id, since, amount, created_at, updated_at, deleted_at)
           VALUES (?, ?, 0, ?, ?, NULL)`,
          generateUuid(),
          validMonth,
          timestamp,
          timestamp
        );
      }
    } else if (currentRow) {
      await txn.runAsync(
        `UPDATE goals
         SET deleted_at = ?, updated_at = ?
         WHERE id = ?`,
        timestamp,
        timestamp,
        currentRow.id
      );
    }

    await txn.runAsync(
      `UPDATE goals
       SET deleted_at = ?, updated_at = ?
       WHERE since > ? AND deleted_at IS NULL`,
      timestamp,
      timestamp,
      validMonth
    );
  });
}

export async function listGoalHistory(
  db: SQLite.SQLiteDatabase
): Promise<Goal[]> {
  const rows = await db.getAllAsync<GoalRow>(
    `SELECT id, since, amount, created_at, updated_at
     FROM goals
     WHERE deleted_at IS NULL
     ORDER BY since DESC`
  );

  return rows.map(mapGoalRow);
}
