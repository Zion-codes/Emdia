import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../../tests/helpers/inMemorySqlite";
import { DatabaseError } from "../errors";
import {
  createCategory,
  deleteCategory,
  removeCategoryBudget,
  setCategoryBudget,
} from "./categories";
import { removeGoalFromMonth, setGoalForMonth } from "./goals";
import { registerInstallmentPayment, settleInstallment } from "./installments";
import { createOwner, deleteOwner, getSelfOwner } from "./owners";
import { getMonthlySummary } from "./summary";
import { createTransaction, deleteTransaction } from "./transactions";

describe("summary repository", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("returns empty summary with defaults when no data exists", async () => {
    const referenceDate = new Date(2026, 3, 15, 12, 0, 0);
    const summary = await getMonthlySummary(db, { referenceDate });

    expect(summary).toEqual({
      month: "2026-04",
      ownerId: null,
      totals: {
        incomeTotal: 0,
        expenseTotal: 0,
        cashFlow: 0,
        paidIncomeTotal: 0,
        paidExpenseTotal: 0,
        realizedCashFlow: 0,
      },
      comparison: {
        previousMonth: "2026-03",
        incomeTotal: 0,
        expenseTotal: 0,
        cashFlow: 0,
        incomeDelta: 0,
        expenseDelta: 0,
        cashFlowDelta: 0,
        incomeChangePercent: null,
        expenseChangePercent: null,
        cashFlowChangePercent: null,
      },
      overdueCount: 0,
      overdueAmount: 0,
      toPayAmount: 0,
      categoryBudgets: [],
      goalAmount: null,
    });
  });

  it("uses current date as default when options are omitted", async () => {
    const summary = await getMonthlySummary(db);
    const now = new Date();
    const expectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    expect(summary.month).toBe(expectedMonth);
    expect(summary.ownerId).toBeNull();
  });

  it("validates month key and ownerId existence", async () => {
    await expect(getMonthlySummary(db, { month: "2026-13" })).rejects.toThrow(
      DatabaseError
    );

    await expect(
      getMonthlySummary(db, { ownerId: "missing-owner" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Responsável não encontrado.",
    });

    const owner = await createOwner(db, { name: "Maria" });
    await deleteOwner(db, owner.id);

    await expect(
      getMonthlySummary(db, { ownerId: owner.id })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Responsável não encontrado.",
    });
  });

  it("computes cash flow, comparison vs previous month, negative base percent, and zero delta", async () => {
    const selfOwner = (await getSelfOwner(db))!;

    await createTransaction(db, {
      name: "Salário Março",
      type: "INCOME",
      amount: 1000,
      dueDate: "2026-03-05",
      ownerId: selfOwner.id,
    });
    await createTransaction(db, {
      name: "Aluguel Março",
      type: "EXPENSE",
      amount: 1500,
      dueDate: "2026-03-10",
      ownerId: selfOwner.id,
    });

    const aprilIncome = await createTransaction(db, {
      name: "Salário Abril",
      type: "INCOME",
      amount: 2000,
      dueDate: "2026-04-05",
      ownerId: selfOwner.id,
    });
    const aprilExpense = await createTransaction(db, {
      name: "Aluguel Abril",
      type: "EXPENSE",
      amount: 1500,
      dueDate: "2026-04-10",
      ownerId: selfOwner.id,
    });
    const deletedTx = await createTransaction(db, {
      name: "Deletada",
      type: "EXPENSE",
      amount: 500,
      dueDate: "2026-04-12",
      ownerId: selfOwner.id,
    });
    await deleteTransaction(db, deletedTx.id);

    await settleInstallment(db, aprilIncome.installments[0].id, {
      confirmed: true,
    });
    await registerInstallmentPayment(db, {
      installmentId: aprilExpense.installments[0].id,
      amount: 600,
    });

    const summary = await getMonthlySummary(db, {
      month: "2026-04",
      referenceDate: new Date(2026, 3, 15, 12, 0, 0),
    });

    expect(summary.totals).toEqual({
      incomeTotal: 2000,
      expenseTotal: 1500,
      cashFlow: 500,
      paidIncomeTotal: 2000,
      paidExpenseTotal: 600,
      realizedCashFlow: 1400,
    });

    expect(summary.comparison).toEqual({
      previousMonth: "2026-03",
      incomeTotal: 1000,
      expenseTotal: 1500,
      cashFlow: -500,
      incomeDelta: 1000,
      expenseDelta: 0,
      cashFlowDelta: 1000,
      incomeChangePercent: 100,
      expenseChangePercent: 0,
      cashFlowChangePercent: 200,
    });
  });

  it("computes overdue and toPayAmount without double counting and respecting local date", async () => {
    const selfOwner = (await getSelfOwner(db))!;

    const oldOverdue = await createTransaction(db, {
      name: "Conta Fevereiro",
      type: "EXPENSE",
      amount: 300,
      dueDate: "2026-02-20",
      ownerId: selfOwner.id,
    });
    await registerInstallmentPayment(db, {
      installmentId: oldOverdue.installments[0].id,
      amount: 100,
    });

    await createTransaction(db, {
      name: "Conta Abril Vencida",
      type: "EXPENSE",
      amount: 250,
      dueDate: "2026-04-10",
      ownerId: selfOwner.id,
    });

    await createTransaction(db, {
      name: "Conta Hoje",
      type: "EXPENSE",
      amount: 400,
      dueDate: "2026-04-15",
      ownerId: selfOwner.id,
    });

    await createTransaction(db, {
      name: "Conta Fim do Mês",
      type: "EXPENSE",
      amount: 150,
      dueDate: "2026-04-28",
      ownerId: selfOwner.id,
    });

    const paidApril = await createTransaction(db, {
      name: "Conta Paga",
      type: "EXPENSE",
      amount: 500,
      dueDate: "2026-04-02",
      ownerId: selfOwner.id,
    });
    await settleInstallment(db, paidApril.installments[0].id, {
      confirmed: true,
    });

    await createTransaction(db, {
      name: "Receita Atrasada Não Conta",
      type: "INCOME",
      amount: 900,
      dueDate: "2026-04-01",
      ownerId: selfOwner.id,
    });

    await createTransaction(db, {
      name: "Conta Maio Futuro",
      type: "EXPENSE",
      amount: 700,
      dueDate: "2026-05-05",
      ownerId: selfOwner.id,
    });

    const summary = await getMonthlySummary(db, {
      month: "2026-04",
      referenceDate: new Date(2026, 3, 15, 23, 30, 0),
    });

    expect(summary.overdueCount).toBe(2);
    expect(summary.overdueAmount).toBe(450);
    expect(summary.toPayAmount).toBe(1000);
  });

  it("filters summary metrics by ownerId", async () => {
    const selfOwner = (await getSelfOwner(db))!;
    const otherOwner = await createOwner(db, { name: "João" });
    const cat = await createCategory(db, {
      name: "Lazer",
      budget: 500,
      month: "2026-04",
    });

    await createTransaction(db, {
      name: "Salário Meu",
      type: "INCOME",
      amount: 3000,
      dueDate: "2026-04-05",
      ownerId: selfOwner.id,
    });
    await createTransaction(db, {
      name: "Cinema Meu",
      type: "EXPENSE",
      amount: 100,
      dueDate: "2026-04-08",
      ownerId: selfOwner.id,
      categoryId: cat.id,
    });

    await createTransaction(db, {
      name: "Reembolso João",
      type: "INCOME",
      amount: 800,
      dueDate: "2026-04-06",
      ownerId: otherOwner.id,
    });
    await createTransaction(db, {
      name: "Jantar João",
      type: "EXPENSE",
      amount: 200,
      dueDate: "2026-04-20",
      ownerId: otherOwner.id,
      categoryId: cat.id,
    });
    await createTransaction(db, {
      name: "Atrasada João",
      type: "EXPENSE",
      amount: 150,
      dueDate: "2026-03-20",
      ownerId: otherOwner.id,
    });

    const otherSummary = await getMonthlySummary(db, {
      month: "2026-04",
      ownerId: otherOwner.id,
      referenceDate: new Date(2026, 3, 15, 12, 0, 0),
    });

    expect(otherSummary.ownerId).toBe(otherOwner.id);
    expect(otherSummary.totals.incomeTotal).toBe(800);
    expect(otherSummary.totals.expenseTotal).toBe(200);
    expect(otherSummary.overdueCount).toBe(1);
    expect(otherSummary.overdueAmount).toBe(150);
    expect(otherSummary.toPayAmount).toBe(350);
    expect(otherSummary.categoryBudgets[0].spentAmount).toBe(200);
  });

  it("computes categoryBudgets ordered by percentage DESC then categoryName NOCASE ASC and goalAmount", async () => {
    const selfOwner = (await getSelfOwner(db))!;

    const catBeta = await createCategory(db, {
      name: "beta",
      color: "#111111",
      icon: "star",
      budget: 200,
      month: "2026-01",
    });
    const catAlpha = await createCategory(db, {
      name: "Alpha",
      color: "#222222",
      icon: "heart",
      budget: 200,
      month: "2026-01",
    });
    const catExceeded = await createCategory(db, {
      name: "Mercado",
      color: "#333333",
      icon: "cart",
      budget: 100,
      month: "2026-02",
    });
    const catZero = await createCategory(db, {
      name: "Zero",
      budget: 100,
      month: "2026-01",
    });
    await removeCategoryBudget(db, catZero.id, "2026-04");
    await createCategory(db, { name: "Sem Orçamento" });
    const catDeleted = await createCategory(db, {
      name: "Deletada",
      budget: 300,
      month: "2026-01",
    });
    await deleteCategory(db, catDeleted.id);
    await setCategoryBudget(db, catAlpha.id, "2026-05", 999);

    await createTransaction(db, {
      name: "Compra Alpha",
      type: "EXPENSE",
      amount: 100,
      dueDate: "2026-04-05",
      ownerId: selfOwner.id,
      categoryId: catAlpha.id,
    });
    await createTransaction(db, {
      name: "Compra Beta",
      type: "EXPENSE",
      amount: 100,
      dueDate: "2026-04-06",
      ownerId: selfOwner.id,
      categoryId: catBeta.id,
    });
    await createTransaction(db, {
      name: "Compra Mercado",
      type: "EXPENSE",
      amount: 125.5,
      dueDate: "2026-04-07",
      ownerId: selfOwner.id,
      categoryId: catExceeded.id,
    });
    await createTransaction(db, {
      name: "Reembolso Mercado",
      type: "INCOME",
      amount: 50,
      dueDate: "2026-04-08",
      ownerId: selfOwner.id,
      categoryId: catExceeded.id,
    });

    await setGoalForMonth(db, "2026-02", 1200);
    await setGoalForMonth(db, "2026-05", 2500);

    const summary = await getMonthlySummary(db, {
      month: "2026-04",
      referenceDate: new Date(2026, 3, 15, 12, 0, 0),
    });

    expect(summary.goalAmount).toBe(1200);
    expect(summary.categoryBudgets).toEqual([
      {
        categoryId: catExceeded.id,
        categoryName: "Mercado",
        categoryColor: "#333333",
        categoryIcon: "cart",
        budgetAmount: 100,
        spentAmount: 125.5,
        remainingAmount: -25.5,
        percentage: 125.5,
        isExceeded: true,
      },
      {
        categoryId: catAlpha.id,
        categoryName: "Alpha",
        categoryColor: "#222222",
        categoryIcon: "heart",
        budgetAmount: 200,
        spentAmount: 100,
        remainingAmount: 100,
        percentage: 50,
        isExceeded: false,
      },
      {
        categoryId: catBeta.id,
        categoryName: "beta",
        categoryColor: "#111111",
        categoryIcon: "star",
        budgetAmount: 200,
        spentAmount: 100,
        remainingAmount: 100,
        percentage: 50,
        isExceeded: false,
      },
    ]);

    await removeGoalFromMonth(db, "2026-04");
    const summaryAfterRemovedGoal = await getMonthlySummary(db, {
      month: "2026-04",
      referenceDate: new Date(2026, 3, 15, 12, 0, 0),
    });
    expect(summaryAfterRemovedGoal.goalAmount).toBeNull();
  });
});
