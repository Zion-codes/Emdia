import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../tests/helpers/inMemorySqlite";
import { exportDatabaseBackup, restoreDatabaseBackup } from "./backup";
import { toCents } from "./money";
import { ensureRecurringInstallments } from "./recurrence";
import {
  createCategory,
  getCategoryBudgetForMonth,
  removeCategoryBudget,
  setCategoryBudget,
} from "./repositories/categories";
import {
  getGoalForMonth,
  removeGoalFromMonth,
  setGoalForMonth,
} from "./repositories/goals";
import {
  listInstallmentsByTransaction,
  registerInstallmentPayment,
  revertTransactionGroup,
  settleTransactionGroup,
} from "./repositories/installments";
import {
  createContribution,
  createInvestment,
  listContributions,
  listInvestments,
} from "./repositories/investments";
import {
  createInvoice,
  getInvoiceMonthSummary,
  payInvoice,
} from "./repositories/invoices";
import { createOwner, getSelfOwner, type Owner } from "./repositories/owners";
import { getMonthlySummary } from "./repositories/summary";
import {
  createSplitTransaction,
  createTransaction,
  deleteTransactionGroup,
  getTransactionGroup,
  RemainderDistribution,
} from "./repositories/transactions";

async function requireSelfOwner(db: SQLite.SQLiteDatabase): Promise<Owner> {
  const owner = await getSelfOwner(db);
  if (!owner) {
    throw new Error("Expected seeded self owner");
  }
  return owner;
}

