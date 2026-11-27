import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../../tests/helpers/inMemorySqlite";
import { DatabaseError } from "../errors";
import { createCategory } from "./categories";
import {
  createInvoice,
  deleteInvoice,
  getInvoiceById,
  getInvoiceMonthSummary,
  listInvoices,
  payInvoice,
  updateInvoice,
} from "./invoices";
import { getSelfOwner, type Owner } from "./owners";
import {
  createTransaction,
  deleteTransaction,
  getTransactionById,
} from "./transactions";

async function requireSelfOwner(db: SQLite.SQLiteDatabase): Promise<Owner> {
  const owner = await getSelfOwner(db);
  if (!owner) {
    throw new Error("Self owner not found");
  }
  return owner;
}

describe("invoices repository", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("creates, lists, and gets invoices ordered case-insensitively with defaults and validations", async () => {
    await expect(
      createInvoice(db, {
        name: "   ",
        dueDay: 10,
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      createInvoice(db, {
        name: "Nubank",
        dueDay: 0,
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      createInvoice(db, {
        name: "Nubank",
        dueDay: 32,
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      createInvoice(db, {
        name: "Nubank",
        dueDay: 10.5,
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      createInvoice(db, {
        name: "Nubank",
        dueDay: 10,
        closingDay: 0,
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      createInvoice(db, {
        name: "Nubank",
        dueDay: 10,
        limitAmount: -1,
      })
    ).rejects.toThrow(DatabaseError);

    const nubank = await createInvoice(db, {
      name: " nubank ",
      limitAmount: 2500.5,
      color: " #820AD1 ",
      dueDay: 10,
      closingDay: 3,
    });

    const inter = await createInvoice(db, {
      name: "Inter",
      color: "   ",
      dueDay: 15,
      closingDay: null,
    });

    const c6 = await createInvoice(db, {
      name: "C6 Bank",
      limitAmount: 1000,
      dueDay: 20,
    });

    expect(nubank).toMatchObject({
      name: "nubank",
      limitAmount: 2500.5,
      usedLimit: 0,
      availableLimit: 2500.5,
      monthTotal: 0,
      monthPaid: 0,
      monthPending: 0,
      color: "#820AD1",
      dueDay: 10,
      closingDay: 3,
    });
    expect(inter).toMatchObject({
      name: "Inter",
      limitAmount: 0,
      color: null,
      dueDay: 15,
      closingDay: null,
    });

    const list = await listInvoices(db, {
      referenceDate: new Date(2026, 4, 15),
    });
    expect(list.map((item) => item.name)).toEqual([
      "C6 Bank",
      "Inter",
      "nubank",
    ]);

    const fetched = await getInvoiceById(db, nubank.id, { month: "2026-05" });
    expect(fetched?.id).toBe(nubank.id);
    expect(await getInvoiceById(db, "missing")).toBeNull();
    expect(c6.closingDay).toBeNull();
  });

  it("computes usedLimit across all pending expense installments, negative availableLimit, and monthly totals", async () => {
    const owner = await requireSelfOwner(db);
    const invoice = await createInvoice(db, {
      name: "Nubank",
      limitAmount: 500,
      dueDay: 10,
      closingDay: 3,
    });

    await createTransaction(db, {
      name: "Notebook",
      type: "EXPENSE",
      amount: 600,
      dueDate: "2026-05-10",
      ownerId: owner.id,
      invoiceId: invoice.id,
      installmentsCount: 3,
    });

    await createTransaction(db, {
      name: "Estorno",
      type: "INCOME",
      amount: 50,
      dueDate: "2026-05-12",
      ownerId: owner.id,
      invoiceId: invoice.id,
    });

    const deletedExpense = await createTransaction(db, {
      name: "Compra Cancelada",
      type: "EXPENSE",
      amount: 300,
      dueDate: "2026-05-15",
      ownerId: owner.id,
      invoiceId: invoice.id,
    });
    await deleteTransaction(db, deletedExpense.id);

    const mayInvoice = await getInvoiceById(db, invoice.id, {
      month: "2026-05",
    });
    expect(mayInvoice).toMatchObject({
      limitAmount: 500,
      usedLimit: 600,
      availableLimit: -100,
      monthTotal: 250,
      monthPaid: 0,
      monthPending: 250,
    });

    const juneInvoice = await getInvoiceById(db, invoice.id, {
      month: "2026-06",
    });
    expect(juneInvoice).toMatchObject({
      usedLimit: 600,
      availableLimit: -100,
      monthTotal: 200,
      monthPaid: 0,
      monthPending: 200,
    });

    await expect(listInvoices(db, { month: "2026-13" })).rejects.toThrow(
      DatabaseError
    );
  });

  it("updates invoice partially and throws NOT_FOUND when missing", async () => {
    const invoice = await createInvoice(db, {
      name: "Nubank",
      limitAmount: 1000,
      color: "#820AD1",
      dueDay: 10,
      closingDay: 3,
    });

    const partialNameOnly = await updateInvoice(db, invoice.id, {
      name: "Nubank Ultravioleta",
    });
    expect(partialNameOnly).toMatchObject({
      name: "Nubank Ultravioleta",
      limitAmount: 1000,
      color: "#820AD1",
      dueDay: 10,
      closingDay: 3,
    });

    const partial = await updateInvoice(db, invoice.id, {
      closingDay: null,
    });
    expect(partial).toMatchObject({
      name: "Nubank Ultravioleta",
      limitAmount: 1000,
      color: "#820AD1",
      dueDay: 10,
      closingDay: null,
    });

    const full = await updateInvoice(db, invoice.id, {
      limitAmount: 3000,
      color: "   ",
      dueDay: 20,
      closingDay: 12,
    });
    expect(full).toMatchObject({
      name: "Nubank Ultravioleta",
      limitAmount: 3000,
      color: null,
      dueDay: 20,
      closingDay: 12,
    });

    await expect(
      updateInvoice(db, "missing", { name: "Outro" })
    ).rejects.toThrow(DatabaseError);
  });

  it("soft deletes invoice and unlinks active transactions", async () => {
    const owner = await requireSelfOwner(db);
    const invoice = await createInvoice(db, {
      name: "Itaú",
      limitAmount: 1500,
      dueDay: 5,
    });

    const tx = await createTransaction(db, {
      name: "Supermercado",
      type: "EXPENSE",
      amount: 220,
      dueDate: "2026-05-05",
      ownerId: owner.id,
      invoiceId: invoice.id,
    });

    await deleteInvoice(db, invoice.id);

    expect(await getInvoiceById(db, invoice.id)).toBeNull();
    expect(await listInvoices(db)).toEqual([]);

    const reloadedTx = await getTransactionById(db, tx.id);
    expect(reloadedTx?.invoiceId).toBeNull();

    await expect(deleteInvoice(db, invoice.id)).rejects.toThrow(DatabaseError);
  });

  it("returns invoice month summary with ordered installments and overdue count", async () => {
    const owner = await requireSelfOwner(db);
    const category = await createCategory(db, { name: "Mercado" });
    const invoice = await createInvoice(db, {
      name: "Bradesco",
      limitAmount: 2000,
      dueDay: 10,
    });

    const txA = await createTransaction(db, {
      name: "Compra A",
      type: "EXPENSE",
      amount: 100,
      dueDate: "2026-05-05",
      ownerId: owner.id,
      categoryId: category.id,
      invoiceId: invoice.id,
    });

    const txB = await createTransaction(db, {
      name: "Compra B",
      type: "EXPENSE",
      amount: 200,
      dueDate: "2026-05-12",
      ownerId: owner.id,
      invoiceId: invoice.id,
    });

    const summary = await getInvoiceMonthSummary(
      db,
      invoice.id,
      "2026-05",
      new Date(2026, 4, 10)
    );

    expect(summary.invoice.id).toBe(invoice.id);
    expect(summary.month).toBe("2026-05");
    expect(summary.totalAmount).toBe(300);
    expect(summary.paidAmount).toBe(0);
    expect(summary.pendingAmount).toBe(300);
    expect(summary.overdueCount).toBe(1);
    expect(summary.installments.map((item) => item.transactionId)).toEqual([
      txA.id,
      txB.id,
    ]);
    expect(summary.installments[0]).toMatchObject({
      categoryId: category.id,
      categoryName: "Mercado",
      ownerId: owner.id,
      ownerName: owner.name,
      isOverdue: true,
    });
    expect(summary.installments[1]).toMatchObject({
      categoryId: null,
      categoryName: null,
      isOverdue: false,
    });

    const defaultRefSummary = await getInvoiceMonthSummary(
      db,
      invoice.id,
      "2026-05"
    );
    expect(defaultRefSummary.month).toBe("2026-05");

    await expect(
      getInvoiceMonthSummary(db, "missing", "2026-05")
    ).rejects.toThrow(DatabaseError);
  });

  it("pays invoice partially and fully in strict order within a single transaction", async () => {
    const owner = await requireSelfOwner(db);
    const invoice = await createInvoice(db, {
      name: "Santander",
      limitAmount: 1000,
      dueDay: 10,
    });

    await expect(
      payInvoice(db, {
        invoiceId: "   ",
        month: "2026-05",
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      payInvoice(db, {
        invoiceId: "missing",
        month: "2026-05",
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      payInvoice(db, {
        invoiceId: invoice.id,
        month: "2026-05",
      })
    ).rejects.toThrow(DatabaseError);

    const txFirst = await createTransaction(db, {
      name: "Primeira",
      type: "EXPENSE",
      amount: 100,
      dueDate: "2026-05-05",
      ownerId: owner.id,
      invoiceId: invoice.id,
    });

    const txSecond = await createTransaction(db, {
      name: "Segunda",
      type: "EXPENSE",
      amount: 150,
      dueDate: "2026-05-10",
      ownerId: owner.id,
      invoiceId: invoice.id,
    });

    await createTransaction(db, {
      name: "Terceira",
      type: "EXPENSE",
      amount: 50,
      dueDate: "2026-05-15",
      ownerId: owner.id,
      invoiceId: invoice.id,
    });

    await expect(
      payInvoice(db, {
        invoiceId: invoice.id,
        month: "2026-05",
        amount: 350,
      })
    ).rejects.toThrow(DatabaseError);

    const partialResult = await payInvoice(db, {
      invoiceId: invoice.id,
      month: "2026-05",
      amount: 160,
      paidAt: "2026-05-11",
    });

    expect(partialResult).toMatchObject({
      invoiceId: invoice.id,
      month: "2026-05",
      paidAmount: 160,
      remainingMonthAmount: 140,
      settledCount: 1,
      partiallyPaidCount: 1,
    });
    expect(partialResult.updatedInstallments).toHaveLength(2);
    expect(partialResult.updatedInstallments[0]).toMatchObject({
      transactionId: txFirst.id,
      allocatedAmount: 100,
      paidAmount: 100,
      remainingAmount: 0,
      status: "PAID",
    });
    expect(partialResult.updatedInstallments[1]).toMatchObject({
      transactionId: txSecond.id,
      allocatedAmount: 60,
      paidAmount: 60,
      remainingAmount: 90,
      status: "PENDING",
    });

    const summaryAfterPartial = await getInvoiceMonthSummary(
      db,
      invoice.id,
      "2026-05",
      new Date(2026, 4, 20)
    );
    expect(summaryAfterPartial.paidAmount).toBe(160);
    expect(summaryAfterPartial.pendingAmount).toBe(140);
    expect(summaryAfterPartial.overdueCount).toBe(2);

    const fullResult = await payInvoice(db, {
      invoiceId: invoice.id,
      month: "2026-05",
    });

    expect(fullResult).toMatchObject({
      invoiceId: invoice.id,
      month: "2026-05",
      paidAmount: 140,
      remainingMonthAmount: 0,
      settledCount: 2,
      partiallyPaidCount: 0,
    });
    expect(fullResult.updatedInstallments).toHaveLength(2);

    const invoiceAfterFull = await getInvoiceById(db, invoice.id, {
      month: "2026-05",
    });
    expect(invoiceAfterFull).toMatchObject({
      usedLimit: 0,
      availableLimit: 1000,
      monthTotal: 300,
      monthPaid: 300,
      monthPending: 0,
    });
  });
});
