import * as SQLite from "expo-sqlite";
import { toMonthKey } from "../../shared/utils/format";
import {
  addMonthsToMonthKey,
  assertMonthKey,
  getMonthDateRange,
  toLocalDateKey,
} from "../dates";
import { DatabaseError } from "../errors";
import { fromCents } from "../money";

export interface MonthlySummaryOptions {
  month?: string;
  ownerId?: string;
  referenceDate?: Date;
}

export interface MonthlyTotals {
  incomeTotal: number;
  expenseTotal: number;
  cashFlow: number;
  paidIncomeTotal: number;
  paidExpenseTotal: number;
  realizedCashFlow: number;
}

export interface MonthlyComparison {
  previousMonth: string;
  incomeTotal: number;
  expenseTotal: number;
  cashFlow: number;
  incomeDelta: number;
  expenseDelta: number;
  cashFlowDelta: number;
  incomeChangePercent: number | null;
  expenseChangePercent: number | null;
  cashFlowChangePercent: number | null;
}

export interface CategoryBudgetProgress {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  percentage: number;
  isExceeded: boolean;
}

export interface MonthlySummary {
  month: string;
  ownerId: string | null;
  totals: MonthlyTotals;
  comparison: MonthlyComparison;
  overdueCount: number;
  overdueAmount: number;
  toPayAmount: number;
  categoryBudgets: CategoryBudgetProgress[];
  goalAmount: number | null;
}

interface TotalsCentsRow {
  income_cents: number;
  expense_cents: number;
  paid_income_cents: number;
  paid_expense_cents: number;
}

interface OverdueRow {
  overdue_count: number;
  overdue_cents: number;
}

interface ToPayRow {
  to_pay_cents: number;
}

interface CategoryBudgetRow {
  category_id: string;
  category_name: string;
  category_color: string | null;
  category_icon: string | null;
  budget_cents: number | null;
  spent_cents: number;
}