describe("critical financial flows with real in-memory SQLite", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("persists exact cent distribution for 7x, 11x, 12x, 360x and 1-cent installments in first/last modes and reflects in summary", async () => {
    const selfOwner = await requireSelfOwner(db);
    const distributions: RemainderDistribution[] = ["first", "last"];
    const cases = [
      { count: 7, amount: 100.0 },
      { count: 11, amount: 250.55 },
      { count: 12, amount: 1000.01 },
      { count: 360, amount: 12345.67 },
      { count: 7, amount: 0.07 },
      { count: 12, amount: 0.12 },
    ];

    for (const remainderDistribution of distributions) {
      for (const testCase of cases) {
        const tx = await createTransaction(db, {
          name: `Parcelado ${testCase.count}x ${remainderDistribution}`,
          type: "EXPENSE",
          amount: testCase.amount,
          dueDate: "2026-01-15",
          ownerId: selfOwner.id,
          installmentsCount: testCase.count,
          amountMode: "total",
          remainderDistribution,
          allowDuplicate: true,
        });

        const installments = await listInstallmentsByTransaction(db, tx.id);
        expect(installments).toHaveLength(testCase.count);

        const totalCents = toCents(testCase.amount);
        const persistedSumCents = installments.reduce(
          (acc, inst) => acc + toCents(inst.amount),
          0
        );
        expect(persistedSumCents).toBe(totalCents);

        if (testCase.amount === 0.07 || testCase.amount === 0.12) {
          expect(installments.every((inst) => toCents(inst.amount) === 1)).toBe(
            true
          );
        } else if (remainderDistribution === "first") {
          expect(toCents(installments[0].amount)).toBeGreaterThanOrEqual(
            toCents(installments[installments.length - 1].amount)
          );
        } else {
          expect(
            toCents(installments[installments.length - 1].amount)
          ).toBeGreaterThanOrEqual(toCents(installments[0].amount));
        }
      }
    }

    const summary = await getMonthlySummary(db, {
      month: "2026-01",
      referenceDate: new Date("2026-01-10T12:00:00.000Z"),
    });
    expect(summary.totals.expenseTotal).toBeGreaterThan(0);
    expect(summary.totals.paidExpenseTotal).toBe(0);
  });

  it("handles successive partial installment payments, partial payInvoice on partially paid installments, deterministic tie-breaking and summary reflection", async () => {
    const selfOwner = await requireSelfOwner(db);
    const invoice = await createInvoice(db, {
      name: "Cartão Principal",
      dueDay: 10,
      closingDay: 3,
      limitAmount: 5000,
    });

    const txA = await createTransaction(db, {
      name: "Compra A",
      type: "EXPENSE",
      amount: 100.0,
      dueDate: "2026-03-10",
      ownerId: selfOwner.id,
      invoiceId: invoice.id,
    });
    const txB = await createTransaction(db, {
      name: "Compra B",
      type: "EXPENSE",
      amount: 100.0,
      dueDate: "2026-03-10",
      ownerId: selfOwner.id,
      invoiceId: invoice.id,
    });

    const [instA] = await listInstallmentsByTransaction(db, txA.id);
    const [instB] = await listInstallmentsByTransaction(db, txB.id);
    const [firstInst, secondInst] = [instA, instB].sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    const p1 = await registerInstallmentPayment(db, {
      installmentId: firstInst.id,
      amount: 33.33,
      paidAt: "2026-03-01T10:00:00.000Z",
    });
    expect(p1.paidAmount).toBe(33.33);
    expect(p1.status).toBe("PENDING");

    const p2 = await registerInstallmentPayment(db, {
      installmentId: firstInst.id,
      amount: 33.33,
      paidAt: "2026-03-02T10:00:00.000Z",
    });
    expect(p2.paidAmount).toBe(66.66);
    expect(p2.status).toBe("PENDING");

    const invoicePay = await payInvoice(db, {
      invoiceId: invoice.id,
      month: "2026-03",
      amount: 50.0,
      paidAt: "2026-03-05T10:00:00.000Z",
    });
    expect(invoicePay.paidAmount).toBe(50.0);
    expect(invoicePay.remainingMonthAmount).toBe(83.34);
    expect(invoicePay.settledCount).toBe(1);
    expect(invoicePay.partiallyPaidCount).toBe(1);
    expect(invoicePay.updatedInstallments.map((u) => u.installmentId)).toEqual([
      firstInst.id,
      secondInst.id,
    ]);

    const afterPaySummary = await getMonthlySummary(db, {
      month: "2026-03",
      referenceDate: new Date("2026-03-06T12:00:00.000Z"),
    });
    expect(afterPaySummary.totals.expenseTotal).toBe(200);
    expect(afterPaySummary.totals.paidExpenseTotal).toBe(116.66);
    expect(afterPaySummary.toPayAmount).toBe(83.34);

    const p3 = await registerInstallmentPayment(db, {
      installmentId: secondInst.id,
      amount: 83.34,
      paidAt: "2026-03-07T10:00:00.000Z",
    });
    expect(p3.paidAmount).toBe(100);
    expect(p3.status).toBe("PAID");

    const invoiceSummary = await getInvoiceMonthSummary(
      db,
      invoice.id,
      "2026-03",
      new Date("2026-03-11T12:00:00.000Z")
    );
    expect(invoiceSummary.paidAmount).toBe(200);
    expect(invoiceSummary.pendingAmount).toBe(0);
  });

  it("supports atomic split transactions with 10 distinct owners, exact cent sum, settle, revert and delete", async () => {
    const selfOwner = await requireSelfOwner(db);
    const otherOwners = [];
    for (let index = 1; index <= 9; index += 1) {
      otherOwners.push(await createOwner(db, { name: `Pessoa ${index}` }));
    }
    const allOwners = [selfOwner, ...otherOwners];
    expect(allOwners).toHaveLength(10);

    const parts = allOwners.map((owner, index) => ({
      ownerId: owner.id,
      amount: index === 0 ? 10.01 : 10.0,
      installmentsCount: 3,
      amountMode: "total" as const,
      remainderDistribution: "last" as const,
    }));

    const group = await createSplitTransaction(db, {
      name: "Viagem 10 Pessoas",
      type: "EXPENSE",
      totalAmount: 100.01,
      dueDate: "2026-04-10",
      parts,
    });

    expect(group).toHaveLength(10);
    const groupId = group[0].groupId;
    expect(groupId).toBeTruthy();

    const fetchedGroup = await getTransactionGroup(db, groupId as string);
    expect(fetchedGroup).toHaveLength(10);
    const totalGroupCents = fetchedGroup.reduce(
      (acc, tx) => acc + toCents(tx.amount),
      0
    );
    expect(totalGroupCents).toBe(10001);

    const settled = await settleTransactionGroup(db, groupId as string, {
      confirmed: true,
      installmentNumber: 1,
      paidAt: "2026-04-10T10:00:00.000Z",
    });
    expect(settled).toHaveLength(10);
    expect(settled.every((item) => item.status === "PAID")).toBe(true);

    const summaryAfterSettle = await getMonthlySummary(db, {
      month: "2026-04",
      referenceDate: new Date("2026-04-10T12:00:00.000Z"),
    });
    expect(summaryAfterSettle.totals.paidExpenseTotal).toBe(33.3);

    const reverted = await revertTransactionGroup(db, groupId as string, {
      confirmed: true,
      installmentNumber: 1,
    });
    expect(reverted).toHaveLength(10);
    expect(reverted.every((item) => item.status === "PENDING")).toBe(true);

    await deleteTransactionGroup(db, groupId as string);
    expect(await getTransactionGroup(db, groupId as string)).toEqual([]);
  });

  it("handles year boundary and set-remove-redefine lifecycle for goals and category budgets with summary integration", async () => {
    const category = await createCategory(db, {
      name: "Alimentação",
      color: "#22C55E",
      icon: "utensils",
    });

    await setGoalForMonth(db, "2025-12", 5000);
    expect(await getGoalForMonth(db, "2025-11")).toBeNull();
    expect(await getGoalForMonth(db, "2025-12")).toBe(5000);
    expect(await getGoalForMonth(db, "2026-01")).toBe(5000);

    await setCategoryBudget(db, category.id, "2025-12", 1200);
    expect(
      await getCategoryBudgetForMonth(db, category.id, "2025-11")
    ).toBeNull();
    expect(await getCategoryBudgetForMonth(db, category.id, "2026-01")).toBe(
      1200
    );

    await setGoalForMonth(db, "2026-01", 6000);
    await removeGoalFromMonth(db, "2026-03");
    await setGoalForMonth(db, "2026-05", 7500);

    expect(await getGoalForMonth(db, "2026-02")).toBe(6000);
    expect(await getGoalForMonth(db, "2026-03")).toBeNull();
    expect(await getGoalForMonth(db, "2026-04")).toBeNull();
    expect(await getGoalForMonth(db, "2026-05")).toBe(7500);

    await setCategoryBudget(db, category.id, "2026-01", 1500);
    await removeCategoryBudget(db, category.id, "2026-03");
    await setCategoryBudget(db, category.id, "2026-05", 1800);

    expect(await getCategoryBudgetForMonth(db, category.id, "2026-02")).toBe(
      1500
    );
    expect(
      await getCategoryBudgetForMonth(db, category.id, "2026-03")
    ).toBeNull();
    expect(
      await getCategoryBudgetForMonth(db, category.id, "2026-04")
    ).toBeNull();
    expect(await getCategoryBudgetForMonth(db, category.id, "2026-05")).toBe(
      1800
    );

    const febSummary = await getMonthlySummary(db, {
      month: "2026-02",
      referenceDate: new Date("2026-02-15T12:00:00.000Z"),
    });
    expect(febSummary.goalAmount).toBe(6000);
    expect(febSummary.categoryBudgets).toHaveLength(1);
    expect(febSummary.categoryBudgets[0].budgetAmount).toBe(1500);

    const marSummary = await getMonthlySummary(db, {
      month: "2026-03",
      referenceDate: new Date("2026-03-15T12:00:00.000Z"),
    });
    expect(marSummary.goalAmount).toBeNull();
    expect(marSummary.categoryBudgets).toHaveLength(0);

    const maySummary = await getMonthlySummary(db, {
      month: "2026-05",
      referenceDate: new Date("2026-05-15T12:00:00.000Z"),
    });
    expect(maySummary.goalAmount).toBe(7500);
    expect(maySummary.categoryBudgets[0].budgetAmount).toBe(1800);
  });

  it("generates day-31 recurring installments across 13-month year rollover and leap year idempotently", async () => {
    const selfOwner = await requireSelfOwner(db);

    const rolloverTx = await createTransaction(db, {
      name: "Assinatura Dia 31",
      type: "EXPENSE",
      amount: 49.9,
      dueDate: "2025-12-31",
      ownerId: selfOwner.id,
      recurrence: true,
    });

    const rolloverResult = await ensureRecurringInstallments(
      db,
      new Date("2027-01-31T12:00:00.000Z")
    );
    expect(rolloverResult.createdInstallmentsCount).toBe(13);

    const idempotentResult = await ensureRecurringInstallments(
      db,
      new Date("2027-01-31T12:00:00.000Z")
    );
    expect(idempotentResult.createdInstallmentsCount).toBe(0);

    const rolloverInstallments = await listInstallmentsByTransaction(
      db,
      rolloverTx.id
    );
    expect(rolloverInstallments.map((item) => item.dueDate)).toEqual([
      "2025-12-31",
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
    ]);

    const leapDb = await createTestDatabase();
    try {
      const leapSelf = await requireSelfOwner(leapDb);
      const leapTx = await createTransaction(leapDb, {
        name: "Recorrência Bissexto",
        type: "INCOME",
        amount: 200,
        dueDate: "2024-01-31",
        ownerId: leapSelf.id,
        recurrence: true,
      });

      const leapResult = await ensureRecurringInstallments(
        leapDb,
        new Date("2024-03-01T12:00:00.000Z")
      );
      expect(leapResult.createdInstallmentsCount).toBe(2);

      const leapInstallments = await listInstallmentsByTransaction(
        leapDb,
        leapTx.id
      );
      expect(leapInstallments.map((item) => item.dueDate)).toEqual([
        "2024-01-31",
        "2024-02-29",
        "2024-03-31",
      ]);
    } finally {
      await leapDb.closeAsync();
    }
  });

  it("performs full round-trip backup export and restore across goals, budgets, partial invoice, 10-owner split, day-31 recurrence and investments", async () => {
    const selfOwner = await requireSelfOwner(db);
    const category = await createCategory(db, {
      name: "Casa",
      color: "#3B82F6",
      icon: "home",
    });
    const invoice = await createInvoice(db, {
      name: "Cartão Backup",
      dueDay: 10,
      closingDay: 3,
      limitAmount: 10000,
    });

    await setGoalForMonth(db, "2026-01", 8000);
    await setCategoryBudget(db, category.id, "2026-01", 2500);

    const invoiceTx = await createTransaction(db, {
      name: "Compra Fatura",
      type: "EXPENSE",
      amount: 300,
      dueDate: "2026-01-10",
      ownerId: selfOwner.id,
      categoryId: category.id,
      invoiceId: invoice.id,
    });
    const [invoiceInst] = await listInstallmentsByTransaction(db, invoiceTx.id);
    await registerInstallmentPayment(db, {
      installmentId: invoiceInst.id,
      amount: 120,
      paidAt: "2026-01-05T10:00:00.000Z",
    });

    const otherOwners = [];
    for (let i = 1; i <= 9; i += 1) {
      otherOwners.push(await createOwner(db, { name: `Sócio ${i}` }));
    }
    const splitGroup = await createSplitTransaction(db, {
      name: "Rateio 10",
      type: "EXPENSE",
      totalAmount: 100,
      dueDate: "2026-01-20",
      categoryId: category.id,
      parts: [selfOwner, ...otherOwners].map((owner) => ({
        ownerId: owner.id,
        amount: 10,
      })),
    });

    const recurringTx = await createTransaction(db, {
      name: "Recorrente 31",
      type: "EXPENSE",
      amount: 50,
      dueDate: "2025-12-31",
      ownerId: selfOwner.id,
      categoryId: category.id,
      recurrence: true,
    });

    const investment = await createInvestment(db, {
      name: "CDB Liquidez",
      type: "Renda Fixa",
      institution: "Banco",
      currentBalance: 1000,
    });
    await createContribution(db, {
      investmentId: investment.id,
      amount: 250,
      contributedAt: "2026-01-08",
    });

    await ensureRecurringInstallments(db, new Date("2026-01-15T12:00:00.000Z"));

    const originalSummary = await getMonthlySummary(db, {
      month: "2026-01",
      referenceDate: new Date("2026-01-15T12:00:00.000Z"),
    });
    const exported = await exportDatabaseBackup(db);

    const cleanDb = await createTestDatabase();
    try {
      await restoreDatabaseBackup(cleanDb, exported, {
        referenceDate: new Date("2026-01-15T12:00:00.000Z"),
      });

      expect(await getGoalForMonth(cleanDb, "2026-01")).toBe(8000);
      expect(
        await getCategoryBudgetForMonth(cleanDb, category.id, "2026-01")
      ).toBe(2500);

      const restoredInvoice = await getInvoiceMonthSummary(
        cleanDb,
        invoice.id,
        "2026-01",
        new Date("2026-01-15T12:00:00.000Z")
      );
      expect(restoredInvoice.paidAmount).toBe(120);
      expect(restoredInvoice.pendingAmount).toBe(180);

      const restoredSplit = await getTransactionGroup(
        cleanDb,
        splitGroup[0].groupId as string
      );
      expect(restoredSplit).toHaveLength(10);

      const restoredRecurring = await listInstallmentsByTransaction(
        cleanDb,
        recurringTx.id
      );
      expect(restoredRecurring.map((i) => i.dueDate)).toEqual([
        "2025-12-31",
        "2026-01-31",
      ]);

      const restoredInvestments = await listInvestments(cleanDb);
      expect(restoredInvestments).toHaveLength(1);
      expect(restoredInvestments[0].currentBalance).toBe(1000);
      const restoredContributions = await listContributions(
        cleanDb,
        investment.id
      );
      expect(restoredContributions).toHaveLength(1);
      expect(restoredContributions[0].amount).toBe(250);

      const restoredSummary = await getMonthlySummary(cleanDb, {
        month: "2026-01",
        referenceDate: new Date("2026-01-15T12:00:00.000Z"),
      });
      expect(restoredSummary.goalAmount).toBe(originalSummary.goalAmount);
      expect(restoredSummary.totals.paidExpenseTotal).toBe(
        originalSummary.totals.paidExpenseTotal
      );
      expect(restoredSummary.categoryBudgets).toEqual(
        originalSummary.categoryBudgets
      );
    } finally {
      await cleanDb.closeAsync();
    }
  });
});
