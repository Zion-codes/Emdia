import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../tests/helpers/inMemorySqlite";
import {
  advanceRecurringInstallment,
  ensureRecurringInstallments,
  stopRecurrence,
} from "./recurrence";
import { listOwners } from "./repositories/owners";
import {
  createTransaction,
  getTransactionById,
  updateTransaction,
} from "./repositories/transactions";

describe("recurrence", () => {
  let db: SQLite.SQLiteDatabase;
  let selfOwnerId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    const owners = await listOwners(db);
    selfOwnerId = owners.find((owner) => owner.isSelf)!.id;
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("rejects invalid reference date in ensureRecurringInstallments", async () => {
    await expect(
      ensureRecurringInstallments(db, new Date("invalid"))
    ).rejects.toThrow("Data de referência inválida.");
  });

  it("uses current date by default in ensureRecurringInstallments", async () => {
    const result = await ensureRecurringInstallments(db);
    expect(result).toEqual({
      createdInstallmentsCount: 0,
      deactivatedTransactionsCount: 0,
    });
  });

  it("materializes missing recurring installments up to reference month preserving day 31 anchor", async () => {
    const tx = await createTransaction(db, {
      name: "Aluguel",
      type: "EXPENSE",
      amount: 1500,
      dueDate: "2026-01-31",
      ownerId: selfOwnerId,
      recurrence: true,
    });

    const firstRun = await ensureRecurringInstallments(
      db,
      new Date(2026, 2, 15)
    );
    expect(firstRun).toEqual({
      createdInstallmentsCount: 2,
      deactivatedTransactionsCount: 0,
    });

    const loaded = await getTransactionById(db, tx.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.installmentsCount).toBe(1);
    expect(loaded!.installments).toHaveLength(3);
    expect(loaded!.installments.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(loaded!.installments.map((item) => item.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(loaded!.installments[1].status).toBe("PENDING");
    expect(loaded!.installments[1].paidAmount).toBe(0);
    expect(loaded!.installments[1].amount).toBe(1500);

    const updated = await updateTransaction(db, tx.id, {
      name: "Aluguel Atualizado",
      recurrence: true,
    });
    expect(updated.name).toBe("Aluguel Atualizado");

    const secondRun = await ensureRecurringInstallments(
      db,
      new Date(2026, 2, 20)
    );
    expect(secondRun).toEqual({
      createdInstallmentsCount: 0,
      deactivatedTransactionsCount: 0,
    });
  });

  it("ignores recurring transactions without base installments or inactive recurrences", async () => {
    const noInstallmentsTx = await createTransaction(db, {
      name: "Sem Parcela",
      type: "EXPENSE",
      amount: 100,
      dueDate: "2026-01-10",
      ownerId: selfOwnerId,
      recurrence: true,
    });
    await db.runAsync(
      `DELETE FROM installments WHERE transaction_id = ?`,
      noInstallmentsTx.id
    );

    await createTransaction(db, {
      name: "Inativa",
      type: "EXPENSE",
      amount: 200,
      dueDate: "2026-01-10",
      ownerId: selfOwnerId,
      recurrence: true,
      active: false,
    });

    const result = await ensureRecurringInstallments(db, new Date(2026, 3, 10));
    expect(result).toEqual({
      createdInstallmentsCount: 0,
      deactivatedTransactionsCount: 0,
    });
  });

  it("auto-deactivates non-recurring transactions when all installments are due", async () => {
    const finished = await createTransaction(db, {
      name: "Parcelado Concluído",
      type: "EXPENSE",
      amount: 300,
      dueDate: "2026-01-10",
      ownerId: selfOwnerId,
      installmentsCount: 3,
    });

    const ongoing = await createTransaction(db, {
      name: "Parcelado Em Aberto",
      type: "EXPENSE",
      amount: 300,
      dueDate: "2026-02-10",
      ownerId: selfOwnerId,
      installmentsCount: 3,
    });

    const missingInstallment = await createTransaction(db, {
      name: "Parcelado Incompleto",
      type: "EXPENSE",
      amount: 200,
      dueDate: "2026-01-10",
      ownerId: selfOwnerId,
      installmentsCount: 2,
    });
    await db.runAsync(
      `UPDATE installments
       SET deleted_at = '2026-01-15T00:00:00.000Z'
       WHERE transaction_id = ? AND number = 2`,
      missingInstallment.id
    );

    const result = await ensureRecurringInstallments(db, new Date(2026, 2, 10));
    expect(result).toEqual({
      createdInstallmentsCount: 0,
      deactivatedTransactionsCount: 1,
    });

    const loadedFinished = await getTransactionById(db, finished.id);
    const loadedOngoing = await getTransactionById(db, ongoing.id);
    const loadedIncomplete = await getTransactionById(
      db,
      missingInstallment.id
    );

    expect(loadedFinished!.active).toBe(false);
    expect(loadedOngoing!.active).toBe(true);
    expect(loadedIncomplete!.active).toBe(true);
  });

  it("stops an active recurrence and validates error cases", async () => {
    await expect(stopRecurrence(db, "   ")).rejects.toThrow(
      "O identificador do lançamento é obrigatório."
    );

    await expect(stopRecurrence(db, "missing-id")).rejects.toThrow(
      "Lançamento não encontrado."
    );

    const nonRecurring = await createTransaction(db, {
      name: "Compra Única",
      type: "EXPENSE",
      amount: 50,
      dueDate: "2026-03-10",
      ownerId: selfOwnerId,
    });

    await expect(stopRecurrence(db, nonRecurring.id)).rejects.toThrow(
      "Este lançamento não é recorrente."
    );

    const recurring = await createTransaction(db, {
      name: "Internet",
      type: "EXPENSE",
      amount: 120,
      dueDate: "2026-03-10",
      ownerId: selfOwnerId,
      recurrence: true,
    });

    const stopped = await stopRecurrence(db, recurring.id);
    expect(stopped.active).toBe(false);
    expect(stopped.recurrence).toBe(true);
    expect(stopped.installments).toHaveLength(1);

    await expect(stopRecurrence(db, recurring.id)).rejects.toThrow(
      "Esta recorrência já está encerrada."
    );
  });

  it("advances a recurring installment manually and validates error cases", async () => {
    await expect(
      advanceRecurringInstallment(db, "any-id", new Date("invalid"))
    ).rejects.toThrow("Data de referência inválida.");

    await expect(advanceRecurringInstallment(db, "")).rejects.toThrow(
      "O identificador do lançamento é obrigatório."
    );

    await expect(advanceRecurringInstallment(db, "missing-id")).rejects.toThrow(
      "Lançamento não encontrado."
    );

    const nonRecurring = await createTransaction(db, {
      name: "Única",
      type: "EXPENSE",
      amount: 80,
      dueDate: "2026-01-10",
      ownerId: selfOwnerId,
    });

    await expect(
      advanceRecurringInstallment(db, nonRecurring.id)
    ).rejects.toThrow("Este lançamento não é recorrente.");

    const inactiveRecurring = await createTransaction(db, {
      name: "Streaming",
      type: "EXPENSE",
      amount: 40,
      dueDate: "2026-01-10",
      ownerId: selfOwnerId,
      recurrence: true,
      active: false,
    });

    await expect(
      advanceRecurringInstallment(db, inactiveRecurring.id)
    ).rejects.toThrow("Esta recorrência já está encerrada.");

    const orphanRecurring = await createTransaction(db, {
      name: "Órfã",
      type: "EXPENSE",
      amount: 90,
      dueDate: "2026-01-10",
      ownerId: selfOwnerId,
      recurrence: true,
    });
    await db.runAsync(
      `DELETE FROM installments WHERE transaction_id = ?`,
      orphanRecurring.id
    );

    await expect(
      advanceRecurringInstallment(db, orphanRecurring.id)
    ).rejects.toThrow("Lançamento recorrente sem parcela base.");

    const recurring = await createTransaction(db, {
      name: "Academia",
      type: "EXPENSE",
      amount: 110,
      dueDate: "2026-01-31",
      ownerId: selfOwnerId,
      recurrence: true,
    });

    const second = await advanceRecurringInstallment(
      db,
      recurring.id,
      new Date(2026, 2, 5)
    );
    expect(second.number).toBe(2);
    expect(second.dueDate).toBe("2026-02-28");
    expect(second.amount).toBe(110);
    expect(second.paidAmount).toBe(0);
    expect(second.remainingAmount).toBe(110);
    expect(second.status).toBe("PENDING");
    expect(second.isOverdue).toBe(true);

    const third = await advanceRecurringInstallment(db, recurring.id);
    expect(third.number).toBe(3);
    expect(third.dueDate).toBe("2026-03-31");
  });
});