function roundToTwoDecimals(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function computeChangePercent(
  deltaCents: number,
  previousCents: number
): number | null {
  if (previousCents === 0) {
    return null;
  }

  return roundToTwoDecimals((deltaCents / Math.abs(previousCents)) * 100);
}

async function assertActiveOwnerExists(
  db: SQLite.SQLiteDatabase,
  ownerId: string
): Promise<void> {
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id
     FROM owners
     WHERE id = ? AND deleted_at IS NULL`,
    ownerId
  );

  if (!row) {
    throw new DatabaseError("NOT_FOUND", "Responsável não encontrado.");
  }
}

async function getMonthTotalsCents(
  db: SQLite.SQLiteDatabase,
  month: string,
  ownerId: string | null
): Promise<TotalsCentsRow> {
  const { start, end } = getMonthDateRange(month);
  const params: (string | number)[] = [start, end];
  const ownerClause = ownerId ? "AND t.owner_id = ?" : "";
  if (ownerId) {
    params.push(ownerId);
  }

  const row = await db.getFirstAsync<TotalsCentsRow>(
    `SELECT
       COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN i.amount ELSE 0 END), 0) AS income_cents,
       COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN i.amount ELSE 0 END), 0) AS expense_cents,
       COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN i.paid_amount ELSE 0 END), 0) AS paid_income_cents,
       COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN i.paid_amount ELSE 0 END), 0) AS paid_expense_cents
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     WHERE t.deleted_at IS NULL
       AND i.deleted_at IS NULL
       AND substr(i.due_date, 1, 10) BETWEEN ? AND ?
       ${ownerClause}`,
    params
  );

  return row!;
}

async function getOverdueSummary(
  db: SQLite.SQLiteDatabase,
  todayKey: string,
  ownerId: string | null
): Promise<{ overdueCount: number; overdueAmount: number }> {
  const params: string[] = [todayKey];
  const ownerClause = ownerId ? "AND t.owner_id = ?" : "";
  if (ownerId) {
    params.push(ownerId);
  }

  const row = await db.getFirstAsync<OverdueRow>(
    `SELECT
       COUNT(*) AS overdue_count,
       COALESCE(SUM(i.amount - i.paid_amount), 0) AS overdue_cents
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     WHERE t.type = 'EXPENSE'
       AND i.status = 'PENDING'
       AND t.deleted_at IS NULL
       AND i.deleted_at IS NULL
       AND substr(i.due_date, 1, 10) < ?
       ${ownerClause}`,
    params
  );

  return {
    overdueCount: row!.overdue_count,
    overdueAmount: fromCents(row!.overdue_cents),
  };
}

async function getToPayAmount(
  db: SQLite.SQLiteDatabase,
  monthStart: string,
  monthEnd: string,
  todayKey: string,
  ownerId: string | null
): Promise<number> {
  const params: string[] = [monthStart, monthEnd, todayKey];
  const ownerClause = ownerId ? "AND t.owner_id = ?" : "";
  if (ownerId) {
    params.push(ownerId);
  }

  const row = await db.getFirstAsync<ToPayRow>(
    `SELECT
       COALESCE(SUM(i.amount - i.paid_amount), 0) AS to_pay_cents
     FROM installments i
     INNER JOIN transactions t ON t.id = i.transaction_id
     WHERE t.type = 'EXPENSE'
       AND i.status = 'PENDING'
       AND t.deleted_at IS NULL
       AND i.deleted_at IS NULL
       AND (
         substr(i.due_date, 1, 10) BETWEEN ? AND ?
         OR substr(i.due_date, 1, 10) < ?
       )
       ${ownerClause}`,
    params
  );

  return fromCents(row!.to_pay_cents);
}

async function getCategoryBudgetsProgress(
  db: SQLite.SQLiteDatabase,
  month: string,
  monthStart: string,
  monthEnd: string,
  ownerId: string | null
): Promise<CategoryBudgetProgress[]> {
  const params: string[] = [month, monthStart, monthEnd];
  const ownerClause = ownerId ? "AND t.owner_id = ?" : "";
  if (ownerId) {
    params.push(ownerId);
  }

  const rows = await db.getAllAsync<CategoryBudgetRow>(
    `SELECT
       c.id AS category_id,
       c.name AS category_name,
       c.color AS category_color,
       c.icon AS category_icon,
       (
         SELECT cb.amount
         FROM category_budgets cb
         WHERE cb.category_id = c.id
           AND cb.month <= ?
           AND cb.deleted_at IS NULL
         ORDER BY cb.month DESC
         LIMIT 1
       ) AS budget_cents,
       COALESCE((
         SELECT SUM(i.amount)
         FROM installments i
         INNER JOIN transactions t ON t.id = i.transaction_id
         WHERE t.category_id = c.id
           AND t.type = 'EXPENSE'
           AND t.deleted_at IS NULL
           AND i.deleted_at IS NULL
           AND substr(i.due_date, 1, 10) BETWEEN ? AND ?
           ${ownerClause}
       ), 0) AS spent_cents
     FROM categories c
     WHERE c.deleted_at IS NULL`,
    params
  );

  const result: CategoryBudgetProgress[] = [];

  for (const row of rows) {
    if (row.budget_cents === null || row.budget_cents <= 0) {
      continue;
    }

    const budgetCents = row.budget_cents;
    const spentCents = row.spent_cents;
    const percentage = roundToTwoDecimals((spentCents / budgetCents) * 100);

    result.push({
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryColor: row.category_color,
      categoryIcon: row.category_icon,
      budgetAmount: fromCents(budgetCents),
      spentAmount: fromCents(spentCents),
      remainingAmount: fromCents(budgetCents - spentCents),
      percentage,
      isExceeded: spentCents > budgetCents,
    });
  }

  result.sort((a, b) => {
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }

    return a.categoryName.localeCompare(b.categoryName, undefined, {
      sensitivity: "base",
    });
  });

  return result;
}

async function getEffectiveGoalAmount(
  db: SQLite.SQLiteDatabase,
  month: string
): Promise<number | null> {
  const row = await db.getFirstAsync<{ amount: number }>(
    `SELECT amount
     FROM goals
     WHERE since <= ? AND deleted_at IS NULL
     ORDER BY since DESC
     LIMIT 1`,
    month
  );

  if (!row || row.amount === 0) {
    return null;
  }

  return fromCents(row.amount);
}

export async function getMonthlySummary(
  db: SQLite.SQLiteDatabase,
  options?: MonthlySummaryOptions
): Promise<MonthlySummary> {
  const referenceDate = options?.referenceDate ?? new Date();
  const month =
    options?.month !== undefined
      ? assertMonthKey(options.month)
      : toMonthKey(referenceDate);
  const ownerId = options?.ownerId ?? null;

  if (ownerId !== null) {
    await assertActiveOwnerExists(db, ownerId);
  }

  const previousMonth = addMonthsToMonthKey(month, -1);
  const todayKey = toLocalDateKey(referenceDate);
  const { start: monthStart, end: monthEnd } = getMonthDateRange(month);

  const [
    currentTotalsRow,
    previousTotalsRow,
    overdue,
    toPayAmount,
    categoryBudgets,
    goalAmount,
  ] = await Promise.all([
    getMonthTotalsCents(db, month, ownerId),
    getMonthTotalsCents(db, previousMonth, ownerId),
    getOverdueSummary(db, todayKey, ownerId),
    getToPayAmount(db, monthStart, monthEnd, todayKey, ownerId),
    getCategoryBudgetsProgress(db, month, monthStart, monthEnd, ownerId),
    getEffectiveGoalAmount(db, month),
  ]);

  const cashFlowCents =
    currentTotalsRow.income_cents - currentTotalsRow.expense_cents;
  const realizedCashFlowCents =
    currentTotalsRow.paid_income_cents - currentTotalsRow.paid_expense_cents;

  const prevCashFlowCents =
    previousTotalsRow.income_cents - previousTotalsRow.expense_cents;

  const incomeDeltaCents =
    currentTotalsRow.income_cents - previousTotalsRow.income_cents;
  const expenseDeltaCents =
    currentTotalsRow.expense_cents - previousTotalsRow.expense_cents;
  const cashFlowDeltaCents = cashFlowCents - prevCashFlowCents;

  return {
    month,
    ownerId,
    totals: {
      incomeTotal: fromCents(currentTotalsRow.income_cents),
      expenseTotal: fromCents(currentTotalsRow.expense_cents),
      cashFlow: fromCents(cashFlowCents),
      paidIncomeTotal: fromCents(currentTotalsRow.paid_income_cents),
      paidExpenseTotal: fromCents(currentTotalsRow.paid_expense_cents),
      realizedCashFlow: fromCents(realizedCashFlowCents),
    },
    comparison: {
      previousMonth,
      incomeTotal: fromCents(previousTotalsRow.income_cents),
      expenseTotal: fromCents(previousTotalsRow.expense_cents),
      cashFlow: fromCents(prevCashFlowCents),
      incomeDelta: fromCents(incomeDeltaCents),
      expenseDelta: fromCents(expenseDeltaCents),
      cashFlowDelta: fromCents(cashFlowDeltaCents),
      incomeChangePercent: computeChangePercent(
        incomeDeltaCents,
        previousTotalsRow.income_cents
      ),
      expenseChangePercent: computeChangePercent(
        expenseDeltaCents,
        previousTotalsRow.expense_cents
      ),
      cashFlowChangePercent: computeChangePercent(
        cashFlowDeltaCents,
        prevCashFlowCents
      ),
    },
    overdueCount: overdue.overdueCount,
    overdueAmount: overdue.overdueAmount,
    toPayAmount,
    categoryBudgets,
    goalAmount,
  };
}
